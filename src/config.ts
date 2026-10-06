export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export const PERIODS_PER_DAY = 4;
export const SLOT_COUNT = DAYS.length * PERIODS_PER_DAY; // 24
export const WEEK_COUNT = 4;
/**
 * The version shown at the foot of every page. Change it here (and in package.json) when a new one goes out.
 * The first number is the app itself, the second goes up when a feature is added (2 is Auto generate), and the third
 * goes up for a fix.
 */
export const APP_VERSION = '1.6.4';
/** Where the Contact support links go. */
export const SUPPORT_EMAIL = 'joshcohn27@gmail.com';
export const SUPPORT_LINK = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Weekly Period Schedule Builder')}`;

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
  a('Trip', 'Trips'),
  a('Time with UH', 'TW UH'),
  a('All-Camp Event', null),
  a('Village Day', null),
  // The session calendar: whole days and half-days that are not periods. Auto generate builds around them.
  a('O-Day', null),
  a('C-Day', null),
  a('S-Day', null),
  a('M-Day', null),
  a('T-Day', null),
  a('Mass Program', null),
  a('Color War', null),
  a("Visitor's Day", null),
  a('All Camp Clean Up', null),
  a('Tusc Triathlon', null),
  a('Opening Day', null),
  a('No Periods', null),
  // Only emitted by Auto generate, in the last week of a 4-week session.
  a('Hobby Culmination', null),
  a('Packing Time', null),
  a('Banquet Prep', null),
];

/** The list above as it is written here, before any program areas were added on the Settings tab. */
const BUILT_IN: Activity[] = [...ACTIVITIES];

/** Program areas in tracking-column order. */
export const AREAS: string[] = [];
const AREA_BY_LABEL = new Map<string, string | null>();

export const areaOf = (label: string): string | null => AREA_BY_LABEL.get(label) ?? null;

export interface OptionGroup {
  group: string | null;
  items: Activity[];
}

/** Dropdown layout: areas with several labels get a heading, the rest are plain options. */
export const OPTION_GROUPS: OptionGroup[] = [];

/** Is this name already an activity or a program area that comes with the app? */
export const isBuiltInName = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  return BUILT_IN.some((a) => a.label.toLowerCase() === n || a.area?.toLowerCase() === n);
};

/**
 * Set the program areas that were added on the Settings tab (archery, martial arts, ...). Each is one activity that counts
 * toward its own area. The lists above are rebuilt in place, so everything that reads them sees the change.
 */
export function setCustomAreas(names: readonly string[]): void {
  const counted = BUILT_IN.filter((a) => a.area !== null);
  const uncounted = BUILT_IN.filter((a) => a.area === null);
  ACTIVITIES.length = 0;
  ACTIVITIES.push(...counted, ...names.map((name) => a(name)), ...uncounted);
  AREAS.length = 0;
  AREA_BY_LABEL.clear();
  for (const act of ACTIVITIES) {
    if (act.area && !AREAS.includes(act.area)) AREAS.push(act.area);
    AREA_BY_LABEL.set(act.label, act.area);
  }
  OPTION_GROUPS.length = 0;
  for (const area of AREAS) {
    const items = ACTIVITIES.filter((act) => act.area === area);
    OPTION_GROUPS.push({ group: items.length > 1 ? area : null, items });
  }
  OPTION_GROUPS.push({ group: 'Not counted in tracking', items: uncounted });
}
setCustomAreas([]);
