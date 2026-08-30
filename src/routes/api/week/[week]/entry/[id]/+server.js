import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export function DELETE({ params }) {
  if (!WEEK_KEY_RE.test(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
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
    week = weeks.removeEntry(week, params.id);
  } catch (e) {
    if (e instanceof weeks.WeekError) return json({ error: e.message }, { status: 404 });
    throw e;
  }
  weeks.writeWeek(params.week, week);
  return json({ ok: true });
}
