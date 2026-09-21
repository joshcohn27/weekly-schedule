import { emptySchedule, newBunk } from '../sample';
import type { Schedule, WeeksState } from '../types';
import { generateWeek, type AutoGenResult, type SessionWeeks } from './index';
import { blocksOf } from './history';

/** Same bunks, all activities blank. */
export const blankCopy = (s: Schedule): Schedule => ({
  bunks: s.bunks.map((b) => ({ ...b, id: b.id, slots: Array<string>(24).fill('') })),
  days: s.days.map((d) => ({ ...d })),
});

export interface SessionRun {
  weeks: WeeksState;
  results: AutoGenResult[];
  ms: number[];
  warnings: string[];
}

/** Generate weeks 1..sessionWeeks in order, each reading the weeks before it. */
export function runSession(roster: Schedule, seed: number, sessionWeeks: SessionWeeks = 4): SessionRun {
  const weeks: WeeksState = { current: 0, weeks: [null, null, null, null] };
  const results: AutoGenResult[] = [];
  const ms: number[] = [];
  for (let w = 1; w <= sessionWeeks; w++) {
    weeks.weeks[w - 1] = blankCopy(roster);
    const t0 = performance.now();
    const res = generateWeek({ weeks, weekIndex: w, mode: 'replace-all', sessionWeeks, seed: seed * 101 + w });
    ms.push(performance.now() - t0);
    weeks.weeks[w - 1] = res.schedule;
    results.push(res);
  }
  return { weeks, results, ms, warnings: results.flatMap((r) => r.warnings) };
}

/** Blocks of a program area a bunk has across all loaded weeks. */
export function sessionBlocks(weeks: WeeksState, name: string, area: string): number {
  let n = 0;
  for (const s of weeks.weeks) {
    const b = s?.bunks.find((x) => x.name === name);
    if (b) n += blocksOf(b.slots).filter((k) => k.area === area).length;
  }
  return n;
}

/** A roster with the given number of bunks per village letter, one grade per bunk stepping up. */
export function rosterOf(counts: Record<string, number>, grade?: (letter: string, i: number) => string): Schedule {
  const s = emptySchedule();
  for (const [letter, k] of Object.entries(counts)) {
    for (let i = 1; i <= k; i++) s.bunks.push(newBunk(`${letter}${i}`, grade ? grade(letter, i) : `${4 + i}th`, String(10 + (i % 4))));
  }
  return s;
}

export interface SessionIssue {
  kind: string;
  detail: string;
}

const labelCells = (weeks: WeeksState, name: string, label: string): number => {
  let n = 0;
  for (const s of weeks.weeks) {
    const b = s?.bunks.find((x) => x.name === name);
    if (b) n += b.slots.filter((l) => l === label).length;
  }
  return n;
};
const weeksWith = (weeks: WeeksState, names: string[], label: string): number =>
  weeks.weeks.filter((s) => s && s.bunks.some((b) => names.includes(b.name) && b.slots.includes(label))).length;

/** Areas where Mohawk and Tusc, which are over-subscribed by design, may end one block short (with a warning). */
export const MAY_BE_SHORT_BY_ONE = ['Judaics', 'Israel Education', 'Teva', 'Ceramics', 'Yoga', 'Dance', 'TW UH'];
const SHORT_NAME: Record<string, string> = { 'Israel Education': 'Israel', 'TW UH': 'Time with UH' };

/**
 * Every way a finished session misses the targets. O, C and S must hit them exactly. M and T may
 * be one block short on the rarer areas and two apart on Athletics/A&C, but only with a warning.
 * Ropes, Waterfront, league, triathlon, pool and Music are exact for everyone. An empty list means on target.
 */
export function sessionIssues(weeks: WeeksState, sessionWeeks: 3 | 4 = 4, warnings: string[] = []): SessionIssue[] {
  const first = weeks.weeks[0];
  if (!first) return [];
  const issues: SessionIssue[] = [];
  const bad = (kind: string, detail: string) => issues.push({ kind, detail });
  const village = (b: { name: string }) => b.name.charAt(0).toUpperCase();
  const villages = [...new Set(first.bunks.map(village))];
  const namesOf = (v: string) => first.bunks.filter((b) => village(b) === v).map((b) => b.name);
  const warned = (name: string, ...words: string[]) => warnings.some((w) => w.includes(name) && words.every((x) => w.includes(x)));

  const targets: [string, number][] = [
    ['Ropes', 2],
    ['Judaics', 2],
    ['Israel Education', 2],
    ['Teva', 2],
    ['Ceramics', 2],
    ['Yoga', 2],
    ['Music', sessionWeeks],
  ];
  const danceTarget: Record<string, number> = { O: 4, S: 4, C: 2, T: 2, M: 1 };
  for (const b of first.bunks) {
    const v = village(b);
    const flexible = v === 'M' || v === 'T';
    const check = (area: string, want: number, got: number) => {
      if (got === want) return;
      if (flexible && MAY_BE_SHORT_BY_ONE.includes(area) && got === want - 1) {
        if (!warned(b.name, SHORT_NAME[area] ?? area, 'short')) bad('Missing warning', `${b.name} is short on ${area} with no warning`);
        return;
      }
      bad(area, `${b.name} has ${got}, wanted ${want}`);
    };
    for (const [area, want] of targets) check(area, want, sessionBlocks(weeks, b.name, area));
    check('Dance', danceTarget[v] ?? 2, sessionBlocks(weeks, b.name, 'Dance'));

    const uh = sessionBlocks(weeks, b.name, 'TW UH');
    if (uh > 2) bad('TW UH', `${b.name} has ${uh}`);
    else if (uh < 1) check('TW UH', 1, uh);

    const ath = sessionBlocks(weeks, b.name, 'Athletics');
    const ac = sessionBlocks(weeks, b.name, 'A&C');
    const gap = ac - ath;
    if (flexible) {
      if (Math.abs(gap) > 2) bad('Athletics/A&C', `${b.name} has ${ath} and ${ac}`);
      else if (gap !== 0 && gap !== 1 && !warned(b.name, 'Athletics')) bad('Missing warning', `${b.name} has ${ath} Athletics and ${ac} A&C with no warning`);
    } else if (gap !== 0 && gap !== 1) bad('Athletics/A&C', `${b.name} has ${ath} and ${ac}`);

    if (v === 'T') {
      const tri = labelCells(weeks, b.name, 'Tusc Triathlon Training');
      if (tri < 12) bad('Tri', `${b.name} has ${tri} periods`);
    } else {
      const league = sessionBlocks(weeks, b.name, 'League');
      if (league !== 3 * sessionWeeks) bad('League', `${b.name} has ${league}`);
    }
    if (v === 'O' || v === 'C') {
      const pool = sessionBlocks(weeks, b.name, 'Pool');
      if (pool < sessionWeeks) bad('Pool', `${b.name} has ${pool}`);
    }
  }
  const wfCounts = villages.map((v) => sessionBlocks(weeks, namesOf(v)[0], 'Waterfront'));
  if (Math.max(...wfCounts) - Math.min(...wfCounts) > 1) bad('Waterfront', `villages ${villages.join('')} have ${wfCounts.join(',')}`);
  for (const v of villages) {
    if (weeksWith(weeks, namesOf(v), 'Shabbat Prep') !== (['M', 'O', 'C', 'S', 'T'].includes(v) ? 1 : 0)) bad('Shabbat Prep', `village ${v}`);
    if ('OCSM'.includes(v) && weeksWith(weeks, namesOf(v), 'Tiyul') !== 1) bad('Tiyul', `village ${v}`);
    const areas = new Set<string>();
    for (const s of weeks.weeks) for (const b of s?.bunks ?? []) for (const k of blocksOf(b.slots)) if (k.area && namesOf(v).includes(b.name)) areas.add(k.area);
    for (const area of areas) {
      if ((v === 'M' || v === 'T') && (area === 'Athletics' || area === 'A&C')) continue; // may be two apart there
      const counts = namesOf(v).map((nm) => sessionBlocks(weeks, nm, area));
      if (Math.max(...counts) - Math.min(...counts) > 1) bad('Village spread', `${v} ${area}: ${counts.join(',')}`);
    }
  }
  return issues;
}
