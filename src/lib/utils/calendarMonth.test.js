import { describe, it, expect } from 'vitest';
import { buildCalendarMonth } from './calendarMonth.js';

describe('buildCalendarMonth', () => {
  it('always returns exactly 42 day cells, regardless of which weekday the 1st falls on', () => {
    // February 2026's 1st is a Sunday; June 2026's 1st is a Monday — two different offsets.
    expect(buildCalendarMonth(2026, 2, {}, '2026-W35', '2026-02-01').days.length).toBe(42);
    const { days } = buildCalendarMonth(2026, 6, {}, '2026-W35', '2026-06-01');
    expect(days.length).toBe(42);
    expect(days[0].date).toBe('2026-06-01');
  });

  it('marks leading/trailing days from adjacent months as inMonth: false', () => {
    const { days } = buildCalendarMonth(2026, 8, {}, '2026-W35', '2026-08-01');
    expect(days[0].inMonth).toBe(false); // grid always starts on a Monday before or on the 1st
    expect(days.at(-1).inMonth).toBe(false);
    const augustFirst = days.find(d => d.date === '2026-08-01');
    expect(augustFirst.inMonth).toBe(true);
    expect(augustFirst.isToday).toBe(true);
    expect(days.find(d => d.date === '2026-08-02').isToday).toBe(false);
  });

  it('isCurrentWeek matches the correct week key for a day in the current ISO week', () => {
    const { days } = buildCalendarMonth(2026, 8, {}, '2026-W35', '2026-08-01');
    const day = days.find(d => d.date === '2026-08-24'); // Monday of 2026-W35
    expect(day.weekKey).toBe('2026-W35');
    expect(day.isCurrentWeek).toBe(true);
  });

  it('entryCount/itemCount bucket by the entry\'s own date / item\'s at-timestamp day, not the week\'s dates', () => {
    const week = {
      week: '2026-W35',
      entries: [{ id: 'e1', date: '2026-08-25' }, { id: 'e2', date: '2026-08-25' }],
      items: [{ id: 'i1', taskId: 'post', at: '2026-08-26T14:00:00Z' }]
    };
    const { days } = buildCalendarMonth(2026, 8, { '2026-W35': week }, '2026-W35', '2026-08-01');
    const day25 = days.find(d => d.date === '2026-08-25');
    const day26 = days.find(d => d.date === '2026-08-26');
    expect(day25.entryCount).toBe(2);
    expect(day25.itemCount).toBe(0);
    expect(day26.entryCount).toBe(0);
    expect(day26.itemCount).toBe(1);
  });
});
