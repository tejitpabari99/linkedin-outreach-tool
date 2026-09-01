import { json } from '@sveltejs/kit';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as config from '$lib/config.js';
import { isAllowedUrl } from '$lib/config.js';
import * as weeks from '$lib/weeks.js';

function structuralCheckWeek(w) {
  const problems = [];
  if (typeof w !== 'object' || w === null || Array.isArray(w)) return ['week object must be a plain object'];
  if (typeof w.version !== 'number') problems.push('"version" must be a number');
  if (typeof w.week !== 'string' || !weeks.isValidWeekKey(w.week)) problems.push('invalid or missing "week" key');
  if (typeof w.start !== 'string') problems.push('"start" must be a string');
  if (typeof w.end !== 'string') problems.push('"end" must be a string');
  if (typeof w.counts !== 'object' || w.counts === null || Array.isArray(w.counts)) {
    problems.push('"counts" must be a plain object');
  } else if (!Object.values(w.counts).every(v => Number.isInteger(v) && v >= 0)) {
    problems.push('"counts" values must be non-negative integers');
  }
  if (typeof w.metrics !== 'object' || w.metrics === null || Array.isArray(w.metrics)) {
    problems.push('"metrics" must be a plain object');
  } else if (!Object.values(w.metrics).every(v => v === null || (Number.isFinite(v) && v >= 0))) {
    problems.push('"metrics" values must be null or non-negative finite numbers');
  }
  if (!Array.isArray(w.items)) {
    problems.push('"items" must be an array');
  } else {
    for (const [index, item] of w.items.entries()) {
      if (typeof item?.id !== 'string') problems.push(`"items[${index}].id" must be a string`);
      if (typeof item?.taskId !== 'string') problems.push(`"items[${index}].taskId" must be a string`);
      if (typeof item?.at !== 'string') problems.push(`"items[${index}].at" must be a string`);
      if (item !== null && typeof item === 'object' && Object.hasOwn(item, 'note')) {
        if (item.note !== null && typeof item.note !== 'string') {
          problems.push(`"items[${index}].note" must be a string or null`);
        } else if (typeof item.note === 'string') {
          const trimmed = item.note.trim();
          if (trimmed.length === 0) {
            item.note = null;
          } else if (trimmed.length > 4000) {
            problems.push(`"items[${index}].note" must be non-empty after trimming and at most 4000 characters`);
          }
        }
      }
      const link = item?.link;
      if (link !== null && link !== undefined && (
        typeof link !== 'object' || Array.isArray(link) ||
        typeof link.url !== 'string' || typeof link.label !== 'string' ||
        link.url === '' || !isAllowedUrl(link.url)
      )) {
        problems.push(`"items[${index}].link" must be null or { url: http/https URL, label: string }`);
      }
    }
  }
  if (!Array.isArray(w.entries)) problems.push('"entries" must be an array');
  return problems;
}

export async function POST({ request }) {
  const body = await request.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'Import body must be a JSON object' }, { status: 400 });
  }

  const problems = [];
  const isBundle = 'weeks' in body;
  let normalizedConfig;

  if (isBundle) {
    if (body.config !== undefined) {
      try {
        normalizedConfig = config.validateConfig(body.config);
      } catch (e) {
        problems.push(`config: ${e.message}`);
      }
    }
    for (const [weekKey, w] of Object.entries(body.weeks ?? {})) {
      if (!weeks.isValidWeekKey(weekKey)) problems.push(`weeks["${weekKey}"]: invalid week-map key`);
      if (weekKey !== w?.week) problems.push(`weeks["${weekKey}"]: key must match week.week`);
      for (const p of structuralCheckWeek(w)) problems.push(`weeks["${weekKey}"]: ${p}`);
    }
  } else {
    for (const p of structuralCheckWeek(body)) problems.push(p);
  }
  if (problems.length > 0) {
    return json({ error: 'Import validation failed', details: problems }, { status: 400 });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(weeks.DATA_DIR, '.backups', ts);
  const filesToBackup = [];
  if (isBundle) {
    if (body.config !== undefined && existsSync(config.CONFIG_PATH)) {
      filesToBackup.push({ src: config.CONFIG_PATH, name: 'config.json' });
    }
    for (const weekKey of Object.keys(body.weeks ?? {})) {
      const p = join(weeks.DATA_DIR, `${weekKey}.json`);
      if (existsSync(p)) filesToBackup.push({ src: p, name: `${weekKey}.json` });
    }
  } else {
    const p = join(weeks.DATA_DIR, `${body.week}.json`);
    if (existsSync(p)) filesToBackup.push({ src: p, name: `${body.week}.json` });
  }
  if (filesToBackup.length > 0) {
    mkdirSync(backupDir, { recursive: true });
    for (const f of filesToBackup) copyFileSync(f.src, join(backupDir, f.name));
  }

  const imported = { config: false, weeks: [] };
  if (isBundle) {
    if (body.config !== undefined) {
      config.writeConfig(normalizedConfig);
      imported.config = true;
    }
    for (const [weekKey, w] of Object.entries(body.weeks ?? {})) {
      weeks.writeWeek(weekKey, w);
      imported.weeks.push(weekKey);
    }
  } else {
    weeks.writeWeek(body.week, body);
    imported.weeks.push(body.week);
  }

  return json({ ok: true, imported, backup: filesToBackup.length > 0 ? `data/.backups/${ts}/` : null });
}
