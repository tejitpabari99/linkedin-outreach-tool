# LinkedIn Outreach Tool — Design Brief

**Date:** 2026-08-29
**Status:** Approved design, pre-implementation
**Next:** `dev-design` → PRD → `dev-tasks` → `dev-code`

## 1. Problem

Tejit has a detailed 22-section LinkedIn & industry-network growth plan aimed at making him legible to the people who matter for Juno (a stealth clinical-trial QC startup): pharma clinical development, CROs, eCOA/endpoint people, CNS/Alzheimer's researchers, health-AI builders, and connectors. The strategy is sound. The problem is that it is a *document*.

The plan asks for ~3–4 hours/week spread across five activity types, most of them low-dopamine, high-friction, and paying off invisibly months later. Tejit has ADHD, and the plan was written without accounting for it. His stated failure mode is specific and it is **not** task initiation:

> "I am good at init. But not consistency. Over time that decays. Becomes boring, don't wanna do it. I get overwhelmed since there is too much to do (or so I feel). And esp if I don't see results, I feel discouraged. I tend to give up on routine. If there is too much recording that is also bad. I won't do it."

So the enemy is **overwhelm → boredom → discouragement → abandonment**, plus **logging fatigue** as the thing that specifically kills trackers. Note that overwhelm is made *worse*, not better, by nagging — which rules out most of the obvious accountability mechanics.

The tool's job, in order:

1. Make the week look **small**. Open it, see that this week is nearly done, do one thing, close it.
2. Make logging **cost nothing**, because a tracker that is 60% accurate is worse than no tracker.
3. Show **visible progress** — the "how far have I come" feeling — without creating a streak that can be broken.
4. Never editorialize about a bad week.

### What research established

Two research passes fed this design.

**LinkedIn data (agent report, 2026-08-29):** there is no sanctioned API path for an individual. The Member Post Analytics API (impressions, reactions, saves, followers-gained per post) rides on the Community Management API, which requires a registered legal business entity plus a verified Company Page — impossible without breaking Juno's stealth. The EU Member Data Portability API is EEA-only and carries no follower count or impressions anyway. Scraping and session-based tools (PhantomBuster, Dux-Soup, `linkedin-api`) are ToS violations with escalating enforcement, and the LinkedIn account *is* the asset being grown, so the risk/reward is absurd. **Conclusion: all metric entry is manual. No API, no scraping, ever.**

**ADHD gamification (agent report, 2026-08-29):** rigid daily streaks reliably cause *abandonment* rather than a pause, because a miss triggers a shame spiral that ends the system; ~80% consistency produces roughly the same long-term outcomes as 100%, so a daily streak enforces a precision the results don't reward. Sales gamification tools (Ambition, Spinify, LevelEleven) score *activities* and pointedly never score *closed deals* — the same activity-vs-outcome split this plan needs. Goodhart's law is the central risk: scoring "requests sent" produces spraying. Novelty decays in 2–4 weeks under fixed rewards. Engagement vs. number-of-mechanics is an **inverted U** — stacking badges + levels + pets + leaderboards predicts burnout. Logging must be one action or drop-off follows within weeks.

### Scope note

An earlier research pass into the Juno Drive folder found that Juno's own stated #1 blocker is *"real interview data and credible expert-referenced feasibility evidence,"* and that a Reachouts sheet with ~11 named targets and pre-drafted messages exists with no send dates. Direct outreach, conference attendance (CTAD, DPHARM, ISCTM), the ADRC pilot-grant path, publishing the existing 85-paper lit review, and advisor recruitment were all proposed as higher-leverage, burst-shaped alternatives to routine LinkedIn work.

**Tejit explicitly declined all of these**: "Don't worry about those other docs and things. It's fine. I am also not attending those conferences. Only the LinkedIn part." That decision is recorded here deliberately — it is a real strategic fork, taken knowingly, and it is out of scope for this tool.

## 2. Decision log

| # | Decision | Alternative rejected | Why |
|---|---|---|---|
| D1 | Two lanes — **Outreach** (data/customers) and **Presence** (comments/posts) — both entirely within LinkedIn | One undifferentiated lane; three lanes incl. a "Ship" lane; multi-channel lanes for conferences/email/grants | Two lanes put the actual bottleneck (talking to people) on screen next to the slower credibility work. A Ship lane would track work he already does unprompted, i.e. decoration. Multi-channel was explicitly declined. |
| D2 | **Split ledger**: effort is scored, outcomes are displayed but never scored | Score outcomes; score inputs only | Scoring outcomes punishes a good week with bad luck and causes quitting; scoring inputs alone Goodharts into volume-spraying. Matches the plan's own line that 2,000 followers with 30 real conversations beats 10,000 random followers. |
| D3 | **Weekly quota**. No daily streaks, no streak freezes | Daily streak with bounded freezes (Duolingo model) | Daily streaks cause abandonment, not a pause, for ADHD users. The plan itself isn't daily — it's "four weekdays," one post/week. A daily streak would misrepresent the target. Freezes add complexity for a mechanic being removed anyway. |
| D4 | Each task has a **min and a target** (e.g. comments 5–10). Min = week cleared; target = stretch | Single fixed number per task | The strategy doc says 12–20 comments and 15 invites/week; Tejit initially said 3 comments and 1 reachout — a 5x gap. Min/target resolves it without either being wrong: a quota cleared by Wednesday builds the habit, while the doc's ambition stays visible. |
| D5 | Quotas: invites 10/15 · follow-up DMs 2/4 · call asks 1/2 · comments 5/10 · posts 1/1 | The doc's raw numbers as hard minimums | Tejit set these directly in the final round. Editable in one click; expected to ratchet up once weeks are being cleared. |
| D6 | **Five metrics**: followers, profile views, post impressions, replies from target people, calls booked | The strategy doc's §19 list (~20 metrics); followers alone | ~20 metrics is a data-entry job that gets done once. Followers alone is too thin to show progress in a slow week — impressions move when followers don't, which matters because flat results are explicitly discouraging. Replies and calls booked are the two that actually track the goal. |
| D7 | **Diary-first logging.** Free-text entry parsed by DeepSeek into counter deltas and metric values | Taps only; deterministic parsing only; preview-then-apply gate | Tejit: *"if I see that for today I can just add diary entry and it will handle the rest, and then I can see the graphs whenever I want... that would make it much easier and better."* Directly targets logging fatigue, the named tracker-killer. |
| D8 | **Diary text is stored verbatim and is the source of truth.** Counters and metrics are derived and correctable | Storing only the parsed result | This is what makes the LLM safe. A wrong parse can never destroy the record — the words written stay exactly the words written, and numbers can be fixed or re-derived. Resolves the "keep it deterministic / no interpretation" requirement at the layer that matters. |
| D9 | Parse **auto-applies**, with a visible diff line and one-click undo | Preview-then-apply; silent auto-apply | Preview reintroduces the click being deleted. Silent application is how you stop trusting the numbers. Auto-apply + visible diff is zero-friction and self-correcting at the moment of error. |
| D10 | **Manual counters retained** alongside the diary | Diary as the only input | Tejit: *"Have the counter too btw. Don't remove it."* Also the correction path when a parse misreads. |
| D11 | Entry dates are **deterministic**: a date picker defaulting to today, back-datable | LLM parses "on Tuesday I…" from the text | A misread date silently moves work into the wrong week and corrupts history. Back-dating must exist (weekend catch-up), but as an explicit control. |
| D12 | **Config and data in separate files.** `config.json` (shareable, no personal data) vs `data/<ISO-week>.json` | One combined file | With one file, sharing the tool means shipping follower counts and call notes, so sharing would never happen. Separation also lets goals be restructured without losing history. |
| D13 | **One JSON file per ISO week** under `data/` | A single append-only `log.json`; a database | Mirrors the existing `content/ideas/` pattern in cc-gateway (readdir + parse each). Retro-logging touches exactly one file. A single file rewrites everything on every tap. A DB was ruled out by Tejit. |
| D14 | Import/export **both** via disk and via UI buttons, plus an export-all | Disk-only; UI-only | Disk editing is what Tejit will use; download/upload is what makes the tool real for anyone else, and doubles as the backup story. ~40 lines. |
| D15 | Links are **optional per logged item, mandatory on posts** | Links per week; no links; links on all task types | Post content lives in Google Docs; the tool stores a URL + label, never the content. Attaching a link must never block a tap — the icon appears after logging and can be filled later. |
| D16 | **Separate git repo, separate SvelteKit app**, own PM2 process, nginx-proxied at `cc.tejitpabari.com/linkedin`, gated by the existing gateway password | Route inside cc-gateway; git submodule; npm package | Only a standalone app makes "share and transfer" real (clone, `npm i`, run). Reuses the proven `/dashboard` → claud-ometer proxy pattern. Submodules force two-repo commits and break on deploy; a package is maximum ceremony for minimum gain. |
| D17 | **LinkedIn-specific behaviour baked in; goals/quotas/lanes/metrics configurable via JSON** | A fully generic task tracker; a fully hardcoded LinkedIn tracker | Tejit: *"the tool is still called LinkedIn outreach tool. Not a generic task tracking tool. But let's say tomorrow I want to increase my outreach in a different area, I can change things around."* |
| D18 | **No notifications, no email.** Passive browser-tab-title counter only | Email/push reminders | The failure is boredom and overwhelm, not forgetting. A reminder for an overwhelmed person is one more thing to dismiss. Also avoids cron and delivery config. |
| D19 | A missed week is **neutral** — a partial square in the history, no red, no guilt copy. Any past week is retro-loggable | Catch-up prompts; streak-broken messaging | Discouragement is the named system-ender. The page must never deliver a verdict on a bad week. Light acknowledgement is acceptable; asking him to account for it is not. |
| D20 | Keep: progress bars, weeks-completed count, sparkline, written log, basic confetti, pinned links, calendar + next-week view. **Drop: XP, levels, badges** | A fuller RPG layer | Levels and badges are arbitrary, known to be arbitrary, and have the fastest novelty decay. Engagement vs. mechanic-count is an inverted U. Calendar was kept at Tejit's explicit override of a proposed YAGNI cut. |
| D21 | **No voice input** | Web Speech API dictation | Cut by Tejit once diary parsing made it redundant. |
| D22 | **No LinkedIn API, no scraping, no third-party analytics integrations.** All metrics manual | Any automated ingestion | No sanctioned path exists for an individual; everything else risks the account being grown. |
| D23 | **No target-list sync.** The Reachouts Google Sheet stays the single owner; the tool links to it | Read-only mirror; full CRM | Avoids a second source of truth and a sync problem. A CRM is a separate product an order of magnitude larger. |
| D24 | **Week-4 honesty check**, deterministic, no LLM | No check; an LLM-written assessment | The agreed tripwire for the tool's own failure mode (see Risk R1). One line comparing Lane A replies + calls against the prior period. No judgement, just the number. |
| D25 | **Admin-only, behind the existing gateway password.** No guest view work | Public read-only scoreboard as accountability | Public commitment has evidence behind it and the gateway supports it, but Tejit explicitly doesn't want it: *"don't worry about it. It is private."* |

## 3. Design

### 3.1 Shape

A standalone SvelteKit app (adapter-node, same stack as cc-gateway), no database, no new runtime dependencies beyond what SvelteKit needs. State is JSON files on disk. One outbound network call exists in the entire system: the diary parse to DeepSeek.

```
linkedin-outreach-tool/
  .dev/linkedin-outreach-tool/     design docs (this file, PRD, TASKS)
  config/
    config.json                    goals, quotas, lanes, metrics, links — shareable
    README.md                      schema documentation + worked example
  data/
    2026-W35.json                  one file per ISO week — private, gitignored
    2026-W36.json
  src/
    lib/
      config.js                    load + validate config
      weeks.js                     read/write week files, ISO week helpers
      parse.js                     DeepSeek call + strict validation of the result
    routes/
      +page.svelte / +page.server.js
      api/week/[week]/+server.js   GET, PATCH
      api/entry/+server.js         POST (create + parse + apply), DELETE (undo)
      api/config/+server.js        GET, PUT
      api/export/+server.js        GET
      api/import/+server.js        POST
```

`data/` is gitignored so the repo can be shared without shipping personal history.

### 3.2 Config schema (`config/config.json`)

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

Config is validated on load. Unknown task/metric ids, duplicate ids, a task naming a nonexistent lane, or `min > target` are all hard errors surfaced as a readable message on the page rather than a stack trace. A broken config must never lose data.

### 3.3 Week schema (`data/2026-W35.json`)

```json
{
  "version": 1,
  "week": "2026-W35",
  "start": "2026-08-31",
  "end": "2026-09-06",
  "counts":  { "invites": 6, "dms": 1, "call_ask": 0, "comments": 4, "post": 1 },
  "metrics": { "followers": 1032, "profile_views": 88, "impressions": 2400, "replies": 3, "calls_booked": 1 },
  "items": [
    { "id": "…", "taskId": "post", "at": "2026-09-02T18:04:00Z",
      "link": { "url": "https://docs.google.com/…#heading=h.abc", "label": "W35 anchor post" } }
  ],
  "entries": [
    { "id": "…", "date": "2026-09-02", "at": "2026-09-02T18:04:00Z",
      "text": "left 4 comments today, sent 6 invites, booked a call with the Genentech person. followers at 1032",
      "applied": { "counts": { "comments": 4, "invites": 6 }, "metrics": { "followers": 1032, "calls_booked": 1 } },
      "parseStatus": "ok" }
  ]
}
```

`counts` and `metrics` are the rendered state. `entries[].text` is the record. `entries[].applied` is what makes undo exact — reverting an entry subtracts precisely what it added.

### 3.4 The diary path

1. Type into the box, pick a date (defaults today), save.
2. The entry is **written to disk verbatim first**, with `parseStatus: "pending"`. If everything downstream fails, the words survive.
3. The text plus the config's task and metric ids go to DeepSeek (`api.deepseek.com`, OpenAI-compatible `/chat/completions`, `WORKER_API_KEY` / `WORKER_BASE_URL` / `WORKER_MODEL` from `.env`, sourced from the machine's existing worker config). Plain `fetch` — no `openai` package, no new dependency.
4. The model must return strict JSON: `{ "counts": { taskId: delta }, "metrics": { metricId: absoluteValue } }`. Any key not in the config is dropped. Deltas must be non-negative integers within a sane bound. Metric values must be non-negative numbers. Anything else fails validation.
5. On success: apply, set `parseStatus: "ok"`, render the diff line — `comments 0→4 · invites 0→6 · followers →1032 · undo`.
6. On failure (bad JSON, network down, no API key, validation reject): `parseStatus: "failed"`, nothing applied, a quiet note offering the manual counters. **The page still works with the LLM entirely unavailable** — it degrades to a tap-and-type tracker with a diary that stores plain text.

Counter taps and manual metric edits write directly and never involve the model.

### 3.5 Screen

One screen, top to bottom, no scrolling to see the week:

1. **Pinned links strip** — from config, click out and come back.
2. **Metrics row** — five numbers, follower sparkline as the headline, each editable inline.
3. **This week** — two lanes, each task a bar with min and target marks. Exactly one item flagged *do this next*. Completed items grey out and shrink, so the page visibly empties as the week goes on.
4. **Diary box** — text + date picker + save. Diff line after saving.
5. **History strip + calendar** — one square per past week (filled / partial / empty), plus the month calendar and next week's view.
6. **The log** — reverse-chronological diary entries with their links, scrollable back through time.

Confetti fires once when every task hits its min. CSS-only, one small burst, no library.

Tab title carries the passive counter (e.g. `(3 left) LinkedIn`). That is the only notification of any kind.

### 3.6 Failure modes

| Failure | Behaviour |
|---|---|
| DeepSeek down / no key / bad JSON | Entry saved verbatim, `parseStatus: "failed"`, manual counters offered. Page fully usable. |
| Parse produces wrong numbers | Visible in the diff line; one-click undo, or edit the counter directly. Diary text unaffected. |
| Config invalid | Readable error on the page naming the offending field. Data untouched. |
| Week file missing | Created on first write from a template. Reading a nonexistent week returns an empty week, not a 500. |
| Concurrent writes | Single user, single process; last write wins. Explicitly accepted. |
| Missed week | Neutral partial square. No prompt, no red, no copy. Retro-loggable via the date picker. |

### 3.7 Verification

Pure functions (ISO week maths, parse-result validation, apply/undo arithmetic, config validation) are unit-testable and should have tests — they are where silent corruption would live. The UI gets a manual smoke pass: log via diary, log via taps, undo an entry, back-date into a prior week, break the config and confirm the error is readable, unset the API key and confirm the page still works.

## 4. Non-goals

- No LinkedIn API, scraping, browser automation, or third-party analytics integration — ever.
- No notifications, email, or push. Tab title only.
- No target-list sync or mirror. The Reachouts Sheet stays the owner; this tool links to it.
- No CRM: no per-person records, notes, pipeline stages, or intro graph.
- No post *content* stored here. Links to Google Docs only.
- No XP, levels, badges, or leaderboards.
- No guest/public view, no sharing of *data*. Sharing means handing someone `config.json`.
- No conference, grant, email-outreach, or publishing lanes — declined explicitly.
- No multi-user, no auth beyond the existing gateway password.
- No seasons, resets, or cycles.
- No voice input.

## 5. Open risks

| # | Risk | Cheapest test |
|---|---|---|
| R1 | **The tool becomes the accomplishment instead of the outreach.** The bars fill, the dopamine lands, and logging quietly substitutes for doing — the same pattern as six deck rewrites happening while eleven drafted messages went unsent. | The week-4 check (D24): did Lane A's replies and calls actually move versus the prior period? If bars are green and Lane A is zero, the tool failed — delete it. |
| R2 | **Weekly metric entry is still too much friction** and the five numbers go stale. | Watch weeks 2–4. If `metrics` are null more than once, cut to followers alone. |
| R3 | **Novelty decay at 2–4 weeks** — the known failure mode of every gamified system, and Tejit's self-described pattern. | If usage stops by week 4 while the underlying work continues, the mechanics were the wrong ones; the fix is fewer, not more. |
| R4 | **15 invites/week is the doc's number, not one Tejit has ever sustained.** The min matters more than the target here. | If the min isn't cleared twice running, lower the min rather than trying harder. |
| R5 | **Parse quality on real diary text** is unmeasured. Casual phrasing ("chatted to a few people") may not map cleanly to counters. | First week of real entries: how many needed an undo or a manual correction? More than ~1 in 4 and the diff line needs to become a preview gate after all. |
| R6 | **The strategic bet may be wrong.** LinkedIn is an indirect, slow path to a data bottleneck that direct outreach might solve faster. Recorded as Tejit's explicit, informed decision — not a design flaw, but the largest open question in the room. | Revisit at week 8: has any LinkedIn activity produced a data conversation? |
