import { GUEST_VILLAGE, villageName } from '../autofill';
import { TRIP_LABELS } from '../autogen/config';
import { CAMP, dateOf, shortDate, type CalendarEvent, type SessionTemplate } from '../autogen/sessionCalendar';
import type { Settings } from '../autogen/settings';
import { DAYS } from '../config';

interface Props {
  settings: Settings;
  /** The session this schedule belongs to: its calendar is what shows until it is changed. */
  template: SessionTemplate;
  villages: string[];
  onChange: (next: Settings) => void;
  /** Put the calendar on the schedule now (empty periods only). */
  onApply: () => void;
  disabled?: boolean;
}

const WHEN: { value: string; label: string; periods: number[] }[] = [
  { value: 'all', label: 'All day', periods: [0, 1, 2, 3] },
  { value: 'am', label: 'Morning (periods 1 and 2)', periods: [0, 1] },
  { value: 'pm', label: 'Afternoon (periods 3 and 4)', periods: [2, 3] },
  { value: 'p1', label: 'Period 1', periods: [0] },
  { value: 'p2', label: 'Period 2', periods: [1] },
  { value: 'p3', label: 'Period 3', periods: [2] },
  { value: 'p4', label: 'Period 4', periods: [3] },
];
const whenOf = (periods: number[]): string => WHEN.find((w) => w.periods.join() === periods.join())?.value ?? 'all';

/** What an event's "who" reads as. */
const whoName = (who: string): string => (who === CAMP ? 'Whole camp' : who === GUEST_VILLAGE ? 'Taste of CSL' : who.length === 1 ? villageName(who) : who);

/**
 * The session calendar on the Settings tab: when Mass Program is, when village day is, where each trip goes, and anything
 * else that is not a period. Auto generate puts these down first and builds around them. It starts as the session's own
 * calendar (2026, on this summer's dates) and every line can be changed, removed or added to.
 */
export default function CalendarSettings({ settings, template, villages, onChange, onApply, disabled }: Props) {
  const events = settings.calendar ?? template.events;
  const set = (next: CalendarEvent[]) => onChange({ ...settings, calendar: next });
  const patch = (index: number, change: Partial<CalendarEvent>) => set(events.map((e, i) => (i === index ? { ...e, ...change } : e)));
  // Taste of CSL's week is set: its lines stay on the calendar and are not listed or changed here
  const isTaste = (who: string): boolean => who.startsWith(GUEST_VILLAGE);
  const whoChoices = [...new Set([CAMP, ...villages, ...events.map((e) => e.who)])].filter((w) => !isTaste(w));
  const labels = [...new Set([...TRIP_LABELS, ...events.map((e) => e.label)])];
  const weeks = Array.from({ length: template.weeks }, (_, i) => i + 1);
  // in the order they happen
  const order = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !isTaste(e.who))
    .sort((x, y) => x.e.week - y.e.week || x.e.day - y.e.day || x.e.periods[0] - y.e.periods[0] || x.i - y.i);

  return (
    <>
      <h3>Session calendar</h3>
      <p className="hint">
        Everything that is not a period: trips, Tiyuls, village day, Mass Program, Color War, Visitor&apos;s Day. Auto generate puts these on
        the schedule first and builds the periods around them. This starts as {template.name} was in 2026, on this summer&apos;s dates. Change
        a line to move it, and what you set here is where it goes from then on.
        {events.some((e) => isTaste(e.who)) && ' Taste of CSL has a set week of its own, which is not listed here.'}
      </p>
      <div className="scroll">
        <table border={1} className="calendar-settings">
          <thead>
            <tr>
              <th>What</th>
              <th>Who</th>
              <th>Week</th>
              <th>Day</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {order.map(({ e, i }) => (
              <tr key={i}>
                <td>
                  <select aria-label={`Calendar line ${i + 1} what`} value={e.label} disabled={disabled} onChange={(ev) => patch(i, { label: ev.target.value })}>
                    {labels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select aria-label={`Calendar line ${i + 1} who`} value={e.who} disabled={disabled} onChange={(ev) => patch(i, { who: ev.target.value })}>
                    {whoChoices.map((w) => (
                      <option key={w} value={w}>
                        {whoName(w)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select aria-label={`Calendar line ${i + 1} week`} value={e.week} disabled={disabled} onChange={(ev) => patch(i, { week: Number(ev.target.value) })}>
                    {weeks.map((w) => (
                      <option key={w} value={w}>
                        Week {w}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select aria-label={`Calendar line ${i + 1} day`} value={e.day} disabled={disabled} onChange={(ev) => patch(i, { day: Number(ev.target.value) })}>
                    {DAYS.map((d, day) => (
                      <option key={d} value={day}>
                        {d} {shortDate(dateOf(template, e.week, day))}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`Calendar line ${i + 1} when`}
                    value={whenOf(e.periods)}
                    disabled={disabled}
                    onChange={(ev) => patch(i, { periods: WHEN.find((w) => w.value === ev.target.value)?.periods ?? e.periods })}
                  >
                    {WHEN.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" disabled={disabled} aria-label={`Remove calendar line ${i + 1}`} onClick={() => set(events.filter((_, k) => k !== i))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <button type="button" disabled={disabled} onClick={() => set([...events, { label: 'Mass Program', who: CAMP, week: 1, day: 1, periods: [0, 1, 2, 3] }])}>
          Add a line
        </button>{' '}
        <button type="button" disabled={disabled || !settings.calendar} onClick={() => onChange({ ...settings, calendar: undefined })}>
          Back to the {template.name.replace(/ \(.*/, '')} calendar
        </button>{' '}
        <button type="button" disabled={disabled} onClick={onApply} title="Fills empty periods only. Nothing that is already on the schedule is changed.">
          Put the calendar on the schedule now
        </button>
      </p>
    </>
  );
}
