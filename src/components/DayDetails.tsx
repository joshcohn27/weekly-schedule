import { DAYS } from '../config';
import type { DayInfo } from '../types';

interface Props {
  days: DayInfo[];
  onDay: (index: number, field: keyof DayInfo, value: string) => void;
}

const FIELDS: { key: keyof DayInfo; label: string }[] = [
  { key: 'rhLod', label: 'R"H & LOD' },
  { key: 'ts', label: 'TS' },
  { key: 'generalDay', label: 'General Day' },
  { key: 'dod', label: 'DOD' },
  { key: 'birthdays', label: 'Birthdays' },
  { key: 'evp', label: 'EVP' },
  { key: 'notes', label: 'Notes' },
];

export default function DayDetails({ days, onDay }: Props) {
  return (
    <section>
      <h2>Day details</h2>
      <p>Optional. These show in the header and footer of each day on the Schedule tab.</p>
      {DAYS.map((d, i) => (
        <fieldset key={d}>
          <legend>{d}</legend>
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}: <input value={days[i][f.key]} onChange={(e) => onDay(i, f.key, e.target.value)} />{' '}
            </label>
          ))}
        </fieldset>
      ))}
    </section>
  );
}
