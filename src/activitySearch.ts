import { ACTIVITIES, OPTION_GROUPS, type OptionGroup } from './config';

/** The dropdown's groups narrowed to activities whose name or program area contains the query. */
export function searchGroups(query: string): OptionGroup[] {
  const q = query.trim().toLowerCase();
  return OPTION_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((a) => !q || a.label.toLowerCase().includes(q) || (a.area ?? '').toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);
}

export const isListed = (text: string): boolean => ACTIVITIES.some((a) => a.label.toLowerCase() === text.trim().toLowerCase());

/** Typed text that matches a listed activity (any casing) becomes that activity; anything else is a write-in. */
export function canonicalLabel(text: string): string {
  const t = text.trim();
  return ACTIVITIES.find((a) => a.label.toLowerCase() === t.toLowerCase())?.label ?? t;
}
