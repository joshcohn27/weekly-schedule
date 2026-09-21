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
    const merged = [newBunk('O1'), newBunk('O2'), newBunk('O3')];
    for (const b of merged) {
      b.slots[0] = 'Pool';
      b.slots[1] = 'Pool';
    }
    const html = renderToStaticMarkup(<ScheduleView bunks={merged} days={days} />);
    expect(html).toMatch(/rowSpan="3" colSpan="2"|rowspan="3" colspan="2"/i); // 3 bunks sharing a double period
  });

  it('build view has one searchable activity input per bunk per slot, plus the fill toolbar', () => {
    const html = renderToStaticMarkup(
      <BuildGrid bunks={bunks} onCell={noop} onBunk={noop} onAdd={noop} onRemove={noop} onMove={noop} onFillSlots={noop} />,
    );
    // +1 for the bulk-fill toolbar's own activity input
    expect((html.match(/class="activity-input"/g) ?? []).length).toBe(bunks.length * 24 + 1);
    // day/period/village pickers in the toolbar are still plain selects
    expect((html.match(/<select/g) ?? []).length).toBe(3);
    // the shared datalist backs every activity input with searchable, write-in-able suggestions
    expect(html).toContain('<datalist id="activity-options"');
    expect(html).toContain('AM Hobbies');
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
  it('repairs short slot arrays and keeps write-in activities', () => {
    const s = normalize({ bunks: [{ id: 'a', name: 'O1', slots: ['Pool', 'Extra Craft Time'] }], days: [] })!;
    expect(s.bunks[0].slots).toHaveLength(24);
    expect(s.bunks[0].slots[0]).toBe('Pool');
    expect(s.bunks[0].slots[1]).toBe('Extra Craft Time');
    expect(s.bunks[0].slots[2]).toBe('');
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
