import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
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

export class WeekError extends Error {
  constructor(message, weekKey = null) {
    super(message);
    this.name = 'WeekError';
    this.weekKey = weekKey;
  }
}

const WEEK_FILE_RE = /^(\d{4}-W\d{2})\.json$/;

export function listWeekKeys(dataDir = DATA_DIR) {
  let files;
  try {
    files = readdirSync(dataDir);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // data/ doesn't exist yet — not an error
    throw err;
  }
  return files
    .map(f => f.match(WEEK_FILE_RE))
    .filter(Boolean)
    .map(m => m[1])
    .sort(); // lexicographic sort == chronological sort: 4-digit year dominates, week is zero-padded
}

export function emptyWeek(weekKey, config) {
  if (!isValidWeekKey(weekKey)) throw new WeekError(`Invalid week key "${weekKey}"`, weekKey);
  const { start, end } = weekKeyToRange(weekKey);
  return {
    version: 1,
    week: weekKey,
    start,
    end,
    counts: Object.fromEntries(config.tasks.map(t => [t.id, 0])),
    metrics: Object.fromEntries(config.metrics.map(m => [m.id, null])),
    items: [],
    entries: []
  };
}

export function readWeek(weekKey, config, dataDir = DATA_DIR) {
  if (!isValidWeekKey(weekKey)) throw new WeekError(`Invalid week key "${weekKey}"`, weekKey);
  const filePath = join(dataDir, `${weekKey}.json`);
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return emptyWeek(weekKey, config); // missing file -> empty week, never a 500
    throw new WeekError(`Failed to read week file ${weekKey}.json: ${err.message}`, weekKey);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Corrupt file is NOT treated as "missing" — never silently fall back to empty here.
    throw new WeekError(`Week file ${weekKey}.json is corrupt and could not be parsed: ${err.message}`, weekKey);
  }
  // Additive-only reconciliation against current config — see PRD §4.7 for the drift policy.
  const counts = { ...parsed.counts };
  for (const t of config.tasks) if (!(t.id in counts)) counts[t.id] = 0;
  const metrics = { ...parsed.metrics };
  for (const m of config.metrics) if (!(m.id in metrics)) metrics[m.id] = null;
  return { ...parsed, counts, metrics, items: parsed.items ?? [], entries: parsed.entries ?? [] };
}

export function writeWeek(weekKey, week, dataDir = DATA_DIR) {
  if (!isValidWeekKey(weekKey)) throw new WeekError(`Invalid week key "${weekKey}"`, weekKey);
  if (week.week !== weekKey) {
    throw new WeekError(`Week object's "week" field ("${week.week}") does not match target key "${weekKey}"`, weekKey);
  }
  mkdirSync(dataDir, { recursive: true });
  const finalPath = join(dataDir, `${weekKey}.json`);
  const tmpPath = join(dataDir, `.${weekKey}.json.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmpPath, JSON.stringify(week, null, 2), 'utf8');
  renameSync(tmpPath, finalPath); // same-directory rename is atomic on POSIX
}

export function projectWeekForConfig(week, config) {
  const taskIds = new Set(config.tasks.map(t => t.id));
  const metricIds = new Set(config.metrics.map(m => m.id));
  return {
    ...week,
    counts: Object.fromEntries(Object.entries(week.counts).filter(([id]) => taskIds.has(id))),
    metrics: Object.fromEntries(Object.entries(week.metrics).filter(([id]) => metricIds.has(id)))
  };
}
