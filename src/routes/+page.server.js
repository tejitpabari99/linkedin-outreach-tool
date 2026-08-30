import { loadConfig, ConfigError } from '$lib/config.js';
import {
  currentWeekKey,
  readWeek,
  projectWeekForConfig,
  listWeekKeys,
  nextWeekKey,
  prevWeekKey,
  weekKeyToRange
} from '$lib/weeks.js';
import { isoWeekKeyFromUTCDate } from '$lib/utils/isoWeek.js';
import { summarizeWeekStatus } from '$lib/utils/historyStatus.js';
import { buildCalendarMonth } from '$lib/utils/calendarMonth.js';
import { weekFourCheck } from '$lib/utils/weekFourCheck.js';
import { mergeLogRows } from '$lib/utils/mergeLogRows.js';

const SPARKLINE_WEEKS = 12;
const HISTORY_WEEKS_MAX = 52;

function laterOf(a, b) {
  return a > b ? a : b;
}

function weekNWeeksBefore(weekKey, n) {
  const { start } = weekKeyToRange(weekKey);
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n * 7);
  return isoWeekKeyFromUTCDate(date);
}

function weekKeysBetween(startKey, endKey) {
  const keys = [];
  for (let key = startKey; key <= endKey; key = nextWeekKey(key)) keys.push(key);
  return keys;
}

function weekKeysOverlappingMonth(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return weekKeysBetween(isoWeekKeyFromUTCDate(first), isoWeekKeyFromUTCDate(last));
}

export function load() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      return {
        configError: { message: e.message, field: e.field },
        config: null,
        week: null
      };
    }
    throw e;
  }

  const weekKey = currentWeekKey(config.timezone);
  const rawWeek = readWeek(weekKey, config);
  const week = projectWeekForConfig(rawWeek, config);

  const projectedWeeks = new Map([[weekKey, week]]);
  const projectedWeek = (key) => {
    if (!projectedWeeks.has(key)) {
      projectedWeeks.set(key, projectWeekForConfig(readWeek(key, config), config));
    }
    return projectedWeeks.get(key);
  };

  const headlineMetric = config.metrics.find((metric) => metric.headline);
  const allKeys = listWeekKeys();
  const sparkKeys = allKeys.filter((key) => key <= weekKey).slice(-SPARKLINE_WEEKS);
  if (!sparkKeys.includes(weekKey)) sparkKeys.push(weekKey);

  const sparkline = sparkKeys.map((key) => ({
    week: key,
    value: projectedWeek(key).metrics[headlineMetric.id] ?? null
  }));

  const firstWeek = allKeys.find((key) => key <= weekKey) ?? weekKey;
  const windowStart = laterOf(firstWeek, weekNWeeksBefore(weekKey, HISTORY_WEEKS_MAX));
  const historyKeys = weekKeysBetween(windowStart, weekKey).slice(-HISTORY_WEEKS_MAX);
  const historyWeekData = historyKeys.map(projectedWeek);
  const historyWeeks = historyWeekData.map((historyWeek) => summarizeWeekStatus(historyWeek, config));
  const weeksCompletedCount = historyWeeks.filter((historyWeek) => historyWeek.status === 'filled').length;

  const touchedWeeks = historyWeekData
    .filter((historyWeek) => summarizeWeekStatus(historyWeek, config).touched)
    .map((historyWeek) => ({
      week: historyWeek.week,
      metrics: {
        replies: historyWeek.metrics.replies ?? null,
        calls_booked: historyWeek.metrics.calls_booked ?? null
      }
    }));
  const weekFourResult = weekFourCheck(touchedWeeks);

  const today = new Date();
  const [calYear, calMonth] = [today.getUTCFullYear(), today.getUTCMonth() + 1];
  const monthWeekKeys = weekKeysOverlappingMonth(calYear, calMonth);
  const weeksByKey = Object.fromEntries(monthWeekKeys.map((key) => [key, projectedWeek(key)]));
  const calendarMonth = buildCalendarMonth(
    calYear,
    calMonth,
    weeksByKey,
    weekKey,
    today.toISOString().slice(0, 10)
  );

  const nextWeekPreview = {
    weekKey: nextWeekKey(weekKey),
    tasks: config.tasks.map((task) => ({
      id: task.id,
      label: task.label,
      min: task.min,
      target: task.target
    }))
  };

  const prevKey = prevWeekKey(weekKey);
  const prevWeek = projectedWeek(prevKey);
  const logInitial = mergeLogRows([], [week, prevWeek]);

  return {
    configError: null,
    config,
    week,
    weekKey,
    sparkline,
    headlineMetricId: headlineMetric.id,
    historyWeeks,
    weeksCompletedCount,
    calendarMonth,
    nextWeekPreview,
    logInitial,
    logOldestLoadedWeek: prevKey,
    weekFourCheck: weekFourResult
  };
}
