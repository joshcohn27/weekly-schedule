// Every number the Auto generate feature uses lives here. Where the written spec was silent,
// the choice made is marked "DEFAULT" so it is easy to find and change.

export type SessionWeeks = 3 | 4;

export const LEAGUE_LABEL: Record<string, string> = { O: 'League', C: 'CHL', S: 'SSL', M: 'MNL', T: 'Tusc Triathlon Training' };
/** Mohawk plays MNL in a 4-week session and MAL in a 3-week session. */
export const leagueLabelFor = (village: string, sessionWeeks: SessionWeeks): string =>
  village === 'M' && sessionWeeks === 3 ? 'MAL' : (LEAGUE_LABEL[village] ?? 'League');
export const ALL_LEAGUE_LABELS = ['League', 'CHL', 'SSL', 'MNL', 'MAL', 'Tusc Triathlon Training'];

// The numbers in SESSION_TARGETS, DANCE_TARGETS, SESSION_FILLER_MAX, SESSION_HARD_MAX, SLOT_CAP and DAY_CAP below are the
// defaults. The Settings tab can change them for a schedule: settings.ts then overwrites these objects in place.

/** Per bunk, over the whole session. Keys are program areas. */
export const SESSION_TARGETS: Record<string, number> = {
  Ropes: 2,
  Judaics: 2,
  'Israel Education': 2,
  Teva: 3,
  Ceramics: 2,
  Yoga: 2,
  'TW UH': 1,
};
/**
 * Areas a bunk may have once more than its target, to fill a period that would otherwise be Athletics or A&C: the most
 * per session. They are one bunk at a time, so asking every bunk for a third would use up nearly every period they have.
 */
export const SESSION_FILLER_MAX: Record<string, number> = { Yoga: 3, Ceramics: 3, Judaics: 3 };
/** H7: the most of each of these a bunk may have in a session. */
export const SESSION_HARD_MAX: Record<string, number> = { Judaics: 3, 'Israel Education': 2, Teva: 3, Ceramics: 3, Yoga: 3, Dance: 3 };
/** Dance blocks per session for each village letter. '*' is a village not listed. */
export const DANCE_TARGETS: Record<string, number> = { O: 3, S: 3, C: 2, T: 2, M: 1, '*': 2 };
/**
 * Every village swims about once a week, so the villages end the session with very nearly the same number of swims.
 * perWeek is a swim that must be there every week; perSession is a total (never more than one for each week of the session)
 * that may be made up in another week when a week has no room.
 */
export const POOL_TARGETS: Record<string, { perWeek?: number; perSession?: number }> = {
  O: { perWeek: 1 },
  C: { perWeek: 1 },
  S: { perSession: 4 },
  M: { perSession: 4 },
  T: { perWeek: 1 },
};
/** DEFAULT: a village letter not listed above is treated like S and M. */
export const POOL_TARGET_OTHER = { perSession: 4 };
/** A bunk with a session total may end this many swims short and still be fine. */
export const POOL_SHORT_OK = 1;
export const WATERFRONT_PER_WEEK = 2;
export const LEAGUE_PER_WEEK = 3; // M: 3 double periods
export const MUSIC_PER_WEEK = 1;
/**
 * Villages with so little room that the weekly Music crowds out A&C. Their bunks have Music in two of the first three weeks
 * (each bunk skips a different week, so the village is never all at Music or all without) and the periods go to A&C instead.
 */
export const MUSIC_LIGHT_VILLAGES = ['M'];
export const MUSIC_LIGHT_PER_SESSION = 2;
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
/** Who may share a period, as set on the Settings tab. The pool never looks at this: its rules are fixed. */
export interface Sharing {
  /** Inside a village: only the bunk next in the list, or any bunk of the village. */
  within: 'next' | 'village';
  /** May the paired villages mix (O with C, S with M)? */
  across: boolean;
  /** How close in grade two bunks must be: the same grade, within one grade, or it does not matter. */
  grades: 'same' | 'one' | 'any';
  /** Pairs set by hand on the grid, "O1|O2" (names in order): true for may, false for may not. They win over the three above. */
  pairs: Record<string, boolean>;
}
/** The sharing in force. settings.ts overwrites it in place; this is the default. */
export const SHARING: Sharing = { within: 'next', across: true, grades: 'one', pairs: {} };

/** Areas where an O bunk may share with a C bunk, or an S bunk with an M bunk. Pool is S with M only. */
export const CROSS_VILLAGE_AREAS = ['Athletics', 'A&C', 'Music', 'Teva', 'Dance', 'Israel Education', 'Pool'];
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
  'Israel Education': 2,
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
  'Israel Education': 2,
  'TW UH': 2,
};
/** H17: these areas are never a double period. A block of them is always one period. */
export const SINGLE_PERIOD_AREAS = ['Athletics', 'A&C'];
/** H15: most blocks of this area one bunk may have in a week. */
export const WEEK_BLOCK_MAX: Record<string, number> = { Athletics: 3, 'A&C': 3, Music: 2 };

// ---- Pool (H16) ---------------------------------------------------------------------------------

/** Total campers at the pool in one period, except a whole village. */
export const POOL_MAX_CAMPERS = 80;
/** A village takes a second swim in a week only when each of its bunks has at least this many periods to spare beyond what is planned. */
export const EXTRA_POOL_MIN_SPARE = 2;
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
/** A bunk away on trips for at least this many periods of a week is not expected to get its weekly Music. */
export const AWAY_PERIODS_NO_MUSIC = 12;
/** Extra periods a later week is assumed to have when sharing out the rare areas, so they are not all used up early. */
export const LATER_WEEK_ROOM_BONUS = 0;
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
/** A Mohawk or Tusc bunk may end the session one block short on this many rare areas. More is not acceptable. */
export const RARE_MT_MAX_SHORT_PER_BUNK = 2;
/** Athletics and A&C may differ by this much per bunk (O, C, S) or (M, T). Exactly at the limit is fine, beyond it is not. */
export const GAP_MAX_OCS = 2;
export const GAP_MAX_MT = 2;
/** Before the last week of a session a gap can still be levelled out, so it may go this much past the limit. */
export const GAP_SLACK_BEFORE_LAST_WEEK = 0;
/** Attempts (counted over the whole search) made before three consecutive bunks of one village may share Ropes. */
export const TRIO_AFTER = 64;
/**
 * In the app a week that does not come out good is thrown away and generated again. One try at a week lasts this long at
 * most; after APP_BACK_UP_AFTER failed tries the week before it is redone as well.
 */
export const APP_MAX_MS = 20000;
export const APP_BACK_UP_AFTER = 2;
/**
 * A run never hands back a week that is not good unless it has been going this long in all: then a week that cannot be made
 * good (a roster that does not fit, a week filled in by hand in a way no schedule can meet) still comes back. Cancel stops it sooner.
 */
export const APP_TOTAL_MAX_MS = 600000;
/** The synchronous generateWeek stops after this long and returns its best week. The browser never uses it: it keeps going until the week is good, or the user cancels. */
export const SYNC_MAX_MS = 10000;

/** Steps the fill search may take on one attempt before giving up, and steps spent on preferences once nothing breaks a rule. */
export const FILL_MAX_STEPS = 6000;
export const FILL_POLISH_STEPS = 500;
/** The fill search gives up on an attempt after this many steps without getting any closer. */
export const FILL_STALL_STEPS = 500;
/** A period the fill search just changed is left alone for about this many steps. */
export const FILL_REST_STEPS = 8;
/** Chance the fill search takes its best move even when it does not help, to get out of a dead end. */
export const FILL_NOISE = 0.25;

/**
 * Building around periods someone filled in by hand (other than trips) can make a target unreachable, so each limit
 * on shortfalls and on the Athletics and A&C gap is this much looser for such a week.
 */
export const BUILD_AROUND_STRETCH = 1;
/**
 * Waterfront likes one half-day a week with no village there. When true, one village (the one furthest ahead) gets one block
 * fewer. It is off: the two periods it frees for a whole village can only become Athletics or A&C, and that made weeks fail.
 */
export const WATERFRONT_HALF_DAY_OFF = false;

/**
 * H18: a bunk never has the same kind of period two days in a row (Athletics on Monday and again on Tuesday). Trips are
 * exempt, and Friday into Sunday does not count. League is three times a week where three days that are not next to each
 * other can be found; a week too short for that (the last week of a 4-week session has four days) has this many.
 */
export const LEAGUE_MIN_PER_WEEK = 2;
/** How strongly league is drawn to the set of days it is aiming for. */
export const NEXT_DAY_WEIGHT = 3;
/** Sets of three days with none next to each other, for a village's three league periods (0 is Sunday). */
export const LEAGUE_DAY_PATTERNS = [
  [0, 2, 4],
  [0, 2, 5],
  [0, 3, 5],
  [1, 3, 5],
];
/** Time with UH fills periods nothing else can, and the last weeks need it most: before the last week a bunk is kept this many under its limit. */
export const UH_HELD_BACK = 1;
/** A bunk away on trips for at least this many periods of a week is squeezed onto few days, and may use what was held back. */
export const UH_RELEASE_TRIP_PERIODS = 4;

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
  /** A second Music in a week: allowed when it fits, but it is there to fill a period, not a target. */
  musicExtra: 6,
  /** Each Time with UH beyond a bunk's first: it is there to fill a period nothing else can, so it is saved for when it is needed. */
  uhExtra: 15,
  /** Each block Athletics and A&C are more than one apart, even where that is still allowed: closer is better. */
  gapWide: 25,
  /** A Yoga, Ceramics or Judaics beyond what was planned for the week: there to fill a period, not a target. */
  fillerExtra: 4,
  /** A Mohawk or Tusc bunk whose leftover periods this week hold no A&C at all. */
  noAcWeek: 30,
  /** Mohawk and Tusc: each block their A&C is not at least one ahead of their Athletics, so the little they have left over leans to A&C. */
  flexibleAcBehind: 40,
};
