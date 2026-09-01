import { isAllowedUrl } from '$lib/config.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function calendarDate(value) {
  if (!ISO_DATE_RE.test(value ?? '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function localDate(timestamp, formatter) {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ensureDay(index, date) {
  return index[date] ??= { date, counts: {}, postItems: [] };
}

function addCount(day, taskId, count) {
  if (typeof taskId !== 'string' || !Number.isFinite(count) || count === 0) return;
  day.counts[taskId] = (day.counts[taskId] ?? 0) + count;
}

function safeLegacyLink(link) {
  if (!link || typeof link !== 'object' || !isAllowedUrl(link.url)) return null;
  return {
    label: typeof link.label === 'string' ? link.label : link.url,
    url: link.url
  };
}

function postItem(item) {
  const note = typeof item.note === 'string' ? item.note : null;
  const link = safeLegacyLink(item.link);
  const noteUrl = note && isAllowedUrl(note) ? note : null;
  return {
    id: item.id,
    note,
    link,
    text: note ?? link?.label ?? link?.url ?? '',
    href: noteUrl ?? link?.url ?? null
  };
}

export function buildActivityIndex(weeks = [], config = {}) {
  const index = {};
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const seenItemIds = new Set();

  for (const week of weeks ?? []) {
    for (const entry of week?.entries ?? []) {
      if (entry?.parseStatus !== 'ok' || !calendarDate(entry.date)) continue;
      const counts = entry.applied?.counts;
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) continue;
      const day = ensureDay(index, entry.date);
      for (const [taskId, count] of Object.entries(counts)) addCount(day, taskId, count);
    }

    for (const item of week?.items ?? []) {
      if (!item || (typeof item.id === 'string' && seenItemIds.has(item.id))) continue;
      const date = localDate(item.at, formatter);
      if (!date) continue;
      if (typeof item.id === 'string') seenItemIds.add(item.id);
      const day = ensureDay(index, date);
      addCount(day, item.taskId, 1);
      if (item.taskId === 'post') day.postItems.push(postItem(item));
    }
  }

  return index;
}

function cloneDay(day, date) {
  return {
    date,
    counts: { ...day?.counts },
    postItems: (day?.postItems ?? []).map(item => ({
      ...item,
      link: item.link ? { ...item.link } : null
    }))
  };
}

export function activityDay(index, date) {
  if (!calendarDate(date)) throw new TypeError(`Invalid calendar date: ${date}`);
  return cloneDay(index?.[date], date);
}

export function activityRange(index, startDate, endDate) {
  const start = calendarDate(startDate);
  const end = calendarDate(endDate);
  if (!start || !end) throw new TypeError('Activity range dates must use YYYY-MM-DD');

  const [first, last] = start <= end ? [start, end] : [end, start];
  const rows = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    rows.push(activityDay(index, cursor.toISOString().slice(0, 10)));
  }
  return rows;
}
