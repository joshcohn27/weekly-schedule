import { describe, expect, it } from 'vitest';
import { canonicalLabel, isListed, searchGroups } from './activitySearch';

const labels = (query: string) => searchGroups(query).flatMap((g) => g.items.map((a) => a.label));

describe('searchGroups', () => {
  it('returns every activity, grouped, for an empty query', () => {
    const groups = searchGroups('');
    expect(groups.find((g) => g.group === 'League')?.items.length).toBeGreaterThan(1);
    expect(groups.find((g) => g.group === 'Not counted in tracking')).toBeTruthy();
  });

  it('filters by activity name, ignoring case', () => {
    expect(labels('swim')).toEqual(['Swim Test']);
    expect(labels('  POOL ')).toEqual(['Pool', 'Swim Test']);
  });

  it('also matches by program area, so "league" finds every league', () => {
    expect(labels('league')).toEqual(expect.arrayContaining(['League', 'CHL', 'MNL', 'MAL', 'SSL']));
  });

  it('drops groups with no matches', () => {
    expect(searchGroups('zzzz')).toEqual([]);
  });
});

describe('canonicalLabel / isListed', () => {
  it('snaps typed text that matches a listed activity to its proper spelling', () => {
    expect(canonicalLabel('  pool ')).toBe('Pool');
    expect(canonicalLabel('am hobbies')).toBe('AM Hobbies');
    expect(isListed('ssl')).toBe(true);
  });

  it('leaves write-ins alone, trimmed', () => {
    expect(canonicalLabel('  Talent Show ')).toBe('Talent Show');
    expect(isListed('Talent Show')).toBe(false);
  });
});
