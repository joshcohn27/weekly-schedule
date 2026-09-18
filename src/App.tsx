import { useCallback, useEffect, useState } from 'react';
import BuildGrid from './components/BuildGrid';
import DayDetails from './components/DayDetails';
import ScheduleView from './components/ScheduleView';
import TrackingView from './components/TrackingView';
import { newBunk, sampleSchedule } from './sample';
import { loadSchedule, saveSchedule } from './storage';
import type { DayInfo, Schedule } from './types';

type View = 'build' | 'schedule' | 'tracking';

const TABS: { id: View; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'tracking', label: 'Tracking' },
];

export default function App() {
  const [schedule, setSchedule] = useState<Schedule>(() => loadSchedule() ?? sampleSchedule());
  const [view, setView] = useState<View>('build');

  useEffect(() => saveSchedule(schedule), [schedule]);

  const setCell = useCallback((bunkId: string, slot: number, label: string) => {
    setSchedule((s) => ({
      ...s,
      bunks: s.bunks.map((b) =>
        b.id === bunkId ? { ...b, slots: b.slots.map((v, i) => (i === slot ? label : v)) } : b,
      ),
    }));
  }, []);

  const setBunkField = useCallback((id: string, field: 'name' | 'grades' | 'count', value: string) => {
    setSchedule((s) => ({ ...s, bunks: s.bunks.map((b) => (b.id === id ? { ...b, [field]: value } : b)) }));
  }, []);

  const addBunk = useCallback(() => {
    setSchedule((s) => ({ ...s, bunks: [...s.bunks, newBunk()] }));
  }, []);

  const removeBunk = useCallback((id: string) => {
    setSchedule((s) => ({ ...s, bunks: s.bunks.filter((b) => b.id !== id) }));
  }, []);

  const moveBunk = useCallback((id: string, direction: -1 | 1) => {
    setSchedule((s) => {
      const i = s.bunks.findIndex((b) => b.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= s.bunks.length) return s;
      const bunks = [...s.bunks];
      [bunks[i], bunks[j]] = [bunks[j], bunks[i]];
      return { ...s, bunks };
    });
  }, []);

  const setDayField = useCallback((index: number, field: keyof DayInfo, value: string) => {
    setSchedule((s) => ({ ...s, days: s.days.map((d, i) => (i === index ? { ...d, [field]: value } : d)) }));
  }, []);

  const resetToSample = () => {
    if (window.confirm('Replace everything with the sample schedule?')) setSchedule(sampleSchedule());
  };

  const clearActivities = () => {
    if (window.confirm('Clear every activity? Bunks stay.')) {
      setSchedule((s) => ({ ...s, bunks: s.bunks.map((b) => ({ ...b, slots: b.slots.map(() => '') })) }));
    }
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
        {view === 'build' && (
          <>
            <BuildGrid
              bunks={schedule.bunks}
              onCell={setCell}
              onBunk={setBunkField}
              onAdd={addBunk}
              onRemove={removeBunk}
              onMove={moveBunk}
            />
            <DayDetails days={schedule.days} onDay={setDayField} />
          </>
        )}
        {view === 'schedule' && <ScheduleView bunks={schedule.bunks} days={schedule.days} />}
        {view === 'tracking' && <TrackingView bunks={schedule.bunks} />}
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
