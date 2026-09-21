import { villageOf } from './autofill';
import type { Bunk } from './types';

/**
 * For one period (slot), which OTHER bunks already have each activity, as a short note like
 * "(O1, O2)", "(O)" when a whole village has it, or "(all)" when every other bunk does.
 */
export function slotUsage(bunks: Bunk[], slot: number, currentBunkId: string): Map<string, string> {
  const others = bunks.filter((b) => b.id !== currentBunkId && b.name.trim());
  const byLabel = new Map<string, Bunk[]>();
  for (const b of others) {
    const label = b.slots[slot];
    if (label) byLabel.set(label, [...(byLabel.get(label) ?? []), b]);
  }

  const notes = new Map<string, string>();
  for (const [label, have] of byLabel) {
    if (others.length > 1 && have.length === others.length) {
      notes.set(label, '(all)');
      continue;
    }
    const parts: string[] = [];
    const doneVillages = new Set<string>();
    for (const b of have) {
      const village = villageOf(b.name);
      if (doneVillages.has(village)) continue;
      const villageOthers = others.filter((o) => villageOf(o.name) === village);
      const villageHave = have.filter((h) => villageOf(h.name) === village);
      if (villageHave.length === villageOthers.length) {
        parts.push(village);
        doneVillages.add(village);
      } else {
        parts.push(b.name.trim());
      }
    }
    notes.set(label, `(${parts.join(', ')})`);
  }
  return notes;
}
