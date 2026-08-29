# PRD: SP1 — Core Data Layer + App Scaffold

**Sub-project:** SP1 (Phase 1, no dependencies)
**Repo:** `/root/projects/linkedin-outreach-tool`
**Date:** 2026-08-29
**Status:** Planning — no implementation started

---

## 1. Problem

The LinkedIn Outreach Tool repo currently contains only `.gitignore` and the approved design brief (`BRAINSTORM.md`). Nothing is scaffolded. Every other sub-project (SP2's API routes, SP3's week view, SP4's history/calendar) needs to import a shared, pure, disk-backed data core: config loading, ISO-week arithmetic, week-file persistence, and the arithmetic that turns an approved diary parse or a counter tap into a new week state.

This layer is where the design's central risk lives. Per D8, diary text is the permanent source of truth and counts/metrics are merely derived — which only holds if the arithmetic that derives them is correct, pure, and never destroys data on disk. The single most dangerous failure mode named in the task brief is a wrong ISO-week key silently filing a log entry under the wrong week, permanently and invisibly. Getting the week-key math and the timezone handling exactly right is therefore the load-bearing part of this PRD.

Because SP2/SP3/SP4 will be implemented against this module's exports without further conversation with SP1, every exported function's signature, argument shape, and return shape must be pinned down precisely here.

## 2. Goals

1. Stand up the SvelteKit app skeleton (adapter-node, plain JS, no TypeScript) mirroring `cc-gateway`'s stack and conventions.
2. Ship the seed `config/config.json` exactly as specified in BRAINSTORM §3.2.
3. Implement `src/lib/config.js`: load + validate, with readable field-naming errors, never a stack trace, never data loss.
4. Implement `src/lib/weeks.js`: correct ISO-8601 week-key maths (including week-numbering-year disagreement and 53-week years), timezone-correct "today," week-file read/write with atomic-ish writes, and a full set of pure state-transition functions (counter bumps, metric sets, diary-entry lifecycle, item/link attachment).
5. Restate the week/entry JSON schema as an authoritative contract.
6. Set up `vitest` as a devDependency-only test runner and specify what must be unit-tested.
7. Leave `data/` to be created lazily on first write; confirm `.gitignore` already excludes it.

## 3. Non-Goals

- No HTTP routes (`src/routes/**`) — that is SP2.
- No diary/LLM parsing (`src/lib/parse.js`) — that is SP2. SP1 never calls `fetch` and has no knowledge of DeepSeek, `WORKER_*` env vars, or network I/O of any kind.
- No UI (`+page.svelte`, components, styling) — that is SP3/SP4.
- No PM2/nginx/deploy wiring — that is SP5.
- No decisions already locked by BRAINSTORM.md are revisited (see D1–D25).
- No database, no ORM, no schema migration tooling — config/data drift is handled by the additive-merge rule in §4.4, not by a migration system.

## 4. Architecture Decisions

### 4.1 App scaffold

Mirrors `/root/projects/cc-gateway` (confirmed via `cat package.json svelte.config.js vite.config.js jsconfig.json src/app.html`), with one correction: cc-gateway's `package.json` lists `@sveltejs/adapter-auto` in `devDependencies` even though `svelte.config.js` imports `@sveltejs/adapter-node` exclusively — `adapter-auto` is unused scaffolding leftover. **Do not copy that inconsistency**; SP1's `package.json` omits `adapter-auto` entirely.

**`package.json`:**

```json
{
  "name": "linkedin-outreach-tool",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "svelte-kit sync || echo ''"
  },
  "devDependencies": {
    "@sveltejs/kit": "^2.50.2",
    "@sveltejs/vite-plugin-svelte": "^6.2.4",
    "svelte": "^5.51.0",
    "vite": "^7.3.1",
    "vitest": "^4.1.11"
  },
  "dependencies": {
    "@sveltejs/adapter-node": "^5.5.4"
  }
}
```

Versions match cc-gateway's exactly (`/root/projects/cc-gateway/package.json`, read directly), except `adapter-auto` is dropped and `vitest` is added. `adapter-node` stays a regular `dependency` (not `devDependency`) to mirror cc-gateway's convention, in case the deploy path ever runs `npm ci --omit=dev`.

**Test runner decision:** cc-gateway has **zero** test files and no test runner configured anywhere in the repo (`grep -ril "vitest\|jest" /root/projects/cc-gateway/` returned nothing) — so there is no existing convention to match or diverge from. `vitest` is recommended per the brief and confirmed available (`npm view vitest version` → `4.1.11`). It is a **devDependency only** — never imported by `src/lib/*.js` or bundled into `build/`, so it does not violate "no new runtime dependencies." A plain `vitest.config.js` (no `vite-plugin-svelte`) suffices because SP1's modules are pure Node (no `$app/*` or `$env/*` SvelteKit-runtime imports), so they run under bare Node/vitest with zero SvelteKit context.

**`vitest.config.js`** (new file, project root):

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.js']
  }
});
```

**`svelte.config.js`** — identical to cc-gateway's, **except** it omits cc-gateway's `csrf: { checkOrigin: false }` override. **Cross-reference: SP5's PRD (`05-deploy-and-docs/PRD.md` §4.D)** found that cc-gateway's reasoning doesn't transfer to this app — cc-gateway's override is very likely a workaround for `ORIGIN` not being reliably correct there (it serves two hostnames, `cc.tejitpabari.com` and `go.tejitpabari.com`, off one `ORIGIN` value), not an inherent requirement of "being proxied." This app is single-hostname, and once SP5's `ORIGIN=https://cc.tejitpabari.com` is set correctly in the deployed `.env` (SP5 §4.D/§4.F), SvelteKit's **default** `checkOrigin: true` passes for free and adds real CSRF defense-in-depth beyond the `sameSite: 'lax'` session cookie alone. So `svelte.config.js` simply does not set `csrf` at all — no explicit `checkOrigin: false`, and no explicit `checkOrigin: true` either, since that's already the default:

```js
import adapter from '@sveltejs/adapter-node';

export default {
  kit: {
    adapter: adapter()
  }
};
```

**This only behaves correctly if `ORIGIN` is set exactly as SP5 specifies.** If `ORIGIN` is left unset or wrong in production, every non-GET/HEAD request (SP2's `POST`/`PATCH`/`PUT`/`DELETE` routes) will fail the default CSRF origin check with SvelteKit's generic cross-site-POST 403. That's SP5's deploy contract to fulfill, not SP1's — noted here only so an implementer wiring this file knows why the default is safe to rely on.

**`vite.config.js`** — identical to cc-gateway's:

```js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
```

**`jsconfig.json`** — identical to cc-gateway's (confirms plain-JS-with-checkJs-off convention):

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "moduleResolution": "bundler"
  }
}
```

**`src/app.html`** — identical to cc-gateway's (same light/dark theme bootstrap):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(e){}</script>
    %sveltekit.head%
  </head>
  <body>
    <div>%sveltekit.body%</div>
  </body>
</html>
```

`.gitignore` already exists and already covers everything needed (`cat .gitignore` → `node_modules/`, `.env`, `.svelte-kit/`, `build/`, `data/`). No changes required.

### 4.2 Path resolution (shared convention for config.js and weeks.js)

Both modules resolve paths from the project root via `import.meta.url`, **not** `process.cwd()` — this makes path resolution correct regardless of the directory PM2 launches the process from, which matters for a "clone it, `npm i`, run it" app (D16):

```js
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url)); // src/lib
const PROJECT_ROOT = join(__dirname, '..', '..');
export const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'config.json');
export const DATA_DIR = join(PROJECT_ROOT, 'data');
```

Every disk-touching exported function takes its path as an **optional trailing parameter defaulting to the real path** (`configPath = CONFIG_PATH`, `dataDir = DATA_DIR`). This is a deliberate dependency-injection seam: unit tests pass a `mkdtempSync`-created temp directory so tests never read or write the real `config/config.json` or `data/` during `npm test`.

### 4.3 `config/config.json` (seed file)

Verbatim from BRAINSTORM §3.2 — this is data, not code, and is not re-derived:

```json
{
  "version": 1,
  "name": "LinkedIn Outreach — Juno",
  "timezone": "America/Los_Angeles",
  "lanes": [
    { "id": "outreach", "label": "Outreach", "blurb": "Get to data + customers" },
    { "id": "presence", "label": "Presence", "blurb": "Be worth finding" }
  ],
  "tasks": [
    { "id": "invites",   "lane": "outreach", "label": "Targeted connection requests", "min": 10, "target": 15, "link": "optional" },
    { "id": "dms",       "lane": "outreach", "label": "Follow-up DMs",                "min": 2,  "target": 4,  "link": "optional" },
    { "id": "call_ask",  "lane": "outreach", "label": "Call asks sent",               "min": 1,  "target": 2,  "link": "optional" },
    { "id": "comments",  "lane": "presence", "label": "Substantive comments",         "min": 5,  "target": 10, "link": "optional" },
    { "id": "post",      "lane": "presence", "label": "Posts published",              "min": 1,  "target": 1,  "link": "required" }
  ],
  "metrics": [
    { "id": "followers",     "label": "Followers",                   "headline": true },
    { "id": "profile_views", "label": "Profile views" },
    { "id": "impressions",   "label": "Post impressions" },
    { "id": "replies",       "label": "Replies from target people" },
    { "id": "calls_booked",  "label": "Calls booked" }
  ],
  "links": [
    { "label": "Reachouts sheet",        "url": "" },
    { "label": "LinkedIn notifications", "url": "https://www.linkedin.com/notifications/" },
    { "label": "Creator analytics",      "url": "https://www.linkedin.com/analytics/creator/" },
    { "label": "My profile",             "url": "" },
    { "label": "Strategy doc",           "url": "" }
  ]
}
```

Three link URLs are intentionally empty (`Reachouts sheet`, `My profile`, `Strategy doc`) — these are real personal URLs only Tejit has; filling them in is a human step (see §8).

### 4.4 `src/lib/config.js` — load + validate

**Exports:**

```js
export class ConfigError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ConfigError';
    this.field = field; // e.g. "tasks[2].lane", "version", or null for whole-file errors
  }
}

export function validateConfig(raw) -> config   // pure; throws ConfigError; no disk I/O
export function loadConfig(configPath = CONFIG_PATH) -> config  // reads + parses + validates; throws ConfigError
export function writeConfig(config, configPath = CONFIG_PATH) -> void  // validates, then atomic write; throws ConfigError, never writes an invalid config
```

**Error shape** (what SP3 renders on the page instead of a stack trace): `{ message: string, field: string | null }` — i.e. `err.message` and `err.field` off a caught `ConfigError`. SP3's `+page.server.js` is expected to do:

```js
try {
  const config = loadConfig();
} catch (e) {
  if (e instanceof ConfigError) return { configError: { message: e.message, field: e.field } };
  throw e;
}
```

**`validateConfig(raw)` rules** (each a distinct, field-naming `ConfigError`):

| Check | Example message | `field` |
|---|---|---|
| Missing required top-level key (`version`, `name`, `timezone`, `lanes`, `tasks`, `metrics`, `links`) | `Config is missing required field "timezone"` | `"timezone"` |
| `version` not a positive integer, or not `1` (only schema version implemented — see §9) | `Config version must be 1 (got 2)` | `"version"` |
| `timezone` not a valid IANA zone (probed via `new Intl.DateTimeFormat(undefined, { timeZone: raw.timezone })` in a try/catch — throws `RangeError` on an invalid zone) | `Config timezone "Americaa/Los_Angeles" is not a valid IANA timezone` | `"timezone"` |
| Duplicate lane id | `Duplicate lane id "outreach"` | `"lanes"` |
| Lane missing `id` or `label` | `Lane at index 1 is missing "label"` | `"lanes[1]"` |
| Duplicate task id | `Duplicate task id "invites"` | `"tasks"` |
| Task missing `id`/`lane`/`label`/`min`/`target`/`link` | `Task "invites" is missing "target"` | `"tasks[0]"` |
| Task's `lane` doesn't match any lane id | `Task "invites" references unknown lane "outreach2"` | `"tasks[0].lane"` |
| Task `min`/`target` not a non-negative integer | `Task "invites": "min" must be a non-negative integer (got -1)` | `"tasks[0].min"` |
| Task `min > target` | `Task "invites": min (15) is greater than target (10)` | `"tasks[0]"` |
| Task `link` not `"optional"` or `"required"` | `Task "invites": "link" must be "optional" or "required" (got "yes")` | `"tasks[0].link"` |
| Duplicate metric id | `Duplicate metric id "followers"` | `"metrics"` |
| Metric missing `id`/`label` | `Metric at index 0 is missing "label"` | `"metrics[0]"` |
| Zero or more than one metric with `headline: true` | `Exactly one metric must be marked "headline": true (found 0)` | `"metrics"` |
| Link missing `label` or `url` key (empty string `url` is fine — see §4.3) | `Link at index 0 is missing "url"` | `"links[0]"` |
| Any id (`lanes[].id`, `tasks[].id`, `metrics[].id`) not matching `^[a-z][a-z0-9_]*$` | `Task id "Invites!" must be lowercase snake_case` | `"tasks[0].id"` |

Task ids and metric ids are **independent namespaces** (`week.counts[taskId]` vs. `week.metrics[metricId]`) — a task id and a metric id are allowed to collide; this is not validated as an error because it cannot corrupt data.

**Caching behaviour: none — read-per-request, always fresh off disk.** Justification: config is not static in this app the way the juno example's manifest was — SP2 ships a `PUT /api/config` endpoint that rewrites `config.json` from the UI, and the very next page load must see the change (e.g. a fixed `min > target` typo) without a process restart. Single-user, low-QPS traffic makes the cost of a synchronous `readFileSync` + `JSON.parse` on every call immaterial (sub-millisecond for a file this size). No cache means no invalidation logic and no stale-config class of bug.

**A broken config must never lose or mutate data:** `loadConfig`/`validateConfig` never write anything. On a validation failure, `config.json` on disk is untouched, and no `data/*.json` file is read or written — the caller (SP2/SP3 route) receives the thrown `ConfigError` and stops before touching `weeks.js` at all.

**`writeConfig(config, configPath = CONFIG_PATH)` — the write side, added for SP2's `PUT /api/config`.** SP2's PRD (§9) assumed this export existed; it did not, until now — added here rather than having SP2 invent its own file-write logic, so "a broken config must never lose data" is enforced at the same module boundary as everything else in this file, not re-implemented by a caller:

```js
export function writeConfig(config, configPath = CONFIG_PATH) {
  validateConfig(config); // defensive re-validation — never persists something that wouldn't itself load cleanly.
                            // Callers (e.g. SP2's PUT /api/config) are expected to have already validated
                            // before calling this, per the "validate, then write" pattern established in §4.4's
                            // caching-behaviour note; this is belt-and-suspenders, not a substitute for that.
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.config.json.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  renameSync(tmpPath, configPath); // same-directory atomic rename — identical pattern to writeWeek (§4.6)
}
```
On a validation failure inside `writeConfig` itself, it throws `ConfigError` before the tmp file is ever written — `config.json` on disk is untouched, matching every other guarantee in this section.

### 4.5 `src/lib/weeks.js` — ISO week maths

**The BRAINSTORM task brief's own illustrative example is factually wrong and is corrected here rather than reproduced.** It states "2026-01-01 falls in 2025-W53." Verified by direct computation (`node -e "new Date(Date.UTC(2026,0,1)).getUTCDay()"` → `4`, i.e. Thursday): under ISO 8601, week 1 is the week containing the year's first Thursday. Jan 1, 2026 is itself a Thursday, so it falls in **2026-W01** — the correct edge case, not the one named in the prompt. The genuinely tricky historical cases (verified by running the exact algorithm below) are:

| Date | ISO week key | Why it's tricky |
|---|---|---|
| 2023-01-01 | `2022-W52` | Jan 1 is a Sunday → belongs to the *previous* ISO week-year |
| 2027-01-01 | `2026-W53` | Jan 1 is a Friday → belongs to the previous ISO week-year, in that year's 53rd week |
| 2021-01-01 | `2020-W53` | Same pattern |
| 2026-12-31 | `2026-W53` | **2026 is itself a 53-week ISO year** — `2026-W53` spans `2026-12-28` .. `2027-01-03` |
| 2020-12-31 | `2020-W53` | Another 53-week year |

These are the required unit-test fixtures (§7).

**Algorithm — "nearest Thursday" method**, the standard correct ISO-8601 algorithm, computed entirely in UTC-anchored calendar-date arithmetic (never wall-clock/local time), so DST transitions cannot perturb it:

```js
const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

export function isValidWeekKey(key) {
  if (typeof key !== 'string') return false;
  const m = key.match(WEEK_KEY_RE);
  if (!m) return false;
  const week = Number(m[2]);
  return week >= 1 && week <= 53;
}

function isoWeekKeyFromUTCDate(utcDate) {
  // utcDate must be a Date built via Date.UTC(y, m0, d) — a pure calendar date, no time component
  const d = new Date(utcDate.getTime());
  const dayNum = (d.getUTCDay() + 6) % 7;      // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);   // shift to the Thursday of this ISO week
  const isoYear = d.getUTCFullYear();          // the ISO week-numbering year
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Thursday = new Date(jan4);
  week1Thursday.setUTCDate(jan4.getUTCDate() - jan4DayNum + 3);
  const week = 1 + Math.round((d - week1Thursday) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function localCalendarParts(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

export function dateToWeekKey(date, timezone) {
  const { y, m, d } = localCalendarParts(date, timezone);
  return isoWeekKeyFromUTCDate(new Date(Date.UTC(y, m - 1, d)));
}

export function currentWeekKey(timezone) {
  return dateToWeekKey(new Date(), timezone);
}

export function weekKeyToRange(key) {
  if (!isValidWeekKey(key)) throw new WeekError(`Invalid week key "${key}"`);
  const [, yStr, wStr] = key.match(WEEK_KEY_RE);
  const isoYear = Number(yStr);
  const week = Number(wStr);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

export function nextWeekKey(key) {
  const { start } = weekKeyToRange(key);
  const [y, m, d] = start.split('-').map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() + 7);
  return isoWeekKeyFromUTCDate(monday);
}

export function prevWeekKey(key) {
  const { start } = weekKeyToRange(key);
  const [y, m, d] = start.split('-').map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() - 7);
  return isoWeekKeyFromUTCDate(monday);
}
```

**Timezone handling — why this is DST-safe:** `dateToWeekKey` extracts the *calendar* Y/M/D that "now" (or any instant) corresponds to inside the target IANA zone via `Intl.DateTimeFormat`'s `timeZone` option, which is backed by the tz database and automatically accounts for DST transitions and historical offset changes — no manual UTC-offset arithmetic is done anywhere. Once the calendar Y/M/D is resolved, every subsequent step is pure date-only arithmetic on a `Date.UTC(...)`-anchored value with no time-of-day component, so nothing downstream can be perturbed by DST. This directly targets the failure mode named in the task: without this, an entry logged at 11:40pm Pacific on a Sunday could be timestamped just after UTC midnight Monday and silently attributed to the wrong ISO week — verified above (`2026-01-01T00:30Z` in `America/Los_Angeles` still resolves to `2026-W01`, i.e. "Dec 31 in LA," correctly, not the UTC calendar date).

`listWeekKeys` never needs a timezone — it only reads filenames off disk.

### 4.6 `src/lib/weeks.js` — week-file I/O

```js
export class WeekError extends Error {
  constructor(message, weekKey = null) {
    super(message);
    this.name = 'WeekError';
    this.weekKey = weekKey;
  }
}

const WEEK_FILE_RE = /^(\d{4}-W\d{2})\.json$/;

export function listWeekKeys(dataDir = DATA_DIR) -> string[]   // sorted ascending
export function emptyWeek(weekKey, config) -> week             // pure, no disk I/O
export function readWeek(weekKey, config, dataDir = DATA_DIR) -> week
export function writeWeek(weekKey, week, dataDir = DATA_DIR) -> void
export function projectWeekForConfig(week, config) -> week     // pure, no disk I/O
```

```js
export function listWeekKeys(dataDir = DATA_DIR) {
  let files;
  try {
    files = readdirSync(dataDir);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // data/ doesn't exist yet — not an error
    throw err;
  }
  return files
    .map(f => f.match(WEEK_FILE_RE))
    .filter(Boolean)
    .map(m => m[1])
    .sort(); // lexicographic sort == chronological sort: 4-digit year dominates, week is zero-padded
}

export function emptyWeek(weekKey, config) {
  if (!isValidWeekKey(weekKey)) throw new WeekError(`Invalid week key "${weekKey}"`, weekKey);
  const { start, end } = weekKeyToRange(weekKey);
  return {
    version: 1,
    week: weekKey,
    start,
    end,
    counts: Object.fromEntries(config.tasks.map(t => [t.id, 0])),
    metrics: Object.fromEntries(config.metrics.map(m => [m.id, null])),
    items: [],
    entries: []
  };
}

export function readWeek(weekKey, config, dataDir = DATA_DIR) {
  if (!isValidWeekKey(weekKey)) throw new WeekError(`Invalid week key "${weekKey}"`, weekKey);
  const filePath = join(dataDir, `${weekKey}.json`);
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return emptyWeek(weekKey, config); // missing file -> empty week, never a 500
    throw new WeekError(`Failed to read week file ${weekKey}.json: ${err.message}`, weekKey);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Corrupt file is NOT treated as "missing" — never silently fall back to empty here.
    // Falling back would let a caller subsequently writeWeek() an empty object over recoverable data.
    throw new WeekError(`Week file ${weekKey}.json is corrupt and could not be parsed: ${err.message}`, weekKey);
  }
  // Additive-only reconciliation against current config — see §4.7 for the drift policy.
  const counts = { ...parsed.counts };
  for (const t of config.tasks) if (!(t.id in counts)) counts[t.id] = 0;
  const metrics = { ...parsed.metrics };
  for (const m of config.metrics) if (!(m.id in metrics)) metrics[m.id] = null;
  return { ...parsed, counts, metrics, items: parsed.items ?? [], entries: parsed.entries ?? [] };
}

export function writeWeek(weekKey, week, dataDir = DATA_DIR) {
  if (!isValidWeekKey(weekKey)) throw new WeekError(`Invalid week key "${weekKey}"`, weekKey);
  if (week.week !== weekKey) {
    throw new WeekError(`Week object's "week" field ("${week.week}") does not match target key "${weekKey}"`, weekKey);
  }
  mkdirSync(dataDir, { recursive: true });
  const finalPath = join(dataDir, `${weekKey}.json`);
  const tmpPath = join(dataDir, `.${weekKey}.json.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmpPath, JSON.stringify(week, null, 2), 'utf8');
  renameSync(tmpPath, finalPath); // same-directory rename is atomic on POSIX — a crash mid-write can't truncate the real file
}

export function projectWeekForConfig(week, config) {
  const taskIds = new Set(config.tasks.map(t => t.id));
  const metricIds = new Set(config.metrics.map(m => m.id));
  return {
    ...week,
    counts: Object.fromEntries(Object.entries(week.counts).filter(([id]) => taskIds.has(id))),
    metrics: Object.fromEntries(Object.entries(week.metrics).filter(([id]) => metricIds.has(id)))
  };
}
```

### 4.7 Config-vs-data drift policy

When `config.json` gains or loses a task/metric id but old `data/*.json` files still carry the old ids:

- **`readWeek`'s reconciliation is additive-only and in-memory.** It adds any config-known id missing from the file's `counts`/`metrics` (defaulted to `0`/`null`) but never deletes a key already present — including ids no longer in config. This is the direct implementation of D8 ("data is never destroyed"): a task that gets renamed or removed from config next month does not erase this month's recorded counts against the old id.
- **The reconciled object is never written back automatically.** `readWeek` only merges in memory; a file on disk is only ever changed by an explicit `writeWeek` call, which always receives the object the caller already had (extra keys survive any read→mutate→write round-trip untouched, since mutation functions in §4.8 only ever touch keys they're told to touch).
- **`projectWeekForConfig` is the UI-facing filter.** It returns a *new*, non-persisted view with `counts`/`metrics` narrowed to exactly the ids current config knows about, so SP3's rendering code never has to special-case an orphaned id it doesn't have a label for. SP2's route handlers should call `readWeek` → mutate → `writeWeek` for the read-modify-write cycle, and separately call `projectWeekForConfig` on whatever they hand to the page for display.
- Orphaned `items[]`/`entries[]` rows referencing a removed task id are left as-is by both functions (they're historical log rows, not the derived `counts`/`metrics` state); whether SP3/SP4 wants any visual treatment for them (e.g. a muted "no longer tracked" label) is their call — flagged as [OPEN] in §9, non-blocking for SP1.

### 4.8 Apply arithmetic (pure state-transition functions)

All of the following are **pure** — no disk I/O, no imports of `readWeek`/`writeWeek` — and use `structuredClone` (Node 20 global) to return a new week object without mutating the input, so tests can assert the original is untouched. Callers (SP2 route handlers) are responsible for the `readWeek` → (one or more of these) → `writeWeek` sequence.

```js
export const MAX_APPLY_DELTA = 1000; // exported so SP2's parse.js validation uses the same bound — one source of truth for "sane bound" (BRAINSTORM §3.4 step 4)

export function bumpCount(week, taskId, delta) -> week
export function setMetric(week, metricId, value) -> week          // value: number >= 0, or null to clear
export function appendEntry(week, { date, text }) -> { week, entry }
export function applyEntryToWeek(week, entryId, approved) -> week // approved: { counts: {taskId: delta}, metrics: {metricId: value} }
export function discardEntry(week, entryId) -> week
export function markEntryFailed(week, entryId) -> week
export function removeEntry(week, entryId) -> week
export function appendItem(week, { taskId, link = null }) -> { week, item }  // link: {url, label} | null
export function attachItemLink(week, itemId, link) -> week                    // link: {url, label} | null
```

```js
export function bumpCount(week, taskId, delta) {
  if (!Number.isInteger(delta)) throw new WeekError(`Delta for "${taskId}" must be an integer (got ${delta})`, week.week);
  const next = structuredClone(week);
  const current = next.counts[taskId] ?? 0;
  next.counts[taskId] = Math.max(0, current + delta); // clamped — a count can never go negative
  return next;
}

export function setMetric(week, metricId, value) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new WeekError(`Metric "${metricId}" value must be a non-negative number or null (got ${value})`, week.week);
  }
  const next = structuredClone(week);
  next.metrics[metricId] = value;
  return next;
}

export function appendEntry(week, { date, text }) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new WeekError('Entry text must be a non-empty string', week.week);
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new WeekError(`Entry date "${date}" must be an ISO calendar date (YYYY-MM-DD)`, week.week);
  }
  const entry = {
    id: randomUUID(),
    date,
    at: new Date().toISOString(),
    text,
    parseStatus: 'pending'
    // "applied" key is intentionally absent until applyEntryToWeek sets it —
    // JSON.stringify drops `undefined` values, so it never appears in the file for pending/discarded/failed entries.
  };
  const next = structuredClone(week);
  next.entries.push(entry);
  return { week: next, entry };
}

function findEntryOrThrow(week, entryId) {
  const entry = week.entries.find(e => e.id === entryId);
  if (!entry) throw new WeekError(`Entry "${entryId}" not found in week ${week.week}`, week.week);
  return entry;
}

export function applyEntryToWeek(week, entryId, approved) {
  const next = structuredClone(week);
  const entry = findEntryOrThrow(next, entryId);
  if (entry.parseStatus !== 'pending') {
    throw new WeekError(`Entry "${entryId}" is not pending (status: ${entry.parseStatus})`, week.week);
  }
  const counts = approved?.counts ?? {};
  const metrics = approved?.metrics ?? {};
  for (const [taskId, delta] of Object.entries(counts)) {
    if (!Number.isInteger(delta) || delta < 0) {
      throw new WeekError(`Invalid count delta for "${taskId}": ${delta}`, week.week);
    }
    if (delta > MAX_APPLY_DELTA) {
      throw new WeekError(`Count delta for "${taskId}" (${delta}) exceeds sane bound (${MAX_APPLY_DELTA})`, week.week);
    }
    const current = next.counts[taskId] ?? 0;
    next.counts[taskId] = Math.max(0, current + delta);
  }
  for (const [metricId, value] of Object.entries(metrics)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new WeekError(`Invalid metric value for "${metricId}": ${value}`, week.week);
    }
    next.metrics[metricId] = value;
  }
  entry.applied = { counts, metrics };
  entry.parseStatus = 'ok';
  return next;
}

export function discardEntry(week, entryId) {
  const next = structuredClone(week);
  const entry = findEntryOrThrow(next, entryId);
  if (entry.parseStatus !== 'pending') {
    throw new WeekError(`Entry "${entryId}" is not pending (status: ${entry.parseStatus})`, week.week);
  }
  entry.parseStatus = 'discarded';
  return next;
}

export function markEntryFailed(week, entryId) {
  const next = structuredClone(week);
  const entry = findEntryOrThrow(next, entryId);
  if (entry.parseStatus !== 'pending') {
    throw new WeekError(`Entry "${entryId}" is not pending (status: ${entry.parseStatus})`, week.week);
  }
  entry.parseStatus = 'failed';
  return next;
}

export function removeEntry(week, entryId) {
  const next = structuredClone(week);
  const idx = next.entries.findIndex(e => e.id === entryId);
  if (idx === -1) throw new WeekError(`Entry "${entryId}" not found in week ${week.week}`, week.week);
  // Deliberately does NOT reverse counts/metrics already merged by a prior applyEntryToWeek (parseStatus 'ok') —
  // per D9 there is no undo mechanism. This only removes the log row; if its effect was applied, that effect stays.
  next.entries.splice(idx, 1);
  return next;
}

function assertValidLink(link, weekKey) {
  if (link !== null && (typeof link !== 'object' || typeof link.url !== 'string' || typeof link.label !== 'string')) {
    throw new WeekError('link must be null or { url: string, label: string }', weekKey);
  }
}

export function appendItem(week, { taskId, link = null }) {
  assertValidLink(link, week.week);
  const item = { id: randomUUID(), taskId, at: new Date().toISOString(), link };
  const next = structuredClone(week);
  next.items.push(item);
  return { week: next, item };
}

export function attachItemLink(week, itemId, link) {
  assertValidLink(link, week.week);
  const next = structuredClone(week);
  const item = next.items.find(i => i.id === itemId);
  if (!item) throw new WeekError(`Item "${itemId}" not found in week ${week.week}`, week.week);
  item.link = link;
  return next;
}
```

**Why `counts`/`metrics` mutation and `items[]` creation are decoupled:** BRAINSTORM's worked example (§3.3) shows exactly one `items[]` entry (for `post`, which requires a link) even though `counts.comments` and `counts.invites` also moved that week — but the diary text ("left 4 comments today, sent 6 invites…") gives no indication whether "4 comments" should produce four individually link-attachable item rows, one row, or none. That is a real UX-granularity question the design doc doesn't settle (see §9 [OPEN]). Rather than guess, SP1 exposes the count/metric arithmetic (`bumpCount`, `setMetric`, `applyEntryToWeek`) and the item/link primitives (`appendItem`, `attachItemLink`) as **independently callable**, pure, and composable. The *policy* of when an `items[]` row gets created — every unit, once per task per diary entry, or only for link-`required` tasks like `post` — is entirely a route/UI-layer decision for SP2/SP3/SP4, made at zero cost to this module's correctness or stability.

### 4.9 Week + entry schema (authoritative contract)

Restated from BRAINSTORM §3.3, with the `parseStatus` lifecycle made explicit:

```json
{
  "version": 1,
  "week": "2026-W35",
  "start": "2026-08-31",
  "end": "2026-09-06",
  "counts":  { "invites": 6, "dms": 1, "call_ask": 0, "comments": 4, "post": 1 },
  "metrics": { "followers": 1032, "profile_views": 88, "impressions": 2400, "replies": 3, "calls_booked": 1 },
  "items": [
    { "id": "<uuid>", "taskId": "post", "at": "2026-09-02T18:04:00Z",
      "link": { "url": "https://docs.google.com/...", "label": "W35 anchor post" } }
  ],
  "entries": [
    { "id": "<uuid>", "date": "2026-09-02", "at": "2026-09-02T18:04:00Z",
      "text": "left 4 comments today, sent 6 invites, booked a call with the Genentech person. followers at 1032",
      "applied": { "counts": { "comments": 4, "invites": 6 }, "metrics": { "followers": 1032, "calls_booked": 1 } },
      "parseStatus": "ok" }
  ]
}
```

`parseStatus` lifecycle: `"pending"` (set by `appendEntry`, on disk immediately after the diary text is saved — step 2 of BRAINSTORM §3.4) → exactly one terminal state: `"ok"` (via `applyEntryToWeek`, sets `applied`), `"discarded"` (via `discardEntry`, `applied` stays absent), or `"failed"` (via `markEntryFailed`, `applied` stays absent, used when the LLM call itself errors before any preview exists). Once terminal, an entry's `parseStatus` never transitions again (`applyEntryToWeek`/`discardEntry`/`markEntryFailed` all throw `WeekError` if called on a non-`"pending"` entry) — this is what makes D9's "no undo" guarantee mechanically enforced rather than just a UI convention.

All ids (`entries[].id`, `items[].id`) are generated via `crypto.randomUUID()` (Node built-in, `import { randomUUID } from 'node:crypto'`, zero new dependency).

### 4.10 `data/` directory

No pre-creation needed. `writeWeek` calls `mkdirSync(dataDir, { recursive: true })` before every write, so the directory is created lazily on first write. `.gitignore` already excludes `data/` (confirmed: `cat .gitignore` → includes `data/` on its own line) — and since git cannot track empty directories anyway, there is nothing to scaffold here even in principle.

## 5. API Change Summary

SP1 defines no HTTP routes — `src/routes/**` is entirely SP2/SP3/SP4's scope. The "API" this sub-project ships is the internal JS module contract below, which SP2's route handlers call directly (same-process function calls, not HTTP):

| Module | Export | Used by |
|---|---|---|
| `src/lib/config.js` | `loadConfig(configPath?)`, `validateConfig(raw)`, `writeConfig(config, configPath?)`, `ConfigError`, `CONFIG_PATH` | SP2 (`GET`/`PUT /api/config`, import's config-bundle write), SP3 (`+page.server.js` config-error rendering) |
| `src/lib/weeks.js` | `dateToWeekKey`, `weekKeyToRange`, `currentWeekKey`, `nextWeekKey`, `prevWeekKey`, `isValidWeekKey`, `listWeekKeys`, `DATA_DIR` | SP2 (`GET/PATCH /api/week/[week]`, `DATA_DIR` for `data/.backups/<ts>/` import path), SP4 (history strip, calendar) |
| `src/lib/weeks.js` | `emptyWeek`, `readWeek`, `writeWeek`, `projectWeekForConfig` | SP2 (all week/entry routes), SP3 (week-view load), SP4 (history/retro-log) |
| `src/lib/weeks.js` | `bumpCount`, `setMetric`, `appendEntry`, `applyEntryToWeek`, `discardEntry`, `markEntryFailed`, `removeEntry`, `appendItem`, `attachItemLink`, `MAX_APPLY_DELTA` | SP2 (`POST /api/entry` + apply/discard/DELETE, manual counter/metric endpoints), SP3 (counter taps), SP4 (per-item link attach) |
| `src/lib/weeks.js` | `WeekError` | SP2 (error → HTTP status mapping), SP3 (error rendering) |

## 6. Frontend Change Summary

N/A for SP1. The scaffold produces `src/app.html` and the build config only — no `+page.svelte`, no components, no routes. SP1 does not run or render; it is only importable.

## 7. Testing

Strategy, not a task list — this is exactly the layer BRAINSTORM §3.7 calls out as where "silent corruption would live," so coverage should be exhaustive on the pure functions and light everywhere else.

**`config.js` (`validateConfig`, unit tests, no disk I/O):**
- The seed config from §4.3 validates cleanly (happy path / regression guard).
- Each row of the validation table in §4.4 gets at least one test: missing each required top-level key; bad `version` (0, `"1"`, 2); invalid timezone string; duplicate lane/task/metric id; task naming a nonexistent lane; `min > target`; `min`/`target` non-integer or negative; bad `link` enum value; zero headline metrics; two headline metrics; malformed id casing.
- Every thrown `ConfigError` is asserted to carry a non-empty `message` and the expected `field`.
- `loadConfig(configPath)` against a temp file: valid file loads; missing file throws (not a stack trace — a `ConfigError`... note: distinguish "file missing" from "content invalid" — both should be a `ConfigError`, not a raw `ENOENT`); malformed JSON throws a readable `ConfigError`, not a `SyntaxError` leaking to the caller.

**`weeks.js` — ISO week maths (unit tests, no disk I/O):**
- All five worked examples from §4.5's table (`2023-01-01`→`2022-W52`, `2027-01-01`→`2026-W53`, `2021-01-01`→`2020-W53`, `2026-12-31`→`2026-W53`, `2020-12-31`→`2020-W53`), plus `2026-01-01`→`2026-W01` explicitly asserting the corrected edge case.
- `dateToWeekKey` around a DST transition boundary in `America/Los_Angeles` (e.g. the Sunday of a spring-forward/fall-back week) to confirm the day doesn't shift.
- `dateToWeekKey` for an instant just after UTC midnight that is still "yesterday evening" in `America/Los_Angeles` (e.g. `2026-01-01T00:30:00Z` should resolve against Dec 31 local, not Jan 1 UTC) — this is the exact silent-corruption scenario named in the task brief.
- `weekKeyToRange` round-trips: for a sample of week keys, `dateToWeekKey(new Date(range.start + 'T12:00:00Z'), 'UTC')` (or any timezone) returns the same key back.
- `nextWeekKey`/`prevWeekKey` across a year boundary and across a 53-week year boundary (e.g. `nextWeekKey('2026-W53')` → `2027-W01`; `prevWeekKey('2027-W01')` → `2026-W53`).
- `isValidWeekKey` rejects malformed strings (`"2026-W54"`, `"2026-w35"`, `"2026-35"`, `""`, `null`).
- `listWeekKeys` against a temp `dataDir`: empty/missing dir → `[]`; mixed valid/invalid filenames → only valid ones returned, sorted, including a cross-year-boundary sort check (`"2026-W53"` before `"2027-W01"`).

**`weeks.js` — file I/O (unit tests against a `mkdtempSync` temp dir, never the real `data/`):**
- `readWeek` on a missing file returns `emptyWeek`'s shape exactly.
- `readWeek` on a corrupt (unparseable) file throws `WeekError`, does not return an empty week.
- `writeWeek` then `readWeek` round-trips exactly.
- `writeWeek` leaves no `.tmp-*` file behind on success; a simulated crash between write and rename (test can just assert the tmp filename pattern and that `renameSync` is the only thing that produces the final name) is at least reasoned about even if not literally fault-injected.
- Config drift: write a week file with an extra legacy task id and a missing new-config task id; `readWeek` returns the legacy id untouched and the new id defaulted; `projectWeekForConfig` drops the legacy id from its output but `readWeek`'s own return value still has it.

**`weeks.js` — apply arithmetic (pure unit tests, no disk I/O):**
- `bumpCount` clamps at 0 (bump by `-5` from `2` → `0`, not `-3`).
- `setMetric` rejects negative/NaN/non-number; accepts `null`.
- `appendEntry` → `applyEntryToWeek` happy path: counts add, metrics overwrite (not add), `entry.applied` and `entry.parseStatus` set correctly, `entries[]` id matches what `appendEntry` returned.
- `applyEntryToWeek`/`discardEntry`/`markEntryFailed` all throw when called on a non-`"pending"` entry (double-apply, apply-after-discard, etc.).
- `applyEntryToWeek` rejects a negative or non-integer delta, and rejects a delta over `MAX_APPLY_DELTA`.
- `removeEntry` on an `"ok"` entry removes the row but leaves `counts`/`metrics` unchanged (no silent undo).
- All mutation functions: assert the **input week object is unchanged** after the call (proves `structuredClone` isolation — this is the property SP2/SP3 will rely on when composing several of these in one route handler).
- `appendItem`/`attachItemLink`: valid link accepted; `null` accepted; malformed link (missing `url` or `label`) throws.

**Not SP1's job:** parse-result validation from the LLM (SP2's `parse.js`), HTTP status mapping (SP2), and all UI/manual smoke testing (SP3/SP4, per BRAINSTORM §3.7's manual pass).

## 8. Manual Intervention Required From You

1. **Fill in the three empty link URLs** in `config/config.json` once implemented: `Reachouts sheet`, `My profile`, `Strategy doc` — these are personal URLs (a private Google Sheet and a LinkedIn profile URL) that no agent has access to.
2. **Confirm `timezone: "America/Los_Angeles"`** is still correct (BRAINSTORM already sets this; flag here only in case you're not currently in Pacific time).
3. **First-run step (not really "manual," but human-triggered):** after `dev-code` scaffolds the repo, `npm install` needs to be run once in `/root/projects/linkedin-outreach-tool` before `npm test`/`npm run dev` work — no `node_modules/` exists yet.
4. No environment variables are required for SP1 itself. `WORKER_API_KEY`/`WORKER_BASE_URL`/`WORKER_MODEL` are SP2's concern (the diary parse call); SP1's config loader is specified to never fail or hang on their absence since it never reads them.

## 9. Open Questions & Decisions

| # | Item | Status |
|---|---|---|
| Q1 | BRAINSTORM's task-brief example "2026-01-01 falls in 2025-W53" | [RESOLVED: incorrect — verified by direct computation that Jan 1, 2026 is a Thursday and therefore correctly falls in `2026-W01`. §4.5 substitutes five verified real edge cases instead (`2023-01-01`→`2022-W52`, `2027-01-01`→`2026-W53`, `2021-01-01`→`2020-W53`, plus two 53-week-year boundaries). The algorithm itself is the standard ISO-8601 "nearest Thursday" method and is correct regardless of this one illustrative example.] |
| Q2 | Test runner choice | [RESOLVED: `vitest`, devDependency only. cc-gateway has no existing test runner or test files at all, so there is no convention to preserve or break.] |
| Q3 | Config caching strategy | [RESOLVED: none — read-per-request. Config is user-editable via SP2's `PUT /api/config`, unlike the juno-example manifest this house-format doc was modeled on, which was static per deployment.] |
| Q4 | Corrupt (unparseable) week file on read | [RESOLVED: `readWeek` throws `WeekError`, never silently substitutes an empty week — silently substituting would let a subsequent `writeWeek` permanently destroy recoverable data, violating D8.] |
| Q5 | Task id vs. metric id cross-namespace collisions | [RESOLVED: allowed, not validated as an error — `counts` and `metrics` are independent objects in the week schema, so a collision cannot corrupt data.] |
| Q6 | Exactly-one-headline-metric validation rule | [RESOLVED: added by SP1, not explicit in BRAINSTORM's validation list but directly required by §3.5's "follower sparkline as the headline" — zero or multiple headline metrics is a config error.] |
| Q7 | `MAX_APPLY_DELTA` — the "sane bound" BRAINSTORM §3.4 assigns to `parse.js` validation | [RESOLVED: SP1 exports the constant (`1000`) from `weeks.js` and also enforces it defensively inside `applyEntryToWeek`, so SP2's `parse.js` should import and reuse the same constant rather than picking an independent number — one source of truth instead of two bounds that could silently diverge.] |
| Q8 | `removeEntry` and an already-`"ok"` (applied) entry | [RESOLVED: does not reverse the applied counts/metrics — per D9 there is no undo mechanism. It only deletes the log row. SP3/SP4's UI should warn before offering delete on a non-pending entry, since the numeric effect will visibly outlive the text that produced it.] |
| Q9 | **`items[]` population policy** — how many item rows (if any) a diary-approved count delta or a manual counter tap should create, and whether/how the `post` task's *required* link is supplied given the LLM never returns links | [RESOLVED: `link:"optional"` tasks (invites, dms, call_ask, comments) never create `items[]` rows — plain `+1`/`−1` taps and diary-approved deltas are pure `counts` deltas only. `link:"required"` tasks (currently just `post`) always create an item on every log, even with `link: null`, so there is always something to attach a link to later. Decided downstream, as anticipated: per SP3 §9 Q8 and SP4 §9 Q1.] |
| Q10 | Orphaned `items[]`/`entries[]` rows referencing a task id removed from config | [RESOLVED: no special "no longer tracked" treatment — `LogRow.svelte` falls back to rendering the raw `taskId` string when the config lookup misses (the item row still renders in full, never crashes, never silently disappears). Decided downstream, as anticipated: per SP4 §9 Q5.] |
| Q11 | Config schema versioning beyond `version: 1` | [DEFERRED — `validateConfig` currently hard-requires `version === 1` and provides no migration path. Out of scope until a real schema change is needed; adding a version-2 migration function later is additive and doesn't require touching any of SP1's other exports.] |
| Q12 | `svelte.config.js`'s `csrf.checkOrigin` — whether to copy cc-gateway's `checkOrigin: false` | [RESOLVED: keep SvelteKit's default `checkOrigin: true` rather than copying cc-gateway's `checkOrigin: false`, because `ORIGIN` is set correctly per SP5's deploy design (`ORIGIN=https://cc.tejitpabari.com`, scheme+host only, no path — SP5 §4.D), per SP5 finding. See §4.1 for the corrected `svelte.config.js` snippet (the `csrf` key is simply omitted) and the cross-reference to SP5's full reasoning.] |
| Q13 | **Final module surface SP2 will import — sign-off on SP2's assumed signatures (SP2 PRD §9, first `[OPEN]` item)** | [RESOLVED: SP2's assumed signatures were checked one-by-one against this PRD's actual §4 exports. Three were wrong and are corrected here (SP1's real, already-shipped design is authoritative; SP2's PRD has been updated in step 3 of this reconciliation pass to match): (1) there is no `weeks.isoWeekKeyForDate(dateStr)` — the real export is `dateToWeekKey(date, timezone)`, which takes a `Date` (not a bare string) plus the config's timezone; SP2 must call it as `weeks.dateToWeekKey(new Date(\`${date}T12:00:00Z\`), config.timezone)` (noon-UTC anchor so the string→Date conversion can never cross a local-timezone day boundary — same technique SP4's client-side `isoWeek.js` independently arrived at). (2) `readWeek(weekKey, config, dataDir?)` takes a **required** `config` argument SP2's assumption omitted — every SP2 call site must load config first and pass it. (3) there is no `weeks.applyParseResult(week, proposed) -> {counts, metrics}` — the real, more capable export is `applyEntryToWeek(week, entryId, approved) -> week`, which takes the entry's id (not just its proposed deltas), returns the **whole** updated week object (not a `{counts,metrics}` fragment), and internally sets `entry.applied`/`entry.parseStatus` and throws `WeekError` if the entry isn't `'pending'` — SP2's apply route should call this directly instead of hand-setting `entry.applied`/`parseStatus` itself. Two more of SP2's assumptions were correct as stated and need no change: `isValidWeekKey(key) -> boolean` and `writeWeek(weekKey, week, dataDir?) -> void`. `weeks.listWeekKeys(dataDir?) -> string[]` was assumed and is correct. `config.loadConfig(configPath?) -> config` (throwing `ConfigError` with a readable `.message`) was assumed and is correct. `config.validateConfig(obj) -> {valid, errors}` was wrong — the real shape is `validateConfig(raw) -> config` (pure; **throws** `ConfigError` on any invalid field, returns the validated config object on success) — SP2 must `try/catch ConfigError`, never destructure `{valid, errors}`. `config.writeConfig(obj) -> void` did not exist and has been added in §4.4 above, specifically for SP2's `PUT /api/config` and its bundle-import write path. A `DATA_DIR` constant did already exist (§4.2, unchanged) for SP2's `data/.backups/<ts>/` import path — SP2's assumption there was correct. **Final surface SP2 imports, exactly as this PRD exports it:** `weeks.js` — `dateToWeekKey(date, timezone)`, `isValidWeekKey(key)`, `weekKeyToRange(key)`, `readWeek(weekKey, config, dataDir?)`, `writeWeek(weekKey, week, dataDir?)`, `listWeekKeys(dataDir?)`, `projectWeekForConfig(week, config)`, `bumpCount(week, taskId, delta)`, `setMetric(week, metricId, value)`, `applyEntryToWeek(week, entryId, approved)`, `discardEntry(week, entryId)`, `markEntryFailed(week, entryId)`, `removeEntry(week, entryId)`, `appendItem(week, {taskId, link})`, `attachItemLink(week, itemId, link)`, `emptyWeek(weekKey, config)`, `MAX_APPLY_DELTA`, `WeekError`, `DATA_DIR`; `config.js` — `loadConfig(configPath?)`, `validateConfig(raw)`, `writeConfig(config, configPath?)`, `ConfigError`, `CONFIG_PATH`.] |
