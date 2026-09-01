import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';
import { parseDiaryEntry } from '$lib/parse.js';

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 2100) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export async function POST({ request }) {
  const body = await request.json();
  const { date, text } = body ?? {};

  if (!isValidCalendarDate(date)) {
    return json({
      error: 'Invalid or missing "date" (expected a real YYYY-MM-DD calendar date)'
    }, { status: 400 });
  }
  if (typeof text !== 'string' || text.trim() === '' || text.length > 10_000) {
    return json({ error: 'Invalid "text": must be non-empty and at most 10,000 characters' }, { status: 400 });
  }

  const cfg = config.loadConfig();
  const weekKey = weeks.dateToWeekKey(new Date(`${date}T12:00:00Z`), cfg.timezone);
  if (!weeks.isValidWeekKey(weekKey)) {
    return json({ error: 'Invalid or missing "date"' }, { status: 400 });
  }
  const result = await parseDiaryEntry({ text, config: cfg });
  if (result.status === 'failed') {
    return json({ status: 'failed', reason: result.reason });
  }

  const week = weeks.readWeek(weekKey, cfg);
  const entry = {
    id: randomUUID(),
    date,
    at: new Date().toISOString(),
    text,
    parseStatus: 'pending',
    parseError: null,
    proposed: result.proposed,
    ignored: result.ignored,
    applied: null
  };
  week.entries.push(entry);
  weeks.writeWeek(weekKey, week);

  return json({ status: 'ok', week: weekKey, entry });
}
