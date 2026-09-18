import { PERIODS_PER_DAY, SLOT_COUNT } from './config';
import type { Block, Bunk } from './types';

/**
 * Auto-merge. Walks the grid row by row. When a cell has an activity, the block grows
 *  - to the right while the next period (same day) has the same activity (a double period),
 *  - then down while every cell underneath has the same activity (a block shared by bunks).
 * Empty cells are never merged. Every cell ends up in exactly one block.
 */
export function computeBlocks(bunks: Bunk[]): Block[] {
  const rows = bunks.length;
  const used: boolean[][] = bunks.map(() => Array<boolean>(SLOT_COUNT).fill(false));
  const labelAt = (r: number, c: number): string => bunks[r].slots[c] ?? '';
  const blocks: Block[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < SLOT_COUNT; c++) {
      if (used[r][c]) continue;
      const label = labelAt(r, c);

      let w = 1;
      let h = 1;
      if (label) {
        while (
          c + w < SLOT_COUNT &&
          (c + w) % PERIODS_PER_DAY !== 0 && // never merge across a day boundary
          !used[r][c + w] &&
          labelAt(r, c + w) === label
        ) {
          w++;
        }
        grow: while (r + h < rows) {
          for (let k = 0; k < w; k++) {
            if (used[r + h][c + k] || labelAt(r + h, c + k) !== label) break grow;
          }
          h++;
        }
      }

      for (let i = 0; i < h; i++) for (let k = 0; k < w; k++) used[r + i][c + k] = true;
      blocks.push({ row: r, col: c, rowSpan: h, colSpan: w, label });
    }
  }
  return blocks;
}

/** Blocks grouped by the table row they start in, left to right (what a <table> needs). */
export function blocksByRow(blocks: Block[], rowCount: number): Block[][] {
  const out: Block[][] = Array.from({ length: rowCount }, () => []);
  for (const b of blocks) out[b.row].push(b);
  for (const row of out) row.sort((x, y) => x.col - y.col);
  return out;
}
