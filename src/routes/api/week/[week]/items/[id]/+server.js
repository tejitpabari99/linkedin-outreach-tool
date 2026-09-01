import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export async function PATCH({ params, request }) {
  if (!WEEK_KEY_RE.test(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  if (!weeks.isValidWeekKey(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  const body = await request.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }
  const hasNote = Object.hasOwn(body, 'note');
  const hasLink = Object.hasOwn(body, 'link');
  if (!hasNote && !hasLink) {
    return json({ error: 'Request body must contain "note" or "link"' }, { status: 400 });
  }

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

  if (!week.items.some(item => item.id === params.id)) {
    return json({ error: `Item "${params.id}" not found in week ${params.week}` }, { status: 404 });
  }
  if (hasNote && body.note !== null && (
    typeof body.note !== 'string' || body.note.trim().length === 0 || body.note.trim().length > 4000
  )) {
    return json({ error: 'note must contain 1 to 4000 characters after trimming, or be null' }, { status: 400 });
  }

  try {
    if (hasNote) week = weeks.setItemNote(week, params.id, body.note);
    if (hasLink) week = weeks.attachItemLink(week, params.id, body.link);
  } catch (e) {
    if (e instanceof weeks.WeekError) return json({ error: e.message }, { status: 400 });
    throw e;
  }
  weeks.writeWeek(params.week, week);
  const item = week.items.find(i => i.id === params.id);
  return json({ item, week: weeks.projectWeekForConfig(week, cfg) });
}
