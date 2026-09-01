export const GRADIENT_COLOR_ROLES = Object.freeze({
  low: 'info',
  guide: 'accent',
  complete: 'warning'
});

const GRADIENT_COLOR_TOKENS = Object.freeze({
  low: 'var(--color-info)',
  guide: 'var(--color-accent)',
  complete: 'var(--color-warning)'
});

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

export function progressPct(count, target) {
  if (typeof count !== 'number' || Number.isNaN(count)) return 0;
  if (typeof target !== 'number' || Number.isNaN(target)) return 0;
  if (target <= 0) return count >= 0 ? 100 : 0;
  return clampPercent((count / target) * 100);
}

export const progressPercent = progressPct;

export function middleStopPosition(linePct) {
  if (typeof linePct !== 'number' || !Number.isFinite(linePct)) return 75;
  return clampPercent(linePct);
}

export function gradientStops(linePct) {
  return {
    low: {
      position: 0,
      colorRole: GRADIENT_COLOR_ROLES.low,
      colorToken: GRADIENT_COLOR_TOKENS.low
    },
    guide: {
      position: middleStopPosition(linePct),
      colorRole: GRADIENT_COLOR_ROLES.guide,
      colorToken: GRADIENT_COLOR_TOKENS.guide
    },
    complete: {
      position: 100,
      colorRole: GRADIENT_COLOR_ROLES.complete,
      colorToken: GRADIENT_COLOR_TOKENS.complete
    }
  };
}
