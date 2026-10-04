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
/** H14: most bunks camp-wide in one period. Athletics takes two or three. A&C takes two, or three of the same age. Time with UH takes two bunks of one village. Ropes is one group of 2 (3 as a trio). */
export const SLOT_CAP: Record<string, number> = {
  Athletics: 3,
  'A&C': 3,
  Music: 2,
  Teva: 2,
  Dance: 2,
  Yoga: 1,
  Ceramics: 1,
  Judaics: 1,
  'Israel Education': 1,
  'TW UH': 2,
  Ropes: 2,
};
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
  'TW UH': 2,
};
/** H15: most blocks of this area one bunk may have in a week. */
export const WEEK_BLOCK_MAX: Record<string, number> = { Athletics: 2, 'A&C': 2 };

// ---- Pool (H16) ---------------------------------------------------------------------------------

/** Total campers at the pool in one period, except a whole village. */
export const POOL_MAX_CAMPERS = 80;
/** When a week has more than this many leftover bunk-periods per period, villages get a second Pool block. */
export const EXTRA_POOL_ABOVE = 3.5;
/** Most times a bunk swims in one week. */
export const POOL_MAX_PER_WEEK = 2;
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
/** Time with UH is planned once a session; a bunk may get it up to this many times when its periods cannot be filled otherwise. */
export const UH_MAX_PER_SESSION = 3;
/** Periods with activities in a normal week (hobbies take two half-days) and in the last week of a 4-week session. */
export const NORMAL_WEEK_PERIODS = 20;
export const LAST_WEEK_PERIODS = 14;
/** A bunk away on trips for at least this many periods of a week is not expected to get its weekly Music. */
export const AWAY_PERIODS_NO_MUSIC = 12;
/** A week never counts as having less than this many spare periods when spreading quotas, so it is never fully shut out. */
export const MIN_WEEK_CAPACITY = 0.1;
/** The last week of a 4-week session is short and crowded, so it takes this share of what a bunk still needs compared with its room. */
export const LAST_WEEK_SHARE = 1;
/** Mohawk and Tusc have the least room, so a week further ahead counts for this much less when spreading what they still need. */
export const FLEXIBLE_LATER_WEEK_SHARE = 1;
/** If the weeks after this one could take less than this many blocks of an area, the whole need is planned now instead of being left to a lottery. */
export const LATER_WEEKS_NEGLIGIBLE = 0.25;
/** Used for pool caps when a bunk has no camper count. */
export const DEFAULT_CAMPERS = 12;
/** Randomized attempts per round. A round shares one calendar draw (which half-days are hobbies), so a short round moves on quickly from a draw that does not work. */
export const ATTEMPTS = 8;
/** DEFAULT: stop early once this many attempts came out with no rule breaks, to keep generating fast. */
export const ENOUGH_VALID_ATTEMPTS = 1;

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
/** Attempts (counted over the whole search) made before three consecutive bunks of one village may share Ropes. */
export const TRIO_AFTER = 64;
/** The synchronous generateWeek stops after this long and returns its best week. The browser never uses it: it keeps going until the week is good, or the user cancels. */
export const SYNC_MAX_MS = 10000;

/** Steps the fill search may take on one attempt before giving up, and steps spent on preferences once nothing breaks a rule. */
export const FILL_MAX_STEPS = 6000;
export const FILL_POLISH_STEPS = 150;
/** The fill search gives up on an attempt after this many steps without getting any closer. */
export const FILL_STALL_STEPS = 500;
/** A period the fill search just changed is left alone for about this many steps. */
export const FILL_REST_STEPS = 8;
/** Chance the fill search takes its best move even when it does not help, to get out of a dead end. */
export const FILL_NOISE = 0.25;

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
  /** A third bunk at Athletics or A&C: fine, but two is a little better. */
  thirdBunk: 2,
  /** Bunks at Athletics together who are on different visits. */
  athleticsUnequal: 1.5,
  /** Three consecutive bunks together at Ropes. */
  trio: 150,
  /** A pair that is more than half a grade apart. */
  pairFarAge: 3,
  /** Pool group smaller than 2 bunks for S and M, or bigger than 5. */
  poolGroupSize: 4,
  /** Each block a bunk's Athletics and A&C are further apart than allowed. Not a rule break, but never acceptable. */
  gapOver: 300,
  /** Athletics ahead of A&C (when they differ, A&C should be the higher one). */
  athleticsAhead: 2,
  /** Each block Athletics and A&C are more than one apart, even where that is still allowed: closer is better. */
  gapWide: 25,
};
