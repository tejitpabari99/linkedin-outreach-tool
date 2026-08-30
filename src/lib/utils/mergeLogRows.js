// src/lib/utils/mergeLogRows.js

/**
 * @param {LogRow[]} existingRows
 * @param {object[]} newWeeks   full projected week objects (from GET /api/week/[week])
 * @returns {LogRow[]}  merged, de-duped by row id, sorted descending by `at`
 */
export function mergeLogRows(existingRows, newWeeks) {
  const rowsFromWeek = (w) => [
    ...w.entries.map(e => ({ id: `entry:${e.id}`, kind: 'entry', weekKey: w.week, at: e.at, entry: e })),
    ...w.items.map(it => ({ id: `item:${it.id}`, kind: 'item', weekKey: w.week, at: it.at, item: it, taskId: it.taskId }))
  ];
  const byId = new Map(existingRows.map(r => [r.id, r]));
  for (const w of newWeeks) for (const row of rowsFromWeek(w)) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
