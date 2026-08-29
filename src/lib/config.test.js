import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig, loadConfig, ConfigError } from './config.js';

const SEED_CONFIG = {
  version: 1,
  name: 'LinkedIn Outreach — Juno',
  timezone: 'America/Los_Angeles',
  lanes: [
    { id: 'outreach', label: 'Outreach', blurb: 'Get to data + customers' },
    { id: 'presence', label: 'Presence', blurb: 'Be worth finding' }
  ],
  tasks: [
    { id: 'invites', lane: 'outreach', label: 'Targeted connection requests', min: 10, target: 15, link: 'optional' },
    { id: 'dms', lane: 'outreach', label: 'Follow-up DMs', min: 2, target: 4, link: 'optional' },
    { id: 'call_ask', lane: 'outreach', label: 'Call asks sent', min: 1, target: 2, link: 'optional' },
    { id: 'comments', lane: 'presence', label: 'Substantive comments', min: 5, target: 10, link: 'optional' },
    { id: 'post', lane: 'presence', label: 'Posts published', min: 1, target: 1, link: 'required' }
  ],
  metrics: [
    { id: 'followers', label: 'Followers', headline: true },
    { id: 'profile_views', label: 'Profile views' },
    { id: 'impressions', label: 'Post impressions' },
    { id: 'replies', label: 'Replies from target people' },
    { id: 'calls_booked', label: 'Calls booked' }
  ],
  links: [
    { label: 'Reachouts sheet', url: '' },
    { label: 'LinkedIn notifications', url: 'https://www.linkedin.com/notifications/' },
    { label: 'Creator analytics', url: 'https://www.linkedin.com/analytics/creator/' },
    { label: 'My profile', url: '' },
    { label: 'Strategy doc', url: '' }
  ]
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function expectConfigError(fn, field) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.field).toBe(field);
  }
  expect(threw).toBe(true);
}

describe('validateConfig — happy path', () => {
  it('accepts the seed config unchanged', () => {
    const result = validateConfig(clone(SEED_CONFIG));
    expect(result.version).toBe(1);
    expect(result.tasks).toHaveLength(5);
  });
});

describe('validateConfig — missing top-level keys', () => {
  for (const key of ['version', 'name', 'timezone', 'lanes', 'tasks', 'metrics', 'links']) {
    it(`throws when "${key}" is missing`, () => {
      const bad = clone(SEED_CONFIG);
      delete bad[key];
      expectConfigError(() => validateConfig(bad), key);
    });
  }
});

describe('validateConfig — version', () => {
  it('rejects version 0', () => {
    const bad = clone(SEED_CONFIG); bad.version = 0;
    expectConfigError(() => validateConfig(bad), 'version');
  });
  it('rejects version as a string "1"', () => {
    const bad = clone(SEED_CONFIG); bad.version = '1';
    expectConfigError(() => validateConfig(bad), 'version');
  });
  it('rejects version 2', () => {
    const bad = clone(SEED_CONFIG); bad.version = 2;
    expectConfigError(() => validateConfig(bad), 'version');
  });
});

describe('validateConfig — timezone', () => {
  it('rejects an invalid IANA timezone string', () => {
    const bad = clone(SEED_CONFIG); bad.timezone = 'Americaa/Los_Angeles';
    expectConfigError(() => validateConfig(bad), 'timezone');
  });
});

describe('validateConfig — lanes', () => {
  it('rejects a duplicate lane id', () => {
    const bad = clone(SEED_CONFIG);
    bad.lanes.push({ id: 'outreach', label: 'Outreach 2' });
    expectConfigError(() => validateConfig(bad), 'lanes');
  });
  it('rejects a lane missing "label"', () => {
    const bad = clone(SEED_CONFIG);
    delete bad.lanes[1].label;
    expectConfigError(() => validateConfig(bad), 'lanes[1]');
  });
  it('rejects a lane id with bad casing', () => {
    const bad = clone(SEED_CONFIG);
    bad.lanes[0].id = 'Outreach!';
    expectConfigError(() => validateConfig(bad), 'lanes[0].id');
  });
});

describe('validateConfig — tasks', () => {
  it('rejects a duplicate task id', () => {
    const bad = clone(SEED_CONFIG);
    bad.tasks.push({ ...bad.tasks[0] });
    expectConfigError(() => validateConfig(bad), 'tasks');
  });
  it('rejects a task missing "target"', () => {
    const bad = clone(SEED_CONFIG);
    delete bad.tasks[0].target;
    expectConfigError(() => validateConfig(bad), 'tasks[0]');
  });
  it('rejects a task referencing an unknown lane', () => {
    const bad = clone(SEED_CONFIG);
    bad.tasks[0].lane = 'outreach2';
    expectConfigError(() => validateConfig(bad), 'tasks[0].lane');
  });
  it('rejects a non-integer "min"', () => {
    const bad = clone(SEED_CONFIG);
    bad.tasks[0].min = 1.5;
    expectConfigError(() => validateConfig(bad), 'tasks[0].min');
  });
  it('rejects a negative "min"', () => {
    const bad = clone(SEED_CONFIG);
    bad.tasks[0].min = -1;
    expectConfigError(() => validateConfig(bad), 'tasks[0].min');
  });
  it('rejects min greater than target', () => {
    const bad = clone(SEED_CONFIG);
    bad.tasks[0].min = 20;
    bad.tasks[0].target = 10;
    expectConfigError(() => validateConfig(bad), 'tasks[0]');
  });
  it('rejects a "link" value that is not optional/required', () => {
    const bad = clone(SEED_CONFIG);
    bad.tasks[0].link = 'yes';
    expectConfigError(() => validateConfig(bad), 'tasks[0].link');
  });
  it('rejects a task id with bad casing', () => {
    const bad = clone(SEED_CONFIG);
    bad.tasks[0].id = 'Invites!';
    expectConfigError(() => validateConfig(bad), 'tasks[0].id');
  });
});

describe('validateConfig — metrics', () => {
  it('rejects a duplicate metric id', () => {
    const bad = clone(SEED_CONFIG);
    bad.metrics.push({ ...bad.metrics[1] });
    expectConfigError(() => validateConfig(bad), 'metrics');
  });
  it('rejects a metric missing "label"', () => {
    const bad = clone(SEED_CONFIG);
    delete bad.metrics[0].label;
    expectConfigError(() => validateConfig(bad), 'metrics[0]');
  });
  it('rejects zero headline metrics', () => {
    const bad = clone(SEED_CONFIG);
    bad.metrics[0].headline = false;
    expectConfigError(() => validateConfig(bad), 'metrics');
  });
  it('rejects two headline metrics', () => {
    const bad = clone(SEED_CONFIG);
    bad.metrics[1].headline = true;
    expectConfigError(() => validateConfig(bad), 'metrics');
  });
});

describe('validateConfig — links', () => {
  it('rejects a link missing "url"', () => {
    const bad = clone(SEED_CONFIG);
    delete bad.links[0].url;
    expectConfigError(() => validateConfig(bad), 'links[0]');
  });
  it('accepts a link with an empty string url', () => {
    const ok = clone(SEED_CONFIG);
    ok.links[0].url = '';
    expect(() => validateConfig(ok)).not.toThrow();
  });
});

describe('loadConfig', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lot-config-'));
  });

  it('loads a valid config file from disk', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify(SEED_CONFIG), 'utf8');
    const result = loadConfig(path);
    expect(result.name).toBe(SEED_CONFIG.name);
  });

  it('throws a ConfigError (not a raw ENOENT) for a missing file', () => {
    const path = join(dir, 'does-not-exist.json');
    expectConfigError(() => loadConfig(path), null);
  });

  it('throws a ConfigError (not a SyntaxError) for malformed JSON', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{ not valid json', 'utf8');
    expectConfigError(() => loadConfig(path), null);
  });
});
