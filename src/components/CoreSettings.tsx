import { coreOf, sameVisitIn, visitsOf, withCore, withSameVisit, withVisits, type CoreSettings as Core, type Settings, type SharedNumbers } from '../autogen/settings';

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
  disabled?: boolean;
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
 * The settings for the areas that are not counted per session like the rarer ones: Waterfront, league, the pool, Athletics,
 * A&C, Music and Time with UH. Who swims together at the pool is not here: those rules are fixed.
 */
export default function CoreSettings({ settings, onChange, disabled }: Props) {
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
          {number('Music times a week', core.musicPerWeek, 0, 1, (n) => set({ musicPerWeek: n }))} a week, at most{' '}
          {number('Music at most a week', core.music.maxPerWeek, 1, 2, (n) => setShared('music', { maxPerWeek: n }))}
        </>
      );
    }
    if (key === 'uh') {
      return (
        <>
          {number('Time with UH at least a session', core.uhMin, 0, 3, (n) => set({ uhMin: n, uhMax: Math.max(n, core.uhMax) }))} a session, at most{' '}
          {number('Time with UH at most a session', core.uhMax, 0, 6, (n) => set({ uhMax: n, uhMin: Math.min(n, core.uhMin) }))}
        </>
      );
    }
    const name = key === 'ac' ? 'A&C' : 'Athletics';
    return <>at most {number(`${name} at most a week`, core[key].maxPerWeek, 0, 3, (n) => setShared(key, { maxPerWeek: n }))} a week</>;
  };

  return (
    <>
      <h3>The main areas</h3>
      <div className="scroll">
        <table border={1} className="settings">
          <thead>
            <tr>
              <th>Program area</th>
              <th>How often, for each bunk</th>
              <th>Bunks at once</th>
              <th>Bunks of one village in a day</th>
              <th>Same visit number</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Waterfront</th>
              <td>{number('Waterfront times a week', core.waterfrontPerWeek, 0, 3, (n) => set({ waterfrontPerWeek: n }))} a week</td>
              <td colSpan={3} className="fixed">
                A whole village, one village at a time
              </td>
            </tr>
            <tr>
              <th scope="row">League</th>
              <td>{number('League times a week', core.leaguePerWeek, 0, 3, (n) => set({ leaguePerWeek: n }))} a week</td>
              <td colSpan={3} className="fixed">
                A whole village (Tusc has triathlon training)
              </td>
            </tr>
            <tr>
              <th scope="row">Pool</th>
              <td>once a week, at most {number('Pool at most a week', core.poolMaxPerWeek, 1, 2, (n) => set({ poolMaxPerWeek: n }))}</td>
              <td colSpan={3} className="fixed">
                The pool keeps its own rules
              </td>
            </tr>
            {SHARED.map(({ key, name, area, atOnce }) => (
              <tr key={key}>
                <th scope="row">{name}</th>
                <td>{often(key)}</td>
                <td>
                  <select aria-label={`${name} bunks at once`} value={core[key].atOnce} disabled={disabled} onChange={(e) => setShared(key, { atOnce: Number(e.target.value) })}>
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
          </tbody>
        </table>
      </div>
      <p className="hint">
        "A week" is the average over the session: a short week, or one with a trip in it, gets fewer. "At most" is how far an area may go
        to fill a period. Athletics and A&C are whatever periods the other areas leave, up to their weekly number. "Same visit number"
        ticked means bunks that share a period there must be on the same visit; unticked, any visit will do.
      </p>
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
    </>
  );
}
