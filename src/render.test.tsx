import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import BuildGrid from './components/BuildGrid';
import ScheduleView from './components/ScheduleView';
import TrackingView from './components/TrackingView';
import { normalize, normalizeWeeksState } from './storage';
import { newBunk, sampleSchedule } from './sample';

const noop = () => {};

describe('rendering', () => {
  const { bunks, days } = sampleSchedule();

  it('schedule view emits rowspan and colspan for merged blocks', () => {
    const html = renderToStaticMarkup(<ScheduleView bunks={bunks} days={days} />);
    expect(html).toMatch(/rowSpan="8" colSpan="2"|rowspan="8" colspan="2"/i); // everyone in AM Hobbies
    expect(html).toMatch(/colspan="4"/i);
  });

  it('build view has one dropdown per bunk per slot', () => {
    const html = renderToStaticMarkup(
      <BuildGrid bunks={bunks} onCell={noop} onBunk={noop} onAdd={noop} onRemove={noop} onMove={noop} />,
    );
    expect((html.match(/<select/g) ?? []).length).toBe(bunks.length * 24);
  });

  it('tracking view renders', () => {
    const html = renderToStaticMarkup(
      <TrackingView bunks={bunks} weekLabel="Week 1" schedules={[{ bunks, days }]} />,
    );
    expect(html).toContain('Waterfront');
    expect(html).toContain('All bunks');
    expect(html).toContain('Whole session');
  });

  it('whole app renders without a saved schedule', () => {
    // no localStorage in node: the app must fall back to the sample
    expect(renderToStaticMarkup(<App />)).toContain('Weekly Period Schedule Builder');
  });

  it('schedule view copes with zero bunks and an empty bunk', () => {
    expect(() => renderToStaticMarkup(<ScheduleView bunks={[]} days={days} />)).not.toThrow();
    expect(() => renderToStaticMarkup(<ScheduleView bunks={[newBunk()]} days={days} />)).not.toThrow();
  });
});

describe('normalize (saved data)', () => {
  it('repairs short slot arrays and drops unknown activities', () => {
    const s = normalize({ bunks: [{ id: 'a', name: 'O1', slots: ['Pool', 'Not A Thing'] }], days: [] })!;
    expect(s.bunks[0].slots).toHaveLength(24);
    expect(s.bunks[0].slots[0]).toBe('Pool');
    expect(s.bunks[0].slots[1]).toBe('');
    expect(s.days).toHaveLength(6);
  });

  it('rejects garbage', () => {
    expect(normalize(null)).toBeNull();
    expect(normalize({ nope: 1 })).toBeNull();
  });
});

describe('normalizeWeeksState (saved multi-week data)', () => {
  it('pads to 4 week slots and clamps the current index', () => {
    const raw = { weeks: [{ bunks: [{ id: 'a', name: 'O1', slots: ['Pool'] }], days: [] }], current: 9 };
    const state = normalizeWeeksState(raw)!;
    expect(state.weeks).toHaveLength(4);
    expect(state.weeks[0]!.bunks[0].name).toBe('O1');
    expect(state.weeks[1]).toBeNull();
    expect(state.current).toBe(0);
  });

  it('rejects garbage', () => {
    expect(normalizeWeeksState(null)).toBeNull();
    expect(normalizeWeeksState({ nope: 1 })).toBeNull();
  });
});
