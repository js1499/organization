// /api/plan — cloud storage for the whole plan, as one JSON document in Redis.
//   GET  -> load the saved plan (or an empty plan)
//   POST -> overwrite the saved plan (last-write-wins)
//
// Gated by the existing root middleware.js, so only password-holders reach it.
// If the store isn't connected yet (no env vars), GET/POST return 503 and the
// front-end transparently falls back to per-device localStorage. Connect Upstash
// Redis in the Vercel "Storage" tab and redeploy to switch on shared sync.
//
// Requires: @upstash/redis (in package.json). Frameworkless "Other" project: this
// flat file is served at /api/plan; package.json has "type":"module" for ESM.
import { Redis } from '@upstash/redis';

const KEY = 'plan';
const EMPTY = { version: 0, updatedAt: 0, categories: [], tasks: [] };

// Vercel auto-injects KV_REST_API_URL / KV_REST_API_TOKEN when Upstash Redis is
// connected via the Marketplace. Absent until then.
const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const redis = URL_ && TOKEN ? new Redis({ url: URL_, token: TOKEN }) : null;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function GET() {
  if (!redis) return json({ error: 'storage_not_configured' }, 503);
  try {
    const plan = await redis.get(KEY);   // auto-deserialized object, or null
    return json(plan ?? EMPTY);
  } catch (e) {
    return json({ error: 'read_failed', detail: String(e && e.message || e) }, 502);
  }
}

export async function POST(request) {
  if (!redis) return json({ error: 'storage_not_configured' }, 503);
  let plan;
  try { plan = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.categories) || !Array.isArray(plan.tasks)) {
    return json({ error: 'expected_plan_object' }, 400);
  }
  // basic size guard — the plan is a few KB; reject anything absurd
  try {
    if (JSON.stringify(plan).length > 1_000_000) return json({ error: 'too_large' }, 413);
    plan.updatedAt = Date.now();
    await redis.set(KEY, plan);
    return json({ ok: true, updatedAt: plan.updatedAt });
  } catch (e) {
    return json({ error: 'write_failed', detail: String(e && e.message || e) }, 502);
  }
}
