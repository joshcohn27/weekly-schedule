import { villageOf } from './autofill';
import { areaOf } from './config';

/**
 * What the Schedule tab lights up after a block is clicked: every block in the same program area
 * (Low and High Ropes are both Ropes). Leagues are per village, so a league click only lights up
 * that village's league blocks. Activities with no program area (All-Camp Event, write-ins) match by name.
 */
export interface Highlight {
  /** The program area, or the label itself when it has none. */
  key: string;
  /** Set for leagues: only blocks that include a bunk of this village match. */
  village: string | null;
}

export const highlightFor = (label: string, bunkName: string): Highlight | null => {
  if (!label) return null;
  const area = areaOf(label);
  return { key: area ?? label, village: area === 'League' ? villageOf(bunkName) : null };
};

/** Does this block, covering these bunks, match the highlight? */
export function isHighlighted(h: Highlight | null, label: string, bunkNames: string[]): boolean {
  if (!h || !label || (areaOf(label) ?? label) !== h.key) return false;
  return h.village === null || bunkNames.some((n) => villageOf(n) === h.village);
}

export const sameHighlight = (a: Highlight | null, b: Highlight | null): boolean =>
  !!a && !!b && a.key === b.key && a.village === b.village;
