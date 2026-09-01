import { loadConfig, ConfigError } from '$lib/config.js';
import {
  currentWeekKey,
  readWeek,
  emptyWeek,
  WeekError,
  projectWeekForConfig,
  listWeekKeys
} from '$lib/weeks.js';
import { sumAllTimeTotals } from '$lib/utils/allTimeTotals.js';
import { buildCalendarMonth } from '$lib/utils/calendarMonth.js';
import { summarizeWeekStatus } from '$lib/utils/historyStatus.js';
import { weekFourCheck } from '$lib/utils/weekFourCheck.js';

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
  const projectedWeeks = new Map();
  const unreadableWeekKeys = new Set();
  const projectedWeek = (key) => {
    if (!projectedWeeks.has(key)) {
      let raw;
      try {
        raw = readWeek(key, config);
      } catch (e) {
        if (!(e instanceof WeekError)) throw e;
        unreadableWeekKeys.add(key);
        console.warn(`Skipping unreadable week ${key} while loading the home page: ${e.message}`);
        raw = emptyWeek(key, config);
      }
      projectedWeeks.set(key, projectWeekForConfig(raw, config));
    }
    return projectedWeeks.get(key);
  };
  const week = projectedWeek(weekKey);

  const allKeys = listWeekKeys();
  const allTimeWeeks = [];
  for (const key of new Set([...allKeys, weekKey])) {
    const allTimeWeek = projectedWeek(key);
    if (!unreadableWeekKeys.has(key)) allTimeWeeks.push(allTimeWeek);
  }
  const allTimeTotals = sumAllTimeTotals(config, allTimeWeeks);

  const touchedWeeks = allTimeWeeks
    .filter((candidate) => candidate.week <= weekKey && summarizeWeekStatus(candidate, config).touched)
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((candidate) => ({
      week: candidate.week,
      metrics: {
        replies: candidate.metrics.replies ?? null,
        calls_booked: candidate.metrics.calls_booked ?? null
      }
    }));
  const weekFourResult = weekFourCheck(touchedWeeks);

  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const year = Number(todayParts.find(({ type }) => type === 'year').value);
  const month = Number(todayParts.find(({ type }) => type === 'month').value);
  const monthWeekKeys = [...new Set(
    buildCalendarMonth(year, month, {}, weekKey, '').days.map(day => day.weekKey)
  )];
  const activityWeeks = Object.fromEntries(
    monthWeekKeys.map((key) => {
      const activityWeek = projectedWeek(key);
      return [key, {
        week: activityWeek.week,
        entries: activityWeek.entries,
        items: activityWeek.items
      }];
    })
  );

  return {
    configError: null,
    config,
    week,
    weekKey,
    allTimeTotals,
    activityWeeks,
    weekFourCheck: weekFourResult
  };
}
