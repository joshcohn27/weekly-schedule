import { useEffect, useRef, useState } from 'react';

/** What a reset covers and what it keeps. */
export interface StartOverChoice {
  scope: 'week' | 'session';
  /** Keep the bunks that are there (names, grades, camper counts). Otherwise the session's own bunks come back. */
  keepBunks: boolean;
  /** Keep the Settings tab as it is. A week never touches the settings. */
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

type Kind = 'week' | 'all' | 'template';

/**
 * Reset: the one way to start again, and it is one of three plain things. Clear a week, clear every week, or put the whole
 * session back to its template. Clearing keeps the bunks and the settings; the template does not.
 */
export default function StartOverDialog({ weekNumber, sessionName, onCancel, onStartOver }: Props) {
  const [kind, setKind] = useState<Kind>('all');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  // the box opens at its top, whatever was given the focus
  useEffect(() => {
    if (box.current) box.current.scrollTop = 0;
  }, []);

  const happens: Record<Kind, string> = {
    week: `Every period of Week ${weekNumber} is emptied. The other weeks, your bunks and your settings are not touched.`,
    all: `Every period of every week of ${sessionName} is emptied. Your bunks and your settings stay.`,
    template: `${sessionName} goes back to exactly how it starts: its own bunks, its own settings and calendar, and no periods filled in. Bunks you added and settings you changed are gone.`,
  };
  const choice: Record<Kind, StartOverChoice> = {
    week: { scope: 'week', keepBunks: true, keepSettings: true },
    all: { scope: 'session', keepBunks: true, keepSettings: true },
    template: { scope: 'session', keepBunks: false, keepSettings: false },
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="startover-title" ref={box}>
        <h2 id="startover-title">Reset</h2>
        <fieldset>
          <legend>Clear the periods</legend>
          <label>
            <input type="radio" name="reset-kind" checked={kind === 'all'} onChange={() => setKind('all')} /> Clear everything: every week of the
            session
          </label>
          <label>
            <input type="radio" name="reset-kind" checked={kind === 'week'} onChange={() => setKind('week')} /> Clear only Week {weekNumber}
          </label>
        </fieldset>
        <fieldset>
          <legend>Or go back to the start</legend>
          <label>
            <input type="radio" name="reset-kind" checked={kind === 'template'} onChange={() => setKind('template')} /> Reset to the base template
            for {sessionName}
          </label>
        </fieldset>
        <p>
          <strong>What will happen:</strong> {happens[kind]}
        </p>
        <p className="hint">
          The session calendar (opening day, trips and Tiyuls, village day, Mass Program or Color War) is put back on the emptied weeks. This
          cannot be undone. Download all weeks first if there is anything here you might want again.
        </p>
        <div className="modal-buttons">
          <button type="button" autoFocus onClick={onCancel}>
            Cancel
          </button>{' '}
          <button type="button" className="primary" onClick={() => onStartOver(choice[kind])}>
            {kind === 'template' ? 'Reset to the template' : kind === 'week' ? `Clear Week ${weekNumber}` : 'Clear everything'}
          </button>
        </div>
      </div>
    </div>
  );
}
