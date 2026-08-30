const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

export function debounce(fn, waitMs) {
  let timeoutId;

  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn.apply(this, args);
    }, waitMs);
  };
}

export function formatWeekRange(weekKey) {
  const match = typeof weekKey === 'string' ? weekKey.match(WEEK_KEY_RE) : null;
  if (!match) throw new Error(`Invalid week key "${weekKey}"`);

  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) throw new Error(`Invalid week key "${weekKey}"`);

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + (week - 1) * 7);

  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  if (thursday.getUTCFullYear() !== isoYear) {
    throw new Error(`Invalid week key "${weekKey}"`);
  }

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10)
  };
}
