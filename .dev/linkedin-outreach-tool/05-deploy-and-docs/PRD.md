# PRD: SP5 — Deployment, Gateway Integration & Docs

**Sub-project:** SP5
**Date:** 2026-08-29
**Status:** Planning — no implementation started

---

## 1. Problem

The LinkedIn Outreach Tool (SP1–SP4) is being built as a standalone SvelteKit app with no auth of its own (D25: admin-only, no guest view — "don't worry about it. It is private."). It needs to:

1. Run as its own long-lived process, independent of `cc-gateway`, per D16.
2. Be reachable at `cc.tejitpabari.com/linkedin` for a human sitting at a browser.
3. Be gated by the same password `cc-gateway` already enforces, with **zero new auth code** — the security bar for this deployment is explicitly "whatever cc-gateway already does is sufficient."
4. Survive `npm i && npm run build && pm2 start` on a machine that has never seen this repo before (D16's "share and transfer" requirement) and survive this machine's own reboots.

The BRAINSTORM's D16 justifies the separate-app decision by saying it "reuses the proven `/dashboard` → claud-ometer proxy pattern." **That pattern does not exist in `cc-gateway`'s source.** This PRD's first job is establishing that fact precisely, then designing the proxy from first principles against the machine's actual, verified state — which turned out to be considerably stranger than "no nginx installed." See §4.A.

---

## 2. Goals

1. Design an authenticated reverse-proxy path from `cc.tejitpabari.com/linkedin` to the new app's local port, reusing `cc-gateway`'s existing `cc_session` cookie / `verifySession()` — no new session mechanism, no new password, no new cookie.
2. Resolve the base-path question (`kit.paths.base`) precisely enough that SP1's `svelte.config.js` and SP2/SP3's fetch/asset URLs can be written against a single, stated contract, not a guess.
3. Resolve `ORIGIN` for adapter-node precisely enough that SP2's `POST`/`PATCH`/`PUT`/`DELETE` routes don't fail CSRF checks in production.
4. Produce a working `ecosystem.config.cjs`, `.env.example`, `config/README.md`, project `README.md`, `CLAUDE.md`, and a verified `.gitignore` for the new repo.
5. Resolve the `cc-gateway/CLAUDE.md` "every feature needs guest mode" rule against D25 ("admin-only, no guest view") explicitly, in writing, so a future maintainer doesn't "fix" this by adding guest access.
6. Leave the exact commands (build, `pm2 start`, `pm2 save`) that turn this design into a running system, and the commands that verify it end-to-end.

---

## 3. Non-Goals

- Any change to how `cc-gateway` authenticates users (D25's security bar: reuse, don't invent).
- Any change to `cc-gateway`'s guest-mode UI/data model — the resolution here is "never add `/linkedin` to `guestVisibility`," not "build a guest view and hide it."
- HTTPS termination, TLS certs, or DNS — out of scope; whatever currently terminates TLS for `cc.tejitpabari.com` continues to do so unchanged (see §4.A — this PRD's design requires **zero changes** to that layer).
- A shared-secret / mTLS handshake between `cc-gateway` and the new app. The new app binds to loopback only and is unreachable except via the proxy; adding a second secret would be exactly the kind of new auth mechanism the security bar rules out.
- Fixing `/root/projects/cc-gateway/deploy/nginx/cc-gateway.conf`, `deploy/README.md`, or `/root/projects/README.md`'s `cc-gateway` row, all of which were found to be stale during this investigation (§4.A). Flagged as [DEFERRED] in §9 — real doc debt, orthogonal to shipping this tool.
- SP1/SP2/SP3/SP4's own file contents — this PRD states the **contract** those sub-projects must build against (base path, `ORIGIN`, env vars, auth boundary) but does not re-derive their internals.

---

## 4. Architecture Decisions

### 4.A — Ground truth: what actually serves `cc.tejitpabari.com` (read this before anything else)

Every claim below is a command run on this machine (hostname `claude1`, public IP `65.21.49.199`, real `systemd` PID 1, `kvm` guest — not a container sandbox) during this investigation, with its actual output.

**nginx is not installed.**
```
$ which nginx            → (not found)
$ nginx -v                → command not found
$ systemctl status nginx  → Unit nginx.service could not be found.
$ ls /etc/nginx/          → No such file or directory
$ dpkg -l | grep nginx    → (no rows)
```
`deploy/nginx/cc-gateway.conf` and `deploy/README.md` describe an nginx-fronted deployment (`listen 80`, `proxy_pass http://127.0.0.1:3002`). That file is not installed anywhere (`/etc/nginx/sites-enabled` doesn't exist because `/etc/nginx` doesn't exist). It is aspirational/stale documentation, not the live path.

**PM2 currently runs nothing.**
```
$ pm2 list
┌────┬──────┬───────────┬─────────┬──────┬─────┬──────┬────────┬──────┬─────┬──────┬──────┬──────────┐
│ (empty table) │
└────┴──────┴───────────┴─────────┴──────┴─────┴──────┴────────┴──────┴─────┴──────┴──────┴──────────┘
```
`ps aux` shows only `PM2 v6.0.14: God Daemon`, freshly spawned today at 07:45, no worker processes. `/root/.pm2/dump.pm2` (PM2's "what to resurrect" file) does contain a stale record of an app with `"status": "stopped"`, captured in an environment carrying `CODEX_THREAD_ID`/`CODEX_CI` variables — i.e. from a *different* prior agent session, not a currently-running process. No `pm2 startup` systemd unit exists (`systemctl list-unit-files | grep pm2` → nothing), so nothing here would survive a reboot even if started right now.

**Nothing is listening on `cc-gateway`'s port, or any app port.**
```
$ ss -ltnp
LISTEN 127.0.0.1%lo:53   (systemd-resolved)
LISTEN 127.0.0.1:34731   (claude — this CLI's own local server)
LISTEN 0.0.0.0:22        (sshd)
(nothing on 80, 443, 3001, 3002, 3003)
```

**Yet `cc.tejitpabari.com` is live, right now, serving real content:**
```
$ curl -sI https://cc.tejitpabari.com/
HTTP/2 200
server: cloudflare
cf-cache-status: DYNAMIC
link: <./_app/immutable/assets/0.GQVmjheu.css>; rel=preload ...  (a real SvelteKit response)
$ getent hosts cc.tejitpabari.com
2606:4700:3034::ac43:83a9   (Cloudflare anycast range)
2606:4700:3034::6815:42f
```
`cf-cache-status: DYNAMIC` rules out a stale cached page — this is a live, freshly-proxied response from an actual origin. And the firewall corroborates a Cloudflare-fronted design:
```
$ ufw status verbose
Default: deny (incoming)
22/tcp        ALLOW   Anywhere
80            ALLOW   <Cloudflare's published IPv4 ranges, ~15 entries>
80            DENY    Anywhere        ← catch-all after the allowlist
(no rule for 443, 3002, or any app port — the box is not reachable on those ports from the public internet at all)
```
Port 80 is only reachable from Cloudflare's edge IPs, nothing else — this firewall was deliberately built for a Cloudflare-fronted origin. `cloudflared` (v2026.3.0) is installed as a binary and holds a saved tunnel credential (`~/.cloudflared/cert.pem`, an Argo Tunnel token dated March), but is **not currently running** (`ps aux` has no `cloudflared` process, `systemctl status cloudflared` → unit not found, no `/etc/cloudflared/config.yml`).

**Conclusion, stated plainly:** something is serving `cc.tejitpabari.com` right now — the response is genuine and dynamic — but it is not observable from this shell. Either (a) this specific interactive session is somehow isolated from the process/network state of the box that's actually fronting the domain, or (b) the live origin is a different machine/mechanism than the one this session's `ps aux`/`ss` can see. This machine has the firewall rules, the `cloudflared` credential, and the `cc-gateway` repo with real secrets in `.env` — consistent with being *the* production box in its normal resting state — but I cannot make PM2's empty list, nginx's absence, and a live `cf-cache-status: DYNAMIC` response agree from inside this shell. **This is recorded as [OPEN] #1 in §9 and must be confirmed by Tejit before deployment.**

**Why this doesn't block the design anyway.** Whatever mechanism fronts `cc.tejitpabari.com` — nginx, Cloudflare Tunnel, or something else — the only thing it needs to know about is `cc-gateway` itself, on whatever port `cc-gateway`'s own `.env` says (`PORT=3002`, confirmed by reading the file). **This PRD's design never asks that ingress layer to learn a second port.** The new app is wired in *behind* `cc-gateway`, as a route `cc-gateway` itself proxies to over loopback. So the nginx-vs-Cloudflare-Tunnel-vs-unknown question, however unresolved, is orthogonal to shipping `/linkedin` — see §4.B. This is the strongest argument for the in-app-proxy design over an nginx `location /linkedin` block: **it requires zero edits to whatever is actually fronting the domain**, which is exactly the layer this investigation couldn't fully pin down.

### 4.B — The proxy: a catch-all route inside `cc-gateway`

**Decision: Option (a) from the brief** — a SvelteKit route inside `cc-gateway` that runs after `hooks.server.js` auth and forwards to the new app over loopback. Rejected: an nginx `location /linkedin` block (§4.A shows nginx isn't even the confirmed ingress layer, and pairing it with `auth_request` would be new auth machinery the security bar rules out).

**New file:** `/root/projects/cc-gateway/src/routes/linkedin/[...path]/+server.js`

```js
import { error } from '@sveltejs/kit';

// Falls back to the app's default dev port if unset; production sets this in cc-gateway's .env
// (mirrors the existing but currently-unused DASHBOARD_URL convention already in that file).
const LINKEDIN_URL = process.env.LINKEDIN_URL || 'http://127.0.0.1:3003';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'
]);

function stripHopByHop(headers) {
  const h = new Headers(headers);
  for (const name of HOP_BY_HOP) h.delete(name);
  return h;
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
async function proxy(event) {
  // Defense-in-depth. hooks.server.js already default-denies this path prefix for
  // role === 'guest' (it is never added to settings.json's guestVisibility map — see §4.C),
  // so an unauthenticated or guest request never reaches this line. This check exists so that
  // a future accidental guestVisibility['/linkedin'] = true edit in /settings cannot expose
  // the app — it fails closed here regardless of that map's contents.
  if (event.locals.role !== 'admin') {
    throw error(403, 'Forbidden');
  }

  const upstreamUrl = new URL(event.url.pathname + event.url.search, LINKEDIN_URL);
  const headers = stripHopByHop(event.request.headers);

  const init = {
    method: event.request.method,
    headers,
    redirect: 'manual' // forward 3xx to the browser as-is; never let our fetch() silently follow one
  };
  if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
    init.body = event.request.body;
    init.duplex = 'half'; // required by undici/Node fetch whenever body is a ReadableStream
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, init);
  } catch (err) {
    // linkedin-outreach PM2 process down/unreachable — fail cleanly, don't take cc-gateway down.
    throw error(502, 'linkedin-outreach-tool is unreachable');
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: stripHopByHop(upstreamResponse.headers)
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
```

Notes on why each piece is there:

- **`[...path]` rest parameter** matches `/linkedin` itself (zero segments) as well as `/linkedin/_app/immutable/...` and `/linkedin/api/week/2026-W35` — one route file covers the page, its assets, and its whole API surface. No `+page.svelte`/`+page.server.js` sibling exists in this directory, so nothing intercepts requests before they reach `+server.js`.
- **Request body streamed, not buffered**: `event.request.body` is passed straight through as a `ReadableStream`; `duplex: 'half'` is the (easy to miss) flag Node's `fetch`/undici requires whenever the request body is a stream rather than a buffer. Skipping it produces a runtime `TypeError` on the first non-GET request with a body.
- **Response body streamed, not buffered**: `new Response(upstreamResponse.body, ...)` forwards the upstream `ReadableStream` directly; nothing here reads it into memory first. This matters for `GET /linkedin/api/export/all` (SP2), which can be a multi-week JSON download.
- **`redirect: 'manual'`**: without this, `fetch()` would transparently follow any 3xx from the app and return its *final* body/status to the browser, silently breaking any navigation-style redirect the app issues and confusing the base-path contract.
- **Hop-by-hop header stripping** (both directions) follows RFC 7230 §6.1 practice for a reverse proxy; `host` is included so `fetch()` sets it correctly for the loopback target instead of forwarding `cc.tejitpabari.com`.
- **No `OPTIONS` export**: SvelteKit auto-generates a default `OPTIONS` (204, `Allow` header) when none is defined. The new app never needs custom `OPTIONS`/CORS handling (everything is same-origin from the browser's perspective — see §4.D), so this default is left alone rather than proxied.
- **`event.locals.role`** already exists on every request by the time this file runs — `hooks.server.js` sets it (`'admin'` or `'guest'`) before any route handler executes, for every request including this one.

**Small, precise edit to `hooks.server.js`.** Its `isApiRequest` check is:
```js
const isApiRequest = path === '/api' || path.startsWith('/api/');
```
This governs whether a denied request gets a `403 {"error":"Forbidden"}` JSON body or a `302` redirect to `/login`. `/linkedin/api/week/2026-W35` does **not** match either arm — it doesn't start with `/api/`, it starts with `/linkedin`. Today this is cosmetic (no unauthenticated request reaches `/linkedin/*` at all, per §4.C's default-deny), but it matters for the one real scenario a single long-lived admin session will actually hit: **the `cc_session` cookie expires** (it's a 1-year `maxAge`, but SP3/SP4 will run client-side `fetch()` calls against `/linkedin/api/...` from an already-open tab) — without this fix, a session-expired `fetch()` from SP2's JSON API gets back a `302` HTML redirect to `/login` instead of a `403` JSON body, which SP2's `response.json()` will throw on. Fix:

```diff
- const isApiRequest = path === '/api' || path.startsWith('/api/');
+ const isApiRequest =
+   path === '/api' || path.startsWith('/api/') ||
+   path.startsWith('/linkedin/api/');
```

This is the only change to `hooks.server.js`. It does not touch the guest-visibility logic at all.

**New env var, `cc-gateway/.env`:**
```
LINKEDIN_URL=http://127.0.0.1:3003
```
This mirrors the existing-but-currently-unread `DASHBOARD_URL` key already sitting in that file — this PRD is the first thing that actually wires such a key into code. `cc-gateway`'s `ecosystem.config.cjs` needs no change: its `loadEnvFile('.env')` already slurps every key in the file into `process.env` generically.

### 4.C — Admin-only vs. `cc-gateway/CLAUDE.md`'s guest-mode rule (the direct conflict, resolved)

`cc-gateway/CLAUDE.md` states: *"Every feature on this site must support a guest read-only mode."* D25 states the opposite for this tool: *"Admin-only... don't worry about it. It is private."* Reading `hooks.server.js` in full resolves this cleanly, without contradiction, because guest access is **opt-in per path prefix**, not opt-out:

```js
const role = verifySession(sessionCookie) || 'guest';   // no/invalid cookie → 'guest'
...
if (role === 'guest') {
  const settings = readSettings();
  const allowedByPrefix = Object.entries(settings.guestVisibility || {})
    .some(([p, v]) => v === true && (path === p || path.startsWith(p + '/')));
  if (!allowedByPrefix) {
    if (isApiRequest) return jsonError(403, 'Forbidden');
    throw redirect(302, '/login');
  }
}
return resolve(event);   // role === 'admin' always falls through, unconditionally
```
`role === 'admin'` never touches the `guestVisibility` check at all — it's an `if (role === 'guest')` block. So the resolution is: **`/linkedin` is simply never added to `settings.json`'s `guestVisibility` map.** With no entry, `allowedByPrefix` is `false` for any guest request, and every guest (including an anonymous visitor with no cookie at all, since `verifySession(null) → null → role = 'guest'`) gets redirected to `/login` for a page request or `403` for an API request (once §4.B's `hooks.server.js` fix lands). An admin session sails through unconditionally. Nothing about this requires new code beyond simply *not* configuring guest visibility — the existing default-deny does the work.

**Documentation fix, one line, `cc-gateway/CLAUDE.md`**, under "Guest / Read-Only Mode":
```diff
  - **Settings**: Guest visibility per page is controlled at `/settings` (Guest Visibility section). New pages must be added to the `pages` array in both `+page.server.js` and `+page.svelte` of the settings route.
+ - **Exception — `/linkedin`**: deliberately admin-only, no guest mode (LinkedIn Outreach Tool, D25). Do not add it to the settings `pages` array or `guestVisibility` map.
```
This exists purely so a future maintainer (human or agent) reading the "every feature needs guest mode" rule doesn't "fix" `/linkedin`'s absence from `/settings` by adding it.

### 4.D — Base path (`kit.paths.base`) and `ORIGIN`: the two decisions SP2/SP3 build against

**`kit.paths.base = '/linkedin'`.** The new app must set this in `svelte.config.js` (an SP1-owned file; this is the required interface value SP1's file must contain):
```js
import adapter from '@sveltejs/adapter-node';

export default {
  kit: {
    adapter: adapter(),
    paths: { base: '/linkedin' }
  }
};
```
**Why not the alternative** (app rooted at `''`, proxy strips the `/linkedin` prefix before forwarding): SvelteKit emits asset URLs as base-relative absolute paths (`/_app/immutable/...`), not page-relative ones. If the app doesn't know its own base, its generated HTML references `/_app/...` at the *root* of whatever origin serves it — which the browser resolves against `cc.tejitpabari.com` (not `.../linkedin`), landing on paths `cc-gateway` doesn't own and that would collide with `cc-gateway`'s **own** `/_app/immutable/...` assets (`cc-gateway` is itself a SvelteKit app serving its own build from the same root). Setting `paths.base` makes every asset/link/fetch URL the app generates already carry the `/linkedin` prefix (`/linkedin/_app/immutable/...`), which is exactly the path the proxy in §4.B forwards unchanged — a 1:1 pass-through with no rewriting on either side. This is the standard, documented way SvelteKit + adapter-node supports subpath hosting, and it composes correctly with the `[...path]` rest-param proxy (which never needs to add or strip a prefix).

**The consequence SP2/SP3 must build against:** any hardcoded `fetch('/api/...')` or `<a href="/some-page">` **will 404 in production** — it resolves against the site root (`cc.tejitpabari.com/api/...`), not the app's own base. SP2/SP3 must either:
- import `{ base } from '$app/paths'` and write `` fetch(`${base}/api/week/${week}`) ``, or
- use path-relative URLs with no leading slash (`fetch('api/week/...')`) resolved against the current page URL, which is already under `/linkedin/...`.

Either is correct; SP2's own PRD already flagged this exact question as `[OPEN]` pending SP5 — this is the answer. Route **file locations** inside `src/routes/api/...` do not change at all; only URL construction in client code does.

**`ORIGIN=https://cc.tejitpabari.com`** — set in the new app's own `.env` (consumed by `ecosystem.config.cjs`, §4.E). adapter-node uses this env var, when present, as the authoritative value for `event.url.origin` — overriding whatever it would otherwise infer from request headers. This is scheme+host only, **no path segment** (`paths.base` and `ORIGIN` are independent: base affects `pathname`, `ORIGIN` affects `origin`). Two things depend on getting this right:

1. **SvelteKit's CSRF origin check.** For any non-GET/HEAD request, SvelteKit compares the browser's `Origin` header against `event.url.origin`. A form/`fetch()` POST from a page loaded at `https://cc.tejitpabari.com/linkedin/...` sends `Origin: https://cc.tejitpabari.com`. With `ORIGIN` set correctly, `event.url.origin` is the same string — the check passes. Get this wrong (e.g. leave it unset, so adapter-node falls back to the `Host` header it sees on the loopback connection — `127.0.0.1:3003`, since §4.B's proxy deliberately strips the inbound `Host` header) and every `POST`/`PATCH`/`PUT`/`DELETE` in SP2's API fails with SvelteKit's generic cross-site-POST 403 — a notoriously unhelpful error to debug blind.

2. **A deliberate divergence from SP1's current draft, flagged for reconciliation.** SP1's PRD (`01-core-data-layer/PRD.md`) copies `cc-gateway`'s `csrf: { checkOrigin: false }` verbatim into the new app's `svelte.config.js`, reasoning that `cc-gateway` needs it "because it runs behind a reverse proxy where the origin header doesn't match." **That reasoning doesn't transfer.** `cc-gateway` disabling the check is very likely working around `ORIGIN` not being reliably correct for it (it serves two hostnames — `cc.tejitpabari.com` and `go.tejitpabari.com` — off one `ORIGIN` value) or simply pre-dating a fix; it isn't an inherent requirement of "being proxied." This app is single-hostname, and once `ORIGIN` is set correctly (above), the default `checkOrigin: true` **costs nothing and passes** — there is no proxying-related reason to disable it. I recommend the new app's `svelte.config.js` **omit** the `csrf` override entirely (SvelteKit's default is `checkOrigin: true`) and rely on a correctly-set `ORIGIN` instead. This is a small, one-line divergence from SP1's current draft that SP1 should apply before implementation — noting it here since it's this PRD's `ORIGIN` decision that makes the divergence safe. (Belt-and-suspenders note, not the reason to make the change: `cc-gateway`'s login cookie is also set `sameSite: 'lax'`, which independently blocks cross-site POST from carrying `cc_session` in modern browsers — so even in the counterfactual where `checkOrigin` were left disabled, classic CSRF isn't wide open. But there's no reason to lean on that alone when the correct fix is free.)

### 4.E — PM2: `ecosystem.config.cjs`, env, ports, binding, logs, persistence

**Port allocation.** `cc-gateway` holds `3002` (its own `.env`, confirmed by reading it). `/root/projects/README.md` documents `claud-ometer` on `3001`. `ss -ltnp` (§4.A) confirms nothing is bound to `3003` on this box right now. **`PORT=3003`**, configurable via the app's own `.env`.

**Bind address — `HOST=127.0.0.1`, not the default `0.0.0.0`.** This machine's public IP (`65.21.49.199`) is bound directly to `eth0`, not NAT'd behind anything (§4.A). `ufw` currently only allows inbound `22` and `80` (from Cloudflare's ranges) — so today, even an app bound to `0.0.0.0:3003` wouldn't be reachable externally. But that protection is `ufw`'s, not the app's, and it's one `ufw allow 3003` away from an accident. adapter-node reads a `HOST` env var (default `0.0.0.0`); setting it to `127.0.0.1` makes the app **only** reachable from the same machine regardless of firewall state — the only path in is through `cc-gateway`'s authenticated proxy on loopback. Cheap, and matches "reuse, don't invent": no new auth is added, but the one auth-free surface that exists (the raw app port) is made unreachable from anywhere the invented-nothing auth doesn't already cover.

**New file:** `/root/projects/linkedin-outreach-tool/ecosystem.config.cjs` — mirrors `cc-gateway`'s `loadEnvFile()` pattern exactly (same function, copied verbatim):
```js
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  } catch (e) { /* ignore */ }
  return env;
}

module.exports = {
  apps: [{
    name: 'linkedin-outreach',
    script: 'build/index.js',
    env: { NODE_ENV: 'production', ...loadEnvFile('.env') }
  }]
};
```

**Build-before-restart** (mirrors `cc-gateway/CLAUDE.md`'s rule exactly, restated in the new repo's own `CLAUDE.md`, §4.G):
```bash
npm run build && pm2 restart linkedin-outreach
```
(and, for `cc-gateway` itself, after the §4.B/§4.C edits land: `npm run build && pm2 restart cc-gateway`.)

**Persistence.** No `pm2 startup` systemd unit exists on this box today for *any* app (§4.A) — this is a pre-existing gap, not new to this project, but it means neither `cc-gateway` nor the new app will survive a reboot unless someone runs `pm2 startup` (prints a `sudo`-requiring systemd-install command) once, followed by `pm2 save` after both apps are started. This is sudo-gated and listed under §8, not automated here.

**Logs.** Default PM2 log locations, no custom path configured: `/root/.pm2/logs/linkedin-outreach-out.log` and `/root/.pm2/logs/linkedin-outreach-error.log`.

**Interface assumption for SP1's `package.json`** (SP1 owns this file — stated here only as the deploy-time contract): `scripts.build` must produce `build/index.js` (adapter-node's standard output — `vite build` with `@sveltejs/adapter-node` does this by default, no special config needed), and there is no `scripts.start` requirement from PM2's side since `ecosystem.config.cjs` invokes `build/index.js` directly with `node` (matching `cc-gateway`'s own `script: 'build/index.js'`) rather than going through `npm start`.

### 4.F — `.env.example`

**New file:** `/root/projects/linkedin-outreach-tool/.env.example`
```env
# Port the app listens on. cc-gateway holds 3002, claud-ometer holds 3001 — this app uses 3003.
PORT=3003

# Bind to loopback only. This app has no auth of its own (D25) — it is reachable exclusively
# through cc-gateway's authenticated proxy at /linkedin, which connects over 127.0.0.1. Do not
# change this to 0.0.0.0 unless you are also adding real auth to this app.
HOST=127.0.0.1

# Must be the PUBLIC origin the browser sees (scheme + host, no path, no trailing slash) — NOT
# this app's own loopback address. Required for adapter-node's CSRF origin check to pass on
# POST/PATCH/PUT/DELETE requests arriving via the /linkedin proxy. See PRD §4.D if this is wrong
# and every write request in the app starts failing with a cross-site-POST error.
ORIGIN=https://cc.tejitpabari.com

# DeepSeek-compatible chat completions endpoint for diary parsing (BRAINSTORM D7). Already
# exported in this machine's ~/.bashrc for other tools — copy the real values from there, do not
# invent new ones. The app must run correctly with these unset (BRAINSTORM §3.6: parse fails
# gracefully, manual counters still work).
WORKER_API_KEY=
WORKER_BASE_URL=
WORKER_MODEL=
```
No `GATEWAY_PASSWORD`, `SESSION_SECRET`, or any session/auth key — this app deliberately has none (D25 + the security-bar directive).

### 4.G — `config/README.md`

**New file:** `/root/projects/linkedin-outreach-tool/config/README.md` — full schema documentation plus a worked "repoint at a different domain" example, since D17 makes this a real deliverable:

````markdown
# `config/config.json` schema

This file defines what the tracker tracks: lanes, tasks, metrics, and pinned links. It contains
no personal data (D12) and is safe to commit and share. Everything the tool measures each week —
what counts as a task, what the min/target quotas are, which metrics get a headline number — comes
from here, not from code. Edit this file by hand; there is no migration system (no database at
all — see the project README).

## Top-level fields

| Field       | Type   | Notes |
|-------------|--------|-------|
| `version`   | number | Always `1` for this schema. Bumped only if the shape changes incompatibly. |
| `name`      | string | Display name shown on the page (e.g. `"LinkedIn Outreach — Juno"`). |
| `timezone`  | string | IANA zone (e.g. `"America/Los_Angeles"`). Controls what "this week" means — see the app's `weeks.js`. |
| `lanes`     | array  | See below. |
| `tasks`     | array  | See below. |
| `metrics`   | array  | See below. |
| `links`     | array  | See below. |

## `lanes[]`

```json
{ "id": "outreach", "label": "Outreach", "blurb": "Get to data + customers" }
```

| Field   | Type   | Required | Notes |
|---------|--------|----------|-------|
| `id`    | string | yes | Unique. Referenced by `tasks[].lane`. |
| `label` | string | yes | Shown as the lane heading. |
| `blurb` | string | no  | One-line subtitle under the heading. |

D1 ships with exactly two lanes (`outreach`, `presence`). Nothing in the code requires exactly
two — the count is config-driven — but the app's layout was designed around a small number of
lanes shown side by side; more than 3–4 will likely look cramped.

## `tasks[]`

```json
{ "id": "invites", "lane": "outreach", "label": "Targeted connection requests", "min": 10, "target": 15, "link": "optional" }
```

| Field    | Type    | Required | Notes |
|----------|---------|----------|-------|
| `id`     | string  | yes | Unique. Referenced by week files' `counts`/`items[].taskId`. **Do not rename an existing task id** once you have logged weeks against it — old week files keep the old id and will show as an unrecognized/orphaned count. Add a new task instead, or edit historical `data/*.json` by hand if you really mean to rename. |
| `lane`   | string  | yes | Must match a `lanes[].id`. |
| `label`  | string  | yes | Shown on the task's progress bar. |
| `min`    | integer | yes | The quota that "clears" the week for this task (D4) — the bar going green/complete. Must be `>= 0`. |
| `target` | integer | yes | The stretch number (D4) — shown as a second mark on the same bar. Must be `>= min`. `min > target` is a hard config-validation error. |
| `link`   | `"optional" \| "required"` | yes | D15. `"required"` means the UI will not let you log this task without attaching a URL (e.g. `post`, where the URL is the only record of what was actually published — content lives in Google Docs, never in this tool). `"optional"` means you can tap-log with no link and attach one later. |

Setting `min` equal to `target` (as the shipped `post` task does: `min: 1, target: 1`) means
there's no stretch tier for that task — it's just a single quota.

## `metrics[]`

```json
{ "id": "followers", "label": "Followers", "headline": true }
```

| Field       | Type    | Required | Notes |
|-------------|---------|----------|-------|
| `id`        | string  | yes | Unique. Referenced by week files' `metrics`. Same rename caveat as `tasks[].id`. |
| `label`     | string  | yes | Shown next to the number. |
| `headline`  | boolean | no (default `false`) | At most one metric should set this `true` — it gets the sparkline treatment (D20) as the tool's single "how far have I come" number. Set on `followers` by default. |

Metrics are **entered manually** (D6/D22 — no LinkedIn API, no scraping, ever) and are stored as
absolute values per week, not deltas — a diary entry saying "followers at 1032" *sets* the number,
it doesn't add to it. Counters (`tasks[]`) are the opposite: they accumulate deltas over the week.

## `links[]`

```json
{ "label": "Reachouts sheet", "url": "" }
```

| Field   | Type   | Required | Notes |
|---------|--------|----------|-------|
| `label` | string | yes | Shown in the pinned-links strip. |
| `url`   | string | yes (may be `""`) | An empty string is allowed and renders as a not-yet-filled-in pin — fill it in later. No id; links are matched/edited by array position. |

## Validation rules (hard errors, not warnings)

Enforced on every load (`GET /api/config`, and again inside `PUT /api/config` before any write —
"a broken config must never lose data"):

- Every `tasks[].lane` must reference an existing `lanes[].id`.
- No duplicate `id` within `lanes`, within `tasks`, or within `metrics` (ids only need to be
  unique within their own array — a task and a metric may share an id string without conflict,
  though avoiding that is clearer in practice).
- `tasks[].min <= tasks[].target`, both `>= 0`, both integers.
- `tasks[].link` is exactly `"optional"` or `"required"`.
- At most one `metrics[].headline === true`.

A validation failure surfaces as a readable message naming the offending field on the page —
never a stack trace — and never touches `data/`.

## Worked example: repointing the tool at a different domain (D17)

D17: *"the tool is still called LinkedIn outreach tool. Not a generic task tracking tool. But
let's say tomorrow I want to increase my outreach in a different area, I can change things
around."* The behavior (diary parsing, min/target bars, weekly reset, history) is fixed; what
it's tracking is not. Example — repointing this same tool at cold-email outreach instead of
LinkedIn, by editing `config.json` alone, no code changes:

```json
{
  "version": 1,
  "name": "Cold Email Outreach — Juno",
  "timezone": "America/Los_Angeles",
  "lanes": [
    { "id": "outbound", "label": "Outbound", "blurb": "New emails sent" },
    { "id": "followthrough", "label": "Follow-through", "blurb": "Replies + calls" }
  ],
  "tasks": [
    { "id": "cold_emails", "lane": "outbound", "label": "Cold emails sent", "min": 15, "target": 25, "link": "optional" },
    { "id": "followups",   "lane": "outbound", "label": "Follow-up emails", "min": 5,  "target": 10, "link": "optional" },
    { "id": "replies_handled", "lane": "followthrough", "label": "Replies responded to", "min": 3, "target": 6, "link": "optional" },
    { "id": "calls_booked_task", "lane": "followthrough", "label": "Calls booked from outreach", "min": 1, "target": 3, "link": "optional" }
  ],
  "metrics": [
    { "id": "reply_rate", "label": "Reply rate (%)", "headline": true },
    { "id": "meetings_booked", "label": "Meetings booked" }
  ],
  "links": [
    { "label": "Email tracking sheet", "url": "" },
    { "label": "Template doc", "url": "" }
  ]
}
```

Nothing in `src/` changes. The page title, lane headings, task bars, and metric labels all follow
this file. Historical `data/*.json` week files logged under the *old* config keep whatever task/
metric ids they were logged with — they don't retroactively relabel, and a week file referencing
an id no longer in `config.json` is not an error (it's just not shown/editable on the current
week's bars; it stays intact in the raw JSON).
````

### 4.H — Project `README.md`

**New file:** `/root/projects/linkedin-outreach-tool/README.md`
```markdown
# LinkedIn Outreach Tool

A weekly LinkedIn outreach + presence tracker, built for one person (Tejit), for one reason:
routine, low-dopamine outreach work reliably decays into "boring, don't wanna do it" without a
system that makes a week look small, costs nothing to log, and never delivers a verdict on a bad
week. Full design rationale: `.dev/linkedin-outreach-tool/BRAINSTORM.md`.

This is not a generic task tracker wearing a LinkedIn name — the behavior (diary-first logging,
min/target quotas, weekly reset, neutral missed weeks) is specific and opinionated. What it
*tracks* is configurable; see `config/README.md`.

## No LinkedIn API. No scraping. All metrics are manual.

There is no automated ingestion of any kind, ever. No sanctioned API path exists for an
individual account (the Member Post Analytics API requires a verified Company Page, which would
break stealth); scraping/session tools are LinkedIn ToS violations that risk the account being
grown. Every number in this tool — followers, impressions, replies, calls booked — is typed in by
hand, either via the diary (parsed into structured deltas by an LLM, then shown as a preview you
approve or discard before anything is written) or via manual counters/fields. The diary text
itself is always saved verbatim first, before any parsing happens, and is the permanent source of
truth regardless of what the parser does with it.

## No database

State is JSON files on disk: `config/config.json` (shareable, no personal data) and one file per
ISO week under `data/` (private, gitignored, never committed). There is nothing to migrate and
nothing to provision — the whole app's state is `git clone` plus that one folder.

## Quick start

```bash
git clone <this repo>
cd linkedin-outreach-tool
npm install
cp .env.example .env        # fill in WORKER_API_KEY / WORKER_BASE_URL / WORKER_MODEL if you want
                             # diary parsing; the app works without them (manual counters only)
npm run build
npm start                   # or: pm2 start ecosystem.config.cjs
```
Then open `http://localhost:3003` (or wherever `PORT` points). If you're running this behind
`cc-gateway` at `cc.tejitpabari.com/linkedin`, see that repo's proxy route instead — this app has
no auth of its own and is not meant to be exposed directly to the internet (see `.env.example`'s
`HOST` comment).

## Backup / sharing story: import & export

There is no server-managed backup. `GET /api/export/all` downloads everything (`config.json` plus
every week file) as one JSON bundle; `POST /api/import` restores from that bundle (or a single
week's export) without deleting weeks the bundle doesn't mention. This doubles as how you'd hand
the *tool* (not your data) to someone else: they get `config/config.json` via the repo, never your
`data/`.

## Config vs. data

- `config/config.json` — what the tool tracks. Shareable. Committed to git. Schema: `config/README.md`.
- `data/*.json` — one file per ISO week, what actually happened. Private. Gitignored. Never committed.
```

### 4.I — Project `CLAUDE.md`

**New file:** `/root/projects/linkedin-outreach-tool/CLAUDE.md`
```markdown
# linkedin-outreach-tool

## Build Before Restart

This is a SvelteKit app running from a compiled build (`build/index.js`), same as `cc-gateway`.
After any code change, always run `npm run build` before restarting the PM2 process, or the
change will not be reflected:

```bash
npm run build && pm2 restart linkedin-outreach
```

## No auth in this app

This app has no login, no session, no password of its own — by design (D25). It is reachable
only via `cc-gateway`'s authenticated proxy at `cc.tejitpabari.com/linkedin`, over loopback
(`HOST=127.0.0.1` in `.env`). Do not add a login page, a session cookie, or any `locals.role`
check here — that would duplicate `cc-gateway`'s auth for zero benefit, since this app is
unreachable except through it. If this app ever needs to be reachable independent of
`cc-gateway`, that is a real security decision requiring its own design, not a small addition.

## Where data lives

- `config/config.json` — shareable, no personal data, committed to git. Schema: `config/README.md`.
- `data/*.json` — one file per ISO week, gitignored, never committed. This is the actual outreach
  record — treat it like the private thing it is.

## What must never be added (BRAINSTORM §4 non-goals)

- No LinkedIn API integration, scraping, or browser automation — ever, for any reason.
- No notifications, email, or push. The tab-title counter is the only "reminder" this tool has.
- No target-list sync/mirror — the Reachouts Google Sheet stays the single owner; this tool only
  links to it.
- No CRM features: no per-person records, notes, pipeline stages, intro graph.
- No post *content* storage — links to Google Docs only.
- No XP, levels, badges, leaderboards, seasons, or resets.
- No guest/public view, no data sharing beyond handing someone `config.json`.
- No multi-user support, no auth beyond `cc-gateway`'s existing password.
- No voice input.

If a task seems to require one of the above, it's very likely out of scope — check
`.dev/linkedin-outreach-tool/BRAINSTORM.md` §4 before building it.
```

### 4.J — `.gitignore`

Current file (5 lines, confirmed by reading it):
```
node_modules/
.env
.svelte-kit/
build/
data/
```
This covers D12's config/data separation correctly (`data/` ignored, `config/` not) and the
standard SvelteKit/Node build artifacts. Two additions recommended, neither currently present:
```diff
  node_modules/
  .env
+ .env.local
  .svelte-kit/
  build/
  data/
+ /root/.pm2/logs is outside the repo, so no PM2 log entry is needed here.
```
In practice: add `.env.local` (SvelteKit/Vite convention for a personal override file that should
never be committed, even though nothing currently creates one) as the only real addition. PM2 logs
already live outside the repo (`~/.pm2/logs/`), so nothing there needs ignoring.

### 4.K — `/root/projects/README.md`

The existing row is already accurate and needs no change for this PRD's purposes:
> `linkedin-outreach-tool` | local (new) | LinkedIn outreach + presence tracker. Weekly quota
> tracker with diary-based logging, JSON-configurable goals. Separate SvelteKit app proxied behind
> cc-gateway at cc.tejitpabari.com/linkedin. Design in .dev/.

Optional, low-priority polish once the app is actually running: append the PM2 process name/port
(`Runs via PM2 (linkedin-outreach, port 3003)`), matching the style of the `claud-ometer` and
`cc-gateway` rows. Not required — deferred to whoever does the final wiring after SP4, since the
row is already correct in substance.

**Separately, and out of scope for this PRD:** the `cc-gateway` row in the same file is stale —
it describes cc-gateway as "an Express app on port 80 [that] proxies /dashboard to claud-ometer."
Both `package.json` and `svelte.config.js` (read directly) show cc-gateway is a SvelteKit/
adapter-node app on port `3002` (per `.env`), and no `/dashboard` proxy exists anywhere in
`src/` (`grep -rni dashboard src/` → nothing). Flagged for awareness only; fixing it is unrelated
to shipping this tool. See §9 [DEFERRED].

---

## 5. API Change Summary

| Route | Owner | Before | After |
|---|---|---|---|
| `cc-gateway`: `src/routes/linkedin/[...path]/+server.js` | **SP5 (new)** | Does not exist | Catch-all authenticated reverse proxy: `GET/POST/PUT/PATCH/DELETE/HEAD` on `/linkedin/**` → `role !== 'admin'` gets `403`; otherwise streamed proxy to `http://127.0.0.1:3003` (or `LINKEDIN_URL`), preserving method/headers/body, with `redirect: 'manual'` and hop-by-hop header stripping both directions. Unreachable upstream → `502`, not a crash. |
| `cc-gateway`: `src/hooks.server.js` | **SP5 (edit)** | `isApiRequest = path === '/api' \|\| path.startsWith('/api/')` | Adds `\|\| path.startsWith('/linkedin/api/')`, so an expired/absent session hitting the new app's JSON API gets a clean `403 {"error":"Forbidden"}` instead of a `302` HTML redirect that breaks `response.json()`. |
| New app's own `src/routes/api/**` | SP2 (not this PRD) | — | Everything SP2 builds is reachable **only** as `/linkedin/api/**` from a browser, and receives requests **only** from `cc-gateway`'s proxy over loopback — this app implements zero auth of its own (§4.I). SP2 does not need to check `locals.role` anywhere; there is no unauthenticated path that reaches it. |

No other API surface changes.

---

## 6. Frontend Change Summary

No new UI is built by this sub-project. The binding contract for SP2/SP3/SP4's frontend work:

- **Base path is `/linkedin`** (`kit.paths.base`, §4.D). Every asset reference, internal link, and
  `fetch()` call to the app's own API must be base-aware (`import { base } from '$app/paths'`, or
  a leading-slash-free relative path) — a hardcoded `/api/...` or `/some-page` will 404 in
  production because it resolves against `cc.tejitpabari.com`'s root, not the app's own root.
- Nothing about route **file locations** under `src/routes/` changes because of the base path —
  SvelteKit applies the prefix automatically at request-resolution time; only URL *construction*
  in `<script>`/`fetch()` code needs to be base-aware.

---

## 7. Testing

No unit-testable logic is introduced by this sub-project (the proxy route is thin I/O plumbing);
verification here is end-to-end, in increasing order of integration:

1. **App in isolation.** `npm run build && pm2 start ecosystem.config.cjs` for the new app alone;
   `curl -i http://127.0.0.1:3003/linkedin` returns `200` with real HTML, directly against the app,
   bypassing `cc-gateway` entirely. Isolates app bugs (SP1–SP4) from proxy bugs (this PRD) before
   testing the two together.
2. **Proxy, unauthenticated.** With both processes running and `cc-gateway` rebuilt with the §4.B/
   §4.C changes: `curl -i https://cc.tejitpabari.com/linkedin` with no cookie → expect `302` to
   `/login` (confirms default-deny with zero `guestVisibility` entry).
3. **Proxy, authenticated — the critical regression test.** Log in via browser with the gateway
   password, navigate to `/linkedin`, and in devtools Network tab confirm: the page HTML loads,
   every `_app/immutable/...` asset request resolves under `/linkedin/_app/...` with no 404s, and
   a write action (save a diary entry, or any `PUT`/`PATCH`) succeeds with no cross-site-POST
   error. A failure here almost always means `ORIGIN` (§4.D) is wrong.
4. **Streaming / large body.** Submit a longer diary entry and separately exercise
   `GET /linkedin/api/export/all` (multi-week bundle) — confirms `duplex: 'half'` on the request
   side and non-buffered streaming on the response side didn't silently truncate anything.
5. **Upstream-down behavior.** `pm2 stop linkedin-outreach` while `cc-gateway` keeps running;
   `curl -i https://cc.tejitpabari.com/linkedin` (as an authenticated admin) → expect a clean `502`,
   and confirm `cc-gateway` itself (e.g. its own home page) is unaffected — the `try/catch` around
   `fetch()` in §4.B is what this test is checking.
6. **Guest-denial spot check.** Confirm `cc-gateway`'s `content/settings.json` does not contain a
   `guestVisibility['/linkedin']` entry (belt-and-suspenders alongside the in-code `role !== 'admin'`
   check in §4.B, which fails closed even if this ever changes via the `/settings` UI).
7. **Reboot survival** (requires the sudo-gated `pm2 startup` step in §8): after `pm2 save`,
   simulate with `pm2 kill && pm2 resurrect` and confirm both `cc-gateway` and `linkedin-outreach`
   come back automatically with the right env.

---

## 8. Manual Intervention Required From You

1. **Confirm the real production ingress** (§4.A's [OPEN] #1). From whichever machine actually
   serves `cc.tejitpabari.com` in practice, run `pm2 list`, `ss -ltnp`, and
   `curl -sI http://127.0.0.1:3002` to confirm `cc-gateway` is the live origin on that box before
   relying on this PRD's "proxy lives inside cc-gateway" design. If this *is* `claude1` in its
   normal resting state and it's simply idle between sessions, no action is needed beyond starting
   both PM2 processes (§8.3) — but this needs your confirmation, not an agent's guess, since the
   evidence in §4.A was genuinely ambiguous from inside this session.
   **Update, post-PRD orchestrator verification (§9 [OPEN] #1):** this is no longer ambiguous —
   `cc.tejitpabari.com` is confirmed live via an origin this box (`claude1`) cannot reach (no
   nginx/cloudflared running here, PM2 shows `cc-gateway` stopped, DNS resolves only to Cloudflare
   anycast, no outbound SSH configured from this box to anywhere). **You must confirm which box is
   the real production origin** and, if it is a different box than this one, either (a) point
   Cloudflare's origin config at this box, or (b) provide access (an SSH key, or a tunnel config)
   so a future deploy from this box can reach the real one. Until that's resolved, do not trust the
   public `cc.tejitpabari.com` URL to reflect anything deployed from this box — verify any
   deployment done here via a direct `curl` to the app's own local port (e.g.
   `curl -sI http://127.0.0.1:3003`) and/or a temporary `/etc/hosts` override or a distinguishing
   local-only test path, not by loading the public domain in a browser.
2. **Populate the new app's real `.env`** from `.env.example` (§4.F) — specifically copy the real
   `WORKER_API_KEY` / `WORKER_BASE_URL` / `WORKER_MODEL` values out of `~/.bashrc` into
   `linkedin-outreach-tool/.env`. PM2's daemon does not reliably inherit an interactive shell's
   exported variables, so these need to live in the app's own `.env` (mirroring how `cc-gateway`
   itself sources secrets) rather than relying on the shell profile. Do this by hand — an agent
   should not print or transcribe secret values.
3. **First start of both processes** and **persistence**:
   ```bash
   pm2 start /root/projects/cc-gateway/ecosystem.config.cjs           # if not already running
   pm2 start /root/projects/linkedin-outreach-tool/ecosystem.config.cjs
   pm2 save
   pm2 startup   # prints a systemd-install command requiring sudo — run what it prints, once
   ```
   `pm2 startup` needs `sudo` and installs a systemd unit; no PM2 app on this box currently
   survives a reboot (§4.A), which is a pre-existing gap this project doesn't introduce but does
   depend on closing.
4. **`ufw`**: no change needed for this design (§4.A/§4.E — the new app binds to loopback only and
   is never referenced by any firewall rule). If step 1's investigation instead concludes this box
   needs to run nginx or `cloudflared` directly (i.e. the "aspirational" nginx docs turn out to be
   the intended real path after all), that would be new manual work outside this PRD's scope —
   flagged, not designed here, per §3's non-goals.

---

## 9. Open Questions & Decisions

| # | Item | Status |
|---|---|---|
| 1 | What actually serves `cc.tejitpabari.com` right now — this box in a state this session couldn't observe, or a different machine entirely. §4.A: nginx not installed, PM2 empty, nothing listening on 80/3002, `cloudflared` installed but not running, yet the domain returns a live, non-cached (`cf-cache-status: DYNAMIC`) SvelteKit response through Cloudflare's edge, and `ufw` is pre-configured for a Cloudflare-fronted origin. | **[OPEN] — VERIFIED (orchestrator, 2026-08-29):** cc.tejitpabari.com is currently served live by an origin NOT reachable from this box (no nginx/cloudflared running here, PM2 shows cc-gateway stopped, DNS resolves only to Cloudflare anycast, no outbound SSH configured). This box cannot today deploy to whatever is actually serving production. Recommended path: build and deploy the linkedin-outreach-tool (and re-deploy cc-gateway itself) on THIS box per the documented `deploy/README.md` model — nginx + PM2 — since this machine holds all the source repos, worker credentials, and matches the "personal machine used to auto-manage all projects" role. This makes the new app live and testable end-to-end from this box's own PM2/nginx, but does NOT guarantee it becomes reachable at the public cc.tejitpabari.com URL until a human reconciles which server is authoritative (DNS/Cloudflare origin config is an owner-only step — see §8 Manual Intervention). Supporting evidence gathered post-PRD: `curl -sI https://cc.tejitpabari.com/` returns `HTTP/2 200`, `server: cloudflare`, `cf-cache-status: DYNAMIC` (a live SSR response, not cache); DNS resolves only to Cloudflare anycast IPs (`104.21.4.47`, `172.67.131.169`, and IPv6 equivalents), never to this box's own `65.21.49.199`; on this box nothing listens on port 80 or 3002 (`ss -ltnp` shows only sshd/DNS/loopback), `cloudflared` has no running process and no `config.yml` under `/root/.cloudflared/` (only `cert.pem`), and PM2's `/root/.pm2/dump.pm2` shows `cc-gateway` with `"status": "stopped"`; and `/root/.ssh/` has no outbound config, no private keys, and an empty `known_hosts` — this box has no configured way to reach whatever machine is actually fronting the domain. Does not block this PRD's design (§4.A already explains why: the in-app-proxy approach requires zero changes to whichever mechanism this turns out to be) — but it does mean "deploy per this PRD" and "become live at the public URL" are now known to be two separate steps, not one. |
| 2 | Proxy approach: in-app SvelteKit catch-all route inside `cc-gateway` vs. an nginx `location /linkedin` block. | **[RESOLVED: in-app catch-all route]** (§4.B) — ingress-mechanism-agnostic (works unchanged regardless of #1's answer), reuses `cc_session`/`verifySession()` with zero new auth code, requires no nginx/DNS/firewall change at all. |
| 3 | `kit.paths.base` value and where the `/linkedin` prefix gets added/stripped. | **[RESOLVED: `paths.base = '/linkedin'` in the app's own `svelte.config.js`; the proxy forwards paths unchanged, 1:1.]** (§4.D) — the only design that avoids asset-path collisions with `cc-gateway`'s own `/_app/**`. |
| 4 | `ORIGIN` value for adapter-node. | **[RESOLVED: `https://cc.tejitpabari.com`]**, scheme+host only, no path (§4.D) — required for the CSRF origin check to pass on every write route SP2 builds. |
| 5 | `svelte.config.js`'s `csrf.checkOrigin` — SP1's current draft copies `cc-gateway`'s `checkOrigin: false`. | **[OPEN, cross-SP]** — this PRD recommends SP1 *not* copy that setting (§4.D): once `ORIGIN` is set correctly, the default `checkOrigin: true` passes for free and adds real defense-in-depth beyond the `sameSite: 'lax'` cookie backstop. This is a one-line change to a file SP1 owns; flagged here rather than made unilaterally, since SP5 doesn't edit SP1's files. Needs SP1 (or whoever runs `dev-code`) to apply it before implementation, or explicitly reject the recommendation with a reason. |
| 6 | Guest mode vs. D25 admin-only conflict in `cc-gateway/CLAUDE.md`. | **[RESOLVED]** (§4.C) — never add `/linkedin` to `guestVisibility`; default-deny already handles it; explicit `role !== 'admin'` check in the proxy as defense-in-depth; one-line documented exception added to `cc-gateway/CLAUDE.md`. |
| 7 | `hooks.server.js`'s `isApiRequest` not matching `/linkedin/api/*`. | **[RESOLVED]** (§4.B) — extend the check to also match `path.startsWith('/linkedin/api/')`, so a session-expired admin's `fetch()` gets JSON `403` instead of an HTML `302` that breaks `response.json()`. |
| 8 | Port for the new app. | **[RESOLVED: `3003`]** — `3001`=claud-ometer (documented), `3002`=cc-gateway (confirmed in `.env`), `3003` confirmed free via `ss -ltnp` on this box. |
| 9 | Bind address for the new app. | **[RESOLVED: `HOST=127.0.0.1`]** — this box's public IP is directly bound to `eth0`; loopback-only binding is a free, no-new-auth safety margin beyond whatever the firewall happens to allow today. |
| 10 | Stale `deploy/nginx/cc-gateway.conf` / `deploy/README.md` in `cc-gateway`, and the stale `cc-gateway` row in `/root/projects/README.md` (describes an Express app on port 80 proxying `/dashboard`, contradicted by the actual SvelteKit/port-3002/no-`/dashboard`-code source). | **[DEFERRED]** — real doc debt discovered during this investigation, unrelated to shipping this tool. Worth a follow-up task; not blocking. |
| 11 | `pm2 startup`/reboot persistence gap (no systemd unit for PM2 on this box for any app, pre-existing). | **[OPEN]** — sudo-gated, listed in §8.3; needs Tejit (or an agent with sudo) to run `pm2 startup` once, for both apps, not specific to this project but a dependency of "survives a reboot." |
