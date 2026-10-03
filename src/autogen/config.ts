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
export const DANCE_TARGETS: Record<string, number> = { O: 3, S: 3, C: 2, T: 2, M: 1 }; // area 'Dance'
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
export const AC_ATHLETICS_MAX_GAP = 1;
/** Trips are entered by hand before generating. The generator never writes them, and "replace" leaves them where they are. */
export const TRIP_LABELS = ['Bike Trip', 'Tiyul'];
/** A week with at most this share of its periods empty counts as already built; one with more is still to be generated. */
export const BUILT_WEEK_MAX_EMPTY = 0.25;

// ---- Who may share a period and an area (H13), and how many (H14, H15) --------------------------

/** Age rank (mean of the numbers in Grades) within this counts as the same age. */
export const AGE_PREFERRED = 0.5;
/** Within this many grades two bunks may share, but the generator likes a closer match better. */
export const AGE_ALLOWED = 1;
/** S with M at the pool must be the same age. */
export const POOL_AGE_MAX = 0.5;
/** Areas where an O bunk may share with a C bunk, or an S bunk with an M bunk. Pool is S with M only. */
export const CROSS_VILLAGE_AREAS = ['Athletics', 'A&C', 'Music', 'Teva', 'Dance', 'Pool'];
/** H14: most bunks camp-wide in one period. Athletics is 3 as a last resort, and the generator wants 2 (see SLOT_PREFERRED). Ropes is one group of 2 (3 as a trio). */
export const SLOT_CAP: Record<string, number> = {
  Athletics: 3,
  'A&C': 2,
  Music: 2,
  Teva: 2,
  Dance: 2,
  Yoga: 1,
  Ceramics: 1,
  Judaics: 1,
  'Israel Education': 1,
  'TW UH': 1,
  Ropes: 2,
};
/** Where the generator prefers to stay: one bunk where two are allowed, and two at Athletics. */
export const SLOT_PREFERRED: Record<string, number> = { Athletics: 2, Music: 1, Teva: 1, Dance: 1 };
/** H15: most bunks of one village at this area in one day. */
export const DAY_CAP: Record<string, number> = {
  Athletics: 2,
  'A&C': 2,
  Music: 2,
  Teva: 2,
  Dance: 2,
  Yoga: 1,
  Ceramics: 1,
  Judaics: 1,
  'Israel Education': 1,
  'TW UH': 1,
};
/** H15: most blocks of this area one bunk may have in a week. */
export const WEEK_BLOCK_MAX: Record<string, number> = { Athletics: 2, 'A&C': 2 };

// ---- Pool (H16) ---------------------------------------------------------------------------------

/** Total campers at the pool in one period, except a whole village. */
export const POOL_MAX_CAMPERS = 80;
/** An O or C bunk's first this many regular Pool blocks are lessons, one bunk alone. The Swim Test is not a lesson. */
export const POOL_LESSONS = 2;

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
/** Villages that are over-subscribed by design: they may end a rare area one block short, and Athletics/A&C two apart, with a warning. */
export const FLEXIBLE_VILLAGES = ['M', 'T'];
/** Last-resort extra Time with UH blocks a bunk may get to fill an otherwise unfillable period. */
export const UH_MAX_PER_SESSION = 2;
/** A week never counts as having less than this many spare periods when spreading quotas, so it is never fully shut out. */
export const MIN_WEEK_CAPACITY = 0.1;
/** The last week of a 4-week session is short and crowded, so it takes this share of what a bunk still needs compared with its room. */
export const LAST_WEEK_SHARE = 0.1;
/** Mohawk and Tusc have the least room, so a week further ahead counts for this much less when spreading what they still need. */
export const FLEXIBLE_LATER_WEEK_SHARE = 0.5;
/** If the weeks after this one could take less than this many blocks of an area, the whole need is planned now instead of being left to a lottery. */
export const LATER_WEEKS_NEGLIGIBLE = 0.25;
/** Used for pool caps when a bunk has no camper count. */
export const DEFAULT_CAMPERS = 12;
/** Most randomized attempts per generate; the lowest-scoring valid one wins. */
export const ATTEMPTS = 40;
/** DEFAULT: stop early once this many attempts came out with no rule breaks, to keep generating fast. */
export const ENOUGH_VALID_ATTEMPTS = 12;

// ---- Quality: when is a generated week good enough to hand back? ------------------------------

/** The rarer areas: a bunk may fall a block short on these under the limits below. */
export const RARE_AREAS = ['Yoga', 'Ceramics', 'Teva', 'Israel Education', 'Judaics', 'Dance', 'TW UH'];
/** A rare area this many blocks short (or more) for one bunk is never acceptable. */
export const RARE_SHORT_MAJOR_AT = 2;
/** O, C and S bunks may each be one block short on a rare area, but only this many bunks in a week. */
export const RARE_OCS_MAX_SHORT_BUNKS = 2;
/** A Mohawk or Tusc bunk with this many rare-area blocks short in one week is not acceptable. */
export const RARE_MT_MAX_SHORT_PER_BUNK = 1;
/** Athletics and A&C may differ by this much per bunk (O, C, S) or (M, T). Exactly at the limit is fine, beyond it is not. */
export const GAP_MAX_OCS = 1;
export const GAP_MAX_MT = 2;
/** Before the last week of a session a gap can still be levelled out, so it may go this much past the limit. */
export const GAP_SLACK_BEFORE_LAST_WEEK = 0;
/**
 * Attempts (counted over the whole search) made at the strictest setting before the last-resort rules open up.
 * From SINGLES_AFTER on, Athletics may hold unrelated bunks (up to 3 in a period); from TRIO_AFTER on, three consecutive
 * bunks of one village may share Ropes or Athletics.
 */
export const SINGLES_AFTER = 0;
export const TRIO_AFTER = 64;
/** The synchronous generateWeek stops after this long and returns its best week. The browser never uses it: it keeps going until the week is good, or the user cancels. */
export const SYNC_MAX_MS = 10000;

export const HOBBY_WED_PM_PROBABILITY = 0.65; // otherwise Tuesday AM
export const HOBBY_SUNDAY_PROBABILITY = 0.2;

// ---- Soft-preference weights (lower total score is better) --------------------------------

export const WEIGHTS = {
  fairnessPerBlock: 50,
  wetThenActive: 15,
  athleticsBeforePoolBonus: 5,
  poolBeforeAthletics: 15,
  extraWetInDay: 25,
  /** A second bunk in Music, Teva or Dance, where one is preferred. */
  sharedPreferredOne: 6,
  /** A second bunk at Athletics (one bunk is best). */
  athleticsPair: 8,
  /** A third bunk at Athletics: a pair plus a single, or three unrelated singles. */
  athleticsThird: 60,
  /** Unrelated bunks together at Athletics. */
  athleticsUnrelated: 100,
  /** Three consecutive bunks together at Athletics or Ropes. */
  trio: 150,
  /** A pair that is more than half a grade apart. */
  pairFarAge: 3,
  /** Pool group smaller than 2 bunks for S and M, or bigger than 5. */
  poolGroupSize: 4,
};
