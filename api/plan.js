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

// Apply ONE surgical change to the shared plan. This is what prevents a stale
// client from clobbering others: it can only touch the record it names, never
// overwrite the whole document. Returns an error string, or null on success.
function applyOp(plan, op) {
  switch (op && op.type) {
    case 'deleteTask':
      if (!op.id) return 'missing_id';
      plan.tasks = plan.tasks.filter((t) => t.id !== op.id);
      return null;
    case 'upsertTask': {
      const t = op.task;
      if (!t || !t.id) return 'invalid_task';
      const i = plan.tasks.findIndex((x) => x.id === t.id);
      if (i >= 0) plan.tasks[i] = t; else plan.tasks.push(t);
      return null;
    }
    case 'deleteCat':
      if (!op.id) return 'missing_id';
      plan.categories = plan.categories.filter((c) => c.id !== op.id);
      plan.tasks = plan.tasks.filter((t) => t.cat !== op.id); // orphaned tasks go too
      return null;
    case 'upsertCat': {
      const c = op.cat;
      if (!c || !c.id) return 'invalid_cat';
      const i = plan.categories.findIndex((x) => x.id === c.id);
      if (i >= 0) plan.categories[i] = c; else plan.categories.push(c);
      return null;
    }
    case 'reorderCats': {
      if (!Array.isArray(op.order)) return 'invalid_order';
      const byId = new Map(plan.categories.map((c) => [c.id, c]));
      const next = [];
      for (const id of op.order) { const c = byId.get(id); if (c) { next.push(c); byId.delete(id); } }
      for (const c of byId.values()) next.push(c); // keep any the client didn't list
      plan.categories = next;
      return null;
    }
    case 'replaceAll': {
      const p = op.plan;
      if (!p || !Array.isArray(p.categories) || !Array.isArray(p.tasks)) return 'invalid_plan';
      plan.categories = p.categories;
      plan.tasks = p.tasks;
      return null;
    }
    default:
      return 'unknown_op';
  }
}

export async function POST(request) {
  if (!redis) return json({ error: 'storage_not_configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  // Read the CURRENT shared plan (the source of truth) and apply the change to
  // it — not to whatever the client last saw. Read-modify-write: fine for a
  // small team; a same-tick double write is the only (negligible) race left.
  let plan;
  try { plan = await redis.get(KEY); } catch (e) { return json({ error: 'read_failed', detail: String(e && e.message || e) }, 502); }
  if (!plan || typeof plan !== 'object') plan = { ...EMPTY };
  if (!Array.isArray(plan.categories)) plan.categories = [];
  if (!Array.isArray(plan.tasks)) plan.tasks = [];

  // Only operation-based writes are accepted. A whole-plan upload — what the
  // pre-fix client sent — is refused, so a stale or not-yet-reloaded old tab
  // can't overwrite the shared plan and resurrect deleted items. (Seeding an
  // empty store uses an explicit { type:'replaceAll', plan } op.)
  if (!body || !body.op) return json({ error: 'expected_op' }, 400);
  const err = applyOp(plan, body.op);
  if (err) return json({ error: err }, 400);

  try {
    plan.version = (plan.version || 0) + 1;
    plan.updatedAt = Date.now();
    if (JSON.stringify(plan).length > 1_000_000) return json({ error: 'too_large' }, 413);
    await redis.set(KEY, plan);
    return json({ ok: true, plan });
  } catch (e) {
    return json({ error: 'write_failed', detail: String(e && e.message || e) }, 502);
  }
}
