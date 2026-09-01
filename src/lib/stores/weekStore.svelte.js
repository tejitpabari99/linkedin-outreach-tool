import { getContext, setContext } from 'svelte';
import { bumpLocalCount as bumpCount, setLocalMetric as setMetric } from '$lib/utils/applyLocal.js';

export const WEEK_STORE_KEY = 'linkedin-outreach:weekStore';

export function createWeekStore(initialWeek, initialConfig, initialAllTimeTotals = {}) {
  let week = $state(initialWeek);
  let weekKey = $state(initialWeek.week);
  let config = $state(initialConfig);
  let allTimeTotals = $state(initialAllTimeTotals ?? {});
  let historyVersion = $state(0);
  let lastDirtyWeek = $state(null);

  function markWeekDirty(weekKey) {
    lastDirtyWeek = weekKey;
    historyVersion++;
  }

  function bumpLocalCount(taskId, delta) {
    bumpCount(week.counts, taskId, delta);
  }

  function setLocalMetric(metricId, value) {
    setMetric(week.metrics, metricId, value);
  }

  function replaceWeek(nextWeek) {
    week = nextWeek;
  }

  function replaceConfig(nextConfig) {
    config = nextConfig;
  }

  function replaceAllTimeTotals(nextTotals) {
    allTimeTotals = nextTotals ?? {};
  }

  function adjustAllTimeTotal(taskId, confirmedDelta) {
    if (!Number.isInteger(confirmedDelta)) {
      throw new TypeError('Confirmed all-time total delta must be an integer');
    }
    const current = allTimeTotals[taskId] ?? 0;
    allTimeTotals[taskId] = Math.max(0, current + confirmedDelta);
  }

  return {
    get week() {
      return week;
    },
    get weekKey() {
      return weekKey;
    },
    get historyVersion() {
      return historyVersion;
    },
    get lastDirtyWeek() {
      return lastDirtyWeek;
    },
    get config() {
      return config;
    },
    get allTimeTotals() {
      return allTimeTotals;
    },
    bumpLocalCount,
    setLocalMetric,
    replaceWeek,
    replaceConfig,
    replaceAllTimeTotals,
    adjustAllTimeTotal,
    markWeekDirty
  };
}

export function provideWeekStore(store) {
  setContext(WEEK_STORE_KEY, store);
}

export function getWeekStore() {
  return getContext(WEEK_STORE_KEY);
}
