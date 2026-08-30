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
