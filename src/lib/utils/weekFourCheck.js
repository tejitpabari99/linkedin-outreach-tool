// src/lib/utils/weekFourCheck.js

/**
 * @typedef {{ week: string, metrics: { replies: number|null, calls_booked: number|null } }} TouchedWeekSlice
 * @typedef {'baseline'|'zero'|'up'|'down'|'flat'|'sparse'} WeekFourOutcome
 * @typedef {{
 *   due: boolean,
 *   outcome: WeekFourOutcome | null,
 *   checkNumber: number | null,
 *   currentTotal: number | null,
 *   priorTotal: number | null,
 *   currentWeeks: string[],
 *   priorWeeks: string[] | null,
 *   line: string | null
 * }} WeekFourCheckResult
 *
 * @param {TouchedWeekSlice[]} touchedWeeksAscending  every week that was `touched` per historyStatus.js,
 *   in ascending week-key order, up to and including the most recent touched week. Weeks with status
 *   'empty' are NOT included.
 */
export function weekFourCheck(touchedWeeksAscending) {
  const n = touchedWeeksAscending.length;
  const due = n > 0 && n % 4 === 0;
  if (!due) {
    return { due: false, outcome: null, checkNumber: null, currentTotal: null, priorTotal: null, currentWeeks: [], priorWeeks: null, line: null };
  }

  const checkNumber = n / 4;
  const current = touchedWeeksAscending.slice(n - 4, n);
  const currentWeeks = current.map(w => w.week);
  const laneASum = w => (w.metrics.replies ?? 0) + (w.metrics.calls_booked ?? 0);
  const currentTotal = current.reduce((s, w) => s + laneASum(w), 0);
  const bothNullCount = current.filter(w => w.metrics.replies == null && w.metrics.calls_booked == null).length;

  if (bothNullCount >= 2) {
    return {
      due: true, outcome: 'sparse', checkNumber, currentTotal, priorTotal: null, currentWeeks, priorWeeks: null,
      line: `Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something.`
    };
  }

  if (checkNumber === 1) {
    return {
      due: true, outcome: 'baseline', checkNumber, currentTotal, priorTotal: null, currentWeeks, priorWeeks: null,
      line: `Lane A (replies + calls booked) so far: ${currentTotal}. First checkpoint — nothing to compare against yet.`
    };
  }

  const prior = touchedWeeksAscending.slice(n - 8, n - 4);
  const priorWeeks = prior.map(w => w.week);
  const priorTotal = prior.reduce((s, w) => s + laneASum(w), 0);
  const priorBothNull = prior.filter(w => w.metrics.replies == null && w.metrics.calls_booked == null).length;

  if (priorBothNull >= 2) {
    return {
      due: true, outcome: 'sparse', checkNumber, currentTotal, priorTotal: null, currentWeeks, priorWeeks: null,
      line: `Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something.`
    };
  }

  let outcome, line;
  if (currentTotal === 0) {
    outcome = 'zero';
    line = priorTotal === 0
      ? `Lane A (replies + calls booked): 0 this period, same as the one before.`
      : `Lane A (replies + calls booked): 0 this period, down from ${priorTotal}.`;
  } else if (currentTotal > priorTotal) {
    outcome = 'up';
    line = `Lane A (replies + calls booked): ${currentTotal} this period, up from ${priorTotal}.`;
  } else if (currentTotal < priorTotal) {
    outcome = 'down';
    line = `Lane A (replies + calls booked): ${currentTotal} this period, down from ${priorTotal}.`;
  } else {
    outcome = 'flat';
    line = `Lane A (replies + calls booked): ${currentTotal} this period, same as the one before.`;
  }

  return { due: true, outcome, checkNumber, currentTotal, priorTotal, currentWeeks, priorWeeks, line };
}
