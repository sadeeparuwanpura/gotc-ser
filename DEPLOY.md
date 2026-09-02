# Deploying `gotc-server` to Render

Front end: **https://gotc-clie.vercel.app** (Vercel)
API: this service (Render)

`render.yaml` is a Blueprint — Render reads it, creates the service and prompts for the two
secrets. Everything else is already set.

---

## 0. If the service already exists: fix these two settings first

**`render.yaml` is only read when the service is created as a Blueprint.** A Web Service made
by hand ignores it completely and keeps Render's defaults — and the default build command is a
bare `npm install`, which installs packages but never compiles anything. The service then
starts against a `dist/` that was never created:

```
==> Running build command 'npm install'...
==> Running 'node dist/index.js'
Error: Cannot find module '/opt/render/project/src/dist/index.js'
```

A `postinstall` hook (`scripts/postinstall-build.mjs`) compiles the server after
`npm install`, so a host left on its default build command still produces a runnable
`dist/`. **That is a safety net, not the fix** — it stops working the moment
`NODE_ENV=production` is set, because npm then skips `devDependencies` and there is no
compiler to run. The script says so in the build log rather than failing silently.

Go to **Settings** and set:

| Field | Value |
|---|---|
| **Build Command** | `npm install --include=dev && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |

Then **Manual Deploy → Clear build cache & deploy**.

`--include=dev` matters once `NODE_ENV=production` is set: npm skips `devDependencies` in
production, and TypeScript is one, so the build would fail with `tsc: not found`.

To use `render.yaml` instead, delete the service and recreate it via **New → Blueprint**.

## 1. Create the service

Render dashboard → **New** → **Blueprint** → pick this repository.

If the repository holds both apps, set **Root Directory** to `gotc-server`.

Render will ask for the two values marked `sync: false`:

| Variable | Value |
|---|---|
| `MONGODB_URI` | your Atlas string, ending `/tcms_dev_v1?ssl=true&...` |
| `JWT_SECRET` | Render generates one. To supply your own: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

Use a **fresh** `JWT_SECRET` for production — not the one in your local `.env`. Changing it
later signs everyone out, which is the point.

## 2. Allow Render to reach Atlas

Atlas → **Network Access** → add `0.0.0.0/0`.

Render's free and starter tiers have no static outbound IP, so an address allowlist cannot
work. This is almost certainly the cause of the intermittent `ENOTFOUND` errors during local
testing too.

## 3. Seed the production database

Once — from your machine, pointed at the production URI:

```bash
cd gotc-server
MONGODB_URI="<the production URI>" npm run seed:reset
```

`seed:reset` empties **only the nine GOTC collections** and never drops a database, but it
does delete GOTC data. On a database that already has real records, skip it.

## 4. Point the front end at the API

Render gives you a URL like `https://gotc-api.onrender.com`. Put it in
`gotc-client/vercel.json`:

```jsonc
{
  "source": "/api/:path*",
  "destination": "https://gotc-api.onrender.com/api/:path*"
}
```

Commit and redeploy the front end. **This is what makes the session work** — the browser only
ever talks to `gotc-clie.vercel.app`, so the `SameSite=Lax` cookie stays first-party. See
`gotc-client/DEPLOY.md` §1.

---

## What `render.yaml` handles that manual setup gets wrong

**`npm ci --include=dev`.** `NODE_ENV=production` is declared as a service variable, and
Render applies it during the *build* as well as at runtime. npm then skips
`devDependencies` — where TypeScript lives — so a plain `npm ci` fails with `tsc: not found`.

**`MONGOMS_DISABLE_POSTINSTALL=1`.** `mongodb-memory-server` is a devDependency whose
postinstall downloads a ~100 MB `mongod` binary. It is only used by `npm test`, and without
this it is fetched on every deploy.

**`healthCheckPath: /api/health`.** Answers without touching the database, so a cold instance
still reports healthy.

**`PORT`.** Render injects it; `src/config/env.ts` already reads it and the server binds all
interfaces. Do not set it yourself.

---

## The free tier will bite you

A free Render service **spins down after 15 minutes idle**, and the next request takes 50s or
more to wake it. Vercel's rewrite gives up well before that, so the first visit after a quiet
period returns a gateway error and the app looks broken.

For anything a person actually uses, take the paid instance. If you stay on free, expect to
load the page twice.

---

## Verify

```bash
curl https://gotc-api.onrender.com/api/health
# {"ok":true,"db":"connected"}

curl -i -X POST https://gotc-api.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"r.fernando@factory.lk","password":"demo1234"}'
# 200, and a Set-Cookie carrying gotc_session with Secure; HttpOnly; SameSite=Lax
```

If `Secure` is missing, `NODE_ENV` is not `production`. The browser will refuse the cookie on
HTTPS and every request after sign-in returns 401.

Then open https://gotc-clie.vercel.app, sign in, and **reload**. Staying signed in through a
reload is the real test — it proves the cookie is being stored and returned.

---

## CORS

`CLIENT_ORIGIN` accepts a comma-separated list, and an entry may use a `*.` subdomain
wildcard:

```
CLIENT_ORIGIN=https://gotc-clie.vercel.app,https://*.vercel.app
```

The wildcard covers Vercel's per-deployment preview subdomains, which a single exact origin
would never match.

With the `/api` rewrite in place none of this is exercised — the request reaches Render
server-to-server with no `Origin` header. It matters only if you call the API directly from a
browser, which also requires `sameSite: 'none'` on the cookie
(`gotc-client/DEPLOY.md` §1B).
