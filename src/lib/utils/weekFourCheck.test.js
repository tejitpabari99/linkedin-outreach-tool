import { describe, it, expect } from 'vitest';
import { weekFourCheck } from './weekFourCheck.js';

function w(week, replies, calls_booked) { return { week, metrics: { replies, calls_booked } }; }

describe('weekFourCheck', () => {
  it.each([0, 1, 2, 3])('n=%i is not due', (n) => {
    const weeks = Array.from({ length: n }, (_, i) => w(`2026-W0${i + 1}`, 1, 0));
    expect(weekFourCheck(weeks).due).toBe(false);
  });

  it('n=4, no nulls -> baseline, with the exact "First checkpoint" copy', () => {
    const weeks = [w('W1', 1, 0), w('W2', 0, 1), w('W3', 2, 0), w('W4', 0, 0)];
    const r = weekFourCheck(weeks);
    expect(r.due).toBe(true);
    expect(r.outcome).toBe('baseline');
    expect(r.line).toBe('Lane A (replies + calls booked) so far: 4. First checkpoint — nothing to compare against yet.');
  });

  it('n=4, 2+ both-null weeks -> sparse before the first-checkpoint baseline guard', () => {
    const current = [w('W1', null, null), w('W2', null, null), w('W3', 0, 0), w('W4', 0, 0)];
    const r = weekFourCheck(current);
    expect(r.outcome).toBe('sparse');
    expect(r.priorTotal).toBe(null);
    expect(r.checkNumber).toBe(1);
    expect(r.line).toBe('Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something.');
  });

  it('n=4, currentTotal=0 -> still baseline, NOT zero (no prior period exists)', () => {
    const weeks = [w('W1', 0, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)];
    const r = weekFourCheck(weeks);
    expect(r.outcome).toBe('baseline');
  });

  it('n=8, current > prior -> up, exact copy', () => {
    const prior = [w('W1', 1, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 1
    const current = [w('W5', 2, 0), w('W6', 1, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 3
    const r = weekFourCheck([...prior, ...current]);
    expect(r.outcome).toBe('up');
    expect(r.line).toBe('Lane A (replies + calls booked): 3 this period, up from 1.');
  });

  it('n=8, current < prior -> down, exact copy', () => {
    const prior = [w('W1', 3, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 3
    const current = [w('W5', 1, 0), w('W6', 0, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 1
    const r = weekFourCheck([...prior, ...current]);
    expect(r.outcome).toBe('down');
    expect(r.line).toBe('Lane A (replies + calls booked): 1 this period, down from 3.');
  });

  it('n=8, current === prior (both nonzero) -> flat, exact copy', () => {
    const prior = [w('W1', 2, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 2
    const current = [w('W5', 1, 1), w('W6', 0, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 2
    const r = weekFourCheck([...prior, ...current]);
    expect(r.outcome).toBe('flat');
    expect(r.line).toBe('Lane A (replies + calls booked): 2 this period, same as the one before.');
  });

  it('n=8, currentTotal=0, priorTotal>0 -> zero, "down from" copy', () => {
    const prior = [w('W1', 4, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 4
    const current = [w('W5', 0, 0), w('W6', 0, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 0
    const r = weekFourCheck([...prior, ...current]);
    expect(r.outcome).toBe('zero');
    expect(r.line).toBe('Lane A (replies + calls booked): 0 this period, down from 4.');
  });

  it('n=8, currentTotal=0, priorTotal=0 -> zero, "same as the one before" copy — the hardest string in the app', () => {
    const weeks = Array.from({ length: 8 }, (_, i) => w(`W${i + 1}`, 0, 0));
    const r = weekFourCheck(weeks);
    expect(r.outcome).toBe('zero');
    expect(r.line).toBe('Lane A (replies + calls booked): 0 this period, same as the one before.');
    // No adjective, no "unfortunately", no exclamation mark anywhere in the string.
    expect(r.line).not.toMatch(/unfortunately|unfortunately|!|sorry|bad|worse|fail/i);
  });

  it('n=8, 2+ weeks in the current window both-null -> sparse, checked before zero/up/down/flat', () => {
    const prior = [w('W1', 1, 0), w('W2', 1, 0), w('W3', 1, 0), w('W4', 1, 0)];
    const current = [w('W5', null, null), w('W6', null, null), w('W7', 0, 0), w('W8', 0, 0)];
    const r = weekFourCheck([...prior, ...current]);
    expect(r.outcome).toBe('sparse');
    expect(r.line).toBe('Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something.');
  });

  it('n=8, 2+ weeks in the prior window both-null -> sparse instead of up from 0', () => {
    const prior = [w('W1', null, null), w('W2', null, null), w('W3', null, null), w('W4', null, null)];
    const current = [w('W5', 2, 0), w('W6', 1, 0), w('W7', 0, 0), w('W8', 0, 0)];
    const r = weekFourCheck([...prior, ...current]);
    expect(r.outcome).toBe('sparse');
    expect(r.priorTotal).toBe(null);
    expect(r.priorWeeks).toBe(null);
    expect(r.line).toBe('Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something.');
  });

  it.each([5, 6, 7])('n=%i (between checkpoints) is not due', (n) => {
    const weeks = Array.from({ length: n }, (_, i) => w(`W${i + 1}`, 1, 0));
    expect(weekFourCheck(weeks).due).toBe(false);
  });

  it('a week with replies:null, calls_booked:3 does NOT count toward bothNullCount (only both-null counts)', () => {
    const current = [w('W5', null, 3), w('W6', null, 3), w('W7', 0, 0), w('W8', 0, 0)]; // 0 fully-null weeks
    const prior = [w('W1', 0, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)];
    const r = weekFourCheck([...prior, ...current]);
    expect(r.outcome).not.toBe('sparse'); // exactly 0 both-null weeks, below the >=2 threshold
  });

  it('n=12 -> checkNumber 3, currentWeeks/priorWeeks slice the correct windows by key, not just by total', () => {
    const weeks = Array.from({ length: 12 }, (_, i) => w(`W${i + 1}`, 1, 0));
    const r = weekFourCheck(weeks);
    expect(r.checkNumber).toBe(3);
    expect(r.currentWeeks).toEqual(['W9', 'W10', 'W11', 'W12']);
    expect(r.priorWeeks).toEqual(['W5', 'W6', 'W7', 'W8']);
  });
});
