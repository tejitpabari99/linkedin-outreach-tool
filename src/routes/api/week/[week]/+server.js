import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export function GET({ params }) {
  if (!WEEK_KEY_RE.test(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  const cfg = config.loadConfig();
  try {
    const week = weeks.readWeek(params.week, cfg);
    return json(week);
  } catch (e) {
    if (e instanceof weeks.WeekError) {
      return json({ error: `Week file ${params.week} exists but could not be parsed`, week: params.week }, { status: 500 });
    }
    throw e;
  }
}

export async function PATCH({ params, request }) {
  if (!WEEK_KEY_RE.test(params.week)) return json({ error: 'Invalid week key' }, { status: 400 });
  const body = await request.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }
  const cfg = config.loadConfig();
  const validTaskIds = new Set(cfg.tasks.map(t => t.id));
  const validMetricIds = new Set(cfg.metrics.map(m => m.id));
  const unknown = [
    ...Object.keys(body.counts ?? {}).filter(id => !validTaskIds.has(id)),
    ...Object.keys(body.metrics ?? {}).filter(id => !validMetricIds.has(id))
  ];
  if (unknown.length > 0) {
    return json({ error: `Unknown task/metric id(s): ${unknown.join(', ')}` }, { status: 400 });
  }
  let week = weeks.readWeek(params.week, cfg);
  try {
    for (const [taskId, delta] of Object.entries(body.counts ?? {})) {
      week = weeks.bumpCount(week, taskId, delta);
    }
    for (const [metricId, value] of Object.entries(body.metrics ?? {})) {
      week = weeks.setMetric(week, metricId, value);
    }
  } catch (e) {
    if (e instanceof weeks.WeekError) return json({ error: e.message }, { status: 400 });
    throw e;
  }
  weeks.writeWeek(params.week, week);
  return json(week);
}
