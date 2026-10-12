import { isGuest, villageOf } from './autofill';
import { POOL_TARGETS, ropesIfRoom, weekly } from './autogen/config';
import { sessionTargetOf } from './autogen/planner';

/** The program areas a bunk is owed a set number of over a session, beyond the ones the Settings tab lists and any that were added. */
const SESSION_AREAS = ['Ropes', 'Pool', 'Music', 'TW UH'];

/**
 * The fewest of a program area a bunk should end the session with, by the numbers in force (the Settings tab), or
 * undefined when nothing is owed: Taste of CSL, an area with no set number (Waterfront, league, Athletics), or ropes for a
 * village that goes only when there is room. A&C is owed once: no bunk goes a session without it. Music is every other
 * week at the least.
 */
export function owedInSession(bunkName: string, area: string, sessionWeeks: number, settingAreas: readonly string[]): number | undefined {
  if (isGuest(bunkName)) return undefined;
  const village = villageOf(bunkName);
  if (area === 'A&C') return 1;
  if (area === 'Music') return weekly().music > 0 ? Math.min(sessionTargetOf(village, sessionWeeks, 'Music'), Math.ceil(sessionWeeks / 2)) : undefined;
  if (area === 'Ropes' && ropesIfRoom(village)) return undefined;
  if (!settingAreas.includes(area) && !SESSION_AREAS.includes(area)) return undefined;
  const owed = sessionTargetOf(village, sessionWeeks, area);
  return owed > 0 ? owed : undefined;
}

/** The fewest a bunk should have in one week: a swim, for the villages that swim every week. Everything else is counted over the session. */
export function owedInWeek(bunkName: string, area: string): number | undefined {
  if (isGuest(bunkName) || area !== 'Pool') return undefined;
  const perWeek = POOL_TARGETS[villageOf(bunkName)]?.perWeek;
  return perWeek && perWeek > 0 ? perWeek : undefined;
}
