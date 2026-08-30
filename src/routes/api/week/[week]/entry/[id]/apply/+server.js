import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export function POST({ params }) {
  if (!WEEK_KEY_RE.test(params.week)) {
    return json({ error: 'Invalid week key' }, { status: 400 });
  }
  if (!weeks.isValidWeekKey(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  const cfg = config.loadConfig();
  let week;
  try {
    week = weeks.readWeek(params.week, cfg);
  } catch (e) {
    if (e instanceof weeks.WeekError) {
      return json({ error: `Week file ${params.week} exists but could not be parsed`, week: params.week }, { status: 500 });
    }
    throw e;
  }
  try {
    const entry = week.entries.find(e => e.id === params.id);
    if (!entry) return json({ error: 'Entry not found' }, { status: 404 });

    if (entry.parseStatus === 'ok') {
      return json({ entry, alreadyApplied: true });
    }
    if (entry.parseStatus !== 'pending' || !entry.proposed) {
      return json({ error: 'Entry has no pending parse to apply' }, { status: 409 });
    }

    week = weeks.applyEntryToWeek(week, entry.id, entry.proposed);
    weeks.writeWeek(params.week, week);
    const updatedEntry = week.entries.find(e => e.id === params.id);
    return json({ entry: updatedEntry, alreadyApplied: false });
  } catch (e) {
    if (e instanceof weeks.WeekError) return json({ error: e.message }, { status: 400 });
    throw e;
  }
}
