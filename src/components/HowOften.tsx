import Info, { HINT } from './Info';

/** The ways "how many times" can be said. Every one is two numbers underneath: the least and the most. */
export type OftenKind = 'exactly' | 'atLeast' | 'noMore' | 'between' | 'leftover';

export const OFTEN_KINDS: { kind: OftenKind; label: string }[] = [
  { kind: 'exactly', label: 'Exactly' },
  { kind: 'atLeast', label: 'At least' },
  { kind: 'noMore', label: 'No more than' },
  { kind: 'between', label: 'Between' },
  { kind: 'leftover', label: 'Leftover' },
];

export interface Often {
  min: number;
  max: number;
}

/**
 * Which way of saying it a pair of numbers is. `most` is the biggest number the area can hold, and stands for "no limit":
 * a most of `most` is "at least" (or "leftover" when the least is 0).
 */
export function kindOf({ min, max }: Often, most: number): OftenKind {
  if (min === max) return 'exactly';
  if (max >= most) return min === 0 ? 'leftover' : 'atLeast';
  return min === 0 ? 'noMore' : 'between';
}

/**
 * The numbers for saying it another way, keeping what was there as far as it still makes sense. `minTop` is the biggest
 * number the area can be given as a set number (Music can be given once a week at the most, say).
 */
export function asKind(kind: OftenKind, value: Often, most: number, minTop: number = most): Often {
  const within = (n: number, least: number, top: number): number => Math.min(top, Math.max(least, n));
  // the number the person most likely means to keep: the least when there is one, otherwise the most
  const one = value.min > 0 ? value.min : value.max < most ? value.max : Math.min(2, minTop);
  switch (kind) {
    case 'exactly':
      return { min: within(one, 0, minTop), max: within(one, 0, minTop) };
    case 'atLeast':
      return { min: within(one, 1, Math.min(minTop, most - 1)), max: most };
    case 'noMore':
      return { min: 0, max: within(value.max < most && value.max > 0 ? value.max : one, 1, most - 1) };
    case 'between': {
      const min = within(one, 1, Math.min(minTop, most - 2));
      return { min, max: within(value.max < most ? value.max : min + 1, min + 1, most - 1) };
    }
    case 'leftover':
      return { min: 0, max: most };
  }
}

/** The ways of saying it that these limits leave room for: "between" needs two numbers under the most, for one. */
export function kindsThatFit(most: number, minTop: number = most): OftenKind[] {
  const fit: OftenKind[] = ['exactly'];
  if (most >= 2 && minTop >= 1) fit.push('atLeast');
  if (most >= 2) fit.push('noMore');
  if (most >= 3 && minTop >= 1) fit.push('between');
  if (most >= 1) fit.push('leftover');
  return fit;
}

interface Props {
  /** The program area's name, for the labels a screen reader hears. */
  label: string;
  value: Often;
  /** The biggest number the area can be set to: it stands for "no limit". */
  most: number;
  onChange: (next: Often) => void;
  disabled?: boolean;
  /** Added to the number boxes' labels ("Time with UH at least a session"). */
  labelEnd?: string;
  /** What the numbers count: "a session" unless said otherwise ("a week", "in the whole session"). */
  unit?: string;
  /** The biggest set number the area can be given, when that is less than `most`. */
  minTop?: number;
  /** The ways of saying it this area can keep, when it cannot keep them all. The others are listed and greyed out. */
  can?: OftenKind[];
  /** Why the greyed-out ways are not offered, for the person pointing at one. */
  why?: string;
  /** Leave out the small "i" beside the numbers (a row with a menu for each village has one for the whole row). */
  plain?: boolean;
}

/**
 * How many times, said the same way for every program area: pick exactly, at least, no more than, between or leftover,
 * and the numbers that go with it.
 */
export default function HowOften({ label, value, most, onChange, disabled, labelEnd = '', unit = 'a session', minTop = most, can, why, plain }: Props) {
  const kind = kindOf(value, most);
  const fits = kindsThatFit(most, minTop).filter((k) => !can || can.includes(k));
  const info = (text: string) => (plain ? null : <Info text={text} />);
  const number = (name: string, n: number, least: number, top: number, change: (n: number) => void) => (
    <input
      type="number"
      aria-label={`${label} ${name}${labelEnd}`}
      min={least}
      max={top}
      value={n}
      disabled={disabled}
      onChange={(e) => {
        const typed = Math.round(Number(e.target.value));
        if (e.target.value !== '' && Number.isFinite(typed)) change(Math.min(top, Math.max(least, typed)));
      }}
    />
  );
  return (
    <span className="how-often">
      <select aria-label={`${label} how often`} value={kind} disabled={disabled} onChange={(e) => onChange(asKind(e.target.value as OftenKind, value, most, minTop))}>
        {OFTEN_KINDS.map((k) => (
          <option key={k.kind} value={k.kind} disabled={!fits.includes(k.kind) && k.kind !== kind} title={fits.includes(k.kind) ? undefined : why}>
            {k.label}
          </option>
        ))}
      </select>{' '}
      {kind === 'exactly' && (
        <>
          {number('exactly', value.min, 0, minTop, (n) => onChange({ min: n, max: n }))} {unit} {info(HINT.exactly)}
        </>
      )}
      {kind === 'atLeast' && (
        <>
          {number('at least', value.min, 1, Math.min(minTop, most - 1), (n) => onChange({ min: n, max: most }))} {unit} {info(HINT.atLeast)}
        </>
      )}
      {kind === 'noMore' && (
        <>
          {number('at most', value.max, 1, most - 1, (n) => onChange({ min: 0, max: n }))} {unit} {info(HINT.noMore)}
        </>
      )}
      {kind === 'between' && (
        <>
          {number('at least', value.min, 1, Math.min(minTop, most - 2), (n) => onChange({ min: n, max: Math.max(n + 1, value.max) }))} and{' '}
          {number('at most', value.max, 2, most - 1, (n) => onChange({ max: n, min: Math.min(n - 1, value.min) }))} {unit} {info(HINT.atMost)}
        </>
      )}
      {kind === 'leftover' && (
        <>
          whatever periods are left {info(HINT.leftoverKind)}
        </>
      )}
    </span>
  );
}
