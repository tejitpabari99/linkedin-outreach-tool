import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';
import { parseDiaryEntry } from '$lib/parse.js';

export async function POST({ request }) {
  const body = await request.json();
  const { date, text } = body ?? {};

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return json({ error: 'Invalid or missing "date" (expected YYYY-MM-DD)' }, { status: 400 });
  }
  if (typeof text !== 'string' || text.trim() === '' || text.length > 10_000) {
    return json({ error: 'Invalid "text": must be non-empty and at most 10,000 characters' }, { status: 400 });
  }

  const cfg = config.loadConfig();
  const weekKey = weeks.dateToWeekKey(new Date(`${date}T12:00:00Z`), cfg.timezone);
  const week = weeks.readWeek(weekKey, cfg);

  const entry = {
    id: randomUUID(),
    date,
    at: new Date().toISOString(),
    text,
    parseStatus: 'pending',
    parseError: null,
    proposed: null,
    ignored: null,
    applied: null
  };
  week.entries.push(entry);

  weeks.writeWeek(weekKey, week);

  const result = await parseDiaryEntry({ text, config: cfg });
  const freshWeek = weeks.readWeek(weekKey, cfg);
  const freshEntry = freshWeek.entries.find(candidate => candidate.id === entry.id);
  const outcomeEntry = freshEntry ?? entry;
  if (result.status === 'ok') {
    outcomeEntry.proposed = result.proposed;
    outcomeEntry.ignored = result.ignored;
  } else {
    outcomeEntry.parseStatus = 'failed';
    outcomeEntry.parseError = result.reason;
  }

  if (freshEntry) weeks.writeWeek(weekKey, freshWeek);

  return json({ week: weekKey, entry: outcomeEntry });
}
