# IHHA Real Time Ops

A live dashboard of every agent on the **Inbound Home Health Agent** profile in Onyx,
filtered to **Available / On Call / Not Available** and sorted by **longest time in status**.
Share the URL with your team; everyone sees the same live list.

## How it works

```
Browser (public/index.html)  ──fetch /api/agents──▶  Node server  ──Onyx MCP──▶  Onyx
```

The server holds the Onyx API key (never the browser), queries Onyx, caches the result for
a few seconds, and serves it to every viewer. If Onyx isn't configured yet—or a call fails—it
falls back to a bundled snapshot so the page is never blank.

## Run locally

Requires Node 18.17+.

```bash
npm install
cp .env.example .env       # then paste your ONYX_API_KEY into .env
npm start
# open http://localhost:3000
```

With no key set it boots in **snapshot mode** (a "Snapshot" badge shows top-right).
Add `ONYX_API_KEY` and restart to go **live** (badge turns to "Live").

## Deploy (any Node host)

Works on Render, Railway, Fly.io, an internal VM, etc. Two things to set:

1. **Start command:** `npm start`
2. **Environment variables:** at minimum `ONYX_API_KEY`. Optionally `PORT`,
   `CACHE_TTL_MS`, and the `ONYX_AUTH_*` knobs if your key uses a non-standard header.

That's it—hand the team the deployed URL.

## If "Live" won't turn on

Check `GET /api/health` → `{ ok: true, onyx_configured: true/false }`.

- `onyx_configured: false` → the server can't see `ONYX_API_KEY`.
- configured but still snapshot → the `/api/agents` response includes an `error` field and
  the page shows it in a banner. Most often the auth header format differs: adjust
  `ONYX_AUTH_HEADER` / `ONYX_AUTH_SCHEME` to match how Onyx expects the key, or confirm the
  key has data-read (SQL) permissions.

## Changing the view

- The query lives in `src/onyx.js` (`AGENTS_SQL`). Change the profile id or columns there.
- Default status filter and sort are in `public/index.html` (`activeStatuses`, `sortKey`).
- Auto-refresh interval: `REFRESH_MS` in `public/index.html`.
