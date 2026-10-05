import { useMemo, useState } from 'react';
import { DAYS } from '../config';
import { specialistSchedules, specialistSheetName, specialistWeeks } from '../specialist';
import type { Schedule } from '../types';

interface Props {
  /** Every week slot; the ones with nothing in them are skipped. */
  weeks: (Schedule | null)[];
  /** Download the same thing as an Excel file, one tab for each program area. */
  onDownload: () => void;
}

/**
 * The Specialists tab: the session from one program area's side. Pick an area, and each week is a grid like the main
 * schedule, days across and periods down, saying which bunks come, which visit it is for them and how many campers.
 */
export default function SpecialistView({ weeks, onDownload }: Props) {
  const schedules = useMemo(() => specialistSchedules(weeks), [weeks]);
  const [picked, setPicked] = useState('');
  const current = schedules.find((s) => s.area === picked) ?? schedules[0];

  return (
    <section>
      <h2>Specialists</h2>
      {!current ? (
        <p>Nothing is scheduled yet. Build a week first, and each program area's schedule will show here.</p>
      ) : (
        <>
          <p>
            <label>
              Program area:{' '}
              <select aria-label="Program area" value={current.area} onChange={(e) => setPicked(e.target.value)}>
                {schedules.map((s) => (
                  <option key={s.area} value={s.area}>
                    {specialistSheetName(s.area)}
                  </option>
                ))}
              </select>
            </label>{' '}
            <button type="button" onClick={() => window.print()}>
              Print
            </button>{' '}
            <button type="button" onClick={onDownload}>
              Download all areas (.xlsx)
            </button>
          </p>
          <p className="hint">
            Each box says who comes, which visit it is for them in this area (counted from the start of the session), and how many
            campers. A double period shows in both of its periods.
          </p>
          {specialistWeeks(current, weeks).map((grid) => (
            <div key={grid.week} className="specialist-week">
              <h3>
                {specialistSheetName(current.area)}, Week {grid.week}
              </h3>
              <div className="scroll">
                <table border={1} className="specialist">
                  <thead>
                    <tr>
                      <th />
                      {DAYS.map((d) => (
                        <th key={d}>{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.cells.map((row, p) => (
                      <tr key={p}>
                        <th scope="row">Period {p + 1}</th>
                        {row.map((cell, day) => (
                          <td key={day} className={cell.length ? 'filled' : undefined}>
                            {cell.map((c, i) => (
                              <div key={i} className="visit">
                                <strong>{c.who}</strong>
                                <span>{c.detail}</span>
                              </div>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
