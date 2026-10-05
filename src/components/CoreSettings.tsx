import {
  coreOf,
  sameVisitIn,
  visitsOf,
  withCore,
  withSameVisit,
  withVisits,
  type CoreSettings as Core,
  type Settings,
  type SharedNumbers,
  leagueOf,
} from '../autogen/settings';
import Info, { HINT } from './Info';

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
  disabled?: boolean;
  /** Village letters in the roster: league is set village by village. */
  villages?: string[];
}

type SharedKey = 'athletics' | 'ac' | 'music' | 'uh';
/** The shared areas: the name on the page, the program area, and how many bunks at once it can be set to. */
const SHARED: { key: SharedKey; name: string; area: string; atOnce: number[] }[] = [
  { key: 'athletics', name: 'Athletics', area: 'Athletics', atOnce: [1, 2, 3, 4] },
  { key: 'ac', name: 'A&C', area: 'A&C', atOnce: [1, 2, 3] },
  { key: 'music', name: 'Music', area: 'Music', atOnce: [1, 2] },
  { key: 'uh', name: 'Time with UH', area: 'TW UH', atOnce: [1, 2] },
];

/**
 * The rows of the settings table for Waterfront, league, the pool, Athletics, A&C, Music and Time with UH. They sit in
 * the same table as every other program area. Who swims together at the pool is not here: those rules are fixed.
 */
export default function CoreRows({ settings, onChange, disabled, villages = [] }: Props) {
  const core = coreOf(settings);
  const set = (patch: Partial<Core>) => onChange(withCore(settings, { ...core, ...patch }));
  const setShared = (key: SharedKey, patch: Partial<SharedNumbers>) => set({ [key]: { ...core[key], ...patch } } as Partial<Core>);
  const number = (label: string, value: number, least: number, most: number, change: (n: number) => void) => (
    <input
      type="number"
      aria-label={label}
      min={least}
      max={most}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const n = Math.round(Number(e.target.value));
        if (e.target.value !== '' && Number.isFinite(n)) change(Math.min(most, Math.max(least, n)));
      }}
    />
  );
  const often = (key: SharedKey) => {
    if (key === 'music') {
      return (
        <>
          at least {number('Music times a week', core.musicPerWeek, 0, 1, (n) => set({ musicPerWeek: n }))} a week <Info text={HINT.aWeek} />, at most{' '}
          {number('Music at most a week', core.music.maxPerWeek, 1, 2, (n) => setShared('music', { maxPerWeek: n }))} <Info text={HINT.atMost} />
        </>
      );
    }
    if (key === 'uh') {
      return (
        <>
          at least {number('Time with UH at least a session', core.uhMin, 0, 3, (n) => set({ uhMin: n, uhMax: Math.max(n, core.uhMax) }))} a session, at most{' '}
          {number('Time with UH at most a session', core.uhMax, 0, 6, (n) => set({ uhMax: n, uhMin: Math.min(n, core.uhMin) }))} <Info text={HINT.atMost} />
        </>
      );
    }
    const name = key === 'ac' ? 'A&C' : 'Athletics';
    return (
      <>
        at most {number(`${name} at most a week`, core[key].maxPerWeek, 0, 3, (n) => setShared(key, { maxPerWeek: n }))} a week <Info text={HINT.leftover} />
      </>
    );
  };

  return (
    <>
      <tr>
        <th scope="row">Waterfront</th>
        <td>
          about {number('Waterfront times a week', core.waterfrontPerWeek, 0, 3, (n) => set({ waterfrontPerWeek: n }))} a week <Info text={HINT.aWeek} />
        </td>
        <td colSpan={3} className="fixed">
          A whole village, one village at a time
        </td>
      </tr>
      <tr>
        <th scope="row">League</th>
        <td className="by-village">
          about{' '}
          {villages.length === 0
            ? number('League times a week', core.leaguePerWeek, 0, 3, (n) => set({ leaguePerWeek: n }))
            : villages.map((v) => (
                <label key={v}>
                  {v}{' '}
                  {number(`League times a week for village ${v}`, leagueOf(settings, v), 0, 3, (n) => set({ leagueByVillage: { ...core.leagueByVillage, [v]: n } }))}
                </label>
              ))}{' '}
          a week <Info text={HINT.aWeek} />
        </td>
        <td colSpan={3} className="fixed">
          A whole village, set village by village. Mohawk's are double periods. For Tusc the number is triathlon sessions.
        </td>
      </tr>
      <tr>
        <th scope="row">Pool</th>
        <td>
          at least {number('Pool times a week', core.poolPerWeek, 0, 1, (n) => set({ poolPerWeek: n, poolMaxPerWeek: Math.max(1, n, core.poolMaxPerWeek) }))} a
          week <Info text={HINT.aWeek} />, at most {number('Pool at most a week', core.poolMaxPerWeek, 1, 2, (n) => set({ poolMaxPerWeek: n }))}{' '}
          <Info text="A second swim in a week is given a whole village at a time, to the village that has swum least, when it fits." />
        </td>
        <td colSpan={3}>
          Lessons alone for an O or C bunk: the first {number('Pool lessons alone', core.poolLessons, 0, 4, (n) => set({ poolLessons: n }))} swims. Most campers
          at once: {number('Pool most campers at once', core.poolMaxCampers, 10, 500, (n) => set({ poolMaxCampers: n }))}
        </td>
      </tr>
      <tr>
        <th scope="row">Ropes</th>
        <td>exactly {number('Ropes times a session', core.ropesPerSession, 0, 2, (n) => set({ ropesPerSession: n }))} a session</td>
        <td colSpan={3}>
          At most {number('Ropes most campers at once', core.ropesMaxCampers, 5, 200, (n) => set({ ropesMaxCampers: n }))} campers at once{' '}
          <Info text="Ropes goes by people, not by bunks: bunks that are next to each other in a village go together as long as their campers add up to no more than this. A bunk bigger than the number goes alone. Low ropes first, then high ropes, each a double period." />
        </td>
      </tr>
      <tr>
        <th scope="row">Hobbies</th>
        <td>
          exactly {number('Hobbies sessions a week', core.hobbyHalfDays, 0, 3, (n) => set({ hobbyHalfDays: n }))} sessions a week{' '}
          <Info text="A session is a half-day for the whole camp. 1 is Friday morning. 2 adds Wednesday afternoon or Tuesday morning. 3 adds Sunday morning, except in week 1, when the swim tests are then. The last week of a 4-week session has one, on Monday morning." />
        </td>
        <td colSpan={3} className="fixed">
          The whole camp
        </td>
      </tr>
      <tr>
        <th scope="row">Shabbat Prep</th>
        <td colSpan={4}>
          <label>
            <input
              type="checkbox"
              aria-label="Shabbat Prep on Friday afternoon"
              checked={core.shabbatPrep}
              disabled={disabled}
              onChange={(e) => set({ shabbatPrep: e.target.checked })}
            />{' '}
            Friday afternoon, on the village's turn
          </label>{' '}
          <label>
            <input
              type="checkbox"
              aria-label="Shabbat Prep extra period"
              checked={core.shabbatPrepExtra}
              disabled={disabled || !core.shabbatPrep}
              onChange={(e) => set({ shabbatPrepExtra: e.target.checked })}
            />{' '}
            and one more period earlier that week
          </label>
        </td>
      </tr>
      <tr>
        <th scope="row">Trips</th>
        <td colSpan={4} className="fixed">
          A Tiyul or a bike trip is entered by hand on the Build tab, and the schedule is built around it.
        </td>
      </tr>
      {SHARED.map(({ key, name, area, atOnce }) => (
        <tr key={key}>
          <th scope="row">{name}</th>
          <td>{often(key)}</td>
          <td>
            <select
              aria-label={`${name} bunks at once`}
              value={core[key].atOnce}
              disabled={disabled}
              onChange={(e) => setShared(key, { atOnce: Number(e.target.value) })}
            >
              {atOnce.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </td>
          <td>{number(`${name} bunks of one village in a day`, core[key].villagePerDay, 1, 6, (n) => setShared(key, { villagePerDay: n }))}</td>
          <td>
            <input
              type="checkbox"
              aria-label={`${name} same visit number`}
              checked={sameVisitIn(settings, area)}
              disabled={disabled}
              onChange={(e) => onChange(withSameVisit(settings, area, e.target.checked))}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

/** The switch that lets bunks that share a period be one visit apart in the last week of the session. */
export function LastWeekSwitch({ settings, onChange, disabled }: Props) {
  return (
    <p>
      <label>
        <input
          type="checkbox"
          aria-label="One visit apart in the last week"
          checked={visitsOf(settings).lastWeekSlack}
          disabled={disabled}
          onChange={(e) => onChange(withVisits(settings, { ...visitsOf(settings), lastWeekSlack: e.target.checked }))}
        />{' '}
        In the last week of the session, bunks that share a period may be one visit apart.
      </label>
    </p>
  );
}
