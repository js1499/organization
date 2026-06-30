// Routing Middleware — a casual shared-password gate for the static site.
//
// Runs on Vercel BEFORE any file is served, so the HTML never reaches a
// visitor's browser until they're past the gate. The password itself is NEVER
// in this file or the repo — it lives in two Vercel environment variables:
//
//   GATE_PASSWORD  the code people type (e.g. 2075)
//   GATE_SECRET    a long random string used to sign the "remember me" cookie
//
// The cookie stores an HMAC token derived from GATE_SECRET (not the password),
// so the password is never written to anyone's browser, and the token can't be
// forged by someone who only knows the password.
//
// Docs: https://vercel.com/docs/routing-middleware/api

import { next } from '@vercel/functions';

const COOKIE = 'gantt_auth';
const ONE_YEAR = 60 * 60 * 24 * 365; // seconds — the "remember this device" window
const enc = new TextEncoder();

// Only run on real pages. Skip the favicon and Vercel's internal paths.
export const config = { matcher: ['/((?!favicon\\.ico|_vercel).*)'] };

// The value we expect the cookie to hold: HMAC-SHA256(GATE_SECRET, "authorized").
// It's the same for every authenticated device — a shared bearer token — but it
// cannot be produced without knowing GATE_SECRET.
async function expectedToken(secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('authorized'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Length-stable comparison so we don't leak how much of the value matched.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}

function setCookie(value) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ONE_YEAR}`;
}

function loginPage(status, error) {
  const body = LOGIN_HTML.replace('<!--ERROR-->', error ? `<p class="err">${error}</p>` : '');
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default async function middleware(request) {
  const password = process.env.GATE_PASSWORD;
  const secret = process.env.GATE_SECRET;

  // Fail CLOSED if the site isn't configured yet — never accidentally open.
  if (!password || !secret) {
    return new Response(
      'This site is not configured yet. Set the GATE_PASSWORD and GATE_SECRET ' +
        'environment variables in the Vercel project settings, then redeploy.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  const token = await expectedToken(secret);

  // Login endpoint.
  if (url.pathname === '/login') {
    if (request.method === 'POST') {
      let submitted = '';
      try {
        const form = await request.formData();
        submitted = String(form.get('password') || '');
      } catch {
        // ignore malformed bodies — treated as a wrong password below
      }
      if (safeEqual(submitted, password)) {
        // Correct → set the remember-me cookie and send them to the chart.
        return new Response(null, {
          status: 303,
          headers: { Location: '/', 'Set-Cookie': setCookie(token), 'cache-control': 'no-store' },
        });
      }
      return loginPage(401, 'Incorrect code. Please try again.');
    }
    // Someone hit /login directly with GET — bounce them home.
    return new Response(null, { status: 303, headers: { Location: '/', 'cache-control': 'no-store' } });
  }

  // Already authenticated → serve the page, and slide the 1-year window forward
  // so an active device is effectively never asked again.
  if (safeEqual(readCookie(request.headers.get('cookie'), COOKIE), token)) {
    return next({ headers: { 'Set-Cookie': setCookie(token) } });
  }

  // Not authenticated. For API calls, return a clean JSON 401 so the app can
  // detect an expired session (instead of trying to parse the login HTML page).
  if (url.pathname.startsWith('/api')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // Otherwise show the human-friendly password prompt.
  return loginPage(200, '');
}

// --- Login screen --------------------------------------------------------
// Styled to match the Gantt chart's palette (slate ink on a soft blue ground).
const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Operating Plan · Access</title>
<style>
  :root{ --ink:#0F172A; --muted:#64748B; --line:#E2E8F0; --card:#FFFFFF; --bg:#EEF2F7; --accent:#1F77B4; }
  *{ box-sizing:border-box; }
  html,body{ height:100%; margin:0; }
  body{
    display:grid; place-items:center; min-height:100%;
    background:radial-gradient(1200px 600px at 15% -10%, #F7FAFF 0%, rgba(247,250,255,0) 60%), var(--bg);
    color:var(--ink);
    font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing:antialiased; padding:24px;
  }
  .card{
    width:100%; max-width:360px; background:var(--card); border:1px solid var(--line);
    border-radius:16px; padding:32px 28px; box-shadow:0 10px 30px rgba(15,23,42,.06);
  }
  .lock{
    width:44px; height:44px; border-radius:12px; display:grid; place-items:center;
    background:#0F172A; color:#fff; margin:0 auto 16px; font-size:20px;
  }
  h1{ font-size:19px; font-weight:700; letter-spacing:-0.01em; text-align:center; margin:0 0 4px; }
  .sub{ text-align:center; color:var(--muted); font-size:13px; margin:0 0 22px; }
  label{ display:block; font-size:12px; font-weight:600; color:var(--muted); margin:0 0 6px; }
  input{
    width:100%; padding:11px 13px; font-size:16px; letter-spacing:.12em; text-align:center;
    border:1px solid var(--line); border-radius:10px; outline:none; transition:border-color .15s, box-shadow .15s;
  }
  input:focus{ border-color:var(--accent); box-shadow:0 0 0 3px rgba(31,119,180,.15); }
  button{
    width:100%; margin-top:14px; padding:11px 16px; font-size:14px; font-weight:600; color:#fff;
    background:#0F172A; border:0; border-radius:10px; cursor:pointer; transition:opacity .15s;
  }
  button:hover{ opacity:.92; }
  .err{ color:#D62728; font-size:12.5px; text-align:center; margin:12px 0 0; }
  .foot{ color:#94A3B8; font-size:11px; text-align:center; margin:18px 0 0; }
</style>
</head>
<body>
  <form class="card" method="POST" action="/login" autocomplete="off">
    <div class="lock">&#128274;</div>
    <h1>Operating Plan</h1>
    <p class="sub">Enter the access code to continue.</p>
    <label for="password">Access code</label>
    <input id="password" name="password" type="password" inputmode="numeric"
           autocomplete="off" autofocus required>
    <button type="submit">Unlock</button>
    <!--ERROR-->
    <p class="foot">This device will stay unlocked.</p>
  </form>
</body>
</html>`;
