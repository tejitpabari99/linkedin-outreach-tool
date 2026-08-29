import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url)); // src/lib
const PROJECT_ROOT = join(__dirname, '..', '..');
export const DATA_DIR = join(PROJECT_ROOT, 'data');

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

export function isValidWeekKey(key) {
  if (typeof key !== 'string') return false;
  const m = key.match(WEEK_KEY_RE);
  if (!m) return false;
  const week = Number(m[2]);
  return week >= 1 && week <= 53;
}

function isoWeekKeyFromUTCDate(utcDate) {
  // utcDate must be a Date built via Date.UTC(y, m0, d) — a pure calendar date, no time component
  const d = new Date(utcDate.getTime());
  const dayNum = (d.getUTCDay() + 6) % 7;      // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);   // shift to the Thursday of this ISO week
  const isoYear = d.getUTCFullYear();          // the ISO week-numbering year
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Thursday = new Date(jan4);
  week1Thursday.setUTCDate(jan4.getUTCDate() - jan4DayNum + 3);
  const week = 1 + Math.round((d - week1Thursday) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function localCalendarParts(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

export function dateToWeekKey(date, timezone) {
  const { y, m, d } = localCalendarParts(date, timezone);
  return isoWeekKeyFromUTCDate(new Date(Date.UTC(y, m - 1, d)));
}

export function currentWeekKey(timezone) {
  return dateToWeekKey(new Date(), timezone);
}

export function weekKeyToRange(key) {
  if (!isValidWeekKey(key)) throw new WeekError(`Invalid week key "${key}"`);
  const [, yStr, wStr] = key.match(WEEK_KEY_RE);
  const isoYear = Number(yStr);
  const week = Number(wStr);
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

export function nextWeekKey(key) {
  const { start } = weekKeyToRange(key);
  const [y, m, d] = start.split('-').map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() + 7);
  return isoWeekKeyFromUTCDate(monday);
}

export function prevWeekKey(key) {
  const { start } = weekKeyToRange(key);
  const [y, m, d] = start.split('-').map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() - 7);
  return isoWeekKeyFromUTCDate(monday);
}
