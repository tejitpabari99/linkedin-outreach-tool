import { describe, expect, it } from 'vitest';
import {
  GRADIENT_COLOR_ROLES,
  gradientStops,
  middleStopPosition,
  progressPct,
  progressPercent
} from './progress.js';

describe('progressPct', () => {
  it.each([
    [-5, 10, 0],
    [0, 10, 0],
    [4, 10, 40],
    [10, 10, 100],
    [15, 10, 100]
  ])('maps count %s and target %s to %s%%', (count, target, expected) => {
    expect(progressPct(count, target)).toBe(expected);
    expect(progressPercent(count, target)).toBe(expected);
  });

  it('treats a non-positive target as complete for a non-negative count without NaN or Infinity', () => {
    expect(progressPct(0, 0)).toBe(100);
    expect(progressPct(4, 0)).toBe(100);
    expect(progressPct(-1, 0)).toBe(0);
    expect(Number.isFinite(progressPct(0, 0))).toBe(true);
  });
});

describe('gradientStops', () => {
  it('uses linePct as the middle guide-stop position', () => {
    expect(middleStopPosition(35)).toBe(35);
    expect(gradientStops(35).guide.position).toBe(35);
    expect(gradientStops(80).guide.position).toBe(80);
  });

  it('keeps the low, guide, and complete color roles identical across task bars', () => {
    const first = gradientStops(35);
    const second = gradientStops(80);

    expect(first.low).toEqual(second.low);
    expect(first.guide.colorRole).toBe(second.guide.colorRole);
    expect(first.guide.colorToken).toBe(second.guide.colorToken);
    expect(first.complete).toEqual(second.complete);
    expect(GRADIENT_COLOR_ROLES).toEqual({ low: 'info', guide: 'accent', complete: 'warning' });
  });

  it('never uses a grey role or token for completion', () => {
    const completion = gradientStops(75).complete;
    expect(`${completion.colorRole} ${completion.colorToken}`.toLowerCase()).not.toContain('grey');
    expect(`${completion.colorRole} ${completion.colorToken}`.toLowerCase()).not.toContain('gray');
  });
});
