import { villageOf } from './autofill';
import { AREAS, DAYS, PERIODS_PER_DAY, areaOf } from './config';
import type { Schedule } from './types';

/** Areas that have no specialist to hand a schedule to. */
const NO_SPECIALIST = ['Hobbies', 'Trips'];

export interface SpecialistBunk {
  name: string;
  /** Which time this is for the bunk in this program area, counting from the start of the session. */
  visit: number;
  /** Campers in the bunk, or null when the count is not a number. */
  campers: number | null;
}

/** One block as the specialist sees it: when it is, what it is, and who comes. */
export interface SpecialistBlock {
  /** 1-based week. */
  week: number;
  /** 0 is Sunday. */
  day: number;
  /** First period of the block, 0 to 3, and how many periods it lasts. */
  period: number;
  length: number;
  /** The activity as written on the schedule (Low Ropes, CHL, ...). */
  label: string;
  bunks: SpecialistBunk[];
}

export interface SpecialistSchedule {
  area: string;
  blocks: SpecialistBlock[];
}

/**
 * The session from each specialist's side: for every program area, every block in order, with the bunks that come and
 * which visit it is for each of them. Weeks are read in order, so a visit number counts the earlier weeks too. An area
 * with nothing on the schedule is left out.
 */
export function specialistSchedules(weeks: (Schedule | null)[]): SpecialistSchedule[] {
  const byArea = new Map<string, Map<string, SpecialistBlock>>();
  const visits = new Map<string, number>(); // "bunk name|area" -> blocks so far
  weeks.forEach((schedule, w) => {
    if (!schedule) return;
    for (const bunk of schedule.bunks) {
      const name = bunk.name.trim();
      const count = parseInt(bunk.count, 10);
      for (let day = 0; day < DAYS.length; day++) {
        let p = 0;
        while (p < PERIODS_PER_DAY) {
          const label = bunk.slots[day * PERIODS_PER_DAY + p] ?? '';
          let length = 1;
          while (label && p + length < PERIODS_PER_DAY && bunk.slots[day * PERIODS_PER_DAY + p + length] === label) length++;
          const area = label ? areaOf(label) : null;
          if (area && !NO_SPECIALIST.includes(area)) {
            const visit = (visits.get(`${name}|${area}`) ?? 0) + 1;
            visits.set(`${name}|${area}`, visit);
            const blocks = byArea.get(area) ?? new Map<string, SpecialistBlock>();
            byArea.set(area, blocks);
            const key = `${w}|${day}|${p}|${length}|${label}`;
            const block = blocks.get(key) ?? { week: w + 1, day, period: p, length, label, bunks: [] };
            blocks.set(key, block);
            block.bunks.push({ name, visit, campers: Number.isFinite(count) ? count : null });
          }
          p += length;
        }
      }
    }
  });
  return AREAS.filter((a) => byArea.has(a)).map((area) => ({
    area,
    blocks: [...(byArea.get(area) as Map<string, SpecialistBlock>).values()].sort((x, y) => x.week - y.week || x.day - y.day || x.period - y.period),
  }));
}

const ORDINALS = ['', '1st', '2nd', '3rd'];
export const ordinal = (n: number): string => ORDINALS[n] ?? `${n}th`;

/** "Period 3", or "Periods 1-2" for a double. */
export const periodText = (b: Pick<SpecialistBlock, 'period' | 'length'>): string =>
  b.length > 1 ? `Periods ${b.period + 1}-${b.period + b.length}` : `Period ${b.period + 1}`;

/** "O1, O2", or "O village" when every bunk of a village (of two or more) is there. `roster` is every bunk name of the week. */
export function bunksText(block: SpecialistBlock, roster: string[]): string {
  const here = block.bunks.map((b) => b.name);
  const out: string[] = [];
  const done = new Set<string>();
  for (const name of here) {
    const v = villageOf(name);
    if (done.has(v)) continue;
    const all = roster.filter((n) => villageOf(n) === v);
    if (all.length > 1 && all.every((n) => here.includes(n))) {
      out.push(`${v} village`);
      done.add(v);
    } else out.push(name);
  }
  return out.join(', ');
}

/** "2nd" when it is the same visit for everyone, otherwise each bunk's own: "O1 2nd, O2 3rd". */
export function visitText(block: SpecialistBlock): string {
  const first = block.bunks[0].visit;
  if (block.bunks.every((b) => b.visit === first)) return ordinal(first);
  return block.bunks.map((b) => `${b.name} ${ordinal(b.visit)}`).join(', ');
}

/** Campers in the block, or '' when some bunk has no count. */
export const campersText = (block: SpecialistBlock): number | '' =>
  block.bunks.every((b) => b.campers !== null) ? block.bunks.reduce((sum, b) => sum + (b.campers as number), 0) : '';

/** One block as it is written in a grid cell: who comes, and under it which visit it is and how many campers. */
export interface SpecialistCell {
  /** "O1, O2" or "O village", with the activity in front when it is not simply the area's name ("Low Ropes: C1, C2"). */
  who: string;
  /** "2nd visit, 22 campers", or "O1 3rd, O2 2nd, 22 campers" when the bunks are on different visits. */
  detail: string;
}

/** One week of one specialist's schedule as a grid: cells[period][day] holds the blocks in that period, usually one or none. */
export interface SpecialistWeek {
  week: number;
  cells: SpecialistCell[][][];
}

/**
 * A specialist's schedule laid out like the main schedule: a grid for each week that has anything, days across and periods
 * down. A double period is written in both of its periods.
 */
export function specialistWeeks(s: SpecialistSchedule, weeks: (Schedule | null)[]): SpecialistWeek[] {
  const out: SpecialistWeek[] = [];
  for (const b of s.blocks) {
    let grid = out.find((g) => g.week === b.week);
    if (!grid) {
      grid = { week: b.week, cells: Array.from({ length: PERIODS_PER_DAY }, () => DAYS.map(() => [] as SpecialistCell[])) };
      out.push(grid);
    }
    const roster = (weeks[b.week - 1]?.bunks ?? []).map((x) => x.name.trim());
    const same = b.bunks.every((x) => x.visit === b.bunks[0].visit);
    const campers = campersText(b);
    const cell: SpecialistCell = {
      who: `${b.label === s.area ? '' : `${b.label}: `}${bunksText(b, roster)}`,
      detail: `${visitText(b)}${same ? ' visit' : ''}${campers === '' ? '' : `, ${campers} campers`}`,
    };
    for (let p = b.period; p < b.period + b.length; p++) grid.cells[p][b.day].push(cell);
  }
  return out;
}

/** A grid cell as one line of text, for a spreadsheet: "O1, O2 (2nd visit, 22 campers)", blocks separated by "; ". */
export const cellText = (cell: SpecialistCell[]): string => cell.map((c) => `${c.who} (${c.detail})`).join('; ');

/**
 * The rows of one specialist's sheet: for each week its name, a row of days, and a row for each period.
 * A blank row separates the weeks.
 */
export function specialistRows(s: SpecialistSchedule, weeks: (Schedule | null)[]): string[][] {
  const rows: string[][] = [];
  for (const grid of specialistWeeks(s, weeks)) {
    if (rows.length > 0) rows.push([]);
    rows.push([`Week ${grid.week}`], ['', ...DAYS]);
    grid.cells.forEach((row, p) => rows.push([`Period ${p + 1}`, ...row.map(cellText)]));
  }
  return rows;
}

/** A sheet name Excel accepts: no \ / ? * [ ] :, at most 31 characters. */
export const specialistSheetName = (area: string): string => (area === 'TW UH' ? 'Time with UH' : area).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
