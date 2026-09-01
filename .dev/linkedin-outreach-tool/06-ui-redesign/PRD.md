# PRD: SP6 — UI Redesign

**Sub-project:** SP6 (post-SP5 redesign; depends on SP1 + SP2 + SP3 + SP4)
**Repo:** `Q:\Repos\linkedin-outreach-tool`
**Date:** 2026-08-31
**Status:** Planning — design only, no implementation started

---

## 1. Problem

The app is working, deployed, and faithful to the original design, but the main screen now exposes too many separate mechanics at once: pinned links, five weekly metrics, two lanes of individually editable bars, diary input, a history strip, a calendar, a next-week preview, a week-4 card, and a row-by-row log. Each part is defensible in isolation. Together they make the tracker look like work.

That is the exact failure mode BRAINSTORM §1 says this product has to survive: **overwhelm → boredom → discouragement → abandonment**, with logging fatigue as the thing that kills trackers first. Risk R3 is particularly relevant: engagement versus mechanic count is an **inverted U**. More visual rewards, controls, history, and configuration do not produce more motivation after the useful midpoint; they predict novelty decay and burnout. The redesign therefore cannot be “the current screen, but more colorful.” It must reduce the number of visible decisions while making the few remaining actions easier to understand and more rewarding to complete.

The present item/counter split also no longer fits the desired interaction. A normal counter tap mutates only `counts`; a post can create an `items[]` row carrying `link:{url,label}|null`; and an approved diary parse contributes to `counts` through `entries[].applied`. The new `+` interaction asks for one or more freeform links/notes, one per increment, while `−` removes selected logged things. That needs an explicit ownership rule between `counts`, `items[]`, and diary entries. It cannot be left to UI code or the first implementation task to improvise.

SP6 redesigns the main page around one compact weekly loop:

1. See cumulative evidence that the work has happened.
2. See this week as five small, finite goals and one next action.
3. Add one or more concrete things through a single task popup, or use the diary as the low-friction bulk path.
4. Browse a quiet, read-only daily tally rather than an editable historical ledger.

It keeps every locked behavioral decision that still matters: Monday–Sunday ISO weeks, min/target quotas, diary preview before Apply, no daily streaks, no judgement on a bad week, D15’s “a link must never block a tap,” D24’s deterministic week-4 honesty check, and complete usability when the LLM is unavailable.

## 2. Goals

1. Replace the hand-written CSS-variable theme with Tailwind CSS v4 + DaisyUI v5, using a bright, colorful light/dark pair without turning the screen into an over-stimulating game surface.
2. Put all configured links and all import/export actions in two fixed-position header dropdowns that never reflow or shift the header; add a Keyboard sheet that owns the visual legend and Escape behavior.
3. Show five compact **all-time** totals, one per task, using a single reusable symbol/text/color vocabulary.
4. Put a compact “This week’s goals” summary immediately below totals, including the existing deterministic `selectNext` pointer and the exact cleared-week copy.
5. Redesign Outreach and Presence so each task is only a name plus one progress/control row: inline `−`, bar, `+`; one editor at the lane heading; one shared progress gradient; no per-task edit control.
6. Make every manual increment concrete: each filled `+` field creates one `items[]` row with freeform text and increments the matching count exactly once, atomically.
7. Make manual decrement equally concrete: `−` presents this week’s removable manual item rows, deletes the selected rows, and decrements the count by the same number in one atomic write.
8. Replace the main-page HistoryStrip and DiaryLog with a smaller activity calendar and a read-only per-day/range tally. Plain click selects one day; Shift-click selects a range; today is selected by default.
9. Keep DiaryBox as the diary/LLM input, including retro-logging into the entry’s own ISO week and Apply/Discard preview. The LLM remains optional plumbing, not a dependency for any manual path.
10. Make dark mode a first-class acceptance dimension: every new or changed state, popup, menu, form, chart mark, focus treatment, and destructive action is checked in both themes.

## 3. Non-Goals

- No metrics row on the main page. `followers`, `profile_views`, `impressions`, `replies`, and `calls_booked` stay in config, week files, diary parsing, APIs, exports/imports, the existing past-week route, and D24 computation; SP6 simply stops rendering `MetricsRow`/`Sparkline` on `/`.
- No change to the diary LLM prompt, provider, model, parse-result schema, Apply/Discard gate, or outbound-call count. There is still exactly one outbound integration, and the app remains fully usable when it is down.
- No new LLM call for daily tallies, summaries, next-task selection, colors, or copy. Those are deterministic local computations.
- No database, auth, multi-user behavior, deployment topology, PM2, gateway, base-path, or environment-variable changes.
- No LinkedIn API, scraping, browser automation, target-list synchronization, CRM, reminders, notifications, streaks, streak freezes, points, badges, levels, leaderboards, or daily quotas.
- No editable historical ledger on the main screen. The “What happened” area is read-only by design.
- No redesign of the underlying five metrics or D24 formula. Moving the small D24 line is presentation only.
- No forced migration that rewrites every historical week file. The additive item field is backward-compatible.
- No new charting, calendar, modal, icon, date, or animation library beyond Tailwind/DaisyUI.

## 4. Architecture Decisions

### 4.A File and component ownership

SP6 is a cross-cutting redesign over already-implemented SP1–SP4. The expected implementation footprint is:

```text
package.json / package-lock.json                add pinned Tailwind/DaisyUI packages
vite.config.js                                  add @tailwindcss/vite plugin
src/app.css                                     new Tailwind/DaisyUI entry + shared visual tokens
src/routes/+layout.svelte                       import app.css; DaisyUI theme persistence
src/routes/+page.server.js                      totals + initial calendar activity data; drop sparkline load
src/routes/+page.svelte                         exact SP6 order; repurpose SP4 mount points
src/lib/config.js                               task.linePct default/validation
src/lib/weeks.js                                additive item.note shape + batch add/remove primitives
src/routes/api/week/[week]/items/+server.js     batch POST + atomic bulk DELETE
src/routes/api/import/+server.js                validate additive item note shape
config/config.json                              seed linePct and the three supplied URLs
config/README.md                                document linePct and item-note-facing config behavior

src/lib/stores/weekStore.svelte.js              reactive config, totals, and dirty-week reconciliation
src/lib/utils/taskVisuals.js                     new canonical task symbol/text/color mapping
src/lib/utils/allTimeTotals.js                   new pure count aggregation helper
src/lib/utils/activityTally.js                   new pure day/range tally + timezone bucketing
src/lib/utils/popupStore.svelte.js               new one-popup/Escape controller

src/lib/components/AppHeader.svelte              new header menus + Keyboard trigger
src/lib/components/JsonListEditor.svelte         new links/lane JSON editor shell
src/lib/components/TotalsRow.svelte              new five all-time boxes
src/lib/components/WeekGoals.svelte              new compact weekly summary + D24 placement
src/lib/components/WeekLanes.svelte              redesigned lane shell + one edit symbol per lane
src/lib/components/TaskBar.svelte                redesigned gradient bar + inline controls
src/lib/components/ItemAddDialog.svelte          new dynamic freeform-text list
src/lib/components/ItemRemoveDialog.svelte       new checkbox removal list
src/lib/components/DiaryBox.svelte               DaisyUI restyle; behavior retained
src/lib/components/EntryPreview.svelte           DaisyUI restyle; behavior retained
src/lib/components/MonthCalendar.svelte          selection, heat, navigation; no next-week block
src/lib/components/WhatHappened.svelte           new read-only daily/range tally
src/lib/components/WeekFourCheck.svelte          smaller line treatment inside WeekGoals
src/lib/components/Confetti.svelte               theme/reduced-motion adaptation only
```

`PinnedLinks.svelte`, `MetricsRow.svelte`, `Sparkline.svelte`, `HistoryStrip.svelte`, and `DiaryLog.svelte` leave the main-page component tree. They do not have to be deleted in the same task if another route or tests still import them. `LogRow.svelte`, `LinkAttachForm.svelte`, and the `WeekSnapshot*` components remain available to `/week/[week]`; because the old global custom-property theme is removed, every still-rendered retained component must either be migrated to DaisyUI/Tailwind in SP6 or be given explicit Daisy semantic classes. SP6 must not leave a hidden dependency on the removed `--card-bg`/`--fg` theme.

### 4.B Tailwind v4, DaisyUI v5, and the theme contract

Use the registry versions locked by this redesign: `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, and `daisyui@5.7.22`. Tailwind is wired through the Vite plugin; DaisyUI is registered from the single global `src/app.css`. There is no Tailwind v3 config file and no second theme layer.

The selected built-in pairing is:

- **Light: `cupcake`** — calm light bases keep the page readable while its pink/teal accents provide the brighter, dopamine-friendly emphasis the current monochrome UI lacks.
- **Dark: `synthwave`** — a genuinely vivid dark surface with strong cyan/pink/purple separation, rather than a desaturated light theme inverted after the fact.

This pair is deliberate against the ADHD research: the broad surfaces remain controlled and mid-saturation, while task symbols, progress, selection, and primary actions get vivid accents. That is “controlled stimulation,” not five competing game systems. Color never carries meaning by itself: symbols have text, progress has numeric text and marks, selections have outlines/ARIA state, and destructive actions have labels.

DaisyUI’s built-ins are a starting palette, not an automatic accessibility waiver. Implementation must verify normal text at WCAG AA 4.5:1, large text and non-text controls at 3:1, visible focus rings, and the task-symbol colors against both base surfaces. If a built-in semantic color misses contrast in either theme, SP6 defines a narrowly-scoped theme override for that role; it does not switch themes ad hoc per component.

The current persistence behavior stays intact: localStorage key `theme`, values `dark`/`light`, default dark. The layout maps `dark` to `document.documentElement.dataset.theme = 'synthwave'` and `light` to `cupcake`. The toggle updates the same key synchronously. The initial theme is established before or at hydration so the page does not flash the other theme.

Dark mode is not a follow-up polish pass. Every acceptance/manual case in §7 is run once in `cupcake` and once in `synthwave`, including disabled controls, JSON parse errors, empty states, calendar range selection, import feedback, and the destructive Remove action.

### 4.C One visual vocabulary and one progress gradient

The five task identities are defined once in `taskVisuals.js`, keyed by the stable config ids. The main-page short labels are intentionally shorter than config labels:

| Task id | Symbol | Short text | Color role |
|---|---:|---|---|
| `post` | `✦` | Posts | rose/secondary |
| `comments` | `◆` | Comments | violet/accent |
| `invites` | `➜` | Requests | cyan/info |
| `dms` | `◇` | DMs | blue/primary |
| `call_ask` | `◎` | Calls | amber/call |

The mapping is reused in all-time totals, This week’s goals, lane task names, What happened tallies, and the Keyboard legend. Unknown future task ids fall back to `•`, the config label, and neutral base text rather than crashing. The five specified boxes remain tied to the five current ids.

All task bars use one gradient family, sampled from the active Daisy theme:

- **0% / low:** cool cyan/blue — activity has started.
- **`linePct` / guide:** vivid violet/pink — the configured guide line has been reached.
- **100% / target:** celebratory warm coral/gold — the configured target is reached.

The task’s progress coordinate is `clamp(count / target * 100, 0, 100)`; a zero target is treated as 100% when count is at least zero, consistent with an already-cleared zero target. The gradient’s color stops are shared; only the position of the middle stop varies through `linePct`. The fill is rendered as a full-track gradient clipped to the current progress width, so 20% reveals only the cool portion, crossing the line reveals the goal color, and 100% reveals the celebratory end. The gradient must not be compressed into whatever width is currently filled, because that would show the celebration color at the first increment.

Completion never greys the bar. The fill continues to intensify through 100%; beyond target, it remains at the 100% color and width. A visible guide line sits at `linePct`, and a second visible line sits at the 100% end. Both remain legible in both themes and under color-vision deficiency because they differ structurally (internal line versus terminal line), not only by hue.

The calendar heat scale samples the same low → guide → celebration family. It does not invent a second red/green performance palette.

### 4.D Header, fixed dropdown geometry, and popup control

The header order is exactly: **brand · Links · Data · Keyboard · theme toggle**. On small screens the action group may horizontally scroll or compact labels, but it does not wrap into an unstable second line.

Both Links and Data are true in-place dropdowns. Each trigger sits in a `position:relative` anchor; the menu is `position:absolute`/DaisyUI `dropdown-content`, opening below the trigger in an overlay layer. Opening either menu changes no parent dimensions and therefore cannot move Data to the right or reflow the header. Only one header dropdown may be open at a time. Outside click and Escape close it.

**Links menu.** It contains every configured link in config order, rendered only as an external anchor when the URL passes the existing http/https guard. Its final item is always **Edit**. The implementation updates `config/config.json` with all five concrete entries:

| Name | URL |
|---|---|
| Reachouts sheet | `https://docs.google.com/spreadsheets/d/17JejcB89EF5M2NI6u1KIlRKjcr9rKuyWgdjO2-BmKW8/edit?usp=drive_link` |
| LinkedIn notifications | `https://www.linkedin.com/notifications/` |
| Creator analytics | `https://www.linkedin.com/analytics/creator/` |
| My profile | `https://www.linkedin.com/in/tejitpabari/` |
| Strategy doc | `https://docs.google.com/document/d/1ALHlIqaLXDJA_um3Egi8odU-lxZFAa4tNbZ2RqJC7Kg/edit?usp=drive_link` |

Edit opens a dialog containing one JSON textarea. The user-facing shape is exactly an array of `{ "name": string, "link": string }`; order in the array is display order, and adding/removing/reordering rows means editing that array directly. The internal config contract remains `{label,url}` to avoid a needless SP1 migration: open maps `label→name` and `url→link`; Save parses and validates the user shape, maps it back, GETs the latest config, replaces only `links`, and PUTs the full object to `/api/config`. Discard, backdrop close, or Escape drops the draft without a request. An invalid JSON/value/URL keeps the dialog open and names the failing array index. Empty URLs remain allowed by the existing config contract and render as inert menu text.

**Data menu.** The regular dropdown contains Export this week (`GET /api/export?week=...`), Export everything (`GET /api/export/all`), and Import (file picker → existing `POST /api/import`). There is no side panel and no trigger movement. Import success calls `invalidateAll()` so totals, config, current week, and calendar truth are rebuilt from disk; failure stays in the dropdown as a readable message and never alters client state.

**Keyboard button.** This opens a DaisyUI modal styled as a compact keyboard-shortcuts sheet. It contains:

1. The five symbol → meaning → color rows from §4.C.
2. `Escape` rendered as a `<kbd>` key with the meaning “discard / close any popup.”

`popupStore.svelte.js` provides one active-popup controller to both header and page descendants. Opening a popup registers an id and a discard callback; opening another first discards/closes the active one. One global Escape listener invokes that callback and clears the popup. This applies to Links/Data dropdowns, links editor, lane editor, `+`, `−`, and Keyboard. Unsaved popup text is never placed in localStorage, the week store, or an API payload before Save.

### 4.E All-time totals and This week’s goals

`+page.server.js` computes `allTimeTotals` by enumerating every key from `listWeekKeys()`, reading/projecting each valid week, and summing `week.counts[task.id] ?? 0` for the five current task ids. It sums **counts**, not entries plus items, because `counts` is the rendered source of truth and summing all three would double-count manual items and approved diary contributions.

The read is intentionally all-time and therefore not capped at 52 weeks. Its cost is nevertheless naturally bounded by the data model: at most one small JSON file per ISO week, about 52 additional reads per year, for one user on local disk. No cache or aggregate file is added pre-emptively. A single unreadable week is omitted using the home page’s existing per-week isolation and recorded as an incomplete-total flag/server warning rather than crashing the whole page; valid data produces exact totals.

`TotalsRow.svelte` renders five small boxes in the fixed product order Posts, Comments, Requests, DMs, Calls. Each box is `{symbol} {short text} {all-time count}`. It has no comparison, target, trend arrow, celebration, or “best” language. The symbol and text make each box understandable without color, and the Keyboard sheet repeats the legend.

Directly below totals, `WeekGoals.svelte` renders **This week’s goals** for the current Monday–Sunday ISO week. Each of the five compact entries contains the shared symbol/short label and `count / min–target` (or `count / target` when min equals target). A quiet range line confirms Monday–Sunday dates. It calls the existing pure `selectNextTask(config, counts)`; if a task remains below min, exactly one line reads `Next: {symbol} {short label} · {N} to the minimum`. Once every min is cleared, that line is replaced by the existing copy verbatim: **“This week is done. Anything from here is extra.”** No copy names days remaining, compares to a prior week, or describes the week as good/bad.

D24’s `WeekFourCheck` moves into this block, immediately below the next/done line, as one dismissible small-text row. This is the right location because it is a periodic truth about whether weekly effort is producing replies/calls, while the calendar is now only a date browser. It remains visually distinct, deterministic, unchanged in formula/copy, and small enough not to become a third headline. It is not merged into the calendar/history interaction.

All-time totals are held reactively in the page store after load. Successful item adds/removals and diary Applies adjust them by the server-confirmed count delta; import invalidates and recomputes from disk. No optimistic total survives a failed request.

### 4.F Lane editor and task bars

Outreach and Presence remain separate sections in config order. Each section heading contains exactly one edit symbol. There is no edit control inside a task box.

The section editor is a JSON-list dialog scoped to that lane. Its user-facing array contains one row per task in lane order:

```json
[
  { "task": "invites", "min": 10, "target": 15, "linePct": 75 }
]
```

`task` is the stable id and is read-only in meaning: Save rejects missing, duplicate, unknown, cross-lane, added, or removed ids. The editor is for the three numeric controls, not for silently restructuring the product. `min` and `target` are non-negative integers with `min <= target`; `linePct` is an integer from 1 through 100. Save GETs the latest config, replaces only those three fields on that lane’s tasks, PUTs the complete config, and replaces the reactive config only after a successful response. Discard/Escape causes no write.

Each task box contains only:

1. A name using the shared symbol + short label.
2. One control row: `−` · progress bar · `+`.

The numeric state (`count / min–target`) is rendered inside or immediately over the bar, not as a second metadata row. The bar’s accessible name states task, count, min, target, and guide line. `−` and `+` retain at least 40×40 CSS-pixel touch targets. `−` is disabled whenever count is zero. If count is positive but there are no removable manual items, it can still open the removal dialog’s truthful empty state (§4.H); it does not silently decrement a diary contribution.

The two visible bar lines are at `linePct` and 100%. `linePct` defaults to 75 for existing/missing config values but is independent of `min`: it is a visual “getting warmer” guide, while min/target remain the actual weekly quota contract. This distinction is named in the editor help and is the principal human sanity-check in §9.

Monday–Sunday behavior does not change. `currentWeekKey(config.timezone)`, `weekKeyToRange`, retro-entry routing, and files named by ISO week remain the source of truth.

### 4.G `+` flow and the resolved item data model

Clicking a task’s `+` opens `ItemAddDialog` for that task and the current ISO week. It starts with one empty text input and no separate label field. As soon as the last input contains non-whitespace text, one new empty input appears below it. Clearing a middle value does not destroy later values; Save filters the list to non-empty trimmed strings while preserving their order. Save is disabled until at least one field is filled. A field is freeform: a LinkedIn/Google Docs URL, a person’s name, “comment on Priya’s post,” or any other plain note are all valid.

Save performs one atomic request for all filled values. If there are `N` values, the server creates `N` item rows and increments the task’s count by exactly `N` in the same read-modify-write. A partial write is not allowed. The client closes only on success, replaces the current week from the response, increments all-time totals by `N`, marks the week dirty for calendar/tally refresh, and clears the draft. On failure it keeps the dialog and draft open with a neutral retry message. Discard/Escape makes no request and stores nothing.

The canonical additive item shape becomes:

```json
{
  "id": "uuid",
  "taskId": "comments",
  "at": "2026-09-01T05:10:00.000Z",
  "note": "https://www.linkedin.com/posts/...",
  "link": null
}
```

`note` is the new freeform text for one manual increment. New SP6 rows require a non-empty trimmed string (recommended maximum 4,000 characters); the batch is capped at 50 rows as a validation/safety bound, not a user-facing gamification mechanic. `link` remains optional/nullable for backward compatibility with existing SP4 rows and the current item PATCH route. Historical rows without `note` remain valid; they are not rewritten.

Rendering rule:

- If `note` itself passes the existing strict `isAllowedUrl` http/https guard, render it as an external link with `target="_blank"` and `rel="noopener noreferrer"`.
- Otherwise render it as escaped plain text with preserved wrapping. Svelte text interpolation, never `{@html}`, is mandatory.
- If `note` is absent, fall back to a safe existing `item.link` label/URL.
- A dangerous or malformed string is still safe to preserve as plain text; it is never promoted to `href`.

This satisfies D15 without special-casing `post`: `link:"required"` remains a configuration nudge/meaning, never a server gate. A plain note is enough to log a post, and an absent formal URL can never block the action. The old dedicated URL+label capture is not part of the new plus flow.

The diary path remains parallel and unchanged: approved `entries[].applied.counts` increment week counts without creating item rows. The LLM is not asked to fabricate one item per parsed increment and no text is split heuristically into item notes.

### 4.H `−` flow and count/item reconciliation

Clicking `−` opens `ItemRemoveDialog` for that task and current week. It lists current-week manual `items[]` whose `taskId` matches, oldest/newest order chosen consistently (recommended newest first), one checkbox per row. The row shows the safe note/link fallback and local date/time; it is not editable. Multiple rows may be selected. Actions are **Remove** and **Discard**. Remove is disabled until a row is selected.

The deletion API is atomic bulk deletion on the existing collection route:

```text
DELETE /api/week/[week]/items
body: { "taskId": "comments", "itemIds": ["uuid-1", "uuid-2"] }
200: { "removedIds": [...], "week": <updated projected week> }
```

The server validates a real week key, known task id, a non-empty unique id list, existence of every id, and that every selected item belongs to the submitted task. It then removes all selected rows and decrements `counts[taskId]` by exactly the number removed in the same write. If any id is stale/mismatched, or the stored count is less than the selected item count, it returns an error and changes nothing. No client sequence of N independent deletes is allowed; that would create avoidable lost-update/partial-delete states.

The reconciliation rule is explicit:

- `items[]` rows represent **manual itemized increments**.
- `entries[].applied.counts` represent **diary-applied increments** and remain owned by the diary record.
- Legacy pure count deltas and imports may contribute counts with no item row.
- Minus removes only selected manual item rows. It never edits, reverses, or synthesizes a diary entry.
- Therefore, if `count = 9` and this task has 3 item rows, the unitemized residual is 6. Removing 2 items produces `count = 7`, 1 item row, and the same residual 6.
- If count is positive but item count is zero, the modal says **“No manually logged items to remove. Diary and older count-only activity stays with its record.”** Remove stays disabled. The button does not pretend an anonymous decrement has provenance it does not have.

This preserves the audit boundary and resolves SP4 Q6 rather than silently orphaning rows. Count corrections for diary-originated history are deliberately not invented in SP6; the diary preview is still the prevention gate, and disk/API correction remains available outside this focused main-screen flow.

### 4.I Calendar selection and “What happened”

`MonthCalendar` becomes slightly smaller: reduced cell minimum height/padding, no HistoryStrip above it, no next-week preview below it, and no “Load earlier” anywhere on the main page. Each day is a real button. Days with structured activity use four stable heat levels sampled from the shared progress family (recommended absolute buckets: 1, 2–4, 5–9, 10+ contributions); zero days remain the base surface. An `aria-label` states date and total activity, so heat is never the only information.

Selection behavior is deterministic:

- Default on first load: today only.
- Plain click: set both range endpoints to that day.
- Shift-click: preserve the prior anchor and set the second endpoint; normalize display to earlier→later even if the second click is earlier.
- A subsequent plain click starts a new single-day selection.
- Previous/next month navigation does not clear the anchor or selection.
- Shift-click after navigating to another month may create a cross-month range. The calendar fetches/caches every overlapping ISO week required for the selected range through existing `GET /api/week/[week]` calls.
- Selected endpoints and in-range days receive a clear structural highlight (filled/ringed endpoints plus an inset range background), distinct from today’s marker and activity heat. `aria-pressed`/range labels mirror it.

`activityTally.js` derives day rows from structured sources only:

1. For each `entry` with `parseStatus:'ok'`, add `entry.applied.counts[taskId]` to `entry.date`.
2. For each manual `item`, add one to its `taskId` on the local calendar date of `item.at` in `config.timezone`.
3. Do not add aggregate `week.counts` again; those already contain both sources.
4. Exclude pending, failed, and discarded diary proposals, raw diary text, metrics, and legacy count-only deltas that have no attributable date.
5. Preserve post item notes/legacy links alongside that day’s `post` tally. Do not infer a post link from an entire diary paragraph.

The local timezone conversion for `item.at` is mandatory; slicing the UTC timestamp is incorrect around Pacific evening/midnight boundaries. `entry.date` is already the explicit local date and is used directly. Because diary entries never create items, the two included sources do not double-count each other.

`WhatHappened.svelte`, directly below the calendar, is read-only and compact. For one day it shows one row such as `✦ 3 posts · ◆ 5 comments · ➜ 10 requests`; for a range it shows **every calendar day** in ascending order, including neutral `Nothing recorded` rows for zero days. It uses task order, symbols, labels, and colors from `taskVisuals.js`. Post notes/links for that day are combined below the tally as small wrapped chips/text, de-duplicated only by item id (identical text from two genuine items is still two logged things). There are no row edit controls, parse-status labels, Apply buttons, delete buttons, raw diary paragraphs, or pagination.

The initial current-month week slices are supplied by `+page.server.js` so today’s tally is present on first paint. Month navigation and a cross-month range reuse `GET /api/week/[week]`; no new calendar API is added. The component caches fetched weeks by key and listens to `weekStore.historyVersion/lastDirtyWeek` so a successful plus, minus, or diary Apply refreshes the affected week and re-derives heat/tallies without a full reload.

### 4.J Exact page order and SP4 mount-point repurposing

The main route renders exactly this order:

1. Header — brand · Links · Data · Keyboard · theme toggle.
2. Five all-time totals.
3. This week’s goals, the one next/done line, then the small D24 line when due.
4. Outreach — one lane edit symbol; task bars with inline `−`/`+`.
5. Presence — same.
6. DiaryBox — logging input + existing parse preview.
7. Smaller activity calendar.
8. What happened — selected day/range read-only tally.

SP4’s old mount points are explicitly repurposed rather than appended to:

- `data-slot="history-calendar"` becomes the calendar-only slot (or is renamed `activity-calendar`); `HistoryStrip` and its weeks-completed count are removed.
- `data-slot="diary-log"` becomes `what-happened`; `DiaryLog`, `LogRow` rows, and “Load earlier” are removed from `/`.
- `WeekFourCheck` moves upward into the goals block, remaining distinct from both calendar and totals.

The current next-week preview is removed from the main page. The weekly goals already state the active Monday–Sunday contract; a second quota list under the calendar is duplicated mechanics and works against R3.

### 4.K State, failure, accessibility, and security boundaries

`weekStore.svelte.js` is extended so `config` and `allTimeTotals` are reactive replaceable state, not an immutable object with ad hoc nested mutation. It continues to own the projected current week and dirty-week signal. Server responses win after every mutation.

Manual item add/remove never uses the existing debounced count PATCH path. Each is one server transaction returning the updated week. Diary Apply continues to use its existing route and entry-owned week key; retro-logging a prior week must not mutate the current week bars, but it does adjust the relevant all-time task totals after a confirmed first Apply and marks that prior week dirty for the calendar cache.

Popup focus is trapped while a modal is open; opening focuses the first meaningful field, closing returns focus to the trigger, and all controls are keyboard reachable. Escape always means discard/close and is shown in the Keyboard legend. The destructive action is literally named Remove and has a text label; it is not represented by color/icon alone.

Every URL sink repeats defense in depth. Config URLs and legacy `item.link` URLs must pass `isAllowedUrl`; freeform `item.note` is only an anchor when it passes the same guard. `javascript:`, `data:`, protocol-relative, backslash-obfuscated, control-character, and malformed values render as text or are rejected at config validation. No `{@html}` is introduced.

The LLM-down behavior remains unchanged: DiaryBox saves verbatim text and offers manual paths when parsing fails; all headers, totals, goals, item add/remove, calendar, imports/exports, theme, and configuration editors work without the LLM.

## 5. Data/Schema/API Change Summary

### 5.1 Config contract — SP1 touch

Each task gains `linePct`:

```json
{ "id": "invites", "lane": "outreach", "label": "Targeted connection requests", "min": 10, "target": 15, "linePct": 75, "link": "optional" }
```

`validateConfig` accepts omission for backward compatibility and normalizes it to default `75`; when present it must be an integer in `[1,100]`. `writeConfig` persists normalized output, so the next successful config Save makes the default explicit. Existing `min`, `target`, lane/id, and link validation remains. Importing an older bundle with no `linePct` continues to work and receives the default. `config/config.json` is updated in implementation with `linePct:75` for all five tasks and the three supplied URLs; the two existing LinkedIn links remain.

This changes SP1’s config contract and requires config unit tests plus `config/README.md` updates.

### 5.2 Week item contract — SP1 touch

`items[]` gains optional `note:string`. New SP6 manual rows require a trimmed non-empty note up to 4,000 characters; historical/imported rows may omit `note` and retain `link`. Week `version` stays `1` because the change is additive and readers remain backward-compatible.

`weeks.js` gains pure/transaction-friendly helpers equivalent to:

- append N validated notes as N distinct item rows in input order;
- remove a validated set of matching task item ids;
- preserve all untouched entries/items/metrics/counts;
- enforce the one-item/one-count delta invariant for those operations.

`readWeek` continues to default absent `items` to `[]` and preserve unknown/orphan task rows. Any deeper item validator must allow the legacy `{link}` shape. This changes SP1’s week contract.

### 5.3 Import and export — SP2 touch

`POST /api/import` validates `item.note` when present (string, trimmed non-empty, ≤4,000), and continues validating `item.link` through `isAllowedUrl`. It also verifies enough item structure to prevent unusable new rows (`id`, `taskId`, `at` strings) without rejecting historical orphan task ids. Bundle config normalization supplies missing `linePct:75` before writing.

Export endpoints need no code-shape change: they serialize the additive fields naturally. A round trip must preserve notes exactly.

### 5.4 Item API — SP2 touch

| Method | Path | SP6 request | Behavior |
|---|---|---|---|
| POST | `/api/week/[week]/items` | `{taskId, notes:[string...]}` | Validate 1–50 non-empty notes; append all items; add `notes.length` to count; one write; return `{items, week}`. |
| DELETE | `/api/week/[week]/items` | `{taskId, itemIds:[string...]}` | Validate unique ids and ownership; remove all; subtract the same number; one write; return `{removedIds, week}`. |
| PATCH | `/api/week/[week]/items/[id]` | existing `{link}` | Retained for backward compatibility/past-week UI; not used by SP6’s main plus flow. |
| PATCH | `/api/week/[week]` | existing counts/metrics | Retained for diary/legacy/past-week behavior; not used to complete a plus/minus item transaction. |

The existing single-item POST payload may remain accepted temporarily for backward compatibility, but the redesigned main page uses only the batch `notes` form. The route must never enforce `task.link === 'required'` at creation; D15 still wins.

### 5.5 All-time totals — server load, no endpoint

`+page.server.js` returns `allTimeTotals: Record<taskId,number>` from all readable files returned by `listWeekKeys()/readWeek()`. No `/api/totals` endpoint or aggregate data file is added. Cost is linear in existing weekly files and naturally bounded to one file per ISO week. Totals use projected current task ids and sum `counts` only.

### 5.6 Per-day/range tally — existing week GETs, no endpoint

The initial page payload includes the minimal current-month week slices needed by `activityTally` (`week`, `entries`, `items`), not fake count-only calendar placeholders. Later months/ranges reuse `GET /api/week/[week]`. The client derives approved diary contributions and manual item contributions deterministically. No new tally endpoint and no LLM summary are added.

This replaces the current `calendarMonth` server shape if necessary; `calendarMonth.js` can be adapted or superseded by `activityTally.js`. Existing `/api/weeks` may remain for other consumers, but the main page no longer calls it because DiaryLog pagination is removed.

## 6. Frontend Change Summary

### 6.1 Component tree

```text
+layout.svelte
└─ +page.svelte
   ├─ AppHeader
   │  ├─ Links dropdown → JsonListEditor
   │  ├─ Data dropdown
   │  └─ Keyboard modal
   ├─ TotalsRow
   ├─ WeekGoals
   │  └─ WeekFourCheck (when due)
   ├─ WeekLanes
   │  ├─ Outreach heading → JsonListEditor
   │  ├─ TaskBar × 3 → ItemAddDialog / ItemRemoveDialog
   │  ├─ Presence heading → JsonListEditor
   │  └─ TaskBar × 2 → ItemAddDialog / ItemRemoveDialog
   ├─ DiaryBox
   │  └─ EntryPreview
   ├─ MonthCalendar
   └─ WhatHappened
```

One popup controller spans the tree; dialogs are not independently allowed to stack.

### 6.2 Responsive layout

- Header actions remain one stable row. At narrow widths, the brand may shorten visually and the action group may scroll; dropdown panels are viewport-clamped and never cause document-width overflow.
- Totals are five across when space permits, then a compact 3+2 or horizontally scrollable row; they do not become five large cards stacked vertically.
- Goals remain a dense wrapping row/list rather than five dashboard cards.
- Lanes are one column on small screens, Outreach then Presence; task control rows never wrap `−`, bar, and `+` out of order.
- Popup panels use `max-height` plus internal scrolling and safe mobile viewport units; footer actions remain visible.
- Calendar remains a seven-column grid, but cell padding/type shrink at the existing phone breakpoint. What happened is always one column.

### 6.3 Copy constraints

Allowed core copy is factual and short: “This week’s goals,” “Next,” “N to the minimum,” the existing done sentence, “Nothing recorded,” “No manually logged items to remove,” “Save,” “Discard,” and “Remove.”

The main page never uses “streak,” “missed,” “behind,” “failed week,” “catch up,” “you should,” a days-left countdown, or an encouragement exclamation mark. Empty/partial days and weeks are not colored red. The calendar reports activity, not adherence.

### 6.4 ADHD-supportive additions — intentionally small

Risk R3’s inverted-U is a release constraint: SP6 may add at most these three low-mechanic supports, and only the first is core.

1. **Core — getting-warmer gradient.** The shared low→guide→target color progression makes an increment intrinsically legible without points, badges, or a separate reward system.
2. **Optional — “N to the minimum.”** One factual distance appears only on the single `selectNext` task. It is not repeated on every task and disappears at the minimum. Defer if it makes the goals block feel busier in visual testing.
3. **Core accessibility / optional animation — reduced motion.** Under `prefers-reduced-motion`, remove progress easing, popup motion, and confetti movement (or replace confetti with a static color change). This reduces sensory cost without adding a mechanic.

No further ADHD mechanics are authorized by this PRD. In particular: no streaks, badges, points, achievements, random rewards, reminders, or notifications. If the redesign still feels busy, the next action is subtraction, not another dopamine device.

## 7. Testing

### 7.1 Pure/data tests

**Config:**
- Missing `linePct` normalizes to 75; 1 and 100 pass; 0, 101, fractions, strings, and null fail with the exact task field.
- PUT/import of an old config succeeds and persists normalized values.
- Link editor mapping round-trips `{name,link}` to `{label,url}` without changing any non-link config field or order.

**Items and APIs:**
- Batch POST with N notes creates N unique rows, preserves note order/text after trim, increments count by N, and performs no partial write if one note is invalid.
- Plain text, valid http, valid https, malformed URL, `javascript:`, `data:`, protocol-relative, backslash-obfuscated, and control-character notes are stored as text but only safe http/https values qualify as links.
- Bulk DELETE rejects duplicate, missing, cross-task, and stale ids without a write.
- Valid DELETE removes exactly selected rows and decrements count by exactly that number while preserving the unitemized residual.
- `count > itemCount` and `count === itemCount` cases are explicit; `count < selectedCount` rejects rather than clamping silently.
- Legacy item rows with no `note` and safe/null `link` continue to read, import, export, and render.
- Import/export round trip preserves `note`; invalid note types/lengths fail before backups/writes begin.

**Totals:**
- Sum across empty, manual-item, diary-applied, mixed, and orphan-task weeks uses only `counts` once.
- More than 52 week files are all included.
- A missing data directory yields five zeros.
- One unreadable week does not crash the home page and marks totals incomplete.

**Activity tally:**
- Only `parseStatus:'ok'` + `applied.counts` diary entries contribute; pending/discarded/failed/proposed-only entries do not.
- Manual items contribute exactly one each; aggregate counts are not added again.
- A mixed day with diary + manual activity does not double-count.
- An item timestamp near UTC/Pacific midnight lands on the configured local date.
- Single-day and reversed/cross-month ranges normalize and produce every day ascending, including zero days.
- Post notes/links stay with the correct day; unsafe URL-like notes stay plain text.

**Progress:**
- `count/target` clamps to 0–100; target zero does not divide by zero.
- The middle stop uses each task’s `linePct`; the low/guide/complete colors are otherwise identical across all bars.
- Completion never selects a grey fill class.

### 7.2 Component/API integration tests where the existing stack supports them

- Only one popup can be active; Escape calls that popup’s discard path and returns focus.
- ItemAddDialog starts with one input, adds one trailing empty input after typing, ignores empty rows, and sends one ordered batch.
- Discard/Escape sends no request and leaves no localStorage/session state.
- ItemRemoveDialog lists only matching current-week items, supports multi-select, and shows the residual empty state without anonymous decrement.
- Successful add/remove replaces server week truth, updates totals once, and marks the right week dirty.
- Diary Apply adjusts totals once; a repeated/already-applied response does not adjust again; retro Apply targets the entry’s own week.
- Links/Data menus are overlay-positioned; toggling them does not change trigger/header bounding boxes.
- Import success invalidates; import failure does not replace config/week/totals.

No new component-test framework is introduced solely for SP6. If the existing Vitest setup cannot render Svelte components, keep state/transform logic pure and cover visual interaction in the manual pass.

### 7.3 Manual smoke pass

1. In both `cupcake` and `synthwave`, inspect every normal, hover, focus, disabled, loading, empty, error, selected, and destructive state; verify WCAG contrast and visible keyboard focus.
2. Reload after both theme choices; confirm the same localStorage behavior and no opposite-theme flash.
3. Open Links, then Data, then Keyboard; confirm each opens under its trigger without moving any header button. Press Escape for each.
4. Edit links with valid reordered JSON, Save, reload, and confirm order/URLs. Repeat with malformed JSON/unsafe URL, then Escape; confirm config is untouched.
5. Edit each lane’s min/target/linePct; confirm only that lane’s numeric fields change and every task bar keeps the shared gradient family.
6. Add one plain note, one safe URL, and three notes in one Save. Confirm one row per filled field, count/total changes by N exactly once, and a new trailing blank was never stored.
7. Type unsaved plus input and press Escape; inspect week file/network log and confirm nothing was written.
8. Remove two selected manual items while diary-originated count also exists; confirm only those rows disappear and the diary residual remains. Confirm count-positive/item-zero shows the explicit empty state.
9. Unset the LLM key/restart as in the existing degraded-mode test: confirm all SP6 manual flows still work and DiaryBox still saves verbatim failed-parse text.
10. Back-date a diary entry across an ISO-week boundary, Apply it, and confirm current bars do not change, all-time totals do, and the historical calendar day/tally refreshes.
11. Confirm default calendar selection is today; plain-click a day; navigate months; Shift-click a second day; verify a highlighted normalized range and every day’s ascending tally.
12. Verify calendar heat, today marker, range body, and endpoints remain visually distinct in both themes and without relying on hue alone.
13. Confirm HistoryStrip, weeks-completed copy, next-week preview, DiaryLog rows, and Load earlier are absent from `/`; confirm D24 remains as a small distinct line near goals when due.
14. Resize to phone width and use touch/keyboard: no horizontal document overflow, ≥40px `+`/`−` targets, stable header, scrollable dialogs, and readable seven-column calendar.
15. Enable reduced motion: confirm progress/popup motion is removed and confetti is static or absent without changing completion state.
16. Run the existing full Vitest suite and production build on Node 22; no diary/API/import/export/past-week regression is accepted.

## 8. Manual Intervention Required From You

No manual intervention is required to author or implement the PRD. The supplied link URLs are non-secret product config and should be committed in `config/config.json` during implementation. The two semantic choices called out as `[OPEN]` in §9 should receive a quick human sanity-check before `dev-tasks`; both have concrete recommendations and do not block task generation if accepted as written.

## 9. Open Questions & Decisions

| # | Item | Status |
|---|---|---|
| Q1 | Light/dark theme pair | `[RESOLVED]` — use DaisyUI `cupcake` + `synthwave`, retain localStorage `theme=light|dark`, default dark, and test every surface in both. This gives controlled light surfaces plus vivid accents and a genuinely designed dark mode. |
| Q2 | What does configurable `linePct` mean relative to `min`? | `[RESOLVED — independent visual guide, default 75]` — confirmed by the project owner: `linePct` is a separately-editable percentage line (1–100) that only positions the gradient’s “getting warmer” guide; progress still maps count/target to 0–100 and `min` remains the quota-cleared threshold shown in goals. Matches the user’s own description ("a value between 1-100 for the 75% line… this will be a %"). |
| Q3 | Does “only parsed things” exclude manual plus items from What happened? | `[RESOLVED — structured/normalized activity, including both approved diary counts and manual items]` — confirmed by the project owner: the daily/range tally shows all logged activity (approved `parseStatus:'ok'` diary contributions plus manual `+` items and their post notes/links), while excluding raw diary text and unapplied statuses. Matches the user’s own request that "Post links and all should be combined" in the range view. |
| Q4 | Item migration strategy | `[RESOLVED]` — additive optional `note`; preserve legacy nullable `link`; no week-version bump and no history rewrite. New SP6 item creation always writes `note`. |
| Q5 | Batch item API versus N single POST/DELETE calls | `[RESOLVED]` — one batch POST and one atomic collection DELETE. Count and rows change in the same disk write; partial multi-select outcomes are not acceptable. |
| Q6 | What minus does when count exceeds item count | `[RESOLVED]` — remove only selected manual rows and subtract the same number; preserve diary/legacy residual exactly. Never synthesize anonymous rows or reverse diary entries. |
| Q7 | All-time totals cost | `[RESOLVED]` — read all week files because “all-time” cannot be truthfully capped. One small file/week is a naturally bounded single-user cost; defer caching until measurement shows a problem. |
| Q8 | Links editor shape versus existing config shape | `[RESOLVED]` — present `{name,link}` exactly as requested and map at the UI boundary to SP1’s `{label,url}`. Avoid a broad config rename unrelated to user value. |
| Q9 | D24 placement | `[RESOLVED]` — one small row directly below This week’s goals. It stays distinct from the calendar and keeps its existing deterministic, non-editorial copy/dismissal behavior. |
| Q10 | Current config’s `post` target differs from the original D5 example | `[RESOLVED]` — SP6 consumes and edits the live config value; it does not reset quotas while adding `linePct`/URLs. The redesign is not a quota migration. |

## 10. Iteration 1 — Feedback amendments (2026-09-01)

Project-owner feedback after reviewing the `feat/ui-redesign` branch. These amend the sections noted;
where they conflict with the original text, these win.

### 10.1 Calmer theme (amends §4.B, §4.C)
The cupcake/synthwave pair is **too bright/neon** (hot pink, high saturation) — over-stimulating, which is
the opposite of the ADHD goal. Repick to a **calm, muted, low-stimulation** pair:
- **Light: `nord`** — muted arctic blues/teals/greys, gentle contrast, subtle (not loud) accents.
- **Dark: `dim`** — dusty, soft, low-contrast dark; calm rather than vivid.
- Theme toggle mapping becomes `light → nord`, `dark → dim` (localStorage `theme` + `data-theme`
  unchanged; default dark = `dim`). Update `app.html` bootstrap + AppHeader toggle accordingly.
- The **progress gradient** (§4.C) is re-toned to gentle neighboring hues — soft teal/blue (0) →
  muted lavender/indigo (line) → muted amber/gold (100). **No hot pink, no neon.** Sample from the calm
  theme's own muted tokens.
- **Task symbol colors** (§4.C / taskVisuals) use the calm theme's muted semantic colors, not saturated
  accents. (Alternatives the owner may request instead: `winter`/`night`, or warm `caramellatte`/`coffee`.)

### 10.2 Prominence (amends §4.E, §6.2)
- The **five all-time totals** ("main goals") are the **most prominent** element: bigger boxes, larger
  symbol + number, more visual weight — the clear top-of-page anchor.
- **"This week's goals"** is rendered **slightly bigger** than before (larger type/spacing), secondary to
  the totals but still prominent.

### 10.3 Calendar Today button (amends §4.I)
Add a **Today** button to the calendar that returns the view to the current month and resets the selection
to today (the default single-day selection).

### 10.4 `+`/`−` semantics — count is independent of the link popup (amends §4.G, §4.H)
The link/note is **optional and must never gate the count**:
- **`+` always increments by 1 on click**, immediately and durably (create one manual item now; count +1;
  totals +1; mark week dirty). This happens **regardless** of the popup.
- If the task's `showPopup` (§10.5) is on, an **optional** link/note popup then opens for that just-created
  increment. **Save** attaches the note to it; **Discard/Escape** closes the popup and the `+1` **stands**
  with no note. Escape is still "discard the popup," not "undo the +1." (The original multi-note dynamic
  list is replaced by a single optional note box per `+`; the owner can request multi-add back.)
- **`−`**: if the task has **≥1 removable manual item** this week, `−` opens the checkbox remove popup
  (pick which to remove; Remove decrements by the number removed; Discard/Escape = no change). If the task
  has **no manual items** this week, **no popup is shown** and `−` is a no-op. `−` stays disabled at count 0.
  Minus still never touches diary/imported residual (the reconciliation rule in §4.H is preserved).

This requires the **item `note` to be optional** (a bare manual increment with no note is valid): `+` creates
a bare item on click, and the optional popup Save attaches the note afterward (via item PATCH `{note}`).
`appendItems` accepts a bare/empty note entry (creates a note-less item, count +1); import/export preserve a
note-less item.

### 10.5 Per-box `showPopup` config property (amends §4.F, §5.1)
Each task gains a boolean config field **`showPopup`** (default `true`) editable in the per-lane JSON editor
alongside `min`/`target`/`linePct`. When `true`, `+` opens the optional link/note popup after counting;
when `false`, `+` just counts `+1` with no popup. `validateConfig` normalizes an omitted `showPopup` to
`true` and validates a present value as a boolean. The lane editor JSON row becomes
`{ task, min, target, linePct, showPopup }`.

## 11. Iteration 2 — Feedback amendments (2026-09-01, second pass)

Project-owner feedback after reviewing iteration 1 on the branch. These amend the noted sections; where
they conflict with earlier text, these win.

### 11.1 "What happened" shows the note text for every task (amends §4.I)
The daily/range tally must show **the note/link text the owner attached to any item**, not only `post`
items. Under each day's tally line, list the notes/links for **all** that day's manual items (comments,
requests, DMs, calls, posts). Render a note as an external link only when it passes `isAllowedUrl`, else as
escaped plain text; a bare item (no note) contributes to the count but adds no text line. Fix the current
behavior that surfaced notes only for `post` and dropped empty-note items entirely.

### 11.2 Active logging date above the lanes — backfill / front-fill (amends §4.F, §4.J, §5.2, §5.4)
The single date that used to sit under "What happened" moves **above the Outreach/Presence lanes** and
becomes the **active logging date**, defaulting to **today** (in `config.timezone`).
- The lanes, "This week's goals", and every logging action (`+`, `−`, note/link) operate on the **ISO week
  of the active date**, and created items are **timestamped on the active date** (so a past date backfills,
  a future date front-fills). Changing the active date loads that week into the reactive store
  (`GET /api/week/[weekOfActiveDate]` → `replaceWeek`), so the bars/goals reflect the selected week.
- **API:** `POST /api/week/[week]/items` accepts an optional **`at`** (ISO timestamp) applied to every
  created item (default now); `appendItems` stamps items with it. The `[week]` in the path is the active
  date's ISO week. `−`/note-PATCH also target the active week.
- Clicking a **single** day in the calendar sets the active date (syncing the lanes + the single-day
  "What happened"). A selected **range** is view-only (§11.4) and does not change the active date.
- All-time totals remain all-time regardless of the active date.

### 11.3 Calendar marks active days green (amends §4.I)
A day on which anything was logged is marked **green** (a calm, muted green consistent with the nord/dim
palette) rather than the previous neutral heat shade; zero days stay the base surface. Green intensity may
still vary by amount, but "did something that day" reads as green at a glance. Heat remains non-hue-only
for accessibility (keep the `aria-label` activity count).

### 11.4 Range aggregate + quick-range preset buttons (amends §4.I)
- When a **range** is selected, "What happened" shows, **above** the per-day breakdown, an **aggregate
  total** for the whole range (e.g. `Range total: ◆ 12 comments · ➜ 30 requests · …`), then each day below.
- Below the calendar, add quick-range buttons — **Last month · This month · Last week · This week** — that
  auto-select that date range (highlighted on the calendar) and show its aggregate + per-day tabulation.
  Weeks are Monday–Sunday; "month" is the calendar month.

### 11.5 Diary: do not save on a failed parse (amends §4.G of SP2 / D8, D9)
The diary must **not persist an entry when parsing fails**. This overrides the original verbatim-first
guarantee (D8) at the owner's explicit request:
- `POST /api/entry` **parses first and only writes the entry when the parse succeeds** (parseStatus becomes
  `pending` with a preview). On a parse failure it **writes nothing** and returns a failure marker
  (`{ status: 'failed', reason }`, no entry).
- The `DiaryBox` UI, on failure: **keeps the textarea content**, shows a **single simple red error line at
  the bottom** with an inline **try again**, and does **not** advance to a saved/preview state. No
  "Saved — couldn't read it automatically…" copy. On success it clears and shows the Apply/Discard preview.
- **Implication (accepted by the owner):** the diary is now an LLM-only path — when the model is
  unavailable the diary won't save (the manual `+`/`−` remain the always-available fallback). Update SP2's
  `POST /api/entry` contract + tests accordingly; the manual paths keep working with the LLM down.

## Changelog
- 2026-08-31 — Initial PRD for SP6 UI redesign (Tailwind v4 + DaisyUI cupcake/synthwave; all-time
  totals; this-week goals; gradient bars with inline +/- and configurable linePct; freeform-note
  batch item add/atomic remove; smaller heat calendar with click/shift-range selection + read-only
  daily/range tally; two in-place header dropdowns + Keyboard legend; metrics row dropped from main).
- 2026-08-31 — Q2 (linePct = independent visual guide) and Q3 (tally shows diary-approved + manual
  activity) marked RESOLVED per project-owner confirmation.- 2026-09-01 — Iteration 1 feedback amendments (§10): calmer nord/dim theme + muted gradient/symbols; bigger totals + goals; calendar Today button; + always counts (optional link popup, not a gate); - popup only when removable items exist; per-task showPopup config property; item note becomes optional.
- 2026-09-01 — Iteration 2 amendments (§11): What happened shows note text for every task + range aggregate; active logging date above the lanes (backfill/front-fill, item at-stamp); calendar marks active days green; quick-range preset buttons (last/this month, last/this week); diary no longer saves on a failed parse (parse-first, inline red error + try again, LLM-only path).
