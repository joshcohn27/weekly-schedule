import { useMemo, useState } from 'react';
import type { Sharing } from '../autogen/config';
import { buildRoster, sharingLevel } from '../autogen/roster';
import { sharingOf, withPair, withSharing, type Settings } from '../autogen/settings';
import type { Bunk } from '../types';

interface Props {
  settings: Settings;
  /** The bunks of the week on screen: the grid has one row and one column for each. */
  bunks: Bunk[];
  onChange: (next: Settings) => void;
  disabled?: boolean;
  /** Start with the grid showing. */
  open?: boolean;
}

/** An area that the paired villages may mix in, so the grid shows those pairs too. */
const SHOWN_FOR = 'Music';

/**
 * Who may share a period: three basic choices, and behind "Advanced" a grid with a box for every pair of bunks.
 * The grid starts as what the basic choices give; a box that is changed wins over them for that pair. The pool
 * is not affected by any of it.
 */
export default function SharingSettings({ settings, bunks, onChange, disabled, open = false }: Props) {
  const [advanced, setAdvanced] = useState(open);
  const sharing = sharingOf(settings);
  const roster = useMemo(() => buildRoster(bunks), [bunks]);
  const basic: Sharing = { ...sharing, pairs: {} };
  const may = (a: number, b: number): boolean => sharingLevel(roster, a, b, SHOWN_FOR, sharing) > 0;
  const mayBasic = (a: number, b: number): boolean => sharingLevel(roster, a, b, SHOWN_FOR, basic) > 0;
  const changed = Object.keys(sharing.pairs).length;
  const set = (patch: Partial<Sharing>) => onChange(withSharing(settings, { ...sharing, ...patch }));

  return (
    <>
      <h3>Who may share a period</h3>
      <p>
        <label>
          Inside a village:{' '}
          <select aria-label="Sharing inside a village" value={sharing.within} disabled={disabled} onChange={(e) => set({ within: e.target.value as Sharing['within'] })}>
            <option value="next">only the bunk next to it in the list</option>
            <option value="village">any bunk of the village</option>
          </select>
        </label>{' '}
        <label>
          Paired villages (O with C, S with M):{' '}
          <select aria-label="Sharing across villages" value={sharing.across ? 'yes' : 'no'} disabled={disabled} onChange={(e) => set({ across: e.target.value === 'yes' })}>
            <option value="yes">may mix</option>
            <option value="no">never mix</option>
          </select>
        </label>{' '}
        <label>
          Grades:{' '}
          <select aria-label="Sharing grades" value={sharing.grades} disabled={disabled} onChange={(e) => set({ grades: e.target.value as Sharing['grades'] })}>
            <option value="same">the same grade</option>
            <option value="one">within one grade</option>
            <option value="any">any grades</option>
          </select>
        </label>
      </p>
      <p className="hint">
        This is for the areas where bunks may be together (A&C, Music, Teva, Dance, Israel and any area set to 2 bunks at once). Athletics
        takes any bunks, Tusc bunks always share with each other, and the pool keeps its own rules whatever is chosen here.
      </p>
      <p>
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
          {advanced ? 'Hide the sharing grid' : 'Advanced: customize sharing'}
        </button>
        {changed > 0 && (
          <>
            {' '}
            <span className="muted">
              {changed} {changed === 1 ? 'pair' : 'pairs'} changed by hand.
            </span>{' '}
            <button type="button" disabled={disabled} onClick={() => set({ pairs: {} })}>
              Undo the changes on the grid
            </button>
          </>
        )}
      </p>
      {advanced && (
        <>
          <p className="hint">
            A ticked box means the two bunks may share a period. Tick or untick any pair; a box you change is outlined, and it stays that
            way whatever the three choices above are set to. The grid goes by bunk name, so a bunk that is renamed starts again from the
            choices above.
          </p>
          <div className="scroll">
            <table border={1} className="sharing-grid">
              <thead>
                <tr>
                  <th />
                  {roster.names.map((n, j) => (
                    <th key={j} data-village={roster.village[j]}>
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.names.map((name, i) => (
                  <tr key={i}>
                    <th scope="row" data-village={roster.village[i]}>
                      {name}
                    </th>
                    {roster.names.map((other, j) =>
                      j <= i || !name || !other || name === other ? (
                        <td key={j} className="none" />
                      ) : (
                        <td key={j} className={may(i, j) !== mayBasic(i, j) ? 'changed' : undefined}>
                          <input
                            type="checkbox"
                            aria-label={`${name} with ${other}`}
                            checked={may(i, j)}
                            disabled={disabled}
                            onChange={(e) => onChange(withPair(settings, name, other, e.target.checked, mayBasic(i, j)))}
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
