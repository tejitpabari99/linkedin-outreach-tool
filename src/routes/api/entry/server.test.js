import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  dateToWeekKey: vi.fn(),
  isValidWeekKey: vi.fn(),
  readWeek: vi.fn(),
  writeWeek: vi.fn(),
  parseDiaryEntry: vi.fn()
}));

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  dateToWeekKey: mocks.dateToWeekKey,
  isValidWeekKey: mocks.isValidWeekKey,
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek
}));
vi.mock('$lib/parse.js', () => ({ parseDiaryEntry: mocks.parseDiaryEntry }));

import { POST } from './+server.js';

const cfg = { timezone: 'America/Los_Angeles' };
const proposed = { counts: { invites: 6 }, metrics: {} };
const ignored = { counts: [], metrics: [] };

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

describe('POST /api/entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.dateToWeekKey.mockReturnValue('2026-W36');
    mocks.isValidWeekKey.mockReturnValue(true);
    mocks.readWeek.mockReturnValue({ week: '2026-W36', entries: [] });
    mocks.parseDiaryEntry.mockResolvedValue({ status: 'ok', proposed, ignored });
  });

  it('persists a valid worker result as a pending preview and returns 200', async () => {
    const response = await POST({
      request: requestWith({ date: '2026-09-02', text: 'sent 6 invites' })
    });
    const result = await responseBody(response);

    expect(result.status).toBe(200);
    expect(result.body.week).toBe('2026-W36');
    expect(result.body.entry).toMatchObject({
      date: '2026-09-02',
      text: 'sent 6 invites',
      parseStatus: 'pending',
      parseError: null,
      proposed,
      ignored,
      applied: null
    });
    expect(mocks.parseDiaryEntry).toHaveBeenCalledWith({ text: 'sent 6 invites', config: cfg });
    expect(mocks.readWeek).toHaveBeenCalledTimes(2);
    expect(mocks.writeWeek).toHaveBeenCalledTimes(2);
  });

  it('returns 200 and preserves verbatim text when parsing is unavailable', async () => {
    const text = '  sent 6 invites\r\nverbatim  ';
    mocks.parseDiaryEntry.mockResolvedValue({ status: 'failed', reason: 'config_missing' });

    const response = await POST({ request: requestWith({ date: '2026-09-02', text }) });
    const result = await responseBody(response);

    expect(result.status).toBe(200);
    expect(result.body.entry).toMatchObject({
      text,
      parseStatus: 'failed',
      parseError: 'config_missing'
    });
    const persistedWeek = mocks.writeWeek.mock.calls.at(-1)[1];
    expect(persistedWeek.entries[0].text).toBe(text);
  });

  it.each([
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '0000-01-01',
    '9999-12-31',
    'not-a-date'
  ])('rejects invalid calendar date %s without writing', async (date) => {
    const response = await POST({ request: requestWith({ date, text: 'x' }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid or missing "date" (expected a real YYYY-MM-DD calendar date)'
    });
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('accepts a real calendar date and writes it', async () => {
    mocks.dateToWeekKey.mockReturnValue('2026-W35');

    const response = await POST({
      request: requestWith({ date: '2026-08-24', text: 'valid entry' })
    });

    expect(response.status).toBe(200);
    expect(mocks.dateToWeekKey).toHaveBeenCalledWith(
      new Date('2026-08-24T12:00:00Z'),
      'America/Los_Angeles'
    );
    expect(mocks.writeWeek).toHaveBeenCalled();
  });

  it('rejects an invalid derived week key as defense in depth', async () => {
    mocks.dateToWeekKey.mockReturnValue('999-W01');
    mocks.isValidWeekKey.mockReturnValue(false);

    const response = await POST({
      request: requestWith({ date: '2026-01-01', text: 'x' })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid or missing "date"' });
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('rejects empty or whitespace-only text', async () => {
    for (const text of ['', '   ']) {
      const response = await POST({ request: requestWith({ date: '2026-09-02', text }) });
      expect(response.status).toBe(400);
    }
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('rejects text longer than 10,000 characters', async () => {
    const response = await POST({
      request: requestWith({ date: '2026-09-02', text: 'x'.repeat(10_001) })
    });

    expect(response.status).toBe(400);
    expect(mocks.writeWeek).not.toHaveBeenCalled();
  });

  it('writes the full pending entry before waiting for the parser', async () => {
    let resolveParse;
    mocks.parseDiaryEntry.mockReturnValue(new Promise((resolve) => {
      resolveParse = resolve;
    }));
    const text = `  ${'verbatim '.repeat(100)}\r\n`;

    const postPromise = POST({ request: requestWith({ date: '2026-09-02', text }) });
    await vi.waitFor(() => expect(mocks.parseDiaryEntry).toHaveBeenCalledTimes(1));

    expect(mocks.writeWeek).toHaveBeenCalledTimes(1);
    const [weekKey, weekAtFirstWrite] = mocks.writeWeek.mock.calls[0];
    expect(weekKey).toBe('2026-W36');
    expect(weekAtFirstWrite.entries[0]).toMatchObject({
      date: '2026-09-02',
      text,
      parseStatus: 'pending',
      parseError: null,
      proposed: null,
      ignored: null,
      applied: null
    });

    resolveParse({ status: 'ok', proposed, ignored });
    await postPromise;
  });

  it('uses the posted date at noon UTC to select a prior ISO week', async () => {
    mocks.dateToWeekKey.mockReturnValue('2026-W20');

    const response = await POST({
      request: requestWith({ date: '2026-05-13', text: 'back dated entry' })
    });

    expect(response.status).toBe(200);
    expect(mocks.dateToWeekKey).toHaveBeenCalledWith(
      new Date('2026-05-13T12:00:00Z'),
      'America/Los_Angeles'
    );
    expect(mocks.readWeek).toHaveBeenCalledWith('2026-W20', cfg);
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W20', expect.any(Object));
  });
});
