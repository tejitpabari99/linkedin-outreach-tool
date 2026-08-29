# Tasks: SP1 — Core Data Layer + App Scaffold

**Sub-project:** SP1 (Phase 1, no dependencies)
**PRD source:** `/root/projects/linkedin-outreach-tool/.dev/linkedin-outreach-tool/01-core-data-layer/PRD.md`
**Repo:** `/root/projects/linkedin-outreach-tool` (currently only `.gitignore` — this is the first sub-project to write real code)
**Fresh authoring** — no prior TASKS.md existed.

All PRD §9 open questions are `[RESOLVED]` (Q11 is `[DEFERRED]`, explicitly out of scope — not a blocker). No `[OPEN]` items remain.

**Scope note (not in the PRD, decided after it was written):** hosting/deployment is out of scope for this pass. Nothing below touches PM2, nginx, or a `05-deploy-and-docs` sub-project. The app runs standalone via `npm run dev` / `npm run build && npm run preview` / `node build`.

---

### Task 1 — Scaffold the SvelteKit app (config files, no routes/UI)

**Traced to PRD §4.1**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/package.json` (new)
  - `/root/projects/linkedin-outreach-tool/svelte.config.js` (new)
  - `/root/projects/linkedin-outreach-tool/vite.config.js` (new)
  - `/root/projects/linkedin-outreach-tool/jsconfig.json` (new)
  - `/root/projects/linkedin-outreach-tool/vitest.config.js` (new)
  - `/root/projects/linkedin-outreach-tool/src/app.html` (new)
  - `/root/projects/linkedin-outreach-tool/src/routes/.gitkeep` (new, empty file — see note below)

- **Changes:** Create each file with exactly this content.

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
  Note: unlike `cc-gateway`, `@sveltejs/adapter-auto` is deliberately **not** included (it's unused leftover scaffolding there — `svelte.config.js` only ever imports `adapter-node`).

  **`svelte.config.js`:**
  ```js
  import adapter from '@sveltejs/adapter-node';

  export default {
    kit: {
      adapter: adapter()
    }
  };
  ```
  Note: deliberately does **not** set `csrf.checkOrigin` at all (neither `true` nor `false`) — this keeps SvelteKit's secure default. Do not copy `cc-gateway`'s `csrf: { checkOrigin: false }` override; per PRD §4.1/§9 Q12 that override doesn't apply here.

  **`vite.config.js`:**
  ```js
  import { sveltekit } from '@sveltejs/kit/vite';
  import { defineConfig } from 'vite';

  export default defineConfig({
    plugins: [sveltekit()]
  });
  ```

  **`jsconfig.json`:**
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

  **`vitest.config.js`:**
  ```js
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      include: ['src/lib/**/*.test.js']
    }
  });
  ```

  **`src/app.html`:**
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

  **`src/routes/.gitkeep`:** empty file. SP1 ships no routes/pages at all (that's SP2/SP3/SP4's job), but `src/routes/` must exist on disk as a real directory for SvelteKit's Vite plugin to resolve cleanly, and git does not track empty directories — the placeholder file is only there so the directory survives a commit before any sub-project adds real route files into it.

  **`.gitignore`:** do **not** edit — it already exists at the repo root and already contains `node_modules/`, `.env`, `.svelte-kit/`, `build/`, `data/` (verified via `cat .gitignore`), which is everything PRD §4.1/§4.10 requires. This satisfies PRD Goal 7 ("confirm `.gitignore` already excludes [`data/`]") with zero code changes.

- **Acceptance criteria:**
  - All 7 files above exist with exactly the content given.
  - `cat /root/projects/linkedin-outreach-tool/.gitignore` still shows the original 5 lines, untouched.
  - No `src/routes/+page.svelte`, no `src/lib/**` files exist yet after this task (those come from later tasks/sub-projects).

---

### Task 2 — Install dependencies and verify the scaffold builds

**Traced to PRD §4.1, §8 item 3**

- **Files:** none (generates `/root/projects/linkedin-outreach-tool/node_modules/`, `package-lock.json`, and `.svelte-kit/` — all already gitignored or, for `package-lock.json`, fine to commit)

- **Changes:** From `/root/projects/linkedin-outreach-tool`, run:
  ```bash
  npm install
  ```
  This is the "first-run step" PRD §8 item 3 calls out (its own text notes it's "not really 'manual,' but human-triggered" — it's a plain, non-privileged command, so it's done here as a regular task rather than deferred to the human).

- **Acceptance criteria:**
  - `npm install` exits 0 and creates `node_modules/@sveltejs/kit`, `node_modules/svelte`, `node_modules/vite`, `node_modules/vitest`, `node_modules/@sveltejs/adapter-node`.
  - `npm run build` (from repo root) completes without error and produces a `build/` directory (adapter-node output), even though there are zero page routes — confirms Task 1's scaffold is structurally valid before any `src/lib` code is added.
  - `npx vitest run` exits 0 with "no test files found" (expected — no `*.test.js` files exist yet).

---

### Task 3 — Add the seed `config/config.json`

**Traced to PRD §4.3 (verbatim from BRAINSTORM §3.2 — data, not derived)**

- **Files:** `/root/projects/linkedin-outreach-tool/config/config.json` (new)

- **Changes:** Create the file with exactly this content:
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
  The three empty `url` values (`Reachouts sheet`, `My profile`, `Strategy doc`) are intentional — see Summary section below, PRD §8 item 1.

- **Acceptance criteria:**
  - `cat config/config.json | python3 -m json.tool` (or `node -e "JSON.parse(require('fs').readFileSync('config/config.json'))"`) succeeds — valid JSON.
  - Exactly one metric (`followers`) has `"headline": true`.
  - File will be used verbatim as the fixture in Task 9's `validateConfig` happy-path test.

---

### Task 4 — `src/lib/config.js`: `ConfigError` + `validateConfig`

**Traced to PRD §4.2 (path resolution) and §4.4 (validation table)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/config.js` (new)

- **Changes:** Create the file with:

  ```js
  import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { dirname, join } from 'node:path';

  const __dirname = dirname(fileURLToPath(import.meta.url)); // src/lib
  const PROJECT_ROOT = join(__dirname, '..', '..');
  export const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'config.json');

  export class ConfigError extends Error {
    constructor(message, field = null) {
      super(message);
      this.name = 'ConfigError';
      this.field = field;
    }
  }

  const ID_RE = /^[a-z][a-z0-9_]*$/;
  const REQUIRED_TOP_LEVEL_KEYS = ['version', 'name', 'timezone', 'lanes', 'tasks', 'metrics', 'links'];

  export function validateConfig(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ConfigError('Config must be a JSON object', null);
    }

    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
      if (!(key in raw)) {
        throw new ConfigError(`Config is missing required field "${key}"`, key);
      }
    }

    if (!Number.isInteger(raw.version) || raw.version !== 1) {
      throw new ConfigError(`Config version must be 1 (got ${JSON.stringify(raw.version)})`, 'version');
    }

    if (typeof raw.timezone !== 'string') {
      throw new ConfigError(`Config timezone must be a string (got ${JSON.stringify(raw.timezone)})`, 'timezone');
    }
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: raw.timezone });
    } catch {
      throw new ConfigError(`Config timezone "${raw.timezone}" is not a valid IANA timezone`, 'timezone');
    }

    if (!Array.isArray(raw.lanes)) throw new ConfigError('Config field "lanes" must be an array', 'lanes');
    const laneIds = new Set();
    for (let i = 0; i < raw.lanes.length; i++) {
      const lane = raw.lanes[i];
      if (!lane || typeof lane !== 'object') throw new ConfigError(`Lane at index ${i} must be an object`, `lanes[${i}]`);
      if (!('id' in lane)) throw new ConfigError(`Lane at index ${i} is missing "id"`, `lanes[${i}]`);
      if (!('label' in lane)) throw new ConfigError(`Lane at index ${i} is missing "label"`, `lanes[${i}]`);
      if (!ID_RE.test(lane.id)) throw new ConfigError(`Lane id "${lane.id}" must be lowercase snake_case`, `lanes[${i}].id`);
      if (laneIds.has(lane.id)) throw new ConfigError(`Duplicate lane id "${lane.id}"`, 'lanes');
      laneIds.add(lane.id);
    }

    if (!Array.isArray(raw.tasks)) throw new ConfigError('Config field "tasks" must be an array', 'tasks');
    const taskIds = new Set();
    for (let i = 0; i < raw.tasks.length; i++) {
      const task = raw.tasks[i];
      if (!task || typeof task !== 'object') throw new ConfigError(`Task at index ${i} must be an object`, `tasks[${i}]`);
      for (const field of ['id', 'lane', 'label', 'min', 'target', 'link']) {
        if (!(field in task)) {
          throw new ConfigError(`Task "${task.id ?? `#${i}`}" is missing "${field}"`, `tasks[${i}]`);
        }
      }
      if (!ID_RE.test(task.id)) throw new ConfigError(`Task id "${task.id}" must be lowercase snake_case`, `tasks[${i}].id`);
      if (taskIds.has(task.id)) throw new ConfigError(`Duplicate task id "${task.id}"`, 'tasks');
      taskIds.add(task.id);
      if (!laneIds.has(task.lane)) {
        throw new ConfigError(`Task "${task.id}" references unknown lane "${task.lane}"`, `tasks[${i}].lane`);
      }
      if (!Number.isInteger(task.min) || task.min < 0) {
        throw new ConfigError(`Task "${task.id}": "min" must be a non-negative integer (got ${task.min})`, `tasks[${i}].min`);
      }
      if (!Number.isInteger(task.target) || task.target < 0) {
        throw new ConfigError(`Task "${task.id}": "target" must be a non-negative integer (got ${task.target})`, `tasks[${i}].target`);
      }
      if (task.min > task.target) {
        throw new ConfigError(`Task "${task.id}": min (${task.min}) is greater than target (${task.target})`, `tasks[${i}]`);
      }
      if (task.link !== 'optional' && task.link !== 'required') {
        throw new ConfigError(`Task "${task.id}": "link" must be "optional" or "required" (got ${JSON.stringify(task.link)})`, `tasks[${i}].link`);
      }
    }

    if (!Array.isArray(raw.metrics)) throw new ConfigError('Config field "metrics" must be an array', 'metrics');
    const metricIds = new Set();
    let headlineCount = 0;
    for (let i = 0; i < raw.metrics.length; i++) {
      const metric = raw.metrics[i];
      if (!metric || typeof metric !== 'object') throw new ConfigError(`Metric at index ${i} must be an object`, `metrics[${i}]`);
      if (!('id' in metric)) throw new ConfigError(`Metric at index ${i} is missing "id"`, `metrics[${i}]`);
      if (!('label' in metric)) throw new ConfigError(`Metric at index ${i} is missing "label"`, `metrics[${i}]`);
      if (!ID_RE.test(metric.id)) throw new ConfigError(`Metric id "${metric.id}" must be lowercase snake_case`, `metrics[${i}].id`);
      if (metricIds.has(metric.id)) throw new ConfigError(`Duplicate metric id "${metric.id}"`, 'metrics');
      metricIds.add(metric.id);
      if (metric.headline === true) headlineCount++;
    }
    if (headlineCount !== 1) {
      throw new ConfigError(`Exactly one metric must be marked "headline": true (found ${headlineCount})`, 'metrics');
    }

    if (!Array.isArray(raw.links)) throw new ConfigError('Config field "links" must be an array', 'links');
    for (let i = 0; i < raw.links.length; i++) {
      const link = raw.links[i];
      if (!link || typeof link !== 'object') throw new ConfigError(`Link at index ${i} must be an object`, `links[${i}]`);
      if (!('label' in link)) throw new ConfigError(`Link at index ${i} is missing "label"`, `links[${i}]`);
      if (!('url' in link)) throw new ConfigError(`Link at index ${i} is missing "url"`, `links[${i}]`);
    }

    return raw;
  }
  ```

  Notes for the implementer:
  - Task id and metric id are independent namespaces (PRD §4.4, §9 Q5) — do **not** add any cross-check between `taskIds` and `metricIds`.
  - Empty string `url` on a link is valid (checked only for key presence, not content) — this is what makes Task 3's seed config with three empty URLs pass validation.
  - `loadConfig`/`writeConfig` are added in Task 5, appended to this same file — don't add them yet.

- **Acceptance criteria:**
  - `node -e "import('./src/lib/config.js').then(m => console.log(typeof m.validateConfig, typeof m.ConfigError, m.CONFIG_PATH))"` (run from repo root) prints `function function <absolute-path-ending-in-config/config.json>` and exits 0.
  - Covered exhaustively by Task 9's tests — not independently re-verified here.

---

### Task 5 — `src/lib/config.js`: `loadConfig` + `writeConfig`

**Traced to PRD §4.4 (load/write side + caching-behaviour decision)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/config.js` (append to the file from Task 4 — do not remove anything already there)

- **Changes:** Append the following two exports after `validateConfig`:

  ```js
  export function loadConfig(configPath = CONFIG_PATH) {
    let raw;
    try {
      raw = readFileSync(configPath, 'utf8');
    } catch (err) {
      throw new ConfigError(`Failed to read config file at ${configPath}: ${err.message}`, null);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new ConfigError(`Config file at ${configPath} contains invalid JSON: ${err.message}`, null);
    }
    return validateConfig(parsed);
  }

  export function writeConfig(config, configPath = CONFIG_PATH) {
    validateConfig(config); // defensive re-validation — never persists something that wouldn't itself load cleanly
    const dir = dirname(configPath);
    mkdirSync(dir, { recursive: true });
    const tmpPath = join(dir, `.config.json.tmp-${process.pid}-${Date.now()}`);
    writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    renameSync(tmpPath, configPath); // same-directory atomic rename
  }
  ```

  Important: `loadConfig` never caches (PRD §4.4 caching-behaviour decision) — every call does a fresh `readFileSync` + `JSON.parse`. Do not add memoization.

- **Acceptance criteria:**
  - `loadConfig()` (no args) against the real `config/config.json` from Task 3 returns the parsed, validated config object with no exception.
  - `loadConfig('/nonexistent/path.json')` throws `ConfigError` (not a raw `ENOENT` `Error`).
  - Fully covered by Task 9's tests, including the "missing file" and "malformed JSON" cases.

---

### Task 6 — `src/lib/weeks.js`: path constants + ISO week-key arithmetic

**Traced to PRD §4.2 and §4.5**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/weeks.js` (new)

- **Changes:** Create the file with exactly this content (copied verbatim from PRD §4.5, plus the shared path-resolution convention from §4.2 adapted for this module):

  ```js
  import { fileURLToPath } from 'node:url';
  import { dirname, join } from 'node:path';

  const __dirname = dirname(fileURLToPath(import.meta.url)); // src/lib
  const PROJECT_ROOT = join(__dirname, '..', '..');
  export const DATA_DIR = join(PROJECT_ROOT, 'data');

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

  **This file references `WeekError` (in `weekKeyToRange`) before it's defined** — that's fine in JS because `weekKeyToRange` isn't *called* until after the whole module (including Task 7's `WeekError` class, appended below this code in the same file) has finished loading. Do not reorder or add a placeholder class here; Task 7 supplies the real one immediately below this block, in the same file, before the file is considered complete.

  Do not implement `emptyWeek`, `readWeek`, `writeWeek`, `listWeekKeys`, `projectWeekForConfig`, or any of the apply-arithmetic functions in this task — those are Tasks 7 and 8.

- **Acceptance criteria:**
  - Covered exhaustively by Task 10's tests — not independently re-verified here, since `weekKeyToRange` can't run standalone until `WeekError` exists (Task 7).
  - `node --input-type=module -e "import('./src/lib/weeks.js').then(m => console.log(m.isValidWeekKey('2026-W35'), m.isValidWeekKey('2026-W54')))"` (run from repo root, after Task 7 adds `WeekError`) prints `true false`.

---

### Task 7 — `src/lib/weeks.js`: `WeekError` + week-file I/O

**Traced to PRD §4.6 and §4.7 (config-vs-data drift policy)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/weeks.js` (append to the file from Task 6)

- **Changes:**

  1. Update the import line at the top of the file (from Task 6) to add the `node:fs` imports:
     ```js
     import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
     import { fileURLToPath } from 'node:url';
     import { dirname, join } from 'node:path';
     ```
  2. Append the following after `prevWeekKey` (the last export from Task 6):

  ```js
  export class WeekError extends Error {
    constructor(message, weekKey = null) {
      super(message);
      this.name = 'WeekError';
      this.weekKey = weekKey;
    }
  }

  const WEEK_FILE_RE = /^(\d{4}-W\d{2})\.json$/;

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
      throw new WeekError(`Week file ${weekKey}.json is corrupt and could not be parsed: ${err.message}`, weekKey);
    }
    // Additive-only reconciliation against current config — see PRD §4.7 for the drift policy.
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
    renameSync(tmpPath, finalPath); // same-directory rename is atomic on POSIX
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

  Key behaviors an implementer must not "fix" or simplify away:
  - A **missing** week file returns `emptyWeek(...)` — this is normal, not an error.
  - A **corrupt** (unparseable) week file throws `WeekError` — it must never silently fall back to an empty week (that would let a subsequent `writeWeek` destroy recoverable data).
  - `readWeek`'s reconciliation only **adds** missing config ids; it never deletes an id already present (including ids no longer in config) — this is in-memory only, never written back automatically.
  - `projectWeekForConfig` is a pure, non-persisted view — it must not be called from inside `readWeek`.

- **Acceptance criteria:**
  - Covered exhaustively by Task 11's tests.
  - `node --input-type=module -e "import('./src/lib/weeks.js').then(m => console.log(m.listWeekKeys('/tmp/definitely-does-not-exist-xyz')))"` prints `[]` and exits 0 (missing `data/`-equivalent dir is not an error).

---

### Task 8 — `src/lib/weeks.js`: apply arithmetic (pure state-transition functions)

**Traced to PRD §4.8 and §4.9 (schema/`parseStatus` lifecycle)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/weeks.js` (append to the file from Task 7)

- **Changes:**

  1. Update the import line at the top of the file to add `node:crypto`:
     ```js
     import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
     import { randomUUID } from 'node:crypto';
     import { fileURLToPath } from 'node:url';
     import { dirname, join } from 'node:path';
     ```
  2. Append the following after `projectWeekForConfig` (the last export from Task 7). `structuredClone` is a Node 20 global — no import needed.

  ```js
  export const MAX_APPLY_DELTA = 1000; // exported so SP2's parse.js validation uses the same bound

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
    // Deliberately does NOT reverse counts/metrics already merged by a prior applyEntryToWeek —
    // per D9 there is no undo mechanism. This only removes the log row.
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

  Key invariant an implementer must preserve: every function here uses `structuredClone(week)` to build its return value and never mutates the `week` argument it was given — this is what lets SP2's route handlers safely chain several of these calls against the same in-memory object.

- **Acceptance criteria:**
  - Covered exhaustively by Task 12's tests.
  - `grep -c "structuredClone(week)" src/lib/weeks.js` returns at least 8 (one per mutating function: `bumpCount`, `setMetric`, `appendEntry`, `applyEntryToWeek`, `discardEntry`, `markEntryFailed`, `removeEntry`, `appendItem`, `attachItemLink`).

---

### Task 9 — Tests: `config.js`

**Traced to PRD §7 ("`config.js`" section) and §9 Q5/Q6**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/config.test.js` (new)

- **Changes:** Create the file with the following content (32 tests: 1 happy-path + 7 missing-key + 3 version + 1 timezone + 3 lane + 8 task + 4 metric + 2 link + 3 `loadConfig`):

  ```js
  import { describe, it, expect, beforeEach } from 'vitest';
  import { mkdtempSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { validateConfig, loadConfig, ConfigError } from './config.js';

  const SEED_CONFIG = {
    version: 1,
    name: 'LinkedIn Outreach — Juno',
    timezone: 'America/Los_Angeles',
    lanes: [
      { id: 'outreach', label: 'Outreach', blurb: 'Get to data + customers' },
      { id: 'presence', label: 'Presence', blurb: 'Be worth finding' }
    ],
    tasks: [
      { id: 'invites', lane: 'outreach', label: 'Targeted connection requests', min: 10, target: 15, link: 'optional' },
      { id: 'dms', lane: 'outreach', label: 'Follow-up DMs', min: 2, target: 4, link: 'optional' },
      { id: 'call_ask', lane: 'outreach', label: 'Call asks sent', min: 1, target: 2, link: 'optional' },
      { id: 'comments', lane: 'presence', label: 'Substantive comments', min: 5, target: 10, link: 'optional' },
      { id: 'post', lane: 'presence', label: 'Posts published', min: 1, target: 1, link: 'required' }
    ],
    metrics: [
      { id: 'followers', label: 'Followers', headline: true },
      { id: 'profile_views', label: 'Profile views' },
      { id: 'impressions', label: 'Post impressions' },
      { id: 'replies', label: 'Replies from target people' },
      { id: 'calls_booked', label: 'Calls booked' }
    ],
    links: [
      { label: 'Reachouts sheet', url: '' },
      { label: 'LinkedIn notifications', url: 'https://www.linkedin.com/notifications/' },
      { label: 'Creator analytics', url: 'https://www.linkedin.com/analytics/creator/' },
      { label: 'My profile', url: '' },
      { label: 'Strategy doc', url: '' }
    ]
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function expectConfigError(fn, field) {
    let threw = false;
    try {
      fn();
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.message.length).toBeGreaterThan(0);
      expect(err.field).toBe(field);
    }
    expect(threw).toBe(true);
  }

  describe('validateConfig — happy path', () => {
    it('accepts the seed config unchanged', () => {
      const result = validateConfig(clone(SEED_CONFIG));
      expect(result.version).toBe(1);
      expect(result.tasks).toHaveLength(5);
    });
  });

  describe('validateConfig — missing top-level keys', () => {
    for (const key of ['version', 'name', 'timezone', 'lanes', 'tasks', 'metrics', 'links']) {
      it(`throws when "${key}" is missing`, () => {
        const bad = clone(SEED_CONFIG);
        delete bad[key];
        expectConfigError(() => validateConfig(bad), key);
      });
    }
  });

  describe('validateConfig — version', () => {
    it('rejects version 0', () => {
      const bad = clone(SEED_CONFIG); bad.version = 0;
      expectConfigError(() => validateConfig(bad), 'version');
    });
    it('rejects version as a string "1"', () => {
      const bad = clone(SEED_CONFIG); bad.version = '1';
      expectConfigError(() => validateConfig(bad), 'version');
    });
    it('rejects version 2', () => {
      const bad = clone(SEED_CONFIG); bad.version = 2;
      expectConfigError(() => validateConfig(bad), 'version');
    });
  });

  describe('validateConfig — timezone', () => {
    it('rejects an invalid IANA timezone string', () => {
      const bad = clone(SEED_CONFIG); bad.timezone = 'Americaa/Los_Angeles';
      expectConfigError(() => validateConfig(bad), 'timezone');
    });
  });

  describe('validateConfig — lanes', () => {
    it('rejects a duplicate lane id', () => {
      const bad = clone(SEED_CONFIG);
      bad.lanes.push({ id: 'outreach', label: 'Outreach 2' });
      expectConfigError(() => validateConfig(bad), 'lanes');
    });
    it('rejects a lane missing "label"', () => {
      const bad = clone(SEED_CONFIG);
      delete bad.lanes[1].label;
      expectConfigError(() => validateConfig(bad), 'lanes[1]');
    });
    it('rejects a lane id with bad casing', () => {
      const bad = clone(SEED_CONFIG);
      bad.lanes[0].id = 'Outreach!';
      expectConfigError(() => validateConfig(bad), 'lanes[0].id');
    });
  });

  describe('validateConfig — tasks', () => {
    it('rejects a duplicate task id', () => {
      const bad = clone(SEED_CONFIG);
      bad.tasks.push({ ...bad.tasks[0] });
      expectConfigError(() => validateConfig(bad), 'tasks');
    });
    it('rejects a task missing "target"', () => {
      const bad = clone(SEED_CONFIG);
      delete bad.tasks[0].target;
      expectConfigError(() => validateConfig(bad), 'tasks[0]');
    });
    it('rejects a task referencing an unknown lane', () => {
      const bad = clone(SEED_CONFIG);
      bad.tasks[0].lane = 'outreach2';
      expectConfigError(() => validateConfig(bad), 'tasks[0].lane');
    });
    it('rejects a non-integer "min"', () => {
      const bad = clone(SEED_CONFIG);
      bad.tasks[0].min = 1.5;
      expectConfigError(() => validateConfig(bad), 'tasks[0].min');
    });
    it('rejects a negative "min"', () => {
      const bad = clone(SEED_CONFIG);
      bad.tasks[0].min = -1;
      expectConfigError(() => validateConfig(bad), 'tasks[0].min');
    });
    it('rejects min greater than target', () => {
      const bad = clone(SEED_CONFIG);
      bad.tasks[0].min = 20;
      bad.tasks[0].target = 10;
      expectConfigError(() => validateConfig(bad), 'tasks[0]');
    });
    it('rejects a "link" value that is not optional/required', () => {
      const bad = clone(SEED_CONFIG);
      bad.tasks[0].link = 'yes';
      expectConfigError(() => validateConfig(bad), 'tasks[0].link');
    });
    it('rejects a task id with bad casing', () => {
      const bad = clone(SEED_CONFIG);
      bad.tasks[0].id = 'Invites!';
      expectConfigError(() => validateConfig(bad), 'tasks[0].id');
    });
  });

  describe('validateConfig — metrics', () => {
    it('rejects a duplicate metric id', () => {
      const bad = clone(SEED_CONFIG);
      bad.metrics.push({ ...bad.metrics[1] });
      expectConfigError(() => validateConfig(bad), 'metrics');
    });
    it('rejects a metric missing "label"', () => {
      const bad = clone(SEED_CONFIG);
      delete bad.metrics[0].label;
      expectConfigError(() => validateConfig(bad), 'metrics[0]');
    });
    it('rejects zero headline metrics', () => {
      const bad = clone(SEED_CONFIG);
      bad.metrics[0].headline = false;
      expectConfigError(() => validateConfig(bad), 'metrics');
    });
    it('rejects two headline metrics', () => {
      const bad = clone(SEED_CONFIG);
      bad.metrics[1].headline = true;
      expectConfigError(() => validateConfig(bad), 'metrics');
    });
  });

  describe('validateConfig — links', () => {
    it('rejects a link missing "url"', () => {
      const bad = clone(SEED_CONFIG);
      delete bad.links[0].url;
      expectConfigError(() => validateConfig(bad), 'links[0]');
    });
    it('accepts a link with an empty string url', () => {
      const ok = clone(SEED_CONFIG);
      ok.links[0].url = '';
      expect(() => validateConfig(ok)).not.toThrow();
    });
  });

  describe('loadConfig', () => {
    let dir;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lot-config-'));
    });

    it('loads a valid config file from disk', () => {
      const path = join(dir, 'config.json');
      writeFileSync(path, JSON.stringify(SEED_CONFIG), 'utf8');
      const result = loadConfig(path);
      expect(result.name).toBe(SEED_CONFIG.name);
    });

    it('throws a ConfigError (not a raw ENOENT) for a missing file', () => {
      const path = join(dir, 'does-not-exist.json');
      expectConfigError(() => loadConfig(path), null);
    });

    it('throws a ConfigError (not a SyntaxError) for malformed JSON', () => {
      const path = join(dir, 'bad.json');
      writeFileSync(path, '{ not valid json', 'utf8');
      expectConfigError(() => loadConfig(path), null);
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/config.test.js` shows 32 passing tests, 0 failures.
  - No test reads or writes the real `config/config.json` — every disk-touching test uses a `mkdtempSync` temp directory.

---

### Task 10 — Tests: ISO week-key maths

**Traced to PRD §4.5 and §7 ("`weeks.js` — ISO week maths" section)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/weeks.isoweek.test.js` (new)

- **Changes:** Create the file with the following content (27 tests: 6 boundary fixtures + 2 DST + 2 timezone-safe-"today" + 5 round-trip + 2 next/prev + 8 `isValidWeekKey` + 2 `listWeekKeys`):

  ```js
  import { describe, it, expect } from 'vitest';
  import { mkdtempSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import {
    dateToWeekKey,
    weekKeyToRange,
    nextWeekKey,
    prevWeekKey,
    isValidWeekKey,
    listWeekKeys
  } from './weeks.js';

  describe('dateToWeekKey — ISO week-year boundary fixtures (PRD §4.5)', () => {
    const cases = [
      ['2023-01-01', 'UTC', '2022-W52'],
      ['2027-01-01', 'UTC', '2026-W53'],
      ['2021-01-01', 'UTC', '2020-W53'],
      ['2026-12-31', 'UTC', '2026-W53'],
      ['2020-12-31', 'UTC', '2020-W53'],
      ['2026-01-01', 'UTC', '2026-W01'] // corrected edge case — PRD §9 Q1
    ];
    for (const [date, tz, expected] of cases) {
      it(`${date} (${tz}) resolves to ${expected}`, () => {
        expect(dateToWeekKey(new Date(`${date}T12:00:00Z`), tz)).toBe(expected);
      });
    }
  });

  describe('dateToWeekKey — DST safety', () => {
    it('does not shift the calendar day across the spring-forward transition (2026-03-08)', () => {
      const before = dateToWeekKey(new Date('2026-03-08T09:00:00Z'), 'America/Los_Angeles'); // 01:00 PST
      const after = dateToWeekKey(new Date('2026-03-08T20:00:00Z'), 'America/Los_Angeles');  // 13:00 PDT
      expect(before).toBe(after);
    });

    it('does not shift the calendar day across the fall-back transition (2026-11-01)', () => {
      const before = dateToWeekKey(new Date('2026-11-01T08:00:00Z'), 'America/Los_Angeles'); // 01:00 PDT
      const after = dateToWeekKey(new Date('2026-11-01T20:00:00Z'), 'America/Los_Angeles');  // 12:00 PST
      expect(before).toBe(after);
    });
  });

  describe('dateToWeekKey — timezone-safe "today" resolution', () => {
    it('an instant just after UTC midnight resolves against the previous local calendar day (documented PRD §4.5 example)', () => {
      // 2026-01-01T00:30:00Z is 2025-12-31T16:30:00 in America/Los_Angeles.
      expect(dateToWeekKey(new Date('2026-01-01T00:30:00Z'), 'America/Los_Angeles')).toBe('2026-W01');
    });

    it('an instant just after UTC midnight Monday resolves to the previous week when the local calendar date is still Sunday', () => {
      // 2026-01-05T00:30:00Z is Monday in UTC but 2026-01-04T16:30:00 (Sunday) in America/Los_Angeles.
      // A buggy implementation using the UTC calendar date directly would wrongly return 2026-W02 here.
      expect(dateToWeekKey(new Date('2026-01-05T00:30:00Z'), 'America/Los_Angeles')).toBe('2026-W01');
    });
  });

  describe('weekKeyToRange round-trips', () => {
    const keys = ['2026-W01', '2026-W35', '2026-W53', '2022-W52', '2020-W53'];
    for (const key of keys) {
      it(`${key}'s range start maps back to ${key}`, () => {
        const { start } = weekKeyToRange(key);
        expect(dateToWeekKey(new Date(`${start}T12:00:00Z`), 'UTC')).toBe(key);
      });
    }
  });

  describe('nextWeekKey / prevWeekKey', () => {
    it('crosses a normal year boundary', () => {
      expect(nextWeekKey('2025-W52')).toBe('2026-W01');
      expect(prevWeekKey('2026-W01')).toBe('2025-W52');
    });
    it('crosses a 53-week year boundary', () => {
      expect(nextWeekKey('2026-W53')).toBe('2027-W01');
      expect(prevWeekKey('2027-W01')).toBe('2026-W53');
    });
  });

  describe('isValidWeekKey', () => {
    const badKeys = ['2026-W54', '2026-w35', '2026-35', '', null, undefined, '2026-W00', 'not-a-key'];
    for (const bad of badKeys) {
      it(`rejects ${JSON.stringify(bad)}`, () => {
        expect(isValidWeekKey(bad)).toBe(false);
      });
    }
    it('accepts a well-formed key', () => {
      expect(isValidWeekKey('2026-W35')).toBe(true);
    });
  });

  describe('listWeekKeys', () => {
    it('returns [] for a missing directory', () => {
      expect(listWeekKeys(join(tmpdir(), 'lot-weeks-does-not-exist-xyz'))).toEqual([]);
    });

    it('returns only valid week-key filenames, sorted chronologically across a year boundary', () => {
      const dir = mkdtempSync(join(tmpdir(), 'lot-weeks-'));
      for (const name of ['2026-W53.json', '2027-W01.json', '2026-W01.json', 'notes.txt', '.config.json.tmp-123']) {
        writeFileSync(join(dir, name), '{}', 'utf8');
      }
      expect(listWeekKeys(dir)).toEqual(['2026-W01', '2026-W53', '2027-W01']);
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/weeks.isoweek.test.js` shows 27 passing tests, 0 failures.
  - All five §4.5 boundary fixtures plus the corrected `2026-01-01 → 2026-W01` case pass explicitly (not just indirectly via other tests).
  - The two "timezone-safe today" tests both pass, including the Sunday/Monday-crossing case that would fail under a UTC-calendar-date implementation.

---

### Task 11 — Tests: week-file I/O

**Traced to PRD §4.6, §4.7 and §7 ("`weeks.js` — file I/O" section)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/weeks.io.test.js` (new)

- **Changes:** Create the file with the following content (6 tests):

  ```js
  import { describe, it, expect, beforeEach } from 'vitest';
  import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { emptyWeek, readWeek, writeWeek, projectWeekForConfig, WeekError } from './weeks.js';

  const CONFIG = {
    tasks: [{ id: 'invites' }, { id: 'dms' }, { id: 'call_ask' }, { id: 'comments' }, { id: 'post' }],
    metrics: [{ id: 'followers' }, { id: 'profile_views' }, { id: 'impressions' }, { id: 'replies' }, { id: 'calls_booked' }]
  };

  describe('readWeek', () => {
    let dir;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lot-weekfiles-')); });

    it("returns emptyWeek's exact shape when the file is missing", () => {
      const result = readWeek('2026-W35', CONFIG, dir);
      expect(result).toEqual(emptyWeek('2026-W35', CONFIG));
    });

    it('throws WeekError (not silently templating) for a corrupt file', () => {
      writeFileSync(join(dir, '2026-W35.json'), '{ not valid json', 'utf8');
      expect(() => readWeek('2026-W35', CONFIG, dir)).toThrow(WeekError);
    });
  });

  describe('writeWeek + readWeek round-trip', () => {
    let dir;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lot-weekfiles-')); });

    it('round-trips a week object exactly', () => {
      const week = emptyWeek('2026-W35', CONFIG);
      week.counts.invites = 6;
      writeWeek('2026-W35', week, dir);
      const reread = readWeek('2026-W35', CONFIG, dir);
      expect(reread).toEqual(week);
    });

    it('leaves no .tmp-* file behind on success', () => {
      const week = emptyWeek('2026-W35', CONFIG);
      writeWeek('2026-W35', week, dir);
      const files = readdirSync(dir);
      expect(files).toEqual(['2026-W35.json']);
      expect(files.some(f => f.includes('.tmp-'))).toBe(false);
    });

    it('rejects a week object whose "week" field does not match the target key', () => {
      const week = emptyWeek('2026-W35', CONFIG);
      expect(() => writeWeek('2026-W36', week, dir)).toThrow(WeekError);
    });
  });

  describe('config-vs-data drift (readWeek reconciliation, PRD §4.7)', () => {
    let dir;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lot-weekfiles-')); });

    it('preserves a legacy task id and defaults a newly-added one, without persisting either', () => {
      const legacyWeek = {
        version: 1, week: '2026-W35', start: '2026-08-31', end: '2026-09-06',
        counts: { invites: 3, legacy_task: 9 },
        metrics: { followers: 100 },
        items: [], entries: []
      };
      writeFileSync(join(dir, '2026-W35.json'), JSON.stringify(legacyWeek), 'utf8');

      const result = readWeek('2026-W35', CONFIG, dir);
      expect(result.counts.legacy_task).toBe(9);       // legacy id preserved
      expect(result.counts.dms).toBe(0);                // new config id defaulted
      expect(result.metrics.profile_views).toBeNull();  // new metric id defaulted

      const projected = projectWeekForConfig(result, CONFIG);
      expect(projected.counts.legacy_task).toBeUndefined(); // dropped from the UI-facing view
      expect(result.counts.legacy_task).toBe(9);             // but readWeek's own object still has it

      const onDisk = JSON.parse(readFileSync(join(dir, '2026-W35.json'), 'utf8'));
      expect(onDisk.counts.dms).toBeUndefined(); // readWeek's reconciliation was never written back
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/weeks.io.test.js` shows 6 passing tests, 0 failures.
  - No test touches the real `data/` directory — every test uses a `mkdtempSync` temp directory.
  - The corrupt-file test specifically asserts a thrown `WeekError`, not a silently-returned empty week.

---

### Task 12 — Tests: apply arithmetic

**Traced to PRD §4.8, §4.9 (`parseStatus` lifecycle) and §7 ("`weeks.js` — apply arithmetic" section)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/weeks.apply.test.js` (new)

- **Changes:** Create the file with the following content (22 tests):

  ```js
  import { describe, it, expect } from 'vitest';
  import {
    emptyWeek, bumpCount, setMetric, appendEntry, applyEntryToWeek,
    discardEntry, markEntryFailed, removeEntry, appendItem, attachItemLink,
    WeekError, MAX_APPLY_DELTA
  } from './weeks.js';

  const CONFIG = {
    tasks: [{ id: 'invites' }, { id: 'comments' }, { id: 'post' }],
    metrics: [{ id: 'followers' }]
  };

  function baseWeek() {
    return emptyWeek('2026-W35', CONFIG);
  }

  describe('bumpCount', () => {
    it('clamps at 0 instead of going negative', () => {
      let week = baseWeek();
      week = bumpCount(week, 'invites', 2);
      week = bumpCount(week, 'invites', -5);
      expect(week.counts.invites).toBe(0);
    });
    it('does not mutate the input week', () => {
      const week = baseWeek();
      const frozen = structuredClone(week);
      bumpCount(week, 'invites', 3);
      expect(week).toEqual(frozen);
    });
    it('rejects a non-integer delta', () => {
      expect(() => bumpCount(baseWeek(), 'invites', 1.5)).toThrow(WeekError);
    });
  });

  describe('setMetric', () => {
    it('accepts null to clear a metric', () => {
      const week = setMetric(baseWeek(), 'followers', null);
      expect(week.metrics.followers).toBeNull();
    });
    it('rejects a negative value', () => {
      expect(() => setMetric(baseWeek(), 'followers', -1)).toThrow(WeekError);
    });
    it('rejects NaN', () => {
      expect(() => setMetric(baseWeek(), 'followers', NaN)).toThrow(WeekError);
    });
    it('does not mutate the input week', () => {
      const week = baseWeek();
      const frozen = structuredClone(week);
      setMetric(week, 'followers', 500);
      expect(week).toEqual(frozen);
    });
  });

  describe('appendEntry -> applyEntryToWeek happy path', () => {
    it('adds counts, sets metrics, and marks the entry ok', () => {
      let week = baseWeek();
      const { week: withEntry, entry } = appendEntry(week, { date: '2026-09-02', text: 'left 4 comments, sent 6 invites' });
      week = applyEntryToWeek(withEntry, entry.id, {
        counts: { comments: 4, invites: 6 },
        metrics: { followers: 1032 }
      });
      expect(week.counts.comments).toBe(4);
      expect(week.counts.invites).toBe(6);
      expect(week.metrics.followers).toBe(1032);
      const stored = week.entries.find(e => e.id === entry.id);
      expect(stored.parseStatus).toBe('ok');
      expect(stored.applied).toEqual({ counts: { comments: 4, invites: 6 }, metrics: { followers: 1032 } });
    });

    it('overwrites (does not add to) an existing metric value on a second entry', () => {
      let week = setMetric(baseWeek(), 'followers', 1000);
      const { week: withEntry, entry } = appendEntry(week, { date: '2026-09-03', text: 'followers at 1010' });
      week = applyEntryToWeek(withEntry, entry.id, { counts: {}, metrics: { followers: 1010 } });
      expect(week.metrics.followers).toBe(1010); // overwritten, not 1000+1010
    });
  });

  describe('idempotency guard — non-pending entries never transition again', () => {
    it('applyEntryToWeek throws when called twice on the same entry', () => {
      const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      const applied = applyEntryToWeek(week, entry.id, { counts: {}, metrics: {} });
      expect(() => applyEntryToWeek(applied, entry.id, { counts: {}, metrics: {} })).toThrow(WeekError);
    });

    it('discardEntry throws when the entry was already applied', () => {
      const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      const applied = applyEntryToWeek(week, entry.id, { counts: {}, metrics: {} });
      expect(() => discardEntry(applied, entry.id)).toThrow(WeekError);
    });

    it('markEntryFailed throws when the entry was already discarded', () => {
      const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      const discarded = discardEntry(week, entry.id);
      expect(() => markEntryFailed(discarded, entry.id)).toThrow(WeekError);
    });
  });

  describe('applyEntryToWeek delta validation', () => {
    it('rejects a negative count delta', () => {
      const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      expect(() => applyEntryToWeek(week, entry.id, { counts: { invites: -1 }, metrics: {} })).toThrow(WeekError);
    });
    it('rejects a non-integer count delta', () => {
      const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      expect(() => applyEntryToWeek(week, entry.id, { counts: { invites: 1.5 }, metrics: {} })).toThrow(WeekError);
    });
    it('rejects a delta exceeding MAX_APPLY_DELTA', () => {
      const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      expect(() => applyEntryToWeek(week, entry.id, { counts: { invites: MAX_APPLY_DELTA + 1 }, metrics: {} })).toThrow(WeekError);
    });
  });

  describe('removeEntry', () => {
    it('removes the log row but leaves counts/metrics unchanged for an already-applied entry (no undo)', () => {
      const { week: withEntry, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      let week = applyEntryToWeek(withEntry, entry.id, { counts: { invites: 5 }, metrics: {} });
      const before = week.counts.invites;
      week = removeEntry(week, entry.id);
      expect(week.entries.find(e => e.id === entry.id)).toBeUndefined();
      expect(week.counts.invites).toBe(before);
    });
  });

  describe('appendItem / attachItemLink', () => {
    it('accepts a valid link', () => {
      const { week, item } = appendItem(baseWeek(), { taskId: 'post', link: { url: 'https://x', label: 'anchor post' } });
      expect(week.items.find(i => i.id === item.id).link.url).toBe('https://x');
    });
    it('accepts a null link', () => {
      const { item } = appendItem(baseWeek(), { taskId: 'post', link: null });
      expect(item.link).toBeNull();
    });
    it('throws on a malformed link (missing label)', () => {
      expect(() => appendItem(baseWeek(), { taskId: 'post', link: { url: 'https://x' } })).toThrow(WeekError);
    });
    it("attachItemLink updates an existing item's link", () => {
      const { week, item } = appendItem(baseWeek(), { taskId: 'post', link: null });
      const updated = attachItemLink(week, item.id, { url: 'https://y', label: 'later link' });
      expect(updated.items.find(i => i.id === item.id).link.url).toBe('https://y');
    });
  });

  describe('structuredClone isolation across mutation functions', () => {
    it('appendEntry does not mutate the input week', () => {
      const week = baseWeek();
      const frozen = structuredClone(week);
      appendEntry(week, { date: '2026-09-02', text: 'x' });
      expect(week).toEqual(frozen);
    });

    it('applyEntryToWeek does not mutate the input week object', () => {
      const { week, entry } = appendEntry(baseWeek(), { date: '2026-09-02', text: 'x' });
      const frozen = structuredClone(week);
      applyEntryToWeek(week, entry.id, { counts: { invites: 3 }, metrics: {} });
      expect(week).toEqual(frozen);
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/weeks.apply.test.js` shows 22 passing tests, 0 failures.
  - The "idempotency guard" describe block specifically proves `applyEntryToWeek`/`discardEntry`/`markEntryFailed` all throw `WeekError` on a non-`"pending"` entry — this is what makes D9's "no undo" guarantee mechanically enforced.
  - The two "structuredClone isolation" tests, plus the two inline isolation tests in `bumpCount`/`setMetric`, confirm no exported function mutates its `week` argument.

---

### Task 13 — Full-suite verification

**Traced to PRD §7 (testing strategy as a whole) and Goals 1–7**

- **Files:** none (verification only — no new files)

- **Changes:** From `/root/projects/linkedin-outreach-tool`, run:
  ```bash
  npx vitest run
  ```
  If any test fails, fix the corresponding `src/lib/*.js` or `*.test.js` file (do not weaken an assertion to make it pass) and re-run until green.

- **Acceptance criteria:**
  - `npx vitest run` reports 4 test files and a combined total of 87 passing tests (32 + 27 + 6 + 22), 0 failures, 0 skipped.
  - `npm run build` still completes without error (re-verifies Task 2's scaffold-integrity check still holds after all of `src/lib` was added — `src/lib` code is never imported by any route, so it cannot affect the build differently, but this re-confirms nothing in Tasks 3–12 accidentally broke the app shell, e.g. a stray syntax error).
  - `git status` (or equivalent) shows exactly the files this PRD scopes: `package.json`, `package-lock.json`, `svelte.config.js`, `vite.config.js`, `jsconfig.json`, `vitest.config.js`, `src/app.html`, `src/routes/.gitkeep`, `config/config.json`, `src/lib/config.js`, `src/lib/weeks.js`, `src/lib/config.test.js`, `src/lib/weeks.isoweek.test.js`, `src/lib/weeks.io.test.js`, `src/lib/weeks.apply.test.js` — no `src/routes/+page.svelte`, no `data/*.json`, nothing under `05-deploy-and-docs` scope.

---

## Summary of what requires you (not a dev agent)

Per PRD §8, three items are genuinely outside any agent's access and are not represented as tasks above:

1. **Fill in the three empty link URLs** in `config/config.json` once implemented: `Reachouts sheet` (a private Google Sheet URL) and `My profile` (your personal LinkedIn profile URL) — no agent has access to these. `Strategy doc` is the third empty one and is the same situation. All three are left as `""` by Task 3 and validate cleanly as-is (an empty `url` string is explicitly valid per PRD §4.3/§4.4) — filling them in is a pure data edit to `config/config.json`, safe to do at any time after Task 3, no re-run of anything required.
2. **Confirm `timezone: "America/Los_Angeles"`** in `config/config.json` is still the correct zone for you — the PRD already sets this from BRAINSTORM.md; this is just a sanity check in case you're reading this from a different timezone than when BRAINSTORM.md was written.
3. No environment variables are required for SP1 itself (confirmed PRD §8 item 4) — `WORKER_API_KEY`/`WORKER_BASE_URL`/`WORKER_MODEL` belong to SP2 and are never read by anything in this task list.

Note on PRD §8 item 3 ("`npm install` needs to be run once ... before `npm test`/`npm run dev` work"): the PRD itself flags this as "not really 'manual,' but human-triggered." Since it's a plain, non-privileged shell command with no credential or approval step involved, it is handled as **Task 2** above rather than deferred here — no separate action is needed from you for it.

No PRD §9 item is `[OPEN]`. Q11 (config schema versioning beyond `version: 1`) is `[DEFERRED]`, not blocking — `validateConfig` intentionally hard-requires `version === 1` with no migration path, and that's by design until a real schema change is needed.

**Scope confirmation:** nothing in this PRD or task list depends on SP5 (deploy). The `svelte.config.js` in Task 1 omits `csrf.checkOrigin` entirely (SvelteKit's secure default), which is safe standalone and only becomes load-bearing once SP5 sets `ORIGIN` correctly in a deployed environment — irrelevant to running this app via `npm run dev` or `npm run preview` today.
