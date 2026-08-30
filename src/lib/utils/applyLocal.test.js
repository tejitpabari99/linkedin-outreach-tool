import { describe, expect, it } from 'vitest';
import { bumpLocalCount, setLocalMetric } from './applyLocal.js';

// Mirrors the bumpCount/setMetric cases in src/lib/weeks.apply.test.js without importing
// src/lib/weeks.js, which is server-only and pulls node:fs into its module graph.
describe('bumpLocalCount', () => {
  it('clamps at 0 instead of going negative', () => {
    const counts = { a: 2 };

    bumpLocalCount(counts, 'a', -5);

    expect(counts).toEqual({ a: 0 });
  });

  it('adds a delta to the prior value', () => {
    const counts = { a: 2 };

    bumpLocalCount(counts, 'a', 3);

    expect(counts).toEqual({ a: 5 });
  });

  it('leaves the prior value unchanged for a non-integer delta', () => {
    const counts = { a: 2 };

    bumpLocalCount(counts, 'a', 1.5);

    expect(counts).toEqual({ a: 2 });
  });

  it('starts a missing count at zero before adding', () => {
    const counts = {};

    bumpLocalCount(counts, 'a', 1);

    expect(counts).toEqual({ a: 1 });
  });
});

describe('setLocalMetric', () => {
  it('overwrites rather than adding', () => {
    const metrics = { m: 5 };

    setLocalMetric(metrics, 'm', 8);

    expect(metrics).toEqual({ m: 8 });
  });

  it('accepts null to clear a metric', () => {
    const metrics = { m: 5 };

    setLocalMetric(metrics, 'm', null);

    expect(metrics).toEqual({ m: null });
  });

  it.each([
    ['negative', -3],
    ['NaN', Number.NaN],
    ['non-number', '8']
  ])('leaves the prior value unchanged for %s input', (_label, value) => {
    const metrics = { m: 5 };

    setLocalMetric(metrics, 'm', value);

    expect(metrics).toEqual({ m: 5 });
  });
});
