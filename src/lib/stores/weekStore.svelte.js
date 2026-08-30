import { getContext, setContext } from 'svelte';
import { bumpLocalCount as bumpCount, setLocalMetric as setMetric } from '$lib/utils/applyLocal.js';

export const WEEK_STORE_KEY = 'linkedin-outreach:weekStore';

export function createWeekStore(initialWeek, config) {
  let week = $state(initialWeek);
  let weekKey = $state(initialWeek.week);

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
    get config() {
      return config;
    },
    bumpLocalCount,
    setLocalMetric,
    replaceWeek
  };
}

export function provideWeekStore(store) {
  setContext(WEEK_STORE_KEY, store);
}

export function getWeekStore() {
  return getContext(WEEK_STORE_KEY);
}
