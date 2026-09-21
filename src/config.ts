export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export const PERIODS_PER_DAY = 4;
export const SLOT_COUNT = DAYS.length * PERIODS_PER_DAY; // 24
export const WEEK_COUNT = 4;

export interface Activity {
  /** What shows in the dropdown and in the schedule. */
  label: string;
  /** Program area it counts toward in Tracking. null = not counted. */
  area: string | null;
}

const a = (label: string, area: string | null = label): Activity => ({ label, area });

/**
 * The dropdown choices. To add or regroup an activity, edit this list.
 * Several labels can count toward one program area (League, Ropes, ...).
 */
export const ACTIVITIES: Activity[] = [
  a('AM Hobbies', 'Hobbies'),
  a('PM Hobbies', 'Hobbies'),
  a('Waterfront'),
  a('Pool'),
  a('Swim Test', 'Pool'),
  a('Low Ropes', 'Ropes'),
  a('High Ropes', 'Ropes'),
  a('Athletics'),
  a('Judaics'),
  a('Israel', 'Israel Education'),
  a('Music'),
  a('A&C'),
  a('Ceramics'),
  a('Yoga'),
  a('Dance'),
  a('Teva'),
  a('Shabbat Prep'),
  a('League'),
  a('CHL', 'League'),
  a('MNL', 'League'),
  a('MAL', 'League'),
  a('SSL', 'League'),
  a('Tusc Triathlon Training', 'League'),
  a('Tusc Biking', 'League'),
  a('Tiyul', 'Trips'),
  a('Bike Trip', 'Trips'),
  a('Time with UH', 'TW UH'),
  a('All-Camp Event', null),
  a('Village Day', null),
  // Only emitted by Auto generate, in the last week of a 4-week session.
  a('Hobby Culmination', null),
  a('Packing Time', null),
  a('Banquet Prep', null),
];

/** Program areas in tracking-column order. */
export const AREAS: string[] = (() => {
  const seen: string[] = [];
  for (const act of ACTIVITIES) if (act.area && !seen.includes(act.area)) seen.push(act.area);
  return seen;
})();

const AREA_BY_LABEL = new Map(ACTIVITIES.map((act) => [act.label, act.area]));

export const areaOf = (label: string): string | null => AREA_BY_LABEL.get(label) ?? null;

export interface OptionGroup {
  group: string | null;
  items: Activity[];
}

/** Dropdown layout: areas with several labels get a heading, the rest are plain options. */
export const OPTION_GROUPS: OptionGroup[] = (() => {
  const out: OptionGroup[] = [];
  for (const area of AREAS) {
    const items = ACTIVITIES.filter((act) => act.area === area);
    out.push({ group: items.length > 1 ? area : null, items });
  }
  out.push({ group: 'Not counted in tracking', items: ACTIVITIES.filter((act) => act.area === null) });
  return out;
})();
