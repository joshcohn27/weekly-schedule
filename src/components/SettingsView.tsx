import type { SettingsProblem } from '../autogen/feasibility';
import { SUPPORT_LINK } from '../config';
import type { Bunk } from '../types';
import SharingSettings from './SharingSettings';
import { useState } from 'react';
import { bigVillageIn, usesBigVillageSettings, withBigVillageSettings, coreOf, withCore, NEW_AREA, addArea, isDefaultSettings, removeArea, sameVisitIn, settingAreas, whyNotAdd, withSameVisit, type AreaSettings, type Settings } from '../autogen/settings';
import CalendarSettings from './CalendarSettings';
import CoreRows, { LastWeekSwitch } from './CoreSettings';
import type { SessionTemplate } from '../autogen/sessionCalendar';
import { villageName } from '../autofill';
import Info, { HINT } from './Info';

interface Props {
  settings: Settings;
  /** Village letters in the roster, for the areas that are set village by village. */
  villages: string[];
  onChange: (next: Settings) => void;
  onReset: () => void;
  /** While a run is going the settings it started with are in use, so they cannot be changed. */
  disabled?: boolean;
  /** What the arithmetic check found wrong with these settings, if anything. */
  problems?: SettingsProblem[];
  /** The bunks of the week on screen, for the sharing grid. */
  bunks?: Bunk[];
  /** The session calendar: shown when the session is known. */
  calendar?: { template: SessionTemplate; onApply: () => void };
}

const NAME: Record<string, string> = { 'Israel Education': 'Israel' };
const nameOf = (area: string): string => NAME[area] ?? area;

/** The rules that are always kept and cannot be changed here. */
export const FIXED_RULES = [
  'Athletics and A&C are single periods, never a double.',
  'No area is in period 4 and again in period 1 the next day.',
  'No bunk has the same kind of period two days in a row.',
  'No area twice in one day for a bunk.',
  'No Waterfront until the swim test is done: in week 1, never on Sunday morning and never before the village has swum. Mohawk swims its test during General Swim on the first day, so its Waterfront starts on the second.',
  'Athletics and A&C stay within two of each other for each bunk over the session.',
  'No Music or Judaics period while any village is at Shabbat Prep: those specialists run it.',
  'The pool: one group at a time, Onondaga and Cayuga never together, Tusc always together, and Seneca with Mohawk only at the same age.',
];

/**
 * The Settings tab: how often each program area happens and how many bunks it takes. Auto generate uses these numbers,
 * and they are saved with the schedule.
 */
export default function SettingsView({ settings, villages, onChange, onReset, disabled, problems = [], bunks = [], calendar }: Props) {
  const set = (area: string, patch: Partial<AreaSettings>) => onChange({ ...settings, areas: { ...settings.areas, [area]: { ...settings.areas[area], ...patch } } });
  // the program area being added: its name and its numbers are chosen before it goes in
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<AreaSettings>(NEW_AREA);
  const blocked = name.trim() === '' ? null : whyNotAdd(settings, name);
  // a village with six or more bunks needs more places than the usual numbers give: offered here, never done unasked
  const bigVillage = bigVillageIn(bunks.map((b) => b.name));
  const suggested = usesBigVillageSettings(settings);
  const useSuggested = () => onChange(withBigVillageSettings(settings));
  const add = () => {
    if (whyNotAdd(settings, name)) return;
    onChange(addArea(settings, name, draft));
    setName('');
    setDraft(NEW_AREA);
  };
  const draftNumber = (label: string, value: number, least: number, most: number, change: (n: number) => void) => (
    <input
      type="number"
      aria-label={`New program area ${label}`}
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
  // how often: "exactly" is both numbers the same, "from _ to _" is a range
  const often = (label: string, value: { min: number; max: number }, input: (label: string, value: number, change: (n: number) => void) => JSX.Element, change: (next: { min: number; max: number }) => void) => {
    const exact = value.min === value.max;
    return (
      <>
        <select
          aria-label={`${label} exactly or a range`}
          value={exact ? 'exactly' : 'range'}
          disabled={disabled}
          onChange={(e) => change(e.target.value === 'exactly' ? { min: value.min, max: value.min } : { min: value.min, max: value.min + 1 })}
        >
          <option value="exactly">exactly</option>
          <option value="range">from</option>
        </select>{' '}
        {exact ? (
          <>
            {input('exactly', value.min, (n) => change({ min: n, max: n }))} a session <Info text={HINT.exactly} />
          </>
        ) : (
          <>
            {input('at least', value.min, (n) => change({ min: n, max: Math.max(n + 1, value.max) }))} to{' '}
            {input('at most', value.max, (n) => change({ max: n, min: Math.min(n, value.min) }))} a session <Info text={HINT.atMost} />
          </>
        )}
      </>
    );
  };
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
      {problems.length === 0 ? (
        <p className="settings-ok">
          These settings add up: the periods fit. <Info text={HINT.estimate} />
        </p>
      ) : (
        <ul className="settings-problems" role="alert">
          {problems.map((p) => (
            <li key={p.text} data-level={p.level}>
              <strong>{p.level === 'no' ? 'Not possible.' : p.level === 'short' ? 'Will come up short.' : 'Unlikely to work.'}</strong> {p.level === 'unlikely' && <Info text={HINT.estimate} />} {p.text}{' '}
              <em>{p.fix}</em>
            </li>
          ))}
          <li data-level="unlikely">
            Stuck? <a href={SUPPORT_LINK}>Contact support</a>.
          </li>
        </ul>
      )}
      <div className="scroll">
        <table border={1} className="settings">
          <thead>
            <tr>
              <th>Program area</th>
              <th>How often, for each bunk</th>
              <th>
                Bunks at once <Info text={HINT.atOnce} />
              </th>
              <th>
                Bunks of one village in a day <Info text={HINT.perDay} />
              </th>
              <th>
                Same visit number <Info text={HINT.sameVisit} />
              </th>
            </tr>
          </thead>
          <tbody>
            <CoreRows settings={settings} onChange={onChange} disabled={disabled} villages={villages} sessionWeeks={calendar?.template.weeks} />
            {settingAreas(settings).map((area) => {
              const a = settings.areas[area];
              return (
                <tr key={area}>
                  <th scope="row">
                    {nameOf(area)}
                    {settings.custom?.includes(area) && (
                      <>
                        {' '}
                        <button type="button" disabled={disabled} onClick={() => onChange(removeArea(settings, area))} aria-label={`Remove ${area}`}>
                          Remove
                        </button>
                      </>
                    )}
                  </th>
                  {a.villages ? (
                    <td className="by-village">
                      {villages.map((v) => (
                        <label key={v}>
                          {villageName(v)} {number(area, `times for village ${v}`, a.villages?.[v] ?? a.min, 0, 12, (n) => set(area, { villages: { ...a.villages, [v]: n } }))}
                        </label>
                      ))}{' '}
                      a session, exactly
                    </td>
                  ) : (
                    <td>
                      {often(nameOf(area), a, (label, value, change) => number(area, label, value, 0, 12, change), (next) => set(area, next))}
                    </td>
                  )}
                  {area === 'Yoga' || area === 'Ceramics' ? (
                    <td colSpan={2}>
                      At most{' '}
                      {area === 'Yoga'
                        ? number(area, 'most campers at once', coreOf(settings).yogaMaxCampers, 5, 200, (n) => onChange(withCore(settings, { ...coreOf(settings), yogaMaxCampers: n })))
                        : number(area, 'most campers at once', coreOf(settings).ceramicsMaxCampers, 5, 200, (n) => onChange(withCore(settings, { ...coreOf(settings), ceramicsMaxCampers: n })))}{' '}
                      campers at once{' '}
                      <Info text={`${area} goes by people, not by bunks, the way Ropes does: bunks that are next to each other in a village go together as long as their campers add up to no more than this. A bunk bigger than the number goes alone.`} />
                    </td>
                  ) : (
                    <>
                      <td>
                        <select aria-label={`${nameOf(area)} bunks at once`} value={a.atOnce} disabled={disabled} onChange={(e) => set(area, { atOnce: Number(e.target.value) })}>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                        </select>
                      </td>
                      <td>{number(area, 'bunks of one village in a day', a.villagePerDay, 1, 6, (n) => set(area, { villagePerDay: n }))}</td>
                    </>
                  )}
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${nameOf(area)} same visit number`}
                      checked={sameVisitIn(settings, area)}
                      disabled={disabled}
                      onChange={(e) => onChange(withSameVisit(settings, area, e.target.checked))}
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="new-area">
              <th scope="row">
                <input
                  type="text"
                  aria-label="New program area name"
                  placeholder="Add a program area"
                  size={16}
                  value={name}
                  disabled={disabled}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') add();
                  }}
                />
              </th>
              <td>
                {often('New program area', draft, (label, value, change) => draftNumber(label, value, 0, 12, change), (next) => setDraft({ ...draft, ...next }))}
              </td>
              <td>
                <select aria-label="New program area bunks at once" value={draft.atOnce} disabled={disabled} onChange={(e) => setDraft({ ...draft, atOnce: Number(e.target.value) })}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </td>
              <td>
                {draftNumber('bunks of one village in a day', draft.villagePerDay, 1, 6, (n) => setDraft({ ...draft, villagePerDay: n }))}
              </td>
              <td>
                <button type="button" onClick={add} disabled={disabled || name.trim() === '' || blocked !== null}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {blocked && <p className="settings-blocked">{blocked}</p>}
      <p className="hint">
        To add a program area (archery, martial arts), type its name in the last row, choose its numbers and press Add. It becomes an
        activity you can pick on the Build tab, a column on the Tracking tab and a tab in the specialist schedules, and Auto generate
        gives it to every bunk as single periods. To stop using an area that comes with the app, set it to exactly 0.
      </p>
      <p className="hint">
        "Exactly" gives every bunk that many. "From _ to _" gives every bunk the first number, and the area may go as far as the second
        to fill a period that would otherwise be Athletics or A&C, so the extra shows up in crowded weeks and not for everyone. When
        the calendar leaves a bunk too few periods for everything, it ends short of something either way. "A week" is the average over the session: a
        short week, or one with a trip in it, gets fewer. Dance is set village by village. Athletics and A&C are whatever periods the
        other areas leave, up to their weekly number, so raising another area means less of them and lowering one means more.
      </p>
      <p className="hint">
        "Same visit number" ticked means bunks that share a period there must be on the same visit; unticked, any visit will do.
      </p>
      <LastWeekSwitch settings={settings} onChange={onChange} disabled={disabled} />
      <SharingSettings settings={settings} bunks={bunks} onChange={onChange} disabled={disabled} />
      <p>
        <button type="button" onClick={onReset} disabled={disabled || isDefaultSettings(settings)}>
          Reset to the default settings
        </button>
      </p>
      {bigVillage && !suggested && (
        <p className="hint big-villages">
          {villageName(bigVillage)} has six or more bunks. With that many the usual numbers leave too few places, and weeks come back with
          empty periods. The suggested settings: 4 bunks at once at Athletics, 2 at Ceramics, 3 bunks of a village a day at every area,
          and any two bunks of a village within a grade may share (not only the ones next to each other in the list).{' '}
          <button type="button" disabled={disabled || suggested} onClick={useSuggested}>
            {suggested ? 'The suggested settings are in use' : 'Use the suggested settings'}
          </button>
        </p>
      )}
      {calendar && <CalendarSettings settings={settings} template={calendar.template} villages={villages} onChange={onChange} onApply={calendar.onApply} disabled={disabled} />}
      {/* Hidden for now: the list of rules that are always kept is not shown on this page.
      <h3>Always kept</h3>
      <ul>
        {FIXED_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      */}
    </section>
  );
}
