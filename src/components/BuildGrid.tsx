import { memo, useMemo, useState } from 'react';
import { PERIOD_CHOICES, periodsForChoice, villageOf } from '../autofill';
import { DAYS, PERIODS_PER_DAY } from '../config';
import type { Bunk } from '../types';
import { ACTIVITY_LIST_ID, ActivityDatalist } from './Options';

interface SlotSelectProps {
  bunkId: string;
  slot: number;
  value: string;
  label: string;
  onCell: (bunkId: string, slot: number, label: string) => void;
}

const SlotSelect = memo(function SlotSelect({ bunkId, slot, value, label, onCell }: SlotSelectProps) {
  return (
    <input
      list={ACTIVITY_LIST_ID}
      className="activity-input"
      aria-label={label}
      value={value}
      onChange={(e) => onCell(bunkId, slot, e.target.value)}
    />
  );
});

interface Props {
  bunks: Bunk[];
  onCell: (bunkId: string, slot: number, label: string) => void;
  onBunk: (id: string, field: 'name' | 'grades' | 'count', value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onFillSlots: (slots: number[], label: string, village: string | null) => void;
  usePreviousWeek?: { label: string; disabled: boolean; onClick: () => void };
}

export default function BuildGrid({ bunks, onCell, onBunk, onAdd, onRemove, onMove, onFillSlots, usePreviousWeek }: Props) {
  const periods = Array.from({ length: PERIODS_PER_DAY }, (_, i) => i);
  const [fillDay, setFillDay] = useState(0);
  const [fillPeriodChoice, setFillPeriodChoice] = useState('0');
  const [fillVillage, setFillVillage] = useState('');
  const [fillLabel, setFillLabel] = useState('');
  const villages = useMemo(() => Array.from(new Set(bunks.map((b) => villageOf(b.name)))).filter(Boolean).sort(), [bunks]);

  return (
    <section>
      {ActivityDatalist}
      <h2>Build</h2>
      <p>
        Pick an activity for each bunk and period, or type your own. Matching neighbors merge automatically on the Schedule
        tab.
      </p>
      <p>
        Set a whole period at once (hobbies already fill everyone automatically; leagues already fill their whole village):{' '}
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
              {v} village
            </option>
          ))}
        </select>{' '}
        <input
          list={ACTIVITY_LIST_ID}
          className="activity-input"
          aria-label="Fill activity"
          value={fillLabel}
          onChange={(e) => setFillLabel(e.target.value)}
        />{' '}
        <button
          type="button"
          onClick={() => {
            const slots = periodsForChoice(fillPeriodChoice).map((p) => fillDay * PERIODS_PER_DAY + p);
            onFillSlots(slots, fillLabel, fillVillage || null);
            setFillLabel('');
          }}
        >
          Set for {fillVillage ? `${fillVillage} village` : 'all bunks'}
        </button>
      </p>
      <div className="scroll">
        <table border={1}>
          <thead>
            <tr>
              <th rowSpan={2}>Bunk</th>
              <th rowSpan={2}>Grades</th>
              <th rowSpan={2}>#</th>
              {DAYS.map((d) => (
                <th key={d} colSpan={PERIODS_PER_DAY}>
                  {d}
                </th>
              ))}
              <th rowSpan={2}>Move / remove</th>
            </tr>
            <tr>
              {DAYS.flatMap((d) => periods.map((p) => <th key={`${d}${p}`}>P{p + 1}</th>))}
            </tr>
          </thead>
          <tbody>
            {bunks.map((b, r) => (
              <tr key={b.id}>
                <td>
                  <input aria-label="Bunk name" size={6} value={b.name} onChange={(e) => onBunk(b.id, 'name', e.target.value)} />
                </td>
                <td>
                  <input aria-label={`${b.name} grades`} size={7} value={b.grades} onChange={(e) => onBunk(b.id, 'grades', e.target.value)} />
                </td>
                <td>
                  <input aria-label={`${b.name} camper count`} size={3} value={b.count} onChange={(e) => onBunk(b.id, 'count', e.target.value)} />
                </td>
                {DAYS.flatMap((d, di) =>
                  periods.map((p) => {
                    const slot = di * PERIODS_PER_DAY + p;
                    return (
                      <td key={slot}>
                        <SlotSelect
                          bunkId={b.id}
                          slot={slot}
                          value={b.slots[slot]}
                          label={`${b.name || 'Bunk'} ${d} period ${p + 1}`}
                          onCell={onCell}
                        />
                      </td>
                    );
                  }),
                )}
                <td>
                  <button type="button" onClick={() => onMove(b.id, -1)} disabled={r === 0} aria-label={`Move ${b.name} up`}>
                    Up
                  </button>
                  <button type="button" onClick={() => onMove(b.id, 1)} disabled={r === bunks.length - 1} aria-label={`Move ${b.name} down`}>
                    Down
                  </button>
                  <button type="button" onClick={() => onRemove(b.id)} aria-label={`Remove ${b.name}`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    </section>
  );
}
