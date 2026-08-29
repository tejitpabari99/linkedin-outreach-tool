import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  validateConfig: vi.fn(),
  writeConfig: vi.fn(),
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
  writeConfig: mocks.writeConfig
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

describe.sequential('POST /api/import real-disk safety', () => {
  let actualFs;
  let dataDir;
  let diskPost;
  let diskWeeks;

  beforeEach(async () => {
    actualFs = await vi.importActual('node:fs');
    dataDir = await mkdtemp(join(tmpdir(), 'lot-task14-import-'));
    vi.resetModules();
    vi.doMock('node:fs', () => actualFs);
    vi.doMock('$lib/config.js', async (importOriginal) => {
      const actual = await importOriginal();
      const configPath = join(dataDir, 'config.json');
      return {
        ...actual,
        CONFIG_PATH: configPath,
        writeConfig: (value, path = configPath) => actual.writeConfig(value, path)
      };
    });
    vi.doMock('$lib/weeks.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        DATA_DIR: dataDir,
        readWeek: (key, config, dir = dataDir) => actual.readWeek(key, config, dir),
        writeWeek: (key, value, dir = dataDir) => actual.writeWeek(key, value, dir),
        listWeekKeys: (dir = dataDir) => actual.listWeekKeys(dir)
      };
    });
    [{ POST: diskPost }, diskWeeks] = await Promise.all([
      import('./+server.js'),
      import('$lib/weeks.js')
    ]);
  });

  afterEach(() => {
    vi.doUnmock('node:fs');
    vi.doUnmock('$lib/config.js');
    vi.doUnmock('$lib/weeks.js');
    actualFs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('backs up original bytes before replacing an existing week', async () => {
    const original = week('2026-W35', 2);
    const imported = week('2026-W35', 9);
    diskWeeks.writeWeek('2026-W35', original);
    const livePath = join(dataDir, '2026-W35.json');
    const originalBytes = actualFs.readFileSync(livePath);
    const originalHash = createHash('sha256').update(originalBytes).digest('hex');

    const response = await diskPost({ request: requestWith(imported) });
    const backupRoot = join(dataDir, '.backups');
    const backupDirs = actualFs.readdirSync(backupRoot);

    expect(response.status).toBe(200);
    expect(backupDirs).toHaveLength(1);
    const backupBytes = actualFs.readFileSync(join(backupRoot, backupDirs[0], '2026-W35.json'));
    expect(createHash('sha256').update(backupBytes).digest('hex')).toBe(originalHash);
    expect(JSON.parse(backupBytes.toString('utf8'))).toEqual(original);
    expect(JSON.parse(actualFs.readFileSync(livePath, 'utf8'))).toEqual(imported);
  });

  it('validates before backup or write, leaving the original untouched', async () => {
    const original = week('2026-W35', 2);
    diskWeeks.writeWeek('2026-W35', original);
    const livePath = join(dataDir, '2026-W35.json');
    const before = actualFs.readFileSync(livePath);
    const invalid = week('2026-W35', 99);
    delete invalid.entries;

    const response = await diskPost({ request: requestWith(invalid) });

    expect(response.status).toBe(400);
    expect(actualFs.existsSync(join(dataDir, '.backups'))).toBe(false);
    expect(actualFs.readFileSync(livePath)).toEqual(before);
  });

  it('rejects a mismatched bundle key before writing any week or backup', async () => {
    const response = await diskPost({
      request: requestWith({
        weeks: {
          '2026-W34': week('2026-W34'),
          '2026-W35': week('2026-W30')
        }
      })
    });

    expect(response.status).toBe(400);
    expect(actualFs.existsSync(join(dataDir, '2026-W34.json'))).toBe(false);
    expect(actualFs.existsSync(join(dataDir, '.backups'))).toBe(false);
  });

  it('rejects a traversing bundle key without copying or writing outside the data directory', async () => {
    const escapedPath = join(dataDir, '..', '..', 'evil.json');
    actualFs.rmSync(escapedPath, { force: true });

    const response = await diskPost({
      request: requestWith({ weeks: { '../../evil': week('2026-W35') } })
    });

    expect(response.status).toBe(400);
    expect(actualFs.existsSync(escapedPath)).toBe(false);
    expect(actualFs.existsSync(join(dataDir, '.backups'))).toBe(false);
  });

  it('rejects a week missing version before writing it', async () => {
    const invalid = week('2026-W35');
    delete invalid.version;

    const response = await diskPost({ request: requestWith(invalid) });

    expect(response.status).toBe(400);
    expect(actualFs.existsSync(join(dataDir, '2026-W35.json'))).toBe(false);
    expect(actualFs.existsSync(join(dataDir, '.backups'))).toBe(false);
  });
});
