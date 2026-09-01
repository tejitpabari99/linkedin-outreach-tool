// src/lib/utils/isoWeek.js — client-safe. No Node built-ins or filesystem-touching functions.
// MUST stay byte-for-byte algorithmically identical to SP1's src/lib/weeks.js. See isoWeek.test.js,
// which asserts parity against the exact fixture set SP1's own PRD defines (§4.5 of SP1's PRD).

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

export function isoWeekKeyFromUTCDate(utcDate) {
  const d = new Date(utcDate.getTime());
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Thursday = new Date(jan4);
  week1Thursday.setUTCDate(jan4.getUTCDate() - jan4DayNum + 3);
  const week = 1 + Math.round((d - week1Thursday) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function localCalendarParts(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

export function dateToWeekKey(date, timezone) {
  const localDateTime = typeof date === 'string'
    ? date.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/)
    : null;
  const { y, m, d } = localDateTime
    ? { y: Number(localDateTime[1]), m: Number(localDateTime[2]), d: Number(localDateTime[3]) }
    : localCalendarParts(typeof date === 'string' ? new Date(date) : date, timezone);
  return isoWeekKeyFromUTCDate(new Date(Date.UTC(y, m - 1, d)));
}

export function weekKeyToRange(key) {
  const m = key.match(WEEK_KEY_RE);
  if (!m) throw new Error(`Invalid week key "${key}"`);
  const isoYear = Number(m[1]), week = Number(m[2]);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}
