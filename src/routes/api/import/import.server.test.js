import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  validateConfig: vi.fn(),
  writeConfig: vi.fn(),
  isAllowedUrl: vi.fn(),
  isValidWeekKey: vi.fn(),
  writeWeek: vi.fn()
}));

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  copyFileSync: mocks.copyFileSync,
  mkdirSync: mocks.mkdirSync
}));
vi.mock('$lib/config.js', () => ({
  CONFIG_PATH: 'Q:\\scratch\\config\\config.json',
  validateConfig: mocks.validateConfig,
  writeConfig: mocks.writeConfig,
  isAllowedUrl: mocks.isAllowedUrl
}));
vi.mock('$lib/weeks.js', () => ({
  DATA_DIR: 'Q:\\scratch\\data',
  isValidWeekKey: mocks.isValidWeekKey,
  writeWeek: mocks.writeWeek
}));

import { POST } from './+server.js';

const cfg = {
  version: 1,
  name: 'Outreach',
  timezone: 'America/Los_Angeles',
  lanes: [],
  tasks: [],
  metrics: [],
  links: []
};

function week(key, count = 0) {
  return {
    version: 1,
    week: key,
    start: '2026-08-24',
    end: '2026-08-30',
    counts: { invites: count },
    metrics: {},
    items: [],
    entries: []
  };
}

function item(overrides = {}) {
  return {
    id: 'item-1',
    taskId: 'post',
    at: '2026-08-29T20:00:00.000Z',
    note: 'A plain note',
    link: null,
    ...overrides
  };
}

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

describe('POST /api/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
    mocks.validateConfig.mockImplementation(value => value);
    mocks.isAllowedUrl.mockImplementation(url => {
      try {
        return ['http:', 'https:'].includes(new URL(url).protocol);
      } catch {
        return false;
      }
    });
    mocks.isValidWeekKey.mockImplementation(key => /^\d{4}-W\d{2}$/.test(key));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T21:02:03.456Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('backs up an existing single week before overwriting it', async () => {
    const importedWeek = week('2026-W35', 9);
    mocks.existsSync.mockReturnValue(true);

    const result = await responseBody(await POST({ request: requestWith(importedWeek) }));
    const backupDir = join('Q:\\scratch\\data', '.backups', '2026-08-29T21-02-03-456Z');

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        imported: { config: false, weeks: ['2026-W35'] },
        backup: 'data/.backups/2026-08-29T21-02-03-456Z/'
      }
    });
    expect(mocks.mkdirSync).toHaveBeenCalledWith(backupDir, { recursive: true });
    expect(mocks.copyFileSync).toHaveBeenCalledWith(
      join('Q:\\scratch\\data', '2026-W35.json'),
      join(backupDir, '2026-W35.json')
    );
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', importedWeek);
    expect(mocks.copyFileSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeWeek.mock.invocationCallOrder[0]
    );
  });

  it('imports only bundle weeks present and leaves omitted weeks untouched', async () => {
    const body = {
      config: cfg,
      weeks: {
        '2026-W34': week('2026-W34', 3),
        '2026-W35': week('2026-W35', 4)
      }
    };
    mocks.existsSync.mockReturnValue(true);

    const result = await responseBody(await POST({ request: requestWith(body) }));

    expect(result.status).toBe(200);
    expect(result.body.imported).toEqual({ config: true, weeks: ['2026-W34', '2026-W35'] });
    expect(mocks.writeConfig).toHaveBeenCalledWith(cfg);
    expect(mocks.writeWeek.mock.calls.map(([key]) => key)).toEqual(['2026-W34', '2026-W35']);
    expect(mocks.writeWeek).not.toHaveBeenCalledWith('2026-W31', expect.anything());
    expect(mocks.writeWeek).not.toHaveBeenCalledWith('2026-W32', expect.anything());
    expect(mocks.writeWeek).not.toHaveBeenCalledWith('2026-W33', expect.anything());
  });

  it('rejects an invalid bundle config before creating backups or writing files', async () => {
    mocks.validateConfig.mockImplementation(() => {
      throw new Error('Config is missing required field "timezone"');
    });
    mocks.existsSync.mockReturnValue(true);

    const result = await responseBody(await POST({
      request: requestWith({ config: { version: 1 }, weeks: { '2026-W35': week('2026-W35') } })
    }));

    expect(result.status).toBe(400);
    expect(result.body.details).toContain('config: Config is missing required field "timezone"');
    expect(mocks.existsSync).not.toHaveBeenCalled();
    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.copyFileSync).not.toHaveBeenCalled();
    expect(mocks.writeConfig).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it.each([
    ['non-string note', { note: 42 }, '"items[0].note" must be a string'],
    ['blank note', { note: '   ' }, '"items[0].note" must be non-empty after trimming and at most 4000 characters'],
    ['oversized note', { note: 'x'.repeat(4001) }, '"items[0].note" must be non-empty after trimming and at most 4000 characters'],
    ['non-string id', { id: 1 }, '"items[0].id" must be a string'],
    ['non-string taskId', { taskId: null }, '"items[0].taskId" must be a string'],
    ['non-string at', { at: 123 }, '"items[0].at" must be a string']
  ])('rejects %s before checking targets, backups, or writes', async (_case, overrides, detail) => {
    const invalid = week('2026-W35');
    invalid.items.push(item(overrides));
    mocks.existsSync.mockReturnValue(true);

    const result = await responseBody(await POST({ request: requestWith(invalid) }));

    expect(result.status).toBe(400);
    expect(result.body.details).toContain(detail);
    expect(mocks.existsSync).not.toHaveBeenCalled();
    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.copyFileSync).not.toHaveBeenCalled();
    expect(mocks.writeConfig).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('imports legacy no-note items and historical orphan task ids unchanged', async () => {
    const imported = week('2026-W35');
    const legacy = item({ taskId: 'removed_task', link: { url: 'https://example.test/legacy', label: 'Legacy' } });
    delete legacy.note;
    imported.items.push(legacy);

    const result = await responseBody(await POST({ request: requestWith(imported) }));

    expect(result.status).toBe(200);
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', imported);
  });

  it('normalizes old bundle config before backup and persists explicit linePct defaults', async () => {
    const oldConfig = {
      ...cfg,
      lanes: [{ id: 'presence', label: 'Presence' }],
      tasks: [{ id: 'post', lane: 'presence', label: 'Posts', min: 1, target: 2, link: 'required' }],
      metrics: [{ id: 'followers', label: 'Followers', headline: true }]
    };
    const normalizedConfig = {
      ...oldConfig,
      tasks: [{ ...oldConfig.tasks[0], linePct: 75 }]
    };
    mocks.validateConfig.mockReturnValue(normalizedConfig);
    mocks.existsSync.mockReturnValue(true);

    const result = await responseBody(await POST({
      request: requestWith({ config: oldConfig, weeks: { '2026-W35': week('2026-W35') } })
    }));

    expect(result.status).toBe(200);
    expect(mocks.validateConfig).toHaveBeenCalledTimes(1);
    expect(mocks.validateConfig).toHaveBeenCalledWith(oldConfig);
    expect(mocks.writeConfig).toHaveBeenCalledWith(normalizedConfig);
    expect(mocks.validateConfig.mock.invocationCallOrder[0]).toBeLessThan(mocks.existsSync.mock.invocationCallOrder[0]);
    expect(mocks.validateConfig.mock.invocationCallOrder[0]).toBeLessThan(mocks.writeConfig.mock.invocationCallOrder[0]);
  });

  it('rejects an unsafe item link across the entire bundle before backup or write', async () => {
    const unsafe = week('2026-W35');
    unsafe.items.push(item({
      link: { url: 'javascript:alert(1)', label: 'Unsafe' }
    }));
    mocks.existsSync.mockReturnValue(true);

    const result = await responseBody(await POST({
      request: requestWith({
        weeks: {
          '2026-W34': week('2026-W34'),
          '2026-W35': unsafe
        }
      })
    }));

    expect(result.status).toBe(400);
    expect(result.body.details).toContain(
      'weeks["2026-W35"]: "items[0].link" must be null or { url: http/https URL, label: string }'
    );
    expect(mocks.existsSync).not.toHaveBeenCalled();
    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.copyFileSync).not.toHaveBeenCalled();
    expect(mocks.writeConfig).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('rejects a single week missing entries without backup or write', async () => {
    const invalid = week('2026-W35');
    delete invalid.entries;

    const result = await responseBody(await POST({ request: requestWith(invalid) }));

    expect(result).toEqual({
      status: 400,
      body: { error: 'Import validation failed', details: ['"entries" must be an array'] }
    });
    expect(mocks.existsSync).not.toHaveBeenCalled();
    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.copyFileSync).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('rejects a non-object import body', async () => {
    const result = await responseBody(await POST({ request: requestWith(null) }));

    expect(result).toEqual({
      status: 400,
      body: { error: 'Import body must be a JSON object' }
    });
    expect(mocks.existsSync).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('rejects invalid count and metric values before writing', async () => {
    const invalidCounts = week('2026-W35');
    invalidCounts.counts.invites = '6';
    const invalidMetrics = week('2026-W36');
    invalidMetrics.metrics = { replies: Number.POSITIVE_INFINITY };

    const countsResult = await responseBody(await POST({ request: requestWith(invalidCounts) }));
    const metricsResult = await responseBody(await POST({ request: requestWith(invalidMetrics) }));

    expect(countsResult.status).toBe(400);
    expect(countsResult.body.details).toContain('"counts" values must be non-negative integers');
    expect(metricsResult.status).toBe(400);
    expect(metricsResult.body.details).toContain('"metrics" values must be null or non-negative finite numbers');
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('returns backup:null when every imported target is new', async () => {
    const result = await responseBody(await POST({ request: requestWith(week('2026-W35')) }));

    expect(result.status).toBe(200);
    expect(result.body.backup).toBeNull();
    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.copyFileSync).not.toHaveBeenCalled();
    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
  });
});
