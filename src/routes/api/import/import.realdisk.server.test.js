import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    ({ POST: diskPost } = await import('./+server.js'));
    diskWeeks = await import('$lib/weeks.js');
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
