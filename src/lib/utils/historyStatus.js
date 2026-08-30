// src/lib/utils/historyStatus.js

/**
 * @param {object} week    a projected week object (SP1's projectWeekForConfig shape:
 *                          { week, start, end, counts, metrics, items, entries })
 * @param {object} config  validated config (needs config.tasks: [{id, min}])
 * @returns {{
 *   week: string, start: string, end: string,
 *   status: 'filled' | 'partial' | 'empty',
 *   clearedCount: number, total: number, touched: boolean
 * }}
 */
export function summarizeWeekStatus(week, config) {
  const total = config.tasks.length;
  const clearedCount = config.tasks.filter(t => (week.counts[t.id] ?? 0) >= t.min).length;
  const anyCounts = config.tasks.some(t => (week.counts[t.id] ?? 0) > 0);
  const anyEntries = (week.entries?.length ?? 0) > 0;
  const anyItems = (week.items?.length ?? 0) > 0;
  const touched = anyCounts || anyEntries || anyItems;

  let status;
  if (total > 0 && clearedCount === total) status = 'filled';
  else if (touched) status = 'partial';
  else status = 'empty';

  return { week: week.week, start: week.start, end: week.end, status, clearedCount, total, touched };
}
