import { loadConfig, ConfigError } from '$lib/config.js';
import {
  currentWeekKey,
  readWeek,
  projectWeekForConfig,
  listWeekKeys
} from '$lib/weeks.js';

const SPARKLINE_WEEKS = 12;

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

  const headlineMetric = config.metrics.find((metric) => metric.headline);
  const allKeys = listWeekKeys();
  const sparkKeys = allKeys.filter((key) => key <= weekKey).slice(-SPARKLINE_WEEKS);
  if (!sparkKeys.includes(weekKey)) sparkKeys.push(weekKey);

  const sparkline = sparkKeys.map((key) => {
    const sparkWeek =
      key === weekKey ? week : projectWeekForConfig(readWeek(key, config), config);
    return { week: key, value: sparkWeek.metrics[headlineMetric.id] ?? null };
  });

  return {
    configError: null,
    config,
    week,
    weekKey,
    sparkline,
    headlineMetricId: headlineMetric.id
  };
}
