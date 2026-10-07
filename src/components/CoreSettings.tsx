import {
  coreOf,
  sameVisitIn,
  visitsOf,
  withCore,
  shabbatWeeksOf,
  withSameVisit,
  withShabbatWeek,
  withVisits,
  type CoreSettings as Core,
  type Settings,
  type SharedNumbers,
  leagueOf,
} from '../autogen/settings';
import { villageName } from '../autofill';
import HowOften from './HowOften';
import Info, { HINT } from './Info';

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
  disabled?: boolean;
  /** Village letters in the roster: league is set village by village. */
  villages?: string[];
  /** How many weeks the session has: Shabbat is set for those weeks only. */
  sessionWeeks?: number;
}

type SharedKey = 'athletics' | 'ac' | 'music' | 'uh';
/** The most Time with UH can be set to in a session: it stands for "no limit". */
const UH_MOST = 6;
/** The shared areas: the name on the page, the program area, and how many bunks at once it can be set to. */
const SHARED: { key: SharedKey; name: string; area: string; atOnce: number[] }[] = [
  { key: 'athletics', name: 'Athletics', area: 'Athletics', atOnce: [1, 2, 3] },
  { key: 'ac', name: 'A&C', area: 'A&C', atOnce: [1, 2, 3] },
  { key: 'music', name: 'Music', area: 'Music', atOnce: [1, 2] },
  { key: 'uh', name: 'Time with UH', area: 'TW UH', atOnce: [1, 2] },
];

/**
 * The rows of the settings table for Waterfront, league, the pool, Athletics, A&C, Music and Time with UH. They sit in
 * the same table as every other program area. Who swims together at the pool is not here: those rules are fixed.
 */
export default function CoreRows({ settings, onChange, disabled, villages = [], sessionWeeks = 4 }: Props) {
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
      return <HowOften label="Time with UH" labelEnd=" a session" value={{ min: core.uhMin, max: core.uhMax }} most={UH_MOST} disabled={disabled} onChange={(next) => set({ uhMin: next.min, uhMax: next.max })} />;
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
                  {villageName(v)}{' '}
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
          exactly {number('Hobbies sessions in the whole session', core.hobbySessions, 0, 9, (n) => set({ hobbySessions: n }))} sessions in the whole
          session{' '}
          <Info text="A hobby session is a half-day for the whole camp. This is the total for the entire session, not a number a week. They are shared out like this: every week gets its Friday morning first (the last week of a 4-week session gets Monday morning instead, and that is all it can have); then a midweek one each week, Wednesday afternoon or Tuesday morning; then Sunday mornings from week 2 on. So 4 is one a week, 7 is two a week and one in the last week, and 9 is the most a 4-week session holds (8 for a 3-week one)." />
        </td>
        <td colSpan={3} className="fixed">
          The whole camp
        </td>
      </tr>
      <tr>
        <th scope="row">Shabbat Prep</th>
        <td colSpan={4}>
          In a village's Shabbat week: the Friday afternoon double always, and exactly{' '}
          {number('Shabbat Prep extra periods', core.shabbatPrepExtra, 0, 2, (n) => set({ shabbatPrepExtra: n }))} more single periods earlier that
          week{' '}
          <Info text="The Friday afternoon double is always there in a village's Shabbat week. The number is how many single periods it gets on top, earlier in the week (0 to 2; two are never on days next to each other). Shabbat Prep is run by the Music and Judaics specialists, so no bunk has Music or Judaics while a village is at Shabbat Prep. Villages that share a week prepare together." />
          <div className="shabbat-weeks">
            Who has Shabbat each week:
            {shabbatWeeksOf(settings).slice(0, sessionWeeks).map((picked, i) => (
              <span key={i} className="by-village">
                <strong>Week {i + 1}</strong>
                {(villages.length ? villages : ['O', 'C', 'S', 'M', 'T']).map((v) => (
                  <label key={v}>
                    <input
                      type="checkbox"
                      aria-label={`Shabbat week ${i + 1} village ${v}`}
                      checked={picked.includes(v)}
                      disabled={disabled}
                      onChange={(e) => onChange(withShabbatWeek(settings, i + 1, e.target.checked ? [...picked, v] : picked.filter((x) => x !== v)))}
                    />{' '}
                    {villageName(v)}
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Shabbat week ${i + 1} no Shabbat`}
                    checked={picked.length === 0}
                    disabled={disabled || picked.length === 0}
                    onChange={() => onChange(withShabbatWeek(settings, i + 1, []))}
                  />{' '}
                  No Shabbat
                </label>
              </span>
            ))}{' '}
            <Info text="The villages ticked for a week get Shabbat Prep that week. No Shabbat means nobody prepares that week. The last Friday of a 4-week session has no periods, so week 4 of a 4-week session never has Shabbat Prep. Until you change these, a 3-week session uses its own usual turns: S and M, then O and C, then Tusc." />
          </div>
        </td>
      </tr>
      <tr>
        <th scope="row">Trips</th>
        <td colSpan={4} className="fixed">
          Tiyuls and bike trips are on the session calendar below. Auto generate puts them on the schedule and builds around them; one you enter by hand on the Build tab stays where you put it.
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
