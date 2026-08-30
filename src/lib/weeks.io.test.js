import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyWeek, readWeek, writeWeek, projectWeekForConfig, WeekError } from './weeks.js';

const CONFIG = {
  tasks: [{ id: 'invites' }, { id: 'dms' }, { id: 'call_ask' }, { id: 'comments' }, { id: 'post' }],
  metrics: [{ id: 'followers' }, { id: 'profile_views' }, { id: 'impressions' }, { id: 'replies' }, { id: 'calls_booked' }]
};

describe('readWeek', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lot-weekfiles-')); });

  it("returns emptyWeek's exact shape when the file is missing", () => {
    const result = readWeek('2026-W35', CONFIG, dir);
    expect(result).toEqual(emptyWeek('2026-W35', CONFIG));
  });

  it('throws WeekError (not silently templating) for a corrupt file', () => {
    writeFileSync(join(dir, '2026-W35.json'), '{ not valid json', 'utf8');
    expect(() => readWeek('2026-W35', CONFIG, dir)).toThrow(WeekError);
  });

  it('throws WeekError for a syntactically-valid-JSON but schema-invalid file ({})', () => {
    writeFileSync(join(dir, '2026-W35.json'), '{}', 'utf8');
    expect(() => readWeek('2026-W35', CONFIG, dir)).toThrow(WeekError);
  });

  it('throws WeekError for a syntactically-valid-JSON but schema-invalid file ([])', () => {
    writeFileSync(join(dir, '2026-W35.json'), '[]', 'utf8');
    expect(() => readWeek('2026-W35', CONFIG, dir)).toThrow(WeekError);
  });

  it('throws WeekError for a syntactically-valid-JSON but schema-invalid file ("hello")', () => {
    writeFileSync(join(dir, '2026-W35.json'), '"hello"', 'utf8');
    expect(() => readWeek('2026-W35', CONFIG, dir)).toThrow(WeekError);
  });
});

describe('writeWeek + readWeek round-trip', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lot-weekfiles-')); });

  it('round-trips a week object exactly', () => {
    const week = emptyWeek('2026-W35', CONFIG);
    week.counts.invites = 6;
    writeWeek('2026-W35', week, dir);
    const reread = readWeek('2026-W35', CONFIG, dir);
    expect(reread).toEqual(week);
  });

  it('leaves no .tmp-* file behind on success', () => {
    const week = emptyWeek('2026-W35', CONFIG);
    writeWeek('2026-W35', week, dir);
    const files = readdirSync(dir);
    expect(files).toEqual(['2026-W35.json']);
    expect(files.some(f => f.includes('.tmp-'))).toBe(false);
  });

  it('rejects a week object whose "week" field does not match the target key', () => {
    const week = emptyWeek('2026-W35', CONFIG);
    expect(() => writeWeek('2026-W36', week, dir)).toThrow(WeekError);
  });
});

describe('config-vs-data drift (readWeek reconciliation, PRD §4.7)', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lot-weekfiles-')); });

  it('preserves a legacy task id and defaults a newly-added one, without persisting either', () => {
    const legacyWeek = {
      version: 1, week: '2026-W35', start: '2026-08-31', end: '2026-09-06',
      counts: { invites: 3, legacy_task: 9 },
      metrics: { followers: 100 },
      items: [], entries: []
    };
    writeFileSync(join(dir, '2026-W35.json'), JSON.stringify(legacyWeek), 'utf8');

    const result = readWeek('2026-W35', CONFIG, dir);
    expect(result.counts.legacy_task).toBe(9);       // legacy id preserved
    expect(result.counts.dms).toBe(0);                // new config id defaulted
    expect(result.metrics.profile_views).toBeNull();  // new metric id defaulted

    const projected = projectWeekForConfig(result, CONFIG);
    expect(projected.counts.legacy_task).toBeUndefined(); // dropped from the UI-facing view
    expect(result.counts.legacy_task).toBe(9);             // but readWeek's own object still has it

    const onDisk = JSON.parse(readFileSync(join(dir, '2026-W35.json'), 'utf8'));
    expect(onDisk.counts.dms).toBeUndefined(); // readWeek's reconciliation was never written back
  });
});

describe('PROJECT_ROOT / DATA_DIR resolution', () => {
  afterEach(() => {
    delete process.env.PROJECT_ROOT;
  });

  it('derives DATA_DIR from process.env.PROJECT_ROOT when set, not process.cwd()', async () => {
    const projectRootDir = mkdtempSync(join(tmpdir(), 'lot-project-root-'));
    process.env.PROJECT_ROOT = projectRootDir;
    vi.resetModules();
    const { DATA_DIR } = await import('./weeks.js');
    expect(DATA_DIR).toBe(join(projectRootDir, 'data'));
    expect(DATA_DIR.startsWith(process.cwd())).toBe(false);
  });
});
