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
