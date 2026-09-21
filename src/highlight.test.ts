import { describe, expect, it } from 'vitest';
import { highlightFor, isHighlighted, sameHighlight } from './highlight';

const hl = (label: string, bunk: string) => highlightFor(label, bunk);

describe('click-to-highlight matching', () => {
  it('does nothing for an empty cell', () => {
    expect(hl('', 'O1')).toBeNull();
    expect(isHighlighted(hl('Pool', 'O1'), '', ['O1'])).toBe(false);
    expect(isHighlighted(null, 'Pool', ['O1'])).toBe(false);
  });

  it('lights up the same program area in every bunk, not just the same label', () => {
    const ropes = hl('Low Ropes', 'O1');
    expect(isHighlighted(ropes, 'High Ropes', ['C3'])).toBe(true);
    expect(isHighlighted(ropes, 'Low Ropes', ['T1'])).toBe(true);
    expect(isHighlighted(ropes, 'Pool', ['O1'])).toBe(false);
    const hobbies = hl('AM Hobbies', 'S2');
    expect(isHighlighted(hobbies, 'PM Hobbies', ['M4'])).toBe(true);
    const pool = hl('Pool', 'O1');
    expect(isHighlighted(pool, 'Swim Test', ['S3'])).toBe(true); // a Swim Test counts as Pool
    expect(isHighlighted(pool, 'Pool', ['S3', 'S4'])).toBe(true); // a merged block over other bunks
  });

  it('matches activities with no program area by name', () => {
    const event = hl('All-Camp Event', 'O1');
    expect(isHighlighted(event, 'All-Camp Event', ['M1'])).toBe(true);
    expect(isHighlighted(event, 'Village Day', ['M1'])).toBe(false);
    const writeIn = hl('Talent Show', 'O1');
    expect(isHighlighted(writeIn, 'Talent Show', ['T2'])).toBe(true);
    expect(isHighlighted(writeIn, 'All-Camp Event', ['T2'])).toBe(false);
  });

  it('keeps a league click inside its village', () => {
    const mohawk = hl('MNL', 'M2');
    expect(isHighlighted(mohawk, 'MNL', ['M1'])).toBe(true);
    expect(isHighlighted(mohawk, 'MAL', ['M4'])).toBe(true); // same village, same program area
    expect(isHighlighted(mohawk, 'SSL', ['S1'])).toBe(false); // another village's league
    expect(isHighlighted(mohawk, 'League', ['O1'])).toBe(false);
    const oneida = hl('League', 'O1');
    expect(isHighlighted(oneida, 'League', ['O3', 'O4'])).toBe(true);
    expect(isHighlighted(oneida, 'CHL', ['C1'])).toBe(false);
    expect(isHighlighted(oneida, 'Pool', ['O1'])).toBe(false);
  });

  it('does not limit anything else to a village', () => {
    expect(hl('Music', 'O1')?.village).toBeNull();
    expect(hl('MNL', 'M1')?.village).toBe('M');
  });

  it('knows when two highlights are the same, so a second click can clear it', () => {
    expect(sameHighlight(hl('Pool', 'O1'), hl('Swim Test', 'S1'))).toBe(true);
    expect(sameHighlight(hl('Pool', 'O1'), hl('Music', 'O1'))).toBe(false);
    expect(sameHighlight(hl('SSL', 'S1'), hl('MNL', 'M1'))).toBe(false); // league in different villages
    expect(sameHighlight(null, hl('Pool', 'O1'))).toBe(false);
  });
});
