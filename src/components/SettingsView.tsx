import { SETTING_AREAS, isDefaultSettings, type AreaSettings, type Settings } from '../autogen/settings';

interface Props {
  settings: Settings;
  /** Village letters in the roster, for the areas that are set village by village. */
  villages: string[];
  onChange: (next: Settings) => void;
  onReset: () => void;
  /** While a run is going the settings it started with are in use, so they cannot be changed. */
  disabled?: boolean;
}

const NAME: Record<string, string> = { 'Israel Education': 'Israel' };
const nameOf = (area: string): string => NAME[area] ?? area;

/** The rules that are always kept and cannot be changed here. */
export const FIXED_RULES = [
  'Athletics and A&C are single periods, never a double.',
  'No area is in period 4 and again in period 1 the next day.',
  'No bunk has the same kind of period two days in a row.',
  'No area twice in one day for a bunk.',
  'Athletics and A&C stay within two of each other for each bunk over the session.',
  'The pool: one group at a time, lessons alone for O and C, O and C never together, Tusc always together, at most 80 campers unless it is a whole village.',
];

/**
 * The Settings tab: how often each program area happens and how many bunks it takes. Auto generate uses these numbers,
 * and they are saved with the schedule.
 */
export default function SettingsView({ settings, villages, onChange, onReset, disabled }: Props) {
  const set = (area: string, patch: Partial<AreaSettings>) => onChange({ areas: { ...settings.areas, [area]: { ...settings.areas[area], ...patch } } });
  const number = (area: string, label: string, value: number, least: number, most: number, change: (n: number) => void) => (
    <input
      type="number"
      aria-label={`${nameOf(area)} ${label}`}
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

  return (
    <section>
      <h2>Settings</h2>
      <p>
        How often each program area happens and how many bunks it takes. Auto generate uses these numbers. They are saved with this
        schedule and go into the Excel file, so a schedule you send to someone carries its own rules.
      </p>
      <div className="scroll">
        <table border={1} className="settings">
          <thead>
            <tr>
              <th rowSpan={2}>Program area</th>
              <th colSpan={2}>Times per bunk per session</th>
              <th rowSpan={2}>Bunks at once</th>
              <th rowSpan={2}>Bunks of one village in a day</th>
            </tr>
            <tr>
              <th>At least</th>
              <th>At most</th>
            </tr>
          </thead>
          <tbody>
            {SETTING_AREAS.map((area) => {
              const a = settings.areas[area];
              return (
                <tr key={area}>
                  <th scope="row">{nameOf(area)}</th>
                  {a.villages ? (
                    <td colSpan={2} className="by-village">
                      {villages.map((v) => (
                        <label key={v}>
                          {v} {number(area, `times for village ${v}`, a.villages?.[v] ?? a.min, 0, 12, (n) => set(area, { villages: { ...a.villages, [v]: n } }))}
                        </label>
                      ))}
                    </td>
                  ) : (
                    <>
                      <td>{number(area, 'at least', a.min, 0, 12, (n) => set(area, { min: n, max: Math.max(n, a.max) }))}</td>
                      <td>{number(area, 'at most', a.max, 0, 12, (n) => set(area, { max: n, min: Math.min(n, a.min) }))}</td>
                    </>
                  )}
                  <td>
                    <select aria-label={`${nameOf(area)} bunks at once`} value={a.atOnce} disabled={disabled} onChange={(e) => set(area, { atOnce: Number(e.target.value) })}>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </td>
                  <td>{number(area, 'bunks of one village in a day', a.villagePerDay, 1, 6, (n) => set(area, { villagePerDay: n }))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        "At least" is what every bunk is given. When "at most" is higher, the extra visit is only used to fill a period that would
        otherwise be Athletics or A&C, so it shows up in crowded weeks and not for everyone. Dance is set village by village. Whatever
        periods these areas do not use become Athletics, A&C or Time with UH, so raising a number means less of those, and lowering one
        means more.
      </p>
      <p>
        <button type="button" onClick={onReset} disabled={disabled || isDefaultSettings(settings)}>
          Reset to the default settings
        </button>
      </p>
      <h3>Always kept</h3>
      <ul>
        {FIXED_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </section>
  );
}
