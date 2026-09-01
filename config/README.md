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
{ "id": "invites", "lane": "outreach", "label": "Targeted connection requests", "min": 10, "target": 15, "linePct": 75, "showPopup": true, "link": "optional" }
```

| Field     | Type    | Required | Notes |
|-----------|---------|----------|-------|
| `id`      | string  | yes | Unique. Referenced by week files' `counts`/`items[].taskId`. **Do not rename an existing task id** once you have logged weeks against it — old week files keep the old id and will show as an unrecognized/orphaned count. Add a new task instead, or edit historical `data/*.json` by hand if you really mean to rename. |
| `lane`    | string  | yes | Must match a `lanes[].id`. |
| `label`   | string  | yes | Shown on the task's progress bar. |
| `min`     | integer | yes | The quota that clears the week for this task (D4). Must be `>= 0`. |
| `target`  | integer | yes | The stretch number and 100% point on the progress bar. Must be `>= min`. `min > target` is a hard config-validation error. |
| `linePct` | integer | no (default `75`) | Independent visual guide position on the progress bar, from `1` to `100`. It is not a quota and is not an alias for `min`; changing it never changes `min` or `target`. The normalized config returned by the app always contains it. |
| `showPopup` | boolean | no (default `true`) | When `true`, `+` counts immediately and then opens the optional link/note popup. When `false`, `+` just counts without opening the popup. The normalized config always contains it. |
| `link`    | `"optional" \| "required"` | yes | D15 display hint. `"required"` nudges the UI to ask for a link, but never blocks a manual increment. SP6 freeform notes are valid concrete items for every task, including posts. `"optional"` carries no link nudge. |

Setting `min` equal to `target` means there is no stretch tier for that task — it is a single quota.

## `metrics[]`

```json
{ "id": "followers", "label": "Followers", "headline": true }
```

| Field       | Type    | Required | Notes |
|-------------|---------|----------|-------|
| `id`        | string  | yes | Unique. Referenced by week files' `metrics`. Same rename caveat as `tasks[].id`. |
| `label`     | string  | yes | Shown next to the number. |
| `headline`  | boolean | no (default `false`) | Exactly one metric must set this `true` — it is the tool's single headline metric. Set on `followers` by default. |

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

## Week `items[]` compatibility

Week files remain schema `version: 1`. The additive SP6 item shape is:

```json
{ "id": "uuid", "taskId": "comments", "at": "2026-09-01T05:10:00.000Z", "note": "Comment on Priya's post", "link": null }
```

`note` is optional for backward compatibility. New SP6 manual items contain a trimmed, non-empty
note of at most 4,000 characters; each note is one concrete item and one count increment. Legacy
items without `note` remain valid, and their nullable `link` object (`{ "url", "label" }`) is
preserved for old week files and the existing link-attachment flow. This additive field does not
require a week-version bump or a migration of historical files.

## Validation rules (hard errors, not warnings)

Enforced on every load (`GET /api/config`, and again inside `PUT /api/config` before any write —
"a broken config must never lose data"):

- Every `tasks[].lane` must reference an existing `lanes[].id`.
- No duplicate `id` within `lanes`, within `tasks`, or within `metrics` (ids only need to be
  unique within their own array — a task and a metric may share an id string without conflict,
  though avoiding that is clearer in practice).
- `tasks[].min <= tasks[].target`, both `>= 0`, both integers.
- Omitted `tasks[].linePct` is normalized to `75`; a present value must be an integer from `1` to `100`.
- Omitted `tasks[].showPopup` is normalized to `true`; a present value must be a boolean.
- `tasks[].link` is exactly `"optional"` or `"required"`; it never gates a manual increment.
- Exactly one `metrics[].headline === true`.

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
    { "id": "cold_emails", "lane": "outbound", "label": "Cold emails sent", "min": 15, "target": 25, "linePct": 75, "link": "optional" },
    { "id": "followups",   "lane": "outbound", "label": "Follow-up emails", "min": 5,  "target": 10, "linePct": 75, "link": "optional" },
    { "id": "replies_handled", "lane": "followthrough", "label": "Replies responded to", "min": 3, "target": 6, "linePct": 75, "link": "optional" },
    { "id": "calls_booked_task", "lane": "followthrough", "label": "Calls booked from outreach", "min": 1, "target": 3, "linePct": 75, "link": "optional" }
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
