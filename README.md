# Operating Plan · Gantt

A single self-contained HTML Gantt chart (`index.html`), hosted on Vercel behind
a casual shared-password gate.

## How the password gate works

`middleware.js` runs on Vercel **before** any page is served. It shows a password
screen to anyone without a valid cookie, and serves the chart to anyone who has
entered the code. A correct code sets a "remember this device" cookie that lasts
**1 year** and slides forward on every visit, so people aren't re-prompted.

The password is **never stored in this repo**. It lives in two Vercel
environment variables:

| Variable        | Value                          | Notes                                              |
| --------------- | ------------------------------ | -------------------------------------------------- |
| `GATE_PASSWORD` | the access code (e.g. `2075`)  | what people type on the login screen               |
| `GATE_SECRET`   | a long random string           | signs the login cookie; generate with `openssl rand -hex 32` |

> Environment-variable changes are not retroactive — **redeploy** after changing them.

This is a light gate to keep random visitors out, not strong authentication.
Anyone given the code can share it, and the chart is fully readable once unlocked.
To raise the bar, use a longer `GATE_PASSWORD`. To log every device out, change
`GATE_SECRET` and redeploy.

## Local note

`package.json` exists only so Vercel installs the middleware helper
(`@vercel/functions`). There is no build step — the site is static.

## Deploy

Connected to Vercel via the GitHub repo: every push to `main` auto-deploys to
production. Framework Preset is **Other**, no build command, output is the repo root.
