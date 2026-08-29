# Review — SP2 (02-api-and-diary-parse)

**Diff:** `main...feat/sp2-api-and-diary-parse`
**Personas:** Bug Hunter, Security, Architect, Test Coverage (dev-review, opus)
**Implementation:** 14 tasks, one commit per task, test-first; suite 275 → **289 tests green** after fixes.

## Verdict: PASS (after one fix loop)

Initial verdict was **BLOCK** (Bug Hunter + Security). All must-fix items were fixed on the
same branch and independently re-reviewed by both blocking personas — final **PASS**, no new
bugs introduced by the fixes.

## Must-fix findings — all CLOSED

1. **Import bundle path-traversal + partial write** (Security BLOCK; also Bug Hunter, Architect,
   Test Coverage). `src/routes/api/import/+server.js`: the outer week-map key from
   `Object.keys(body.weeks)` was never validated, so `{"weeks":{"../../evil":{…}}}` reached
   `copyFileSync`/`writeWeek` with a traversing path (read/overwrite any `.json` on disk), and
   `writeWeek` threw mid-loop *after* config + earlier weeks were already written → half-applied
   destructive import. **Fix:** validation pass now rejects `!isValidWeekKey(weekKey) || weekKey
   !== w.week` and returns 400 **before any** `mkdirSync`/`copyFileSync`/`writeWeek`. Re-verified:
   an invalid/traversing/mismatched key 400s with zero filesystem side effects (commit `a853718`).

2. **`structuralCheckWeek` too weak** (Bug Hunter, Test Coverage). Missing `version`/`start`/`end`
   checks let an imported week brick its file (every later `GET /api/week/[week]` 500s via
   `readWeek`'s `assertWeekShape`); count values weren't required numeric, so `counts:{invites:"6"}`
   survived and a later tap produced `"6"+1 = "61"`. **Fix:** shape check now requires
   `version:number`, `start`/`end:string`, all counts integers ≥ 0, all metrics number-or-null.
   Cross-checked against `emptyWeek`/`bumpCount`/`setMetric` so a real export round-trips cleanly
   (commit `a853718`).

3. **Lost-update race across the ~20s LLM `await`** (Bug Hunter BLOCK; Test Coverage).
   `POST /api/entry` and `…/reparse` did read → write → `await parseDiaryEntry` → mutate the
   **stale** snapshot → write. Two overlapping requests on the same week clobbered each other,
   permanently losing verbatim diary text (violates D8). **Fix:** after the await, re-read the week
   fresh, find the entry by id, mutate that fresh object, then write — no `await` in the
   re-read→mutate→write section, so it is atomic on Node's single-threaded loop. Fallback when the
   id is absent (concurrent delete) neither throws nor resurrects the entry. Verbatim-first write
   before the await is preserved. Overlapping-request test added (commits `0124e06`).

## Should-fix — CLOSED

- **`parse.js` abort didn't cover the body read** (Bug Hunter note): the 20s timer was cleared
  right after `fetch` resolved headers, so a stalled `res.json()` could hang past 20s. Timer now
  spans the body read; abort during the body → `timeout`. Tolerant fence-strip (trims surrounding
  whitespace) so a trailing newline after ` ``` ` no longer yields `invalid_json` (commit `d0de3e5`).
- **Non-object request bodies** (Bug Hunter/Test Coverage notes): `PATCH /api/week/[week]`,
  `POST/PATCH items` now return 400 on a `null`/primitive body instead of 500. Added the two
  missing coverage cases: items POST with a malformed link → 400; apply/discard on a `pending`
  entry with `proposed:null` → 409 (commit `1f92ac7`).

## Considered and declined (with rationale)

- **Architect: `POST /api/entry` should call `weeks.appendEntry` / `markEntryFailed`.** Declined —
  TASKS.md Task 3 *explicitly* mandates inline entry construction ("Do not call `weeks.appendEntry`
  for `POST /api/entry` … that route builds the entry object inline and pushes it directly")
  because SP2's entry schema adds `proposed`/`ignored`/`parseError` that SP1's `appendEntry` does
  not set. The direct `parseStatus`/`parseError` writes act on that same route-owned inline entry
  and also need to set `parseError`, which `markEntryFailed` doesn't. This is per the approved plan,
  not a boundary violation.

## Notes (non-blocking, recorded for SP3/SP4)

- `details` has two shapes across routes: `[{field,message}]` (config PUT) vs `string[]` (import).
  Both match the PRD literally (the PRD is internally inconsistent) — SP3/SP4 clients must branch.
- Concurrent-delete fallback in entry/reparse returns 200 with an entry not on disk (a client
  polling afterwards sees it vanish). Product decision, not a bug.
- `{"weeks": 5}` / `{"weeks": null}` yields `Object.entries → []` → 200 `{imported:{weeks:[]}}`
  rather than 400. No fs side effect; semantic nit.
- A config-load 500 embeds the absolute `CONFIG_PATH` in `error` (pre-existing, minor path
  disclosure).
- Imported `items`/`entries` element contents are untyped and flow to the UI — safe under Svelte's
  default escaping; revisit if SP3 ever renders them with `{@html}`.

## Next step

SP2 clear to land. Squash-merge `feat/sp2-api-and-diary-parse` into `main`; proceed to SP3.

## Changelog
- 2026-08-29 15:50 — Initial 4-persona review (BLOCK), fix loop (3 blockers + notes), and
  confirming re-review by Bug Hunter + Security (PASS). Synthesized by the orchestrator.
