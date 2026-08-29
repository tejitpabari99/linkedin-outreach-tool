import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export async function PATCH({ params, request }) {
  if (!WEEK_KEY_RE.test(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  const body = await request.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }
  const { link } = body;
  const cfg = config.loadConfig();
  let week = weeks.readWeek(params.week, cfg);
  try {
    week = weeks.attachItemLink(week, params.id, link);
  } catch (e) {
    if (e instanceof weeks.WeekError) return json({ error: e.message }, { status: 404 });
    throw e;
  }
  weeks.writeWeek(params.week, week);
  const item = week.items.find(i => i.id === params.id);
  return json({ item });
}
