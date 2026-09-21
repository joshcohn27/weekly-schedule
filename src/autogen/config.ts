// Every number the Auto generate feature uses lives here. Where the written spec was silent,
// the choice made is marked "DEFAULT" so it is easy to find and change.

export type SessionWeeks = 3 | 4;

export const LEAGUE_LABEL: Record<string, string> = { O: 'League', C: 'CHL', S: 'SSL', M: 'MNL', T: 'Tusc Triathlon Training' };
/** Mohawk plays MNL in a 4-week session and MAL in a 3-week session. */
export const leagueLabelFor = (village: string, sessionWeeks: SessionWeeks): string =>
  village === 'M' && sessionWeeks === 3 ? 'MAL' : (LEAGUE_LABEL[village] ?? 'League');
export const ALL_LEAGUE_LABELS = ['League', 'CHL', 'SSL', 'MNL', 'MAL', 'Tusc Triathlon Training'];

/** Per bunk, over the whole session. Keys are program areas. */
export const SESSION_TARGETS: Record<string, number> = {
  Ropes: 2,
  Judaics: 2,
  'Israel Education': 2,
  Teva: 2,
  Ceramics: 2,
  Yoga: 2,
  'TW UH': 1,
};
export const DANCE_TARGETS: Record<string, number> = { O: 4, S: 4, C: 2, T: 2, M: 1 }; // area 'Dance'
/** DEFAULT: a village letter not listed above gets this many Dance blocks per session. */
export const DANCE_TARGET_OTHER = 2;
export const POOL_TARGETS: Record<string, { perWeek?: number; perSession?: number }> = {
  O: { perWeek: 1 },
  C: { perWeek: 1 },
  S: { perSession: 3 },
  M: { perSession: 3 },
  T: { perWeek: 1 },
};
/** DEFAULT: a village letter not listed above is treated like S and M. */
export const POOL_TARGET_OTHER = { perSession: 3 };
export const WATERFRONT_PER_WEEK = 2;
export const LEAGUE_PER_WEEK = 3; // M: 3 double periods
export const MUSIC_PER_WEEK = 1;
export const TIYUL_WEEKS: Record<SessionWeeks, Record<string, number[]>> = {
  4: { O: [2, 3], C: [2, 3], S: [3, 4], M: [3, 4] },
  3: { O: [2], C: [2], S: [2], M: [2] },
};
// The 2026 key. Friday of week 4 has no periods, so a 4-week session has none in week 4.
export const SHABBAT_ROTATION: Record<SessionWeeks, Record<number, string[]>> = {
  4: { 1: ['M'], 2: ['O', 'C'], 3: ['S', 'T'] },
  3: { 1: ['S', 'M'], 2: ['O', 'C'], 3: ['T'] },
};
export const POOL_MAX_CAMPERS = 80;
export const POOL_YOUNG_MAX_CAMPERS = 16; // O and C combined, per period
export const AC_ATHLETICS_MAX_GAP = 1;
export const CROSS_VILLAGE_PAIRABLE = ['Pool', 'Athletics', 'A&C', 'Music', 'Dance', 'Yoga', 'Ceramics', 'Teva'];
export const SOLO_ONLY = ['Judaics', 'Israel Education'];
export const DAY_OFF_AREAS = ['Athletics', 'A&C', 'Music', 'Judaics', 'Israel Education', 'Ceramics', 'Yoga', 'Dance', 'Teva'];

export const WET_LABELS = ['Pool', 'Swim Test', 'Waterfront', 'Tusc Triathlon Training'];
export const ACTIVE_LABELS = ['Athletics', ...ALL_LEAGUE_LABELS, 'Low Ropes', 'High Ropes', 'Tiyul'];

/** Labels that are always the whole village at once (rule H3). */
export const VILLAGE_LEVEL_LABELS = ['Waterfront', ...ALL_LEAGUE_LABELS, 'Shabbat Prep', 'Tiyul', 'Bike Trip', 'Swim Test'];
/** Labels exempt from the equal-ordinal rule (rule H5): village-level blocks, plus camp-wide hobbies. */
export const ORDINAL_EXEMPT_LABELS = [...VILLAGE_LEVEL_LABELS, 'AM Hobbies', 'PM Hobbies'];

/** Half-day layout: periods 0-1 are the morning, 2-3 the afternoon. */
export const HALF_PERIODS: number[][] = [
  [0, 1],
  [2, 3],
];

// ---- DEFAULT choices where the spec was silent ----------------------------------------------

/** Age rank within this of the roster minimum or maximum counts as youngest or oldest (Time with UH). */
export const UH_EARLY_MARGIN = 0.5;
/** Last-resort extra Time with UH blocks a bunk may get to fill an otherwise unfillable period. */
export const UH_MAX_PER_SESSION = 2;
/** Week 4 of a 4-week session has far fewer open periods, so quotas count it as this much of a normal week. */
export const LAST_WEEK_CAPACITY = 0.5;
export const LAST_WEEK_CAPACITY_T = 0.25;
/** Used for pool caps when a bunk has no camper count. */
export const DEFAULT_CAMPERS = 12;
/** Chance a pairable one-period block tries to find a partner. */
export const PAIR_PROBABILITY = 0.65;
/** Number of randomized attempts per generate; the lowest-scoring valid one wins. */
export const ATTEMPTS = 40;

export const HOBBY_WED_PM_PROBABILITY = 0.65; // otherwise Tuesday AM
export const HOBBY_SUNDAY_PROBABILITY = 0.2;

// ---- Soft-preference weights (lower total score is better) --------------------------------

export const WEIGHTS = {
  fairnessPerBlock: 50,
  soloClash: 40,
  missingDayOff: 10,
  wetThenActive: 15,
  athleticsBeforePoolBonus: 5,
  poolBeforeAthletics: 15,
  extraWetInDay: 25,
  pairReward: 2,
};
