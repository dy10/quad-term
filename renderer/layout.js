'use strict';

// Pure layout computation — no DOM, no browser globals.
//
// Data model:
//   columns: Array<{ id, widthRatio, panes: Array<{ id, heightRatio }> }>
//
// widthRatio values across all columns sum to 1.0.
// heightRatio values within each column sum to 1.0.
//
// CSS grid uses interleaved content + 2px separator tracks:
//   N columns  → (2N-1) column tracks: content, 2px, content, 2px, ...
//   M panes    → (2M-1) row tracks:    content, 2px, content, 2px, ...
// Single column/pane → just '1fr' (no separator track needed).

/**
 * @typedef {{ id: string, heightRatio: number }} Pane
 * @typedef {{ id: string, widthRatio: number, panes: Pane[] }} Column
 */

/**
 * Build a CSS multi-track template from an array of ratios, interleaved with
 * 2px separator tracks. Each content track is `calc(R% - Kpx)` where K
 * distributes the separator pixels evenly (1px per adjacent separator side).
 *
 * @param {number[]} ratios - must sum to 1.0
 * @returns {string}
 */
function buildTemplate(ratios) {
  if (ratios.length === 1) return '1fr';
  const n = ratios.length;
  const tracks = [];
  for (let i = 0; i < n; i++) {
    const pct = (ratios[i] * 100).toFixed(2);
    // Each interior pane loses 1px per adjacent separator; edge panes lose 1px.
    const sepPx = i === 0 || i === n - 1 ? 1 : 2;
    tracks.push(`calc(${pct}% - ${sepPx}px)`);
    if (i < n - 1) tracks.push('2px');
  }
  return tracks.join(' ');
}

/**
 * Compute the full layout for the workspace.
 *
 * @param {Column[]} columns
 * @returns {{
 *   gridTemplateColumns: string,
 *   columns: Array<{
 *     id: string,
 *     gridColumn: string,
 *     gridTemplateRows: string,
 *     panes: Array<{ id: string, gridRow: string }>,
 *   }>,
 *   colSeparators: Array<{
 *     gridColumn: string,
 *     leftColId: string,
 *     rightColId: string,
 *   }>,
 *   rowSeparators: Array<{
 *     colId: string,
 *     gridRow: string,
 *     topPaneId: string,
 *     bottomPaneId: string,
 *   }>,
 * }}
 */
function computeLayout(columns) {
  if (!columns || columns.length === 0) {
    return {
      gridTemplateColumns: '1fr',
      columns: [],
      colSeparators: [],
      rowSeparators: [],
    };
  }

  const gridTemplateColumns = buildTemplate(columns.map(c => c.widthRatio));

  const outColumns = [];
  const colSeparators = [];
  const rowSeparators = [];

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    // Content tracks are at odd 1-based positions: 1, 3, 5, ...
    const gridColumn = String(ci * 2 + 1);

    const panes = col.panes || [];
    const gridTemplateRows = buildTemplate(panes.map(p => p.heightRatio));

    const outPanes = panes.map((pane, pi) => ({
      id: pane.id,
      gridRow: String(pi * 2 + 1),
    }));

    outColumns.push({ id: col.id, gridColumn, gridTemplateRows, panes: outPanes });

    // Column separator sits in the track to the right of this column
    if (ci < columns.length - 1) {
      colSeparators.push({
        gridColumn: String(ci * 2 + 2),
        leftColId: col.id,
        rightColId: columns[ci + 1].id,
      });
    }

    // Row separators within this column
    for (let pi = 0; pi < panes.length - 1; pi++) {
      rowSeparators.push({
        colId: col.id,
        gridRow: String(pi * 2 + 2),
        topPaneId: panes[pi].id,
        bottomPaneId: panes[pi + 1].id,
      });
    }
  }

  return { gridTemplateColumns, columns: outColumns, colSeparators, rowSeparators };
}

/**
 * Snap ratios so they sum exactly to 1.0 by adjusting the last item.
 * Guards against floating-point drift after many drags.
 *
 * @param {{ heightRatio?: number, widthRatio?: number }[]} items
 * @param {'heightRatio'|'widthRatio'} key
 */
function normalizeRatios(items, key) {
  if (items.length === 0) return;
  const sum = items.slice(0, -1).reduce((s, item) => s + item[key], 0);
  items[items.length - 1][key] = Math.max(0, 1 - sum);
}

/**
 * Remove panes[removedIndex], giving its heightRatio to the pane above (or
 * below if it was the first). Mutates the array in place.
 *
 * @param {Pane[]} items
 * @param {number} removedIndex
 */
function redistributeRatios(items, removedIndex) {
  const removed = items[removedIndex];
  items.splice(removedIndex, 1);
  if (items.length === 0) return;
  const target = items[removedIndex - 1] ?? items[0];
  target.heightRatio += removed.heightRatio;
}

/**
 * Remove columns[removedIndex], giving its widthRatio to the column to the
 * left (or right if it was the first). Mutates the array in place.
 *
 * @param {Column[]} columns
 * @param {number} removedIndex
 */
function redistributeWidthRatios(columns, removedIndex) {
  const removed = columns[removedIndex];
  columns.splice(removedIndex, 1);
  if (columns.length === 0) return;
  const target = columns[removedIndex - 1] ?? columns[0];
  target.widthRatio += removed.widthRatio;
}

if (typeof module !== 'undefined') module.exports = { computeLayout, buildTemplate, redistributeRatios, redistributeWidthRatios, normalizeRatios };
