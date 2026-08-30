import { loadConfig, ConfigError } from '$lib/config.js';
import { readWeek, projectWeekForConfig, isValidWeekKey, currentWeekKey } from '$lib/weeks.js';
import { error } from '@sveltejs/kit';

export function load({ params }) {
  if (!isValidWeekKey(params.week)) throw error(400, 'Invalid week key');
  let config;
  try { config = loadConfig(); }
  catch (e) { if (e instanceof ConfigError) return { configError: { message: e.message, field: e.field }, config: null, week: null }; throw e; }

  const raw = readWeek(params.week, config);
  const week = projectWeekForConfig(raw, config);
  return { config, week, weekKey: params.week, isCurrentWeek: params.week === currentWeekKey(config.timezone) };
}
