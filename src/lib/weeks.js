import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isAllowedUrl } from './config.js';

// See the matching comment in config.js: PROJECT_ROOT must not be a path derived from
// import.meta.url, because that breaks once this module is bundled into build/server/chunks/...
// by adapter-node. process.env.PROJECT_ROOT (set by ecosystem.config.cjs) is used first so the
// resolved path doesn't depend on the invoking shell's cwd; process.cwd() is the documented
// fallback for `vite dev` and `vitest`, which always start with cwd = the project root.
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
export const DATA_DIR = join(PROJECT_ROOT, 'data');

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;
const ISO_TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export function isValidIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(ISO_TIMESTAMP_RE);
  if (!match) return false;

  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const maxDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > maxDay) return false;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  if (offsetHour !== undefined && (
    Number(offsetHour) > 14 || Number(offsetMinute) > 59 ||
    (Number(offsetHour) === 14 && Number(offsetMinute) !== 0)
  )) return false;
  return !Number.isNaN(Date.parse(value));
}

export function isValidWeekKey(key) {
  if (typeof key !== 'string') return false;
  const m = key.match(WEEK_KEY_RE);
  if (!m) return false;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return false;
  return week <= maxIsoWeekOfYear(year);
}

// Dec 28 of any given year always falls in that year's LAST ISO week (per the ISO 8601
// "nearest Thursday" rule), so running the same week-key algorithm on it tells us whether
// this ISO year has 52 or 53 weeks — reused rather than re-deriving the 52-vs-53 rule
// independently, so there is only one implementation of the ISO week algorithm to keep correct.
function maxIsoWeekOfYear(isoYear) {
  const key = isoWeekKeyFromUTCDate(new Date(Date.UTC(isoYear, 11, 28)));
  return Number(key.match(WEEK_KEY_RE)[2]);
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

// A syntactically-valid-JSON value that isn't shaped like a week object must still throw —
// a caller silently accepting it could later writeWeek() the bogus object over recoverable data.
// Only the top-level shape is checked here; per-task/metric-id correctness against the current
// config is projectWeekForConfig's job (PRD §4.6/§9), not readWeek's.
function assertWeekShape(parsed, weekKey) {
  const fail = (field) => {
    throw new WeekError(`Week file for ${weekKey} is corrupt: missing or invalid '${field}'`, weekKey);
  };
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) fail('root');
  if (typeof parsed.version !== 'number') fail('version');
  if (typeof parsed.week !== 'string' || parsed.week !== weekKey) fail('week');
  if (typeof parsed.start !== 'string') fail('start');
  if (typeof parsed.end !== 'string') fail('end');
  if (parsed.counts === null || typeof parsed.counts !== 'object' || Array.isArray(parsed.counts)) fail('counts');
  if (parsed.metrics === null || typeof parsed.metrics !== 'object' || Array.isArray(parsed.metrics)) fail('metrics');
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
  assertWeekShape(parsed, weekKey);
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

export const MAX_APPLY_DELTA = 1000; // exported so SP2's parse.js validation uses the same bound

export function bumpCount(week, taskId, delta) {
  if (!Number.isInteger(delta)) throw new WeekError(`Delta for "${taskId}" must be an integer (got ${delta})`, week.week);
  const next = structuredClone(week);
  const current = next.counts[taskId] ?? 0;
  next.counts[taskId] = Math.max(0, current + delta); // clamped — a count can never go negative
  return next;
}

export function setMetric(week, metricId, value) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new WeekError(`Metric "${metricId}" value must be a non-negative number or null (got ${value})`, week.week);
  }
  const next = structuredClone(week);
  next.metrics[metricId] = value;
  return next;
}

export function appendEntry(week, { date, text }) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new WeekError('Entry text must be a non-empty string', week.week);
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new WeekError(`Entry date "${date}" must be an ISO calendar date (YYYY-MM-DD)`, week.week);
  }
  const entry = {
    id: randomUUID(),
    date,
    at: new Date().toISOString(),
    text,
    parseStatus: 'pending'
    // "applied" key is intentionally absent until applyEntryToWeek sets it —
    // JSON.stringify drops `undefined` values, so it never appears in the file for pending/discarded/failed entries.
  };
  const next = structuredClone(week);
  next.entries.push(entry);
  return { week: next, entry };
}

function findEntryOrThrow(week, entryId) {
  const entry = week.entries.find(e => e.id === entryId);
  if (!entry) throw new WeekError(`Entry "${entryId}" not found in week ${week.week}`, week.week);
  return entry;
}

export function applyEntryToWeek(week, entryId, approved) {
  const next = structuredClone(week);
  const entry = findEntryOrThrow(next, entryId);
  if (entry.parseStatus !== 'pending') {
    throw new WeekError(`Entry "${entryId}" is not pending (status: ${entry.parseStatus})`, week.week);
  }
  const counts = approved?.counts ?? {};
  const metrics = approved?.metrics ?? {};
  for (const [taskId, delta] of Object.entries(counts)) {
    if (!Number.isInteger(delta) || delta < 0) {
      throw new WeekError(`Invalid count delta for "${taskId}": ${delta}`, week.week);
    }
    if (delta > MAX_APPLY_DELTA) {
      throw new WeekError(`Count delta for "${taskId}" (${delta}) exceeds sane bound (${MAX_APPLY_DELTA})`, week.week);
    }
    const current = next.counts[taskId] ?? 0;
    next.counts[taskId] = Math.max(0, current + delta);
  }
  for (const [metricId, value] of Object.entries(metrics)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new WeekError(`Invalid metric value for "${metricId}": ${value}`, week.week);
    }
    next.metrics[metricId] = value;
  }
  entry.applied = { counts, metrics };
  entry.parseStatus = 'ok';
  return next;
}

export function discardEntry(week, entryId) {
  const next = structuredClone(week);
  const entry = findEntryOrThrow(next, entryId);
  if (entry.parseStatus !== 'pending') {
    throw new WeekError(`Entry "${entryId}" is not pending (status: ${entry.parseStatus})`, week.week);
  }
  entry.parseStatus = 'discarded';
  return next;
}

export function markEntryFailed(week, entryId) {
  const next = structuredClone(week);
  const entry = findEntryOrThrow(next, entryId);
  if (entry.parseStatus !== 'pending') {
    throw new WeekError(`Entry "${entryId}" is not pending (status: ${entry.parseStatus})`, week.week);
  }
  entry.parseStatus = 'failed';
  return next;
}

export function removeEntry(week, entryId) {
  const next = structuredClone(week);
  const idx = next.entries.findIndex(e => e.id === entryId);
  if (idx === -1) throw new WeekError(`Entry "${entryId}" not found in week ${week.week}`, week.week);
  // Deliberately does NOT reverse counts/metrics already merged by a prior applyEntryToWeek —
  // per D9 there is no undo mechanism. This only removes the log row.
  next.entries.splice(idx, 1);
  return next;
}

function assertValidLink(link, weekKey) {
  if (link !== null && (
    typeof link !== 'object' || typeof link.url !== 'string' || typeof link.label !== 'string' ||
    link.url === '' || !isAllowedUrl(link.url)
  )) {
    throw new WeekError('link must be null or { url: http/https URL, label: string }', weekKey);
  }
}

export function appendItem(week, { taskId, link = null }) {
  assertValidLink(link, week.week);
  const item = { id: randomUUID(), taskId, at: new Date().toISOString(), link };
  const next = structuredClone(week);
  next.items.push(item);
  return { week: next, item };
}

function assertTaskId(taskId, weekKey) {
  if (typeof taskId !== 'string' || taskId.length === 0) {
    throw new WeekError('taskId must be a non-empty string', weekKey);
  }
}

function currentCount(week, taskId) {
  const count = week.counts[taskId] ?? 0;
  if (!Number.isInteger(count) || count < 0) {
    throw new WeekError(`Count for "${taskId}" must be a non-negative integer`, week.week);
  }
  return count;
}

export function appendItems(week, { taskId, notes, at }) {
  assertTaskId(taskId, week.week);
  const itemAt = at === undefined ? new Date().toISOString() : at;
  if (!isValidIsoTimestamp(itemAt)) {
    throw new WeekError('at must be a valid ISO timestamp string', week.week);
  }
  if (!Array.isArray(notes) || notes.length < 1 || notes.length > 50) {
    throw new WeekError('notes must be an array containing 1 to 50 strings', week.week);
  }

  const normalizedNotes = notes.map((note, index) => {
    if (note === null || note === undefined) return null;
    if (typeof note !== 'string') {
      throw new WeekError(`notes[${index}] must be a string, null, or undefined`, week.week);
    }
    const trimmed = note.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 4000) {
      throw new WeekError(`notes[${index}] must contain at most 4000 characters after trimming`, week.week);
    }
    return trimmed;
  });
  const count = currentCount(week, taskId);
  const items = normalizedNotes.map(note => ({
    id: randomUUID(),
    taskId,
    at: itemAt,
    note,
    link: null
  }));
  const next = structuredClone(week);
  next.items.push(...items);
  next.counts[taskId] = count + items.length;
  return { week: next, items };
}

export function removeItems(week, { taskId, itemIds }) {
  assertTaskId(taskId, week.week);
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new WeekError('itemIds must be a non-empty array', week.week);
  }
  if (itemIds.some(id => typeof id !== 'string' || id.length === 0)) {
    throw new WeekError('itemIds must contain only non-empty strings', week.week);
  }
  const selectedIds = new Set(itemIds);
  if (selectedIds.size !== itemIds.length) {
    throw new WeekError('itemIds must be unique', week.week);
  }

  for (const id of itemIds) {
    const matches = week.items.filter(item => item.id === id);
    if (matches.length !== 1) {
      throw new WeekError(`Item "${id}" not found in week ${week.week}`, week.week);
    }
    if (matches[0].taskId !== taskId) {
      throw new WeekError(`Item "${id}" does not belong to task "${taskId}"`, week.week);
    }
  }
  const count = currentCount(week, taskId);
  if (count < itemIds.length) {
    throw new WeekError(`Count for "${taskId}" is less than the number of selected items`, week.week);
  }

  const next = structuredClone(week);
  next.items = next.items.filter(item => !selectedIds.has(item.id));
  next.counts[taskId] = count - itemIds.length;
  return { week: next, removedIds: [...itemIds] };
}

export function setItemNote(week, itemId, note) {
  let normalizedNote = null;
  if (note !== null) {
    if (typeof note !== 'string') {
      throw new WeekError('note must be a non-empty string or null', week.week);
    }
    normalizedNote = note.trim();
    if (normalizedNote.length === 0 || normalizedNote.length > 4000) {
      throw new WeekError('note must contain 1 to 4000 characters after trimming, or be null', week.week);
    }
  }

  const next = structuredClone(week);
  const item = next.items.find(i => i.id === itemId);
  if (!item) throw new WeekError(`Item "${itemId}" not found in week ${week.week}`, week.week);
  item.note = normalizedNote;
  return next;
}

export function attachItemLink(week, itemId, link) {
  assertValidLink(link, week.week);
  const next = structuredClone(week);
  const item = next.items.find(i => i.id === itemId);
  if (!item) throw new WeekError(`Item "${itemId}" not found in week ${week.week}`, week.week);
  item.link = link;
  return next;
}
