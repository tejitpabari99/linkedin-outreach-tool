import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  dataDir: '',
  parseDiaryEntry: vi.fn(),
  loadConfig: vi.fn(),
  validateConfig: vi.fn(value => value),
  writeConfig: vi.fn()
}));

vi.mock('$lib/parse.js', () => ({ parseDiaryEntry: state.parseDiaryEntry }));
vi.mock('$lib/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    get CONFIG_PATH() { return join(state.dataDir, 'config.json'); },
    loadConfig: state.loadConfig,
    validateConfig: state.validateConfig,
    writeConfig: state.writeConfig
  };
});
vi.mock('$lib/weeks.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    get DATA_DIR() { return state.dataDir; },
    readWeek: vi.fn((key, config, dir = state.dataDir) => actual.readWeek(key, config, dir)),
    writeWeek: vi.fn((key, week, dir = state.dataDir) => actual.writeWeek(key, week, dir)),
    listWeekKeys: vi.fn((dir = state.dataDir) => actual.listWeekKeys(dir))
  };
});

import { POST as createEntry } from './+server.js';
import { GET as getWeek, PATCH as patchWeek } from '../week/[week]/+server.js';
import { POST as applyEntry } from '../week/[week]/entry/[id]/apply/+server.js';
import { POST as discardEntry } from '../week/[week]/entry/[id]/discard/+server.js';
import { DELETE as deleteEntry } from '../week/[week]/entry/[id]/+server.js';
import { POST as createItem } from '../week/[week]/items/+server.js';
import { PATCH as patchItem } from '../week/[week]/items/[id]/+server.js';
import { GET as getConfig, PUT as putConfig } from '../config/+server.js';
import { GET as exportWeek } from '../export/+server.js';
import { GET as exportAll } from '../export/all/+server.js';
import { POST as importData } from '../import/+server.js';
import { GET as getWeeks } from '../weeks/+server.js';
import * as weeks from '$lib/weeks.js';

const CONFIG = {
  version: 1,
  name: 'Outreach',
  timezone: 'America/Los_Angeles',
  lanes: [
    { id: 'outreach', label: 'Outreach' },
    { id: 'presence', label: 'Presence' }
  ],
  tasks: [
    { id: 'invites', lane: 'outreach', label: 'Invites', min: 0, target: 10, link: 'optional' },
    { id: 'post', lane: 'presence', label: 'Post', min: 0, target: 1, link: 'required' }
  ],
  metrics: [{ id: 'followers', label: 'Followers', headline: true }],
  links: []
};

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

function urlFor(path) {
  return new URL(`http://localhost${path}`);
}

async function expectSuccess(responseOrPromise) {
  const response = await responseOrPromise;
  expect(response.status).toBeLessThan(400);
  return response;
}

let fetchSpy;

beforeEach(() => {
  state.dataDir = mkdtempSync(join(tmpdir(), 'lot-task14-entry-'));
  vi.clearAllMocks();
  state.loadConfig.mockReturnValue(CONFIG);
  state.validateConfig.mockImplementation(value => value);
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  rmSync(state.dataDir, { recursive: true, force: true });
});

describe('POST /api/entry cross-cutting behavior', () => {
  it('durably writes exact verbatim text before the parser promise resolves', async () => {
    state.parseDiaryEntry.mockReturnValue(new Promise(() => {}));
    const text = '  exact first line\r\nsecond line with trailing spaces  ';

    void createEntry({ request: requestWith({ date: '2026-09-02', text }) });

    const weekPath = join(state.dataDir, '2026-W36.json');
    await vi.waitFor(() => expect(existsSync(weekPath)).toBe(true));
    const persisted = JSON.parse(readFileSync(weekPath, 'utf8'));

    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0]).toMatchObject({ text, parseStatus: 'pending' });
    expect(persisted.entries[0].text).toBe(text);
    expect(state.parseDiaryEntry).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves both entries when overlapping parses resolve out of order', async () => {
    let resolveFirstParse;
    state.parseDiaryEntry
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirstParse = resolve;
      }))
      .mockResolvedValueOnce({
        status: 'ok',
        proposed: { counts: { invites: 2 }, metrics: {} },
        ignored: { counts: [], metrics: [] }
      });

    const firstPost = createEntry({
      request: requestWith({ date: '2026-09-02', text: 'first overlapping entry' })
    });
    await vi.waitFor(() => expect(state.parseDiaryEntry).toHaveBeenCalledTimes(1));

    await createEntry({
      request: requestWith({ date: '2026-09-02', text: 'second overlapping entry' })
    });
    resolveFirstParse({
      status: 'ok',
      proposed: { counts: { invites: 1 }, metrics: {} },
      ignored: { counts: [], metrics: [] }
    });
    await firstPost;

    const persisted = JSON.parse(readFileSync(join(state.dataDir, '2026-W36.json'), 'utf8'));
    expect(persisted.entries.map(entry => entry.text)).toEqual([
      'first overlapping entry',
      'second overlapping entry'
    ]);
  });

  it('keeps every non-LLM API route usable without calling the parser', async () => {
    const weekKey = '2026-W35';
    const seeded = weeks.emptyWeek(weekKey, CONFIG);
    seeded.entries.push(
      {
        id: 'apply-me', text: 'apply', parseStatus: 'pending',
        proposed: { counts: { invites: 2 }, metrics: { followers: 12 } }, applied: null
      },
      {
        id: 'discard-me', text: 'discard', parseStatus: 'pending',
        proposed: { counts: {}, metrics: {} }, applied: null
      },
      { id: 'delete-me', text: 'delete', parseStatus: 'failed', proposed: null, applied: null }
    );
    weeks.writeWeek(weekKey, seeded);
    vi.clearAllMocks();

    await expectSuccess(getWeek({ params: { week: weekKey } }));
    await expectSuccess(patchWeek({
      params: { week: weekKey },
      request: requestWith({ counts: { invites: 1 }, metrics: { followers: 10 } })
    }));

    const itemResponse = await expectSuccess(createItem({
      params: { week: weekKey },
      request: requestWith({ taskId: 'post', link: null })
    }));
    const { item } = await itemResponse.json();
    await expectSuccess(patchItem({
      params: { week: weekKey, id: item.id },
      request: requestWith({ link: { url: 'https://example.test/post', label: 'Post' } })
    }));

    await expectSuccess(applyEntry({ params: { week: weekKey, id: 'apply-me' } }));
    await expectSuccess(discardEntry({ params: { week: weekKey, id: 'discard-me' } }));
    await expectSuccess(deleteEntry({ params: { week: weekKey, id: 'delete-me' } }));
    await expectSuccess(getConfig());
    await expectSuccess(putConfig({ request: requestWith(CONFIG) }));
    await expectSuccess(exportWeek({ url: urlFor(`/api/export?week=${weekKey}`) }));
    await expectSuccess(exportAll());

    await expectSuccess(importData({ request: requestWith(weeks.emptyWeek('2026-W34', CONFIG)) }));
    await expectSuccess(getWeeks({ url: urlFor('/api/weeks?before=2026-W36') }));

    expect(state.parseDiaryEntry).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 200 with config_missing while preserving text when the LLM is unavailable', async () => {
    state.parseDiaryEntry.mockResolvedValue({ status: 'failed', reason: 'config_missing' });
    const text = '  unavailable worker still preserves this\r\nverbatim  ';

    const response = await createEntry({ request: requestWith({ date: '2026-09-02', text }) });
    const body = await response.json();
    const persisted = JSON.parse(readFileSync(join(state.dataDir, '2026-W36.json'), 'utf8'));

    expect(response.status).toBe(200);
    expect(body.entry).toMatchObject({ text, parseStatus: 'failed', parseError: 'config_missing' });
    expect(persisted.entries[0]).toMatchObject({ text, parseStatus: 'failed', parseError: 'config_missing' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
