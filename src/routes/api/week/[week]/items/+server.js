import { json } from '@sveltejs/kit';
import * as config from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

function invalidWeek(week) {
  return !WEEK_KEY_RE.test(week) || !weeks.isValidWeekKey(week);
}

function invalidBody(body) {
  return typeof body !== 'object' || body === null || Array.isArray(body);
}

function validateTask(cfg, taskId) {
  return cfg.tasks.some(task => task.id === taskId);
}

function readWeek(weekKey, cfg) {
  try {
    return { week: weeks.readWeek(weekKey, cfg) };
  } catch (error) {
    if (error instanceof weeks.WeekError) {
      return {
        response: json(
          { error: `Week file ${weekKey} exists but could not be parsed`, week: weekKey },
          { status: 500 }
        )
      };
    }
    throw error;
  }
}

function validationError(message) {
  return json({ error: message }, { status: 400 });
}

export async function POST({ params, request }) {
  if (invalidWeek(params.week)) return validationError('Invalid week key');
  const body = await request.json();
  if (invalidBody(body)) return validationError('Request body must be a JSON object');

  const { taskId, notes } = body;
  const cfg = config.loadConfig();
  if (!validateTask(cfg, taskId)) return validationError(`Unknown task id "${taskId}"`);
  if (!Array.isArray(notes) || notes.length < 1 || notes.length > 50) {
    return validationError('notes must be an array containing 1 to 50 values');
  }
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index];
    if (note !== null && typeof note !== 'string') {
      return validationError(`notes[${index}] must be a string or null`);
    }
    if (typeof note === 'string' && note.trim().length > 4000) {
      return validationError(`notes[${index}] must contain at most 4000 characters after trimming`);
    }
  }
  const loaded = readWeek(params.week, cfg);
  if (loaded.response) return loaded.response;

  let result;
  try {
    result = weeks.appendItems(loaded.week, { taskId, notes });
  } catch (error) {
    if (error instanceof weeks.WeekError) return validationError(error.message);
    throw error;
  }
  weeks.writeWeek(params.week, result.week);
  return json({ items: result.items, week: weeks.projectWeekForConfig(result.week, cfg) });
}

export async function DELETE({ params, request }) {
  if (invalidWeek(params.week)) return validationError('Invalid week key');
  const body = await request.json();
  if (invalidBody(body)) return validationError('Request body must be a JSON object');

  const { taskId, itemIds } = body;
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return validationError('itemIds must be a non-empty array');
  }
  if (itemIds.some(id => typeof id !== 'string' || id.length === 0)) {
    return validationError('itemIds must contain only non-empty strings');
  }
  if (new Set(itemIds).size !== itemIds.length) return validationError('itemIds must be unique');

  const cfg = config.loadConfig();
  if (!validateTask(cfg, taskId)) return validationError(`Unknown task id "${taskId}"`);
  const loaded = readWeek(params.week, cfg);
  if (loaded.response) return loaded.response;

  let result;
  try {
    result = weeks.removeItems(loaded.week, { taskId, itemIds });
  } catch (error) {
    if (error instanceof weeks.WeekError) return validationError(error.message);
    throw error;
  }
  weeks.writeWeek(params.week, result.week);
  return json({
    removedIds: result.removedIds,
    week: weeks.projectWeekForConfig(result.week, cfg)
  });
}
