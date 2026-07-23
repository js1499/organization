# Operating Plan · Gantt

An interactive, editable Gantt chart of the operating plan, hosted on Vercel
behind a shared-password gate. No build step — plain HTML/CSS/ES-modules.

## What it does

- **Tabs** — an **All** view plus one tab per business. On All, click a legend
  chip to hide/show a whole business (hiding a business is per-device).
- **Edit anything** — click a bar/row or the ✎ pencil to edit a task; a row's ✕
  **deletes** that task for everyone (with a confirm); **+ Add task** to create
  one; the **Businesses** button to add/rename/recolour/reorder/delete
  businesses. Changes save instantly and sync to everyone.
- **Live clock** — the "As of" stamp and the dashed *today* line follow live
  **US-Eastern** time (`America/New_York`, DST-aware). The time window auto-fits
  whatever is visible.
- **Refined UI** — subtle motion, hover states, and quiet synthesized audio
  (mute toggle, top-right; remembered per device).

## Architecture

| File            | Role                                                            |
| --------------- | --------------------------------------------------------------- |
| `index.html`    | Page shell                                                      |
| `app.css`       | Styles                                                          |
| `data.js`       | Seed plan (used first run / when the store is empty)            |
| `app.js`        | State, render, editing, clock, sound, persistence               |
| `api/plan.js`   | Cloud store endpoint (`GET` load / `POST` applies one operation) |
| `middleware.js` | Password gate (covers pages **and** `/api`)                     |

## Persistence

Edits always save to **localStorage** instantly, and to a shared **cloud store**
when one is connected — so the app works immediately, and "lights up" shared sync
once the store exists. The status pill (top-right) shows **On this device**,
**Saving…**, or **Synced**.

### Turn on shared cloud sync (one-time, free)

1. Vercel → this project → **Storage** tab → **Upstash Redis** → **Free** plan →
   **Connect** to this project. This auto-injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` — no key copying.
2. **Redeploy** (Deployments → ⋯ → Redeploy, or push any commit).

After that, everyone with the password sees the same plan from any device; the
Redis token stays server-side (the browser only ever talks to `/api/plan`).

**How edits stay unified.** The browser doesn't upload its whole plan (that would
let a stale tab overwrite others' changes). Instead each edit is sent as a single
**operation** — `deleteTask`, `upsertTask`, `deleteCat`, `upsertCat`,
`reorderCats` — and the server applies it to the *current* shared plan, then
returns the authoritative result. So a stale tab deleting one task can never
resurrect or erase anything else. Open tabs also **poll every ~10s** (and on
refocus) to pull others' changes, so everyone converges without reloading. Until
Upstash is connected, edits are simply per-device (localStorage only).

## Password gate

`GATE_PASSWORD` (the access code) and `GATE_SECRET` (signs the login cookie) live
in Vercel env vars — never in the repo. The cookie remembers a device for 1 year.
This is a light gate to keep out casual visitors, not strong authentication.

## Deploy

Connected to Vercel via GitHub: every push to `main` auto-deploys to production.
Framework Preset **Other**, no build command.
