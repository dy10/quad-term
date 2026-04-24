'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout, splitTarget } = require('../renderer/layout.js');

// Grid indices:   User labels:
//   0  1            1  3
//   2  3            2  4

const NONE = new Set();

// ─── All 4 panes open ────────────────────────────────────────────────────────

test('all panes open: 3-track columns and rows', () => {
  const { gridTemplateColumns, gridTemplateRows } = computeLayout(NONE);
  assert.match(gridTemplateColumns, /2px/);
  assert.match(gridTemplateRows,    /2px/);
});

test('all panes open: both separators shown', () => {
  const { showColSep, showRowSep } = computeLayout(NONE);
  assert.equal(showColSep, true);
  assert.equal(showRowSep, true);
});

test('all panes open: correct grid positions', () => {
  const { panes } = computeLayout(NONE);
  assert.equal(panes[0].gridColumn, '1');  // top-left
  assert.equal(panes[0].gridRow,    '1');
  assert.equal(panes[1].gridColumn, '3');  // top-right
  assert.equal(panes[1].gridRow,    '1');
  assert.equal(panes[2].gridColumn, '1');  // bottom-left
  assert.equal(panes[2].gridRow,    '3');
  assert.equal(panes[3].gridColumn, '3');  // bottom-right
  assert.equal(panes[3].gridRow,    '3');
});

// ─── Close pane 2 (user "2", index 2, bottom-left) ───────────────────────────
// Expected: pane 1 (index 0, top-left) expands down to fill the column

test('close bottom-left (idx 2): top-left spans full height', () => {
  const { panes } = computeLayout(new Set([2]));
  assert.equal(panes[0].gridRow, '1 / 4', 'pane 0 should span both row tracks');
});

test('close bottom-left (idx 2): right column panes stay in place', () => {
  const { panes } = computeLayout(new Set([2]));
  assert.equal(panes[1].gridRow, '1');
  assert.equal(panes[3].gridRow, '3');
});

test('close bottom-left (idx 2): col separator still shown, row separator still shown', () => {
  const { showColSep, showRowSep } = computeLayout(new Set([2]));
  assert.equal(showColSep, true);
  assert.equal(showRowSep, true);
});

// ─── Close pane 3 (user "3", index 1, top-right) ─────────────────────────────
// Expected: pane 4 (index 3, bottom-right) expands up to fill the column

test('close top-right (idx 1): bottom-right spans full height', () => {
  const { panes } = computeLayout(new Set([1]));
  assert.equal(panes[3].gridRow, '1 / 4', 'pane 3 should span both row tracks');
});

test('close top-right (idx 1): left column panes stay in place, no col spanning', () => {
  const { panes } = computeLayout(new Set([1]));
  assert.equal(panes[0].gridColumn, '1');
  assert.equal(panes[0].gridRow,    '1');
  assert.equal(panes[2].gridColumn, '1');
  assert.equal(panes[2].gridRow,    '3');
});

test('close top-right (idx 1): bottom-right stays in col 3, not spanning cols', () => {
  const { panes } = computeLayout(new Set([1]));
  assert.equal(panes[3].gridColumn, '3');
});

test('close top-right (idx 1): both separators still shown', () => {
  const { showColSep, showRowSep } = computeLayout(new Set([1]));
  assert.equal(showColSep, true);
  assert.equal(showRowSep, true);
});

// ─── Close pane 1 (user "1", index 0, top-left) ──────────────────────────────
// Expected: pane 2 (index 2, bottom-left) expands up

test('close top-left (idx 0): bottom-left spans full height', () => {
  const { panes } = computeLayout(new Set([0]));
  assert.equal(panes[2].gridRow, '1 / 4');
});

test('close top-left (idx 0): right column panes unaffected, no col spanning', () => {
  const { panes } = computeLayout(new Set([0]));
  assert.equal(panes[1].gridColumn, '3');
  assert.equal(panes[1].gridRow,    '1');
  assert.equal(panes[3].gridColumn, '3');
  assert.equal(panes[3].gridRow,    '3');
  assert.equal(panes[2].gridColumn, '1');
});

// ─── Close pane 4 (user "4", index 3, bottom-right) ──────────────────────────
// Expected: pane 3 (index 1, top-right) expands down

test('close bottom-right (idx 3): top-right spans full height', () => {
  const { panes } = computeLayout(new Set([3]));
  assert.equal(panes[1].gridRow, '1 / 4');
});

test('close bottom-right (idx 3): left column panes unaffected, no col spanning', () => {
  const { panes } = computeLayout(new Set([3]));
  assert.equal(panes[0].gridColumn, '1');
  assert.equal(panes[0].gridRow,    '1');
  assert.equal(panes[2].gridColumn, '1');
  assert.equal(panes[2].gridRow,    '3');
  assert.equal(panes[1].gridColumn, '3');
});

// ─── Close an entire row ──────────────────────────────────────────────────────

test('close entire bottom row (idx 2,3): single row track, no row separator', () => {
  const { gridTemplateRows, showRowSep } = computeLayout(new Set([2, 3]));
  assert.equal(gridTemplateRows, '1fr');
  assert.equal(showRowSep, false);
});

test('close entire bottom row (idx 2,3): panes 0 and 1 both get gridRow 1', () => {
  const { panes } = computeLayout(new Set([2, 3]));
  assert.equal(panes[0].gridRow, '1');
  assert.equal(panes[1].gridRow, '1');
});

test('close entire top row (idx 0,1): single row track, no row separator', () => {
  const { gridTemplateRows, showRowSep } = computeLayout(new Set([0, 1]));
  assert.equal(gridTemplateRows, '1fr');
  assert.equal(showRowSep, false);
});

// ─── Close an entire column ───────────────────────────────────────────────────

test('close entire right col (idx 1,3): single column track, no col separator', () => {
  const { gridTemplateColumns, showColSep } = computeLayout(new Set([1, 3]));
  assert.equal(gridTemplateColumns, '1fr');
  assert.equal(showColSep, false);
});

test('close entire right col (idx 1,3): panes 0 and 2 both get gridColumn 1', () => {
  const { panes } = computeLayout(new Set([1, 3]));
  assert.equal(panes[0].gridColumn, '1');
  assert.equal(panes[2].gridColumn, '1');
});

test('close entire left col (idx 0,2): single column track, no col separator', () => {
  const { gridTemplateColumns, showColSep } = computeLayout(new Set([0, 2]));
  assert.equal(gridTemplateColumns, '1fr');
  assert.equal(showColSep, false);
});

// ─── Diagonal closes ─────────────────────────────────────────────────────────

test('close top-left and bottom-right (idx 0,3): remaining panes span their axes', () => {
  const { panes } = computeLayout(new Set([0, 3]));
  assert.equal(panes[2].gridRow, '1 / 4');
  assert.equal(panes[1].gridRow, '1 / 4');
});

test('close top-left and bottom-right (idx 0,3): columns unchanged', () => {
  const { panes } = computeLayout(new Set([0, 3]));
  assert.equal(panes[2].gridColumn, '1');
  assert.equal(panes[1].gridColumn, '3');
});

test('close top-right and bottom-left (idx 1,2): remaining panes span their axes', () => {
  const { panes } = computeLayout(new Set([1, 2]));
  // pane 0 (top-left): row-partner 2 is closed → spans full height
  assert.equal(panes[0].gridRow, '1 / 4');
  // pane 3 (bottom-right): row-partner 1 is closed → spans full height
  assert.equal(panes[3].gridRow, '1 / 4');
});

test('close top-right and bottom-left (idx 1,2): columns unchanged', () => {
  const { panes } = computeLayout(new Set([1, 2]));
  assert.equal(panes[0].gridColumn, '1');
  assert.equal(panes[3].gridColumn, '3');
});

// ─── Only one pane left ───────────────────────────────────────────────────────

for (const [sole, others] of [
  [0, [1, 2, 3]],
  [1, [0, 2, 3]],
  [2, [0, 1, 3]],
  [3, [0, 1, 2]],
]) {
  test(`only pane ${sole} open: single track in both axes, no separators, placed at 1/1`, () => {
    const { gridTemplateColumns, gridTemplateRows, showColSep, showRowSep, panes } =
      computeLayout(new Set(others));
    assert.equal(gridTemplateColumns, '1fr');
    assert.equal(gridTemplateRows,    '1fr');
    assert.equal(showColSep, false);
    assert.equal(showRowSep, false);
    assert.equal(panes[sole].gridColumn, '1');
    assert.equal(panes[sole].gridRow,    '1');
  });
}

// ─── Entire row collapse: column positions of survivors ──────────────────────

test('close entire bottom row (idx 2,3): surviving panes keep correct column positions', () => {
  const { panes } = computeLayout(new Set([2, 3]));
  assert.equal(panes[0].gridColumn, '1');
  assert.equal(panes[1].gridColumn, '3');
});

test('close entire top row (idx 0,1): surviving panes keep correct column positions', () => {
  const { panes } = computeLayout(new Set([0, 1]));
  assert.equal(panes[2].gridColumn, '1');
  assert.equal(panes[3].gridColumn, '3');
  assert.equal(panes[2].gridRow, '1');
  assert.equal(panes[3].gridRow, '1');
});

// ─── Entire column collapse: row positions of survivors ──────────────────────

test('close entire right col (idx 1,3): surviving panes keep correct row positions', () => {
  const { panes } = computeLayout(new Set([1, 3]));
  assert.equal(panes[0].gridRow, '1');
  assert.equal(panes[2].gridRow, '3');
});

test('close entire left col (idx 0,2): surviving panes in col 1, correct row positions', () => {
  const { panes } = computeLayout(new Set([0, 2]));
  assert.equal(panes[1].gridColumn, '1');
  assert.equal(panes[3].gridColumn, '1');
  assert.equal(panes[1].gridRow, '1');
  assert.equal(panes[3].gridRow, '3');
});

// ─── Custom split ratio ───────────────────────────────────────────────────────

test('custom split ratio is reflected in grid template', () => {
  const { gridTemplateColumns, gridTemplateRows } =
    computeLayout(NONE, { col: 0.3, row: 0.7 });
  assert.match(gridTemplateColumns, /30\.00%/);
  assert.match(gridTemplateRows,    /70\.00%/);
});

test('split at min boundary (0.1): template contains 10.00%', () => {
  const { gridTemplateColumns, gridTemplateRows } =
    computeLayout(NONE, { col: 0.1, row: 0.1 });
  assert.match(gridTemplateColumns, /10\.00%/);
  assert.match(gridTemplateRows,    /10\.00%/);
});

test('split at max boundary (0.9): template contains 90.00%', () => {
  const { gridTemplateColumns, gridTemplateRows } =
    computeLayout(NONE, { col: 0.9, row: 0.9 });
  assert.match(gridTemplateColumns, /90\.00%/);
  assert.match(gridTemplateRows,    /90\.00%/);
});

test('split ratio ignored when only one column track exists', () => {
  const { gridTemplateColumns } = computeLayout(new Set([1, 3]), { col: 0.3, row: 0.5 });
  assert.equal(gridTemplateColumns, '1fr');
});

test('split ratio ignored when only one row track exists', () => {
  const { gridTemplateRows } = computeLayout(new Set([2, 3]), { col: 0.5, row: 0.3 });
  assert.equal(gridTemplateRows, '1fr');
});

// ─── Closed panes not present in output ──────────────────────────────────────

test('closed panes are absent from the panes output', () => {
  const { panes } = computeLayout(new Set([1, 2]));
  assert.equal(panes[1], undefined);
  assert.equal(panes[2], undefined);
  assert.notEqual(panes[0], undefined);
  assert.notEqual(panes[3], undefined);
});

// ─── splitTarget ─────────────────────────────────────────────────────────────

// split down: always opens the column-partner (other pane in the same column)
test('splitTarget: pane 0 down → 2', () => assert.equal(splitTarget(0, 'down'), 2));
test('splitTarget: pane 1 down → 3', () => assert.equal(splitTarget(1, 'down'), 3));
test('splitTarget: pane 2 down → 0', () => assert.equal(splitTarget(2, 'down'), 0));
test('splitTarget: pane 3 down → 1', () => assert.equal(splitTarget(3, 'down'), 1));

// split right: always opens the row-partner (other pane in the same row)
test('splitTarget: pane 0 right → 1', () => assert.equal(splitTarget(0, 'right'), 1));
test('splitTarget: pane 1 right → 0', () => assert.equal(splitTarget(1, 'right'), 0));
test('splitTarget: pane 2 right → 3', () => assert.equal(splitTarget(2, 'right'), 3));
test('splitTarget: pane 3 right → 2', () => assert.equal(splitTarget(3, 'right'), 2));

// out of range
test('splitTarget: invalid idx → null', () => assert.equal(splitTarget(5, 'down'), null));
