import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import BuildGrid from './components/BuildGrid';
// import DayDetails from './components/DayDetails';
import ScheduleView from './components/ScheduleView';
import TrackingView from './components/TrackingView';
import { WEEK_COUNT, areaOf } from './config';
import { downloadAllWeeks, downloadWeek, readUploadedFile } from './excel';
import { emptySchedule, newBunk, sampleSchedule } from './sample';
import { defaultWeeksState, loadWeeks, saveWeeks } from './storage';
import type { Schedule, WeeksState } from './types';
// import type { DayInfo } from './types';

type View = 'build' | 'schedule' | 'tracking';

const TABS: { id: View; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'tracking', label: 'Tracking' },
];

const weekLabel = (index: number): string => `Week ${index + 1}`;
const isEmpty = (s: Schedule | null): boolean => !s || s.bunks.length === 0;

export default function App() {
  const [weeksState, setWeeksState] = useState<WeeksState>(() => loadWeeks() ?? defaultWeeksState());
  const [view, setView] = useState<View>('build');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveWeeks(weeksState), [weeksState]);

  const current = weeksState.current;
  const schedule = weeksState.weeks[current] ?? emptySchedule();
  const allSchedules = weeksState.weeks.filter((w): w is Schedule => w !== null);
  const previousWeek = current > 0 ? weeksState.weeks[current - 1] : null;

  const updateCurrentSchedule = useCallback((fn: (s: Schedule) => Schedule) => {
    setWeeksState((ws) => ({
      ...ws,
      weeks: ws.weeks.map((w, i) => (i === ws.current ? fn(w ?? emptySchedule()) : w)),
    }));
  }, []);

  const switchWeek = useCallback((index: number) => {
    setWeeksState((ws) => ({
      current: index,
      weeks: ws.weeks[index] === null ? ws.weeks.map((w, i) => (i === index ? emptySchedule() : w)) : ws.weeks,
    }));
  }, []);

  // Hobbies is always everyone at once, so picking it for one bunk fills the whole period;
  // exceptions are then a manual edit on just that bunk, same as any other activity.
  const setCell = useCallback(
    (bunkId: string, slot: number, label: string) => {
      updateCurrentSchedule((s) => ({
        ...s,
        bunks:
          areaOf(label) === 'Hobbies'
            ? s.bunks.map((b) => ({ ...b, slots: b.slots.map((v, i) => (i === slot ? label : v)) }))
            : s.bunks.map((b) => (b.id === bunkId ? { ...b, slots: b.slots.map((v, i) => (i === slot ? label : v)) } : b)),
      }));
    },
    [updateCurrentSchedule],
  );

  const fillSlotForAll = useCallback(
    (slot: number, label: string) => {
      updateCurrentSchedule((s) => ({
        ...s,
        bunks: s.bunks.map((b) => ({ ...b, slots: b.slots.map((v, i) => (i === slot ? label : v)) })),
      }));
    },
    [updateCurrentSchedule],
  );

  const setBunkField = useCallback(
    (id: string, field: 'name' | 'grades' | 'count', value: string) => {
      updateCurrentSchedule((s) => ({ ...s, bunks: s.bunks.map((b) => (b.id === id ? { ...b, [field]: value } : b)) }));
    },
    [updateCurrentSchedule],
  );

  const addBunk = useCallback(() => {
    updateCurrentSchedule((s) => ({ ...s, bunks: [...s.bunks, newBunk()] }));
  }, [updateCurrentSchedule]);

  const removeBunk = useCallback(
    (id: string) => {
      updateCurrentSchedule((s) => ({ ...s, bunks: s.bunks.filter((b) => b.id !== id) }));
    },
    [updateCurrentSchedule],
  );

  const moveBunk = useCallback(
    (id: string, direction: -1 | 1) => {
      updateCurrentSchedule((s) => {
        const i = s.bunks.findIndex((b) => b.id === id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= s.bunks.length) return s;
        const bunks = [...s.bunks];
        [bunks[i], bunks[j]] = [bunks[j], bunks[i]];
        return { ...s, bunks };
      });
    },
    [updateCurrentSchedule],
  );

  // const setDayField = useCallback((index: number, field: keyof DayInfo, value: string) => {
  //   updateCurrentSchedule((s) => ({ ...s, days: s.days.map((d, i) => (i === index ? { ...d, [field]: value } : d)) }));
  // }, [updateCurrentSchedule]);

  const resetToSample = () => {
    if (window.confirm(`Replace ${weekLabel(current)} with the sample schedule?`)) updateCurrentSchedule(() => sampleSchedule());
  };

  const clearActivities = () => {
    if (window.confirm('Clear every activity? Bunks stay.')) {
      updateCurrentSchedule((s) => ({ ...s, bunks: s.bunks.map((b) => ({ ...b, slots: b.slots.map(() => '') })) }));
    }
  };

  const resetWeek = () => {
    if (window.confirm(`Reset ${weekLabel(current)}? This clears all bunks and activities for this week.`)) {
      updateCurrentSchedule(() => emptySchedule());
    }
  };

  const useLastWeekBunks = () => {
    if (!previousWeek || previousWeek.bunks.length === 0) return;
    const msg =
      schedule.bunks.length > 0
        ? `Replace ${weekLabel(current)}'s bunks with ${weekLabel(current - 1)}'s roster? Activities already set for this week will be cleared.`
        : `Fill ${weekLabel(current)} with ${weekLabel(current - 1)}'s bunk roster (names, grades, counts, empty activities)?`;
    if (!window.confirm(msg)) return;
    updateCurrentSchedule((s) => ({
      ...s,
      bunks: previousWeek.bunks.map((b) => newBunk(b.name, b.grades, b.count)),
    }));
  };

  const handleDownload = () => downloadWeek(schedule, current + 1);
  const handleDownloadAll = () => downloadAllWeeks(weeksState.weeks);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const parsed = await readUploadedFile(file);
    if (parsed.length === 0) {
      window.alert("Couldn't read that file. Upload something downloaded from this app.");
      return;
    }

    const inRange = parsed.filter((p) => p.weekNumber >= 1 && p.weekNumber <= WEEK_COUNT);
    const overflow = parsed.length - inRange.length;
    const overflowNote = overflow > 0 ? ` ${overflow} week(s) beyond ${weekLabel(WEEK_COUNT - 1)} in the file were skipped.` : '';
    if (inRange.length === 0) {
      window.alert(`Nothing to load.${overflowNote}`);
      return;
    }

    const summary = inRange
      .map((p) => `${weekLabel(p.weekNumber - 1)}${isEmpty(weeksState.weeks[p.weekNumber - 1]) ? '' : ' (overwrite)'}`)
      .join(', ');
    if (!window.confirm(`Load ${summary}?${overflowNote}`)) return;

    setWeeksState((ws) => {
      const weeks = [...ws.weeks];
      for (const p of inRange) weeks[p.weekNumber - 1] = p.schedule;
      return { weeks, current: inRange[0].weekNumber - 1 };
    });
  };

  return (
    <div>
      <header>
        <h1>Weekly Period Schedule Builder</h1>
        <p>Build a sample week: four periods a day, Sunday to Friday. Your work is saved in this browser.</p>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={view === t.id} onClick={() => setView(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <div className="weekbar">
          <label>
            Week:{' '}
            <select value={current} onChange={(e) => switchWeek(Number(e.target.value))}>
              {Array.from({ length: WEEK_COUNT }, (_, i) => (
                <option key={i} value={i}>
                  {weekLabel(i)}
                  {isEmpty(weeksState.weeks[i]) ? ' (empty)' : ''}
                </option>
              ))}
            </select>
          </label>{' '}
          <button type="button" onClick={handleDownload}>
            Download {weekLabel(current)} (.xlsx)
          </button>{' '}
          <button type="button" onClick={handleDownloadAll}>
            Download all weeks (.xlsx)
          </button>{' '}
          <button type="button" onClick={handleUploadClick}>
            Upload
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={handleFileChange} />
          {' '}
          <button type="button" onClick={resetWeek}>
            Reset {weekLabel(current)}
          </button>
        </div>

        {view === 'build' && (
          <>
            <BuildGrid
              bunks={schedule.bunks}
              onCell={setCell}
              onBunk={setBunkField}
              onAdd={addBunk}
              onRemove={removeBunk}
              onMove={moveBunk}
              onFillSlot={fillSlotForAll}
              usePreviousWeek={
                current > 0
                  ? {
                      label: `Use ${weekLabel(current - 1)}'s bunks`,
                      disabled: !previousWeek || previousWeek.bunks.length === 0,
                      onClick: useLastWeekBunks,
                    }
                  : undefined
              }
            />
            {/* <DayDetails days={schedule.days} onDay={setDayField} /> */}
          </>
        )}
        {view === 'schedule' && <ScheduleView bunks={schedule.bunks} days={schedule.days} />}
        {view === 'tracking' && <TrackingView bunks={schedule.bunks} weekLabel={weekLabel(current)} schedules={allSchedules} />}
      </main>

      <footer>
        <button type="button" onClick={clearActivities}>
          Clear all activities
        </button>{' '}
        <button type="button" onClick={resetToSample}>
          Reset to sample
        </button>
      </footer>
    </div>
  );
}
