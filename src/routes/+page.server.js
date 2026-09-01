import { loadConfig, ConfigError } from '$lib/config.js';
import {
  currentWeekKey,
  readWeek,
  emptyWeek,
  WeekError,
  projectWeekForConfig,
  listWeekKeys,
  nextWeekKey
} from '$lib/weeks.js';
import { sumAllTimeTotals } from '$lib/utils/allTimeTotals.js';
import { summarizeWeekStatus } from '$lib/utils/historyStatus.js';
import { isoWeekKeyFromUTCDate } from '$lib/utils/isoWeek.js';
import { weekFourCheck } from '$lib/utils/weekFourCheck.js';

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
  const projectedWeeks = new Map();
  const unreadableWeekKeys = new Set();
  let totalsIncomplete = false;
  const projectedWeek = (key) => {
    if (!projectedWeeks.has(key)) {
      let raw;
      try {
        raw = readWeek(key, config);
      } catch (e) {
        if (!(e instanceof WeekError)) throw e;
        totalsIncomplete = true;
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
  const monthWeekKeys = weekKeysOverlappingMonth(year, month);
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
    totalsIncomplete,
    activityWeeks,
    weekFourCheck: weekFourResult
  };
}
