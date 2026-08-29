import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';
import { parseDiaryEntry } from '$lib/parse.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export async function POST({ params }) {
  if (!WEEK_KEY_RE.test(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  const cfg = config.loadConfig();
  const week = weeks.readWeek(params.week, cfg);
  const entry = week.entries.find(e => e.id === params.id);
  if (!entry) return json({ error: 'Entry not found' }, { status: 404 });
  if (entry.parseStatus !== 'failed') {
    return json({ error: 'Only a failed entry can be reparsed' }, { status: 409 });
  }

  const result = await parseDiaryEntry({ text: entry.text, config: cfg });
  const freshWeek = weeks.readWeek(params.week, cfg);
  const freshEntry = freshWeek.entries.find(candidate => candidate.id === params.id);
  const outcomeEntry = freshEntry ?? entry;
  if (result.status === 'ok') {
    outcomeEntry.parseStatus = 'pending';
    outcomeEntry.parseError = null;
    outcomeEntry.proposed = result.proposed;
    outcomeEntry.ignored = result.ignored;
  } else {
    outcomeEntry.parseError = result.reason;
  }
  if (freshEntry) weeks.writeWeek(params.week, freshWeek);
  return json({ entry: outcomeEntry });
}
