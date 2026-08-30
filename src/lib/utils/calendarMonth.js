// src/lib/utils/calendarMonth.js
import { isoWeekKeyFromUTCDate } from './isoWeek.js';

/**
 * @param {number} year
 * @param {number} month        1-12
 * @param {Record<string, object>} weeksByKey   projected week objects, keyed by their own `week`,
 *                                               covering every ISO week that overlaps this month
 * @param {string} currentWeekKey
 * @param {string} todayStr      YYYY-MM-DD
 * @returns {{
 *   year: number, month: number,
 *   days: { date: string, inMonth: boolean, weekKey: string, isToday: boolean,
 *           entryCount: number, itemCount: number, isCurrentWeek: boolean }[]
 * }}
 */
export function buildCalendarMonth(year, month, weeksByKey, currentWeekKey, todayStr) {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startDow = (firstOfMonth.getUTCDay() + 6) % 7; // Mon=0
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(gridStart.getUTCDate() - startDow);

  const days = [];
  for (let i = 0; i < 42; i++) { // 6 full weeks, always — fixed grid height, no layout jump month to month
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const weekKey = isoWeekKeyFromUTCDate(d);
    const week = weeksByKey[weekKey];
    const dayEntries = week ? week.entries.filter(e => e.date === dateStr).length : 0;
    const dayItems = week ? week.items.filter(it => it.at.slice(0, 10) === dateStr).length : 0;
    days.push({
      date: dateStr,
      inMonth: d.getUTCMonth() + 1 === month,
      weekKey,
      isToday: dateStr === todayStr,
      entryCount: dayEntries,
      itemCount: dayItems,
      isCurrentWeek: weekKey === currentWeekKey
    });
  }
  return { year, month, days };
}
