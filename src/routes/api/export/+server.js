import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export function GET({ url }) {
  const weekKey = url.searchParams.get('week');
  if (!weekKey || !WEEK_KEY_RE.test(weekKey)) {
    return json({ error: 'Invalid or missing "week" query param' }, { status: 400 });
  }
  const cfg = config.loadConfig();
  const week = weeks.readWeek(weekKey, cfg);
  return new Response(JSON.stringify(week, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${weekKey}.json"`
    }
  });
}
