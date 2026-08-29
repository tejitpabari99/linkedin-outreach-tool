import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class ConfigError extends Error {
    constructor(message, field = null) {
      super(message);
      this.field = field;
    }
  }
  return {
    ConfigError,
    loadConfig: vi.fn(),
    validateConfig: vi.fn(),
    writeConfig: vi.fn()
  };
});

vi.mock('$lib/config.js', () => ({
  ConfigError: mocks.ConfigError,
  loadConfig: mocks.loadConfig,
  validateConfig: mocks.validateConfig,
  writeConfig: mocks.writeConfig
}));

import { GET, PUT } from './+server.js';

const validConfig = {
  version: 1,
  name: 'Outreach',
  timezone: 'America/Los_Angeles',
  lanes: [{ id: 'growth', label: 'Growth' }],
  tasks: [{ id: 'invites', lane: 'growth', label: 'Invites', min: 5, target: 10, link: 'optional' }],
  metrics: [{ id: 'followers', label: 'Followers', headline: true }],
  links: []
};

function requestWith(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

describe('GET/PUT /api/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue(validConfig);
    mocks.validateConfig.mockImplementation(value => value);
  });

  it('GET returns the full valid config', async () => {
    expect(await responseBody(GET())).toEqual({ status: 200, body: validConfig });
  });

  it('GET returns 500 with a readable ConfigError message', async () => {
    mocks.loadConfig.mockImplementation(() => {
      throw new mocks.ConfigError('Task "invites": min (11) is greater than target (10)', 'tasks[0]');
    });

    expect(await responseBody(GET())).toEqual({
      status: 500,
      body: { error: 'Task "invites": min (11) is greater than target (10)' }
    });
  });

  it('PUT writes validated config and a subsequent GET reflects it', async () => {
    const updated = { ...validConfig, name: 'Updated Outreach' };
    let stored = validConfig;
    mocks.writeConfig.mockImplementation(value => {
      stored = value;
    });
    mocks.loadConfig.mockImplementation(() => stored);

    expect(await responseBody(await PUT({ request: requestWith(updated) }))).toEqual({
      status: 200,
      body: { ok: true }
    });
    expect(mocks.validateConfig).toHaveBeenCalledWith(updated);
    expect(mocks.writeConfig).toHaveBeenCalledWith(updated);
    expect(await responseBody(GET())).toEqual({ status: 200, body: updated });
  });

  it('PUT returns details for invalid config without changing persisted bytes', async () => {
    const beforeBytes = JSON.stringify(validConfig, null, 2);
    const invalid = { ...validConfig, tasks: [{ id: 'invites' }] };
    mocks.validateConfig.mockImplementation(() => {
      throw new mocks.ConfigError('Task "invites" is missing "target"', 'tasks[0]');
    });

    const result = await responseBody(await PUT({ request: requestWith(invalid) }));

    expect(result).toEqual({
      status: 400,
      body: {
        error: 'Task "invites" is missing "target"',
        details: [{ field: 'tasks[0]', message: 'Task "invites" is missing "target"' }]
      }
    });
    expect(mocks.writeConfig).not.toHaveBeenCalled();
    expect(JSON.stringify(validConfig, null, 2)).toBe(beforeBytes);
  });
});
