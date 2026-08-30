import { getContext, setContext } from 'svelte';
import { bumpLocalCount as bumpCount, setLocalMetric as setMetric } from '$lib/utils/applyLocal.js';

export const WEEK_STORE_KEY = 'linkedin-outreach:weekStore';

export function createWeekStore(initialWeek, config) {
  let week = $state(initialWeek);
  let weekKey = $state(initialWeek.week);
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
    bumpLocalCount,
    setLocalMetric,
    replaceWeek,
    markWeekDirty
  };
}

export function provideWeekStore(store) {
  setContext(WEEK_STORE_KEY, store);
}

export function getWeekStore() {
  return getContext(WEEK_STORE_KEY);
}
