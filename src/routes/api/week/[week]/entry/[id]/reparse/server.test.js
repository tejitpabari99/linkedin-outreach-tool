import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readWeek: vi.fn(),
  writeWeek: vi.fn(),
  parseDiaryEntry: vi.fn()
}));

vi.mock('$lib/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('$lib/weeks.js', () => ({
  readWeek: mocks.readWeek,
  writeWeek: mocks.writeWeek
}));
vi.mock('$lib/parse.js', () => ({ parseDiaryEntry: mocks.parseDiaryEntry }));

import { POST } from './+server.js';

const cfg = { tasks: [], metrics: [] };
const params = { week: '2026-W35', id: 'entry-1' };
const proposed = { counts: { invites: 4 }, metrics: { followers: 120 } };
const ignored = { counts: ['unknown'], metrics: [] };

function failedWeek() {
  return {
    week: '2026-W35',
    entries: [{
      id: 'entry-1',
      text: 'stored verbatim diary text',
      parseStatus: 'failed',
      parseError: 'config_missing',
      proposed: null,
      ignored: null
    }]
  };
}

describe('POST reparse entry', () => {
  let week;

  beforeEach(() => {
    vi.clearAllMocks();
    week = failedWeek();
    mocks.loadConfig.mockReturnValue(cfg);
    mocks.readWeek.mockImplementation(() => week);
    mocks.parseDiaryEntry.mockResolvedValue({ status: 'ok', proposed, ignored });
  });

  it('turns a successful reparse into a pending preview and clears the error', async () => {
    const response = await POST({ params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry).toMatchObject({
      parseStatus: 'pending',
      parseError: null,
      proposed,
      ignored
    });
    expect(mocks.parseDiaryEntry).toHaveBeenCalledWith({
      text: 'stored verbatim diary text',
      config: cfg
    });
    expect(mocks.readWeek).toHaveBeenCalledTimes(2);
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', week);
  });

  it('keeps a repeatedly failing entry failed and updates its reason', async () => {
    mocks.parseDiaryEntry.mockResolvedValue({ status: 'failed', reason: 'network_error' });

    const response = await POST({ params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.parseStatus).toBe('failed');
    expect(body.entry.parseError).toBe('network_error');
    expect(mocks.readWeek).toHaveBeenCalledTimes(2);
    expect(mocks.writeWeek).toHaveBeenCalledWith('2026-W35', week);
  });

  it.each(['pending', 'ok', 'discarded'])(
    'returns 409 without parsing an entry in %s state',
    async (parseStatus) => {
      week.entries[0].parseStatus = parseStatus;

      const response = await POST({ params });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'Only a failed entry can be reparsed' });
      expect(mocks.parseDiaryEntry).not.toHaveBeenCalled();
      expect(mocks.writeWeek).not.toHaveBeenCalled();
    }
  );

  it('never inspects a request body and uses only the stored entry text', async () => {
    const request = { json: vi.fn(() => { throw new Error('request body must not be read'); }) };

    const response = await POST({ params, request });

    expect(response.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.parseDiaryEntry).toHaveBeenCalledWith({
      text: 'stored verbatim diary text',
      config: cfg
    });
  });

  it('returns 404 for an unknown entry id without parsing', async () => {
    const response = await POST({ params: { ...params, id: 'missing' } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Entry not found' });
    expect(mocks.parseDiaryEntry).not.toHaveBeenCalled();
  });

  it('rejects path traversal before config, disk, or parse access', async () => {
    const response = await POST({ params: { week: '../../etc', id: 'entry-1' } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid week key' });
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.readWeek).not.toHaveBeenCalled();
    expect(mocks.parseDiaryEntry).not.toHaveBeenCalled();
  });
});
