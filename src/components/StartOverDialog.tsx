import { useEffect, useState } from 'react';

/** What the person asked to start over, and what to keep while doing it. */
export interface StartOverChoice {
  scope: 'week' | 'session';
  /** Keep the bunks that are there (names, grades, camper counts). Otherwise the session's own bunks come back. */
  keepBunks: boolean;
  /** Keep the Settings tab as it is. Only asked for the whole session; a week never touches the settings. */
  keepSettings: boolean;
}

interface Props {
  /** 1-based number of the week on screen. */
  weekNumber: number;
  /** "Session 1 (4 weeks)" */
  sessionName: string;
  onCancel: () => void;
  onStartOver: (choice: StartOverChoice) => void;
}

/**
 * The one way to start again. It says in words what will happen before anything does: which periods are emptied, that the
 * session calendar goes back on, and what is kept.
 */
export default function StartOverDialog({ weekNumber, sessionName, onCancel, onStartOver }: Props) {
  const [scope, setScope] = useState<'week' | 'session'>('week');
  const [keepBunks, setKeepBunks] = useState(true);
  const [keepSettings, setKeepSettings] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const where = scope === 'week' ? `Week ${weekNumber}` : `every week of ${sessionName}`;
  const happens = [
    `Every period of ${where} is emptied.`,
    'The session calendar is put back on: opening day, trips and Tiyuls, village day, Mass Program or Color War.',
    keepBunks ? 'Your bunks stay: names, grades and camper counts.' : `The bunks go back to the ones ${sessionName} starts with.`,
    scope === 'week' ? 'The other weeks and the Settings tab are not touched.' : keepSettings ? 'The Settings tab stays as it is.' : 'The Settings tab goes back to the numbers and the calendar the session starts with.',
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="startover-title">
        <h2 id="startover-title">Start over</h2>
        <fieldset>
          <legend>What should start over?</legend>
          <label>
            <input type="radio" name="startover-scope" checked={scope === 'week'} onChange={() => setScope('week')} /> Just Week {weekNumber}
          </label>
          <label>
            <input type="radio" name="startover-scope" checked={scope === 'session'} onChange={() => setScope('session')} /> The whole session:{' '}
            {sessionName}
          </label>
        </fieldset>
        <fieldset>
          <legend>What should be kept?</legend>
          <label>
            <input type="checkbox" checked={keepBunks} onChange={(e) => setKeepBunks(e.target.checked)} /> Keep my bunks (names, grades, camper
            counts).
          </label>
          {scope === 'session' && (
            <label>
              <input type="checkbox" checked={keepSettings} onChange={(e) => setKeepSettings(e.target.checked)} /> Keep my settings.
            </label>
          )}
        </fieldset>
        <p>
          <strong>What will happen:</strong>
        </p>
        <ul>
          {happens.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="hint">This cannot be undone. Download all weeks first if there is anything here you might want again.</p>
        <div className="modal-buttons">
          <button type="button" autoFocus onClick={onCancel}>
            Cancel
          </button>{' '}
          <button type="button" className="primary" onClick={() => onStartOver({ scope, keepBunks, keepSettings: scope === 'week' ? true : keepSettings })}>
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
