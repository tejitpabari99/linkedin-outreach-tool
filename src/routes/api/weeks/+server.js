import { json } from '@sveltejs/kit';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

export function GET({ url }) {
  const before = url.searchParams.get('before');
  if (!before || !WEEK_KEY_RE.test(before)) {
    return json({ error: 'Invalid or missing before week key' }, { status: 400 });
  }
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1
    ? Math.min(26, rawLimit)
    : 8;

  const earlier = weeks.listWeekKeys().filter(k => k < before);
  const page = earlier.slice(-limit).reverse();
  return json({ weeks: page });
}
