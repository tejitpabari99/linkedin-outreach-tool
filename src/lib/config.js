import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

// PROJECT_ROOT must not be a path derived from import.meta.url: once this module is bundled
// by adapter-node, its file lives under build/server/chunks/... rather than src/lib, so a
// relative "../.." from the module's own location no longer points at the project root.
// process.env.PROJECT_ROOT (set by ecosystem.config.cjs) is used first in production so the
// resolved path doesn't depend on the invoking shell's cwd; process.cwd() is the documented
// fallback for `vite dev` and `vitest`, which always start with cwd = the project root.
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
export const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'config.json');

export class ConfigError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ConfigError';
    this.field = field;
  }
}

const ID_RE = /^[a-z][a-z0-9_]*$/;
const REQUIRED_TOP_LEVEL_KEYS = ['version', 'name', 'timezone', 'lanes', 'tasks', 'metrics', 'links'];

export function isAllowedUrl(u) {
  if (typeof u !== 'string') return false;
  if (u === '') return true;
  if (/[\\]/.test(u)) return false;
  try {
    const protocol = new URL(u).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateConfig(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('Config must be a JSON object', null);
  }

  raw = structuredClone(raw);

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in raw)) {
      throw new ConfigError(`Config is missing required field "${key}"`, key);
    }
  }

  if (!Number.isInteger(raw.version) || raw.version !== 1) {
    throw new ConfigError(`Config version must be 1 (got ${JSON.stringify(raw.version)})`, 'version');
  }

  if (typeof raw.timezone !== 'string') {
    throw new ConfigError(`Config timezone must be a string (got ${JSON.stringify(raw.timezone)})`, 'timezone');
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: raw.timezone });
  } catch {
    throw new ConfigError(`Config timezone "${raw.timezone}" is not a valid IANA timezone`, 'timezone');
  }

  if (!Array.isArray(raw.lanes)) throw new ConfigError('Config field "lanes" must be an array', 'lanes');
  const laneIds = new Set();
  for (let i = 0; i < raw.lanes.length; i++) {
    const lane = raw.lanes[i];
    if (!lane || typeof lane !== 'object') throw new ConfigError(`Lane at index ${i} must be an object`, `lanes[${i}]`);
    if (!('id' in lane)) throw new ConfigError(`Lane at index ${i} is missing "id"`, `lanes[${i}]`);
    if (!('label' in lane)) throw new ConfigError(`Lane at index ${i} is missing "label"`, `lanes[${i}]`);
    if (!ID_RE.test(lane.id)) throw new ConfigError(`Lane id "${lane.id}" must be lowercase snake_case`, `lanes[${i}].id`);
    if (laneIds.has(lane.id)) throw new ConfigError(`Duplicate lane id "${lane.id}"`, 'lanes');
    laneIds.add(lane.id);
  }

  if (!Array.isArray(raw.tasks)) throw new ConfigError('Config field "tasks" must be an array', 'tasks');
  const taskIds = new Set();
  for (let i = 0; i < raw.tasks.length; i++) {
    const task = raw.tasks[i];
    if (!task || typeof task !== 'object') throw new ConfigError(`Task at index ${i} must be an object`, `tasks[${i}]`);
    for (const field of ['id', 'lane', 'label', 'min', 'target', 'link']) {
      if (!(field in task)) {
        throw new ConfigError(`Task "${task.id ?? `#${i}`}" is missing "${field}"`, `tasks[${i}]`);
      }
    }
    if (!ID_RE.test(task.id)) throw new ConfigError(`Task id "${task.id}" must be lowercase snake_case`, `tasks[${i}].id`);
    if (taskIds.has(task.id)) throw new ConfigError(`Duplicate task id "${task.id}"`, 'tasks');
    taskIds.add(task.id);
    if (!laneIds.has(task.lane)) {
      throw new ConfigError(`Task "${task.id}" references unknown lane "${task.lane}"`, `tasks[${i}].lane`);
    }
    if (!Number.isInteger(task.min) || task.min < 0) {
      throw new ConfigError(`Task "${task.id}": "min" must be a non-negative integer (got ${task.min})`, `tasks[${i}].min`);
    }
    if (!Number.isInteger(task.target) || task.target < 0) {
      throw new ConfigError(`Task "${task.id}": "target" must be a non-negative integer (got ${task.target})`, `tasks[${i}].target`);
    }
    if (task.min > task.target) {
      throw new ConfigError(`Task "${task.id}": min (${task.min}) is greater than target (${task.target})`, `tasks[${i}]`);
    }
    if (!('linePct' in task)) task.linePct = 75;
    if (!Number.isInteger(task.linePct) || task.linePct < 1 || task.linePct > 100) {
      throw new ConfigError(`Task "${task.id}": "linePct" must be an integer from 1 to 100 (got ${JSON.stringify(task.linePct)})`, `tasks[${i}].linePct`);
    }
    if (task.link !== 'optional' && task.link !== 'required') {
      throw new ConfigError(`Task "${task.id}": "link" must be "optional" or "required" (got ${JSON.stringify(task.link)})`, `tasks[${i}].link`);
    }
  }

  if (!Array.isArray(raw.metrics)) throw new ConfigError('Config field "metrics" must be an array', 'metrics');
  const metricIds = new Set();
  let headlineCount = 0;
  for (let i = 0; i < raw.metrics.length; i++) {
    const metric = raw.metrics[i];
    if (!metric || typeof metric !== 'object') throw new ConfigError(`Metric at index ${i} must be an object`, `metrics[${i}]`);
    if (!('id' in metric)) throw new ConfigError(`Metric at index ${i} is missing "id"`, `metrics[${i}]`);
    if (!('label' in metric)) throw new ConfigError(`Metric at index ${i} is missing "label"`, `metrics[${i}]`);
    if (!ID_RE.test(metric.id)) throw new ConfigError(`Metric id "${metric.id}" must be lowercase snake_case`, `metrics[${i}].id`);
    if (metricIds.has(metric.id)) throw new ConfigError(`Duplicate metric id "${metric.id}"`, 'metrics');
    metricIds.add(metric.id);
    if (metric.headline === true) headlineCount++;
  }
  if (headlineCount !== 1) {
    throw new ConfigError(`Exactly one metric must be marked "headline": true (found ${headlineCount})`, 'metrics');
  }

  if (!Array.isArray(raw.links)) throw new ConfigError('Config field "links" must be an array', 'links');
  for (let i = 0; i < raw.links.length; i++) {
    const link = raw.links[i];
    if (!link || typeof link !== 'object') throw new ConfigError(`Link at index ${i} must be an object`, `links[${i}]`);
    if (!('label' in link)) throw new ConfigError(`Link at index ${i} is missing "label"`, `links[${i}]`);
    if (!('url' in link)) throw new ConfigError(`Link at index ${i} is missing "url"`, `links[${i}]`);
    if (!isAllowedUrl(link.url)) {
      throw new ConfigError(`Link at index ${i} must have an empty or http/https URL`, `links[${i}].url`);
    }
  }

  return raw;
}

export function loadConfig(configPath = CONFIG_PATH) {
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (err) {
    throw new ConfigError(`Failed to read config file at ${configPath}: ${err.message}`, null);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`Config file at ${configPath} contains invalid JSON: ${err.message}`, null);
  }
  return validateConfig(parsed);
}

export function writeConfig(config, configPath = CONFIG_PATH) {
  const normalized = validateConfig(config); // defensive re-validation — never persists something that wouldn't itself load cleanly
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.config.json.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmpPath, JSON.stringify(normalized, null, 2), 'utf8');
  renameSync(tmpPath, configPath); // same-directory atomic rename
}
