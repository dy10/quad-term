'use strict';

// Pure layout computation — no DOM, no browser globals.
// Grid indices:
//   0  1
//   2  3
// (user-visible numbering: 1=top-left, 3=top-right, 2=bottom-left, 4=bottom-right)

/**
 * Given the set of closed pane indices and a split ratio, compute the layout
 * for all open panes.
 *
 * @param {Set<number>} closed  - indices (0-3) of closed panes
 * @param {{ col: number, row: number }} splits - ratio 0..1 for col/row divider position
 * @returns {{
 *   gridTemplateColumns: string,
 *   gridTemplateRows: string,
 *   panes: Record<number, { gridColumn: string, gridRow: string }>,
 *   showColSep: boolean,
 *   showRowSep: boolean,
 * }}
 */
function computeLayout(closed, splits = { col: 0.5, row: 0.5 }) {
  const col0HasAny = !closed.has(0) || !closed.has(2);
  const col1HasAny = !closed.has(1) || !closed.has(3);
  const row0HasAny = !closed.has(0) || !closed.has(1);
  const row1HasAny = !closed.has(2) || !closed.has(3);

  let gridTemplateColumns, gridTemplateRows;

  if (col0HasAny && col1HasAny) {
    const pct  = (splits.col * 100).toFixed(2);
    const rest = (100 - splits.col * 100).toFixed(2);
    gridTemplateColumns = `calc(${pct}% - 1px) 2px calc(${rest}% - 1px)`;
  } else {
    gridTemplateColumns = '1fr';
  }

  if (row0HasAny && row1HasAny) {
    const pct  = (splits.row * 100).toFixed(2);
    const rest = (100 - splits.row * 100).toFixed(2);
    gridTemplateRows = `calc(${pct}% - 1px) 2px calc(${rest}% - 1px)`;
  } else {
    gridTemplateRows = '1fr';
  }

  const panes = {};
  for (let idx = 0; idx < 4; idx++) {
    if (closed.has(idx)) continue;

    const isTopRow  = idx < 2;
    const isLeftCol = idx % 2 === 0;

    let gridColumn, gridRow;

    // Column: only collapse to single track when the whole opposite column is gone
    if (!col0HasAny || !col1HasAny) {
      gridColumn = '1';
    } else {
      gridColumn = isLeftCol ? '1' : '3';
    }

    // Row: span both row tracks when the column-partner (same col, other row) is closed
    if (!row0HasAny || !row1HasAny) {
      gridRow = '1';
    } else {
      const rowPartner = isTopRow ? idx + 2 : idx - 2;
      gridRow = closed.has(rowPartner) ? '1 / 4' : (isTopRow ? '1' : '3');
    }

    panes[idx] = { gridColumn, gridRow };
  }

  return {
    gridTemplateColumns,
    gridTemplateRows,
    panes,
    showColSep: col0HasAny && col1HasAny,
    showRowSep: row0HasAny && row1HasAny,
  };
}

/**
 * Return the pane index that would be opened by a split from `idx`.
 * direction 'down'  → column-partner (the other pane sharing this column)
 * direction 'right' → row-partner (the other pane sharing this row)
 * Always returns the partner slot regardless of which side it falls on,
 * or null if idx is out of range.
 *
 * @param {number} idx - current pane index (0-3)
 * @param {'down'|'right'} direction
 * @returns {number|null}
 */
function splitTarget(idx, direction) {
  if (idx < 0 || idx > 3) return null;
  if (direction === 'down')  return idx < 2 ? idx + 2 : idx - 2; // column-partner
  if (direction === 'right') return idx % 2 === 0 ? idx + 1 : idx - 1; // row-partner
  return null;
}

if (typeof module !== 'undefined') module.exports = { computeLayout, splitTarget };
