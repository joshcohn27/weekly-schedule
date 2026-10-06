import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { PERIOD_CHOICES, periodsForChoice, villageName, villageOf } from '../autofill';
import { clearChoices, isCleared, type ClearRequest, type ClearWho } from '../clear';
import { DAYS, PERIODS_PER_DAY } from '../config';
import { slotUsage } from '../slotUsage';
import type { Bunk } from '../types';
import ActivityPicker from './ActivityPicker';

interface SlotSelectProps {
  bunkId: string;
  slot: number;
  value: string;
  label: string;
  onCell: (bunkId: string, slot: number, label: string) => void;
  usage: (slot: number, bunkId: string) => Map<string, string>;
}

const SlotSelect = memo(function SlotSelect({ bunkId, slot, value, label, onCell, usage }: SlotSelectProps) {
  return (
    <ActivityPicker
      value={value}
      label={label}
      onCommit={(chosen) => onCell(bunkId, slot, chosen)}
      usage={() => usage(slot, bunkId)}
    />
  );
});

interface Props {
  bunks: Bunk[];
  onCell: (bunkId: string, slot: number, label: string) => void;
  /** Changing the bunks of this one week. Left out, the bunks are shown and not changed here: they are set on the Setup tab. */
  onBunk?: (id: string, field: 'name' | 'grades' | 'count', value: string) => void;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
  /** Where to send someone who has no bunks yet. */
  onOpenSetup?: () => void;
  onFillSlots: (slots: number[], label: string, village: string | null) => void;
  /** Empty what the request covers; `description` says it in words for the confirm. */
  onClear?: (req: ClearRequest, description: string) => void;
  onRemoveMarks?: () => void;
  usePreviousWeek?: { label: string; disabled: boolean; onClick: () => void };
  /** The six day headings, with their dates when the session has them. */
  dayLabels?: readonly string[];
}

export default function BuildGrid({ bunks, onCell, onBunk, onAdd, onRemove, onMove, onFillSlots, onClear, onRemoveMarks, usePreviousWeek, dayLabels = DAYS, onOpenSetup }: Props) {
  const editBunks = !!onBunk;
  const periods = Array.from({ length: PERIODS_PER_DAY }, (_, i) => i);
  const [fillDay, setFillDay] = useState(0);
  const [fillPeriodChoice, setFillPeriodChoice] = useState('0');
  const [fillVillage, setFillVillage] = useState('');
  const [fillLabel, setFillLabel] = useState('');
  const villages = useMemo(() => Array.from(new Set(bunks.map((b) => villageOf(b.name)))).filter(Boolean).sort(), [bunks]);
  // Read through a ref so every cell keeps the same callback and stays memoized as bunks change.
  const bunksRef = useRef(bunks);
  bunksRef.current = bunks;
  const usage = useCallback((slot: number, bunkId: string) => slotUsage(bunksRef.current, slot, bunkId), []);

  const [clearArea, setClearArea] = useState('');
  const [clearWho, setClearWho] = useState('');
  const [clearDay, setClearDay] = useState('0');
  const [clearPeriodChoice, setClearPeriodChoice] = useState('ALL');
  const anyCleared = bunks.some((b) => b.cleared?.some((s) => b.slots[s] === ''));
  const runClear = () => {
    const who: ClearWho = clearWho.startsWith('v:') ? { kind: 'village', village: clearWho.slice(2) } : clearWho.startsWith('b:') ? { kind: 'bunk', id: clearWho.slice(2) } : { kind: 'all' };
    const whoText = who.kind === 'village' ? villageName(who.village) : who.kind === 'bunk' ? bunks.find((b) => b.id === who.id)?.name || 'that bunk' : 'all bunks';
    const allDay = clearPeriodChoice === 'ALL';
    const when = `${clearDay === 'week' ? 'the whole week' : DAYS[Number(clearDay)]}${allDay ? '' : `, ${PERIOD_CHOICES.find((c) => c.value === clearPeriodChoice)?.label.toLowerCase()}`}`;
    onClear?.(
      {
        who,
        area: clearArea || null,
        day: clearDay === 'week' ? null : Number(clearDay),
        periods: allDay ? periods : periodsForChoice(clearPeriodChoice),
      },
      `${clearArea || 'everything'} for ${whoText} on ${when}`,
    );
  };

  return (
    <section>
      <h2>Build</h2>
      <p className="lead">Pick an activity for each bunk and period, or type your own.</p>
      {bunks.length === 0 && (
        <p className="empty-note">
          This week has no bunks yet.{' '}
          {onOpenSetup && (
            <button type="button" onClick={onOpenSetup}>
              Add them on the Setup tab
            </button>
          )}
        </p>
      )}
      <div className="tools">
      <p>
        <strong>Set a whole period</strong>{' '}
        <select aria-label="Fill day" value={fillDay} onChange={(e) => setFillDay(Number(e.target.value))}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>{' '}
        <select aria-label="Fill period" value={fillPeriodChoice} onChange={(e) => setFillPeriodChoice(e.target.value)}>
          {PERIOD_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>{' '}
        <select aria-label="Fill village" value={fillVillage} onChange={(e) => setFillVillage(e.target.value)}>
          <option value="">All bunks</option>
          {villages.map((v) => (
            <option key={v} value={v}>
              {villageName(v)}
            </option>
          ))}
        </select>{' '}
        <ActivityPicker value={fillLabel} label="Fill activity" onCommit={setFillLabel} />{' '}
        <button
          type="button"
          onClick={() => {
            const slots = periodsForChoice(fillPeriodChoice).map((p) => fillDay * PERIODS_PER_DAY + p);
            onFillSlots(slots, fillLabel, fillVillage || null);
            setFillLabel('');
          }}
        >
          Set for {fillVillage ? villageName(fillVillage) : 'all bunks'}
        </button>
      </p>
      <p>
        <strong>Clear</strong>{' '}
        <select aria-label="Clear what" value={clearArea} onChange={(e) => setClearArea(e.target.value)}>
          <option value="">everything</option>
          {clearChoices(bunks).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>{' '}
        for{' '}
        <select aria-label="Clear for" value={clearWho} onChange={(e) => setClearWho(e.target.value)}>
          <option value="">all bunks</option>
          {villages.map((v) => (
            <option key={v} value={`v:${v}`}>
              {villageName(v)}
            </option>
          ))}
          {bunks.map((b) => (
            <option key={b.id} value={`b:${b.id}`}>
              {b.name || 'Bunk'}
            </option>
          ))}
        </select>{' '}
        on{' '}
        <select aria-label="Clear day" value={clearDay} onChange={(e) => setClearDay(e.target.value)}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
          <option value="week">the whole week</option>
        </select>{' '}
        <select aria-label="Clear periods" value={clearPeriodChoice} onChange={(e) => setClearPeriodChoice(e.target.value)}>
          <option value="ALL">All day</option>
          {PERIOD_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>{' '}
        <button type="button" onClick={runClear}>
          Clear
        </button>
        {anyCleared && (
          <>
            {' '}
            <button type="button" onClick={onRemoveMarks}>
              Remove the yellow marks
            </button>
          </>
        )}
      </p>
      <p className="hint">
        Hobbies fill the whole camp and a league fills its whole village when you pick them for one bunk. Cleared periods are left empty
        and shown in yellow until you fill them again (by hand, or with Auto generate and "build around").
      </p>
      </div>
      <div className="scroll">
        <table border={1}>
          <thead>
            <tr>
              <th rowSpan={2}>Bunk</th>
              <th rowSpan={2}>Grades</th>
              <th rowSpan={2}>#</th>
              {DAYS.map((d, i) => (
                <th key={d} colSpan={PERIODS_PER_DAY}>
                  {dayLabels[i]}
                </th>
              ))}
              {editBunks && <th rowSpan={2}>Move / remove</th>}
            </tr>
            <tr>
              {DAYS.flatMap((d) => periods.map((p) => <th key={`${d}${p}`}>P{p + 1}</th>))}
            </tr>
          </thead>
          <tbody>
            {bunks.map((b, r) => (
              <tr key={b.id}>
                {editBunks ? (
                  <>
                    <td>
                      <input aria-label="Bunk name" size={6} value={b.name} onChange={(e) => onBunk?.(b.id, 'name', e.target.value)} />
                    </td>
                    <td>
                      <input aria-label={`${b.name} grades`} size={7} value={b.grades} onChange={(e) => onBunk?.(b.id, 'grades', e.target.value)} />
                    </td>
                    <td>
                      <input aria-label={`${b.name} camper count`} size={3} value={b.count} onChange={(e) => onBunk?.(b.id, 'count', e.target.value)} />
                    </td>
                  </>
                ) : (
                  <>
                    <th scope="row" data-village={villageOf(b.name)}>
                      {b.name}
                    </th>
                    <td className="bunk-info">{b.grades}</td>
                    <td className="bunk-info">{b.count}</td>
                  </>
                )}
                {DAYS.flatMap((d, di) =>
                  periods.map((p) => {
                    const slot = di * PERIODS_PER_DAY + p;
                    return (
                      <td key={slot} className={isCleared(b, slot) ? 'cleared' : undefined}>
                        <SlotSelect
                          bunkId={b.id}
                          slot={slot}
                          value={b.slots[slot]}
                          label={`${b.name || 'Bunk'} ${d} period ${p + 1}`}
                          onCell={onCell}
                          usage={usage}
                        />
                      </td>
                    );
                  }),
                )}
                {editBunks && (
                  <td>
                    <button type="button" onClick={() => onMove?.(b.id, -1)} disabled={r === 0} aria-label={`Move ${b.name} up`}>
                      Up
                    </button>
                    <button type="button" onClick={() => onMove?.(b.id, 1)} disabled={r === bunks.length - 1} aria-label={`Move ${b.name} down`}>
                      Down
                    </button>
                    <button type="button" onClick={() => onRemove?.(b.id)} aria-label={`Remove ${b.name}`}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editBunks && (
        <>
          <p>
            <button type="button" onClick={onAdd}>
              Add bunk
            </button>{' '}
            {usePreviousWeek && (
              <button type="button" onClick={usePreviousWeek.onClick} disabled={usePreviousWeek.disabled}>
                {usePreviousWeek.label}
              </button>
            )}
          </p>
          <p>Bunks that sit next to each other in this list can merge, so keep each village together.</p>
        </>
      )}
    </section>
  );
}
