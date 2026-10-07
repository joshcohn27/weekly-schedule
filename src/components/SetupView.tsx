import { villageName, villageOf } from '../autofill';
import type { SettingsProblem } from '../autogen/feasibility';
import type { SessionTemplate } from '../autogen/sessionCalendar';
import { MAX_BUNKS_IN_CAMP, MAX_CAMPERS_PER_BUNK, addableVillages, biggestCampSize, datesOf, type SessionId } from '../session';
import type { Bunk } from '../types';

interface Props {
  template: SessionTemplate;
  templates: readonly SessionTemplate[];
  onSession: (id: SessionId) => void;
  /** The bunks of the session. A change here is made in every week. */
  bunks: Bunk[];
  onBunk: (id: string, field: 'name' | 'grades' | 'count', value: string) => void;
  onAddTo: (village: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onFillBiggest: () => void;
  /** What the check on the Settings tab found, if anything. */
  problems: SettingsProblem[];
  onOpenSettings: () => void;
  onAutoGenerate: () => void;
  onOpenBuild: () => void;
  onUpload: () => void;
  onDownloadAll: () => void;
  onStartOver: () => void;
  /** A run is going on: nothing here can be changed until it is over. */
  disabled?: boolean;
}

/**
 * The Setup tab: everything that is decided once for a session, in the order it is done. Which session, its bunks, a look
 * at the numbers, and then on to building. Reset is at the top, and the files are at the bottom.
 */
export default function SetupView({ template, templates, onSession, bunks, onBunk, onAddTo, onRemove, onMove, onFillBiggest, problems, onOpenSettings, onAutoGenerate, onOpenBuild, onUpload, onDownloadAll, onStartOver, disabled }: Props) {
  const villages = addableVillages(template);
  const others = bunks.filter((b) => !villages.includes(villageOf(b.name)));
  const full = bunks.length >= MAX_BUNKS_IN_CAMP;
  const serious = problems.filter((p) => p.level !== 'short').length;

  const rows = (list: Bunk[]) =>
    list.map((b) => {
      const at = bunks.indexOf(b);
      return (
        <tr key={b.id}>
          <td>
            <input aria-label="Bunk name" size={6} value={b.name} disabled={disabled} onChange={(e) => onBunk(b.id, 'name', e.target.value)} />
          </td>
          <td>
            <input aria-label={`${b.name} grades`} size={8} value={b.grades} disabled={disabled} onChange={(e) => onBunk(b.id, 'grades', e.target.value)} />
          </td>
          <td>
            <input aria-label={`${b.name} campers`} size={3} value={b.count} disabled={disabled} onChange={(e) => onBunk(b.id, 'count', e.target.value)} />
          </td>
          <td className="row-tools">
            <button type="button" className="quiet" disabled={disabled || at === 0} onClick={() => onMove(b.id, -1)} aria-label={`Move ${b.name} up`} title="Move up">
              ↑
            </button>
            <button type="button" className="quiet" disabled={disabled || at === bunks.length - 1} onClick={() => onMove(b.id, 1)} aria-label={`Move ${b.name} down`} title="Move down">
              ↓
            </button>
            <button type="button" className="quiet" disabled={disabled} onClick={() => onRemove(b.id)} aria-label={`Remove ${b.name}`}>
              Remove
            </button>
          </td>
        </tr>
      );
    });

  return (
    <section className="setup">
      <div className="titlebar">
        <h2>Setup</h2>
        <button type="button" className="danger" disabled={disabled} onClick={onStartOver} title="Clear the periods, or put the session back to its base template. It says what will happen first.">
          Reset
        </button>
      </div>
      <p className="lead">Set the session up here, top to bottom. Everything on this page is for the whole session, not one week.</p>

      <div className="card">
        <h3>
          <span className="step">1</span> Session
        </h3>
        <div className="choices">
          {templates.map((t) => (
            <button key={t.id} type="button" className="choice" aria-pressed={t.id === template.id} disabled={disabled} onClick={() => onSession(t.id as SessionId)}>
              <strong>{t.name}</strong>
              <span>{datesOf(t)}</span>
            </button>
          ))}
        </div>
        <p className="hint">Each session keeps its own bunks, schedule and settings. Switching does not lose the other one.</p>
      </div>

      <div className="card">
        <h3>
          <span className="step">2</span> Bunks
          <span className="count">
            {bunks.length} of {MAX_BUNKS_IN_CAMP} cabins
          </span>
        </h3>
        <p className="hint">A bunk added, changed or removed here is added, changed or removed in every week of {template.name}.</p>
        <div className="villages">
          {villages.map((v) => {
            const mine = bunks.filter((b) => villageOf(b.name) === v);
            return (
              <div key={v} className="village" data-village={v}>
                <h4>
                  {villageName(v)} <span className="muted">{mine.length === 1 ? '1 bunk' : `${mine.length} bunks`}</span>
                </h4>
                {mine.length > 0 && (
                  <table className="roster">
                    <thead>
                      <tr>
                        <th>Bunk</th>
                        <th>Grades</th>
                        <th>Campers</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>{rows(mine)}</tbody>
                  </table>
                )}
                <button type="button" disabled={disabled || full} onClick={() => onAddTo(v)} aria-label={`Add a bunk to ${villageName(v)}`}>
                  Add a bunk
                </button>
                {v === 'TC' && <p className="hint">Taste of CSL is in camp for week 1 only.</p>}
              </div>
            );
          })}
          {others.length > 0 && (
            <div className="village">
              <h4>Other</h4>
              <table className="roster">
                <tbody>{rows(others)}</tbody>
              </table>
            </div>
          )}
        </div>
        <p>
          <button type="button" disabled={disabled} onClick={onFillBiggest}>
            Fill in the biggest camp
          </button>{' '}
          <span className="muted">
            Every village at its most bunks ({biggestCampSize(template)} in all), {MAX_CAMPERS_PER_BUNK} campers each.
          </span>
        </p>
      </div>

      <div className="card">
        <h3>
          <span className="step">3</span> Numbers and calendar
        </h3>
        <p>
          How often each program area happens, who may share a period, and when the trips, village day and the other days on the calendar
          fall. They start at the usual numbers for {template.name}.
        </p>
        <p className={serious ? 'check bad' : problems.length ? 'check warn' : 'check ok'}>
          {serious
            ? `The Settings tab has ${serious === 1 ? 'a warning' : `${serious} warnings`} about these numbers.`
            : problems.length
              ? 'The numbers work, with a note on the Settings tab about what will come up short.'
              : 'The numbers add up for these bunks.'}
        </p>
        <p>
          <button type="button" onClick={onOpenSettings}>
            Look at the settings
          </button>
        </p>
      </div>

      <div className="card">
        <h3>
          <span className="step">4</span> Build the schedule
        </h3>
        <p>Let Auto generate build the weeks, or fill the periods in yourself. You can do both: generate, then change what you like.</p>
        <p>
          <button type="button" className="primary" disabled={disabled || bunks.length === 0} onClick={onAutoGenerate}>
            Auto generate
          </button>{' '}
          <button type="button" onClick={onOpenBuild}>
            Go to the Build tab
          </button>
        </p>
      </div>

      <div className="card plain">
        <h3>Files</h3>
        <p>
          <button type="button" disabled={disabled} onClick={onUpload}>
            Upload a schedule (.xlsx)
          </button>{' '}
          <button type="button" onClick={onDownloadAll}>
            Download all weeks (.xlsx)
          </button>
        </p>
        <p className="hint">Your work is saved in this browser as you go. Download a file to keep a copy or to send the schedule to someone.</p>
      </div>
    </section>
  );
}
