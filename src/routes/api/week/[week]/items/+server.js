import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export async function POST({ params, request }) {
  if (!WEEK_KEY_RE.test(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  if (!weeks.isValidWeekKey(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  const body = await request.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }
  const { taskId, link } = body;
  const cfg = config.loadConfig();
  if (!cfg.tasks.some(t => t.id === taskId)) {
    return json({ error: `Unknown task id "${taskId}"` }, { status: 400 });
  }
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
    let item;
    ({ week, item } = weeks.appendItem(week, { taskId, link: link ?? null }));
    week = weeks.bumpCount(week, taskId, 1);
    weeks.writeWeek(params.week, week);
    return json({ item, counts: week.counts });
  } catch (e) {
    if (e instanceof weeks.WeekError) return json({ error: e.message }, { status: 400 });
    throw e;
  }
}
