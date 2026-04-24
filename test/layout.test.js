'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout, buildTemplate, redistributeRatios, redistributeWidthRatios, normalizeRatios } = require('../renderer/layout.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function col(id, widthRatio, ...panes) {
  return { id, widthRatio, panes: panes.map(([pid, h]) => ({ id: pid, heightRatio: h })) };
}

// 2×2 starting state (matches createTab defaults)
const TWO_BY_TWO = [
  col('c0', 0.5, ['p00', 0.5], ['p01', 0.5]),
  col('c1', 0.5, ['p10', 0.5], ['p11', 0.5]),
];

// ─── buildTemplate ───────────────────────────────────────────────────────────

test('buildTemplate: single ratio → 1fr', () => {
  assert.equal(buildTemplate([1]), '1fr');
});

test('buildTemplate: two equal ratios → one 2px separator', () => {
  const t = buildTemplate([0.5, 0.5]);
  const sepCount = (t.match(/ 2px /g) || []).length;
  assert.equal(sepCount, 1);
});

test('buildTemplate: three ratios → two 2px separators', () => {
  const t = buildTemplate([0.3, 0.4, 0.3]);
  const sepCount = (t.match(/ 2px /g) || []).length;
  assert.equal(sepCount, 2);
});

test('buildTemplate: ratios reflected in percentages', () => {
  const t = buildTemplate([0.3, 0.7]);
  assert.match(t, /30\.00%/);
  assert.match(t, /70\.00%/);
});

// ─── Empty / edge inputs ─────────────────────────────────────────────────────

test('computeLayout: empty columns → 1fr, no separators', () => {
  const r = computeLayout([]);
  assert.equal(r.gridTemplateColumns, '1fr');
  assert.equal(r.columns.length, 0);
  assert.equal(r.colSeparators.length, 0);
  assert.equal(r.rowSeparators.length, 0);
});

test('computeLayout: null columns → 1fr, no separators', () => {
  const r = computeLayout(null);
  assert.equal(r.gridTemplateColumns, '1fr');
});

// ─── Single column ────────────────────────────────────────────────────────────

test('single column: gridTemplateColumns is 1fr', () => {
  const r = computeLayout([col('c0', 1, ['p0', 1])]);
  assert.equal(r.gridTemplateColumns, '1fr');
});

test('single column: gridColumn is 1', () => {
  const r = computeLayout([col('c0', 1, ['p0', 1])]);
  assert.equal(r.columns[0].gridColumn, '1');
});

test('single column, single pane: gridTemplateRows is 1fr', () => {
  const r = computeLayout([col('c0', 1, ['p0', 1])]);
  assert.equal(r.columns[0].gridTemplateRows, '1fr');
});

test('single column, single pane: pane gridRow is 1', () => {
  const r = computeLayout([col('c0', 1, ['p0', 1])]);
  assert.equal(r.columns[0].panes[0].gridRow, '1');
});

test('single column, single pane: no separators', () => {
  const r = computeLayout([col('c0', 1, ['p0', 1])]);
  assert.equal(r.colSeparators.length, 0);
  assert.equal(r.rowSeparators.length, 0);
});

// ─── Two columns ─────────────────────────────────────────────────────────────

test('two columns: gridTemplateColumns has 2px separator', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.match(r.gridTemplateColumns, /2px/);
});

test('two columns: first col gridColumn is 1', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.columns[0].gridColumn, '1');
});

test('two columns: second col gridColumn is 3', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.columns[1].gridColumn, '3');
});

test('two columns: one col separator at gridColumn 2', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.colSeparators.length, 1);
  assert.equal(r.colSeparators[0].gridColumn, '2');
});

test('two columns: col separator has correct leftColId and rightColId', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.colSeparators[0].leftColId, 'c0');
  assert.equal(r.colSeparators[0].rightColId, 'c1');
});

// ─── Three columns ────────────────────────────────────────────────────────────

test('three columns: col gridColumns are 1, 3, 5', () => {
  const cols = [
    col('a', 0.33, ['p0', 1]),
    col('b', 0.34, ['p1', 1]),
    col('c', 0.33, ['p2', 1]),
  ];
  const r = computeLayout(cols);
  assert.equal(r.columns[0].gridColumn, '1');
  assert.equal(r.columns[1].gridColumn, '3');
  assert.equal(r.columns[2].gridColumn, '5');
});

test('three columns: two col separators at gridColumns 2 and 4', () => {
  const cols = [
    col('a', 0.33, ['p0', 1]),
    col('b', 0.34, ['p1', 1]),
    col('c', 0.33, ['p2', 1]),
  ];
  const r = computeLayout(cols);
  assert.equal(r.colSeparators.length, 2);
  assert.equal(r.colSeparators[0].gridColumn, '2');
  assert.equal(r.colSeparators[1].gridColumn, '4');
});

test('three columns: separator col IDs correct', () => {
  const cols = [
    col('a', 0.33, ['p0', 1]),
    col('b', 0.34, ['p1', 1]),
    col('c', 0.33, ['p2', 1]),
  ];
  const r = computeLayout(cols);
  assert.equal(r.colSeparators[0].leftColId, 'a');
  assert.equal(r.colSeparators[0].rightColId, 'b');
  assert.equal(r.colSeparators[1].leftColId, 'b');
  assert.equal(r.colSeparators[1].rightColId, 'c');
});

// ─── Per-column row tracks ────────────────────────────────────────────────────

test('column with 2 panes: gridTemplateRows has 2px', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.match(r.columns[0].gridTemplateRows, /2px/);
});

test('column with 2 panes: pane gridRows are 1 and 3', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.columns[0].panes[0].gridRow, '1');
  assert.equal(r.columns[0].panes[1].gridRow, '3');
});

test('column with 3 panes: pane gridRows are 1, 3, 5', () => {
  const threePane = [col('c0', 1, ['p0', 0.33], ['p1', 0.34], ['p2', 0.33])];
  const r = computeLayout(threePane);
  assert.equal(r.columns[0].panes[0].gridRow, '1');
  assert.equal(r.columns[0].panes[1].gridRow, '3');
  assert.equal(r.columns[0].panes[2].gridRow, '5');
});

test('column with 3 panes: gridTemplateRows has two 2px tracks', () => {
  const threePane = [col('c0', 1, ['p0', 0.33], ['p1', 0.34], ['p2', 0.33])];
  const r = computeLayout(threePane);
  const sepCount = (r.columns[0].gridTemplateRows.match(/ 2px /g) || []).length;
  assert.equal(sepCount, 2);
});

// ─── Row separator descriptors ────────────────────────────────────────────────

test('column with 1 pane: no row separators', () => {
  const r = computeLayout([col('c0', 1, ['p0', 1])]);
  assert.equal(r.rowSeparators.length, 0);
});

test('column with 2 panes: one row separator', () => {
  const r = computeLayout(TWO_BY_TWO);
  const rowSeps = r.rowSeparators.filter(s => s.colId === 'c0');
  assert.equal(rowSeps.length, 1);
});

test('column with 2 panes: row separator gridRow is 2', () => {
  const r = computeLayout(TWO_BY_TWO);
  const sep = r.rowSeparators.find(s => s.colId === 'c0');
  assert.equal(sep.gridRow, '2');
});

test('column with 2 panes: row separator has correct pane IDs', () => {
  const r = computeLayout(TWO_BY_TWO);
  const sep = r.rowSeparators.find(s => s.colId === 'c0');
  assert.equal(sep.topPaneId, 'p00');
  assert.equal(sep.bottomPaneId, 'p01');
});

test('column with 3 panes: two row separators at gridRows 2 and 4', () => {
  const threePane = [col('c0', 1, ['p0', 0.33], ['p1', 0.34], ['p2', 0.33])];
  const r = computeLayout(threePane);
  assert.equal(r.rowSeparators.length, 2);
  assert.equal(r.rowSeparators[0].gridRow, '2');
  assert.equal(r.rowSeparators[1].gridRow, '4');
});

test('two columns with different pane counts: row separators are independent', () => {
  const cols = [
    col('c0', 0.5, ['p00', 0.33], ['p01', 0.34], ['p02', 0.33]),
    col('c1', 0.5, ['p10', 1]),
  ];
  const r = computeLayout(cols);
  const c0seps = r.rowSeparators.filter(s => s.colId === 'c0');
  const c1seps = r.rowSeparators.filter(s => s.colId === 'c1');
  assert.equal(c0seps.length, 2);
  assert.equal(c1seps.length, 0);
});

// ─── 2×2 starting state (regression anchor) ──────────────────────────────────

test('2x2 starting state: correct gridTemplateColumns', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.match(r.gridTemplateColumns, /2px/);
  assert.equal(r.columns.length, 2);
});

test('2x2 starting state: all pane gridRows and gridColumns correct', () => {
  const r = computeLayout(TWO_BY_TWO);
  // col 0
  assert.equal(r.columns[0].gridColumn, '1');
  assert.equal(r.columns[0].panes[0].gridRow, '1');
  assert.equal(r.columns[0].panes[1].gridRow, '3');
  // col 1
  assert.equal(r.columns[1].gridColumn, '3');
  assert.equal(r.columns[1].panes[0].gridRow, '1');
  assert.equal(r.columns[1].panes[1].gridRow, '3');
});

test('2x2 starting state: one col separator, two row separators', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.colSeparators.length, 1);
  assert.equal(r.rowSeparators.length, 2);
});

test('2x2 starting state: each column has its own row separator', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.ok(r.rowSeparators.find(s => s.colId === 'c0'));
  assert.ok(r.rowSeparators.find(s => s.colId === 'c1'));
});

// ─── Custom ratios ────────────────────────────────────────────────────────────

test('custom column width ratios reflected in gridTemplateColumns', () => {
  const cols = [
    col('c0', 0.3, ['p0', 1]),
    col('c1', 0.7, ['p1', 1]),
  ];
  const r = computeLayout(cols);
  assert.match(r.gridTemplateColumns, /30\.00%/);
  assert.match(r.gridTemplateColumns, /70\.00%/);
});

test('custom pane height ratios reflected in gridTemplateRows', () => {
  const cols = [col('c0', 1, ['p0', 0.4], ['p1', 0.6])];
  const r = computeLayout(cols);
  assert.match(r.columns[0].gridTemplateRows, /40\.00%/);
  assert.match(r.columns[0].gridTemplateRows, /60\.00%/);
});

test('two columns with different height ratios: each column independent', () => {
  const cols = [
    col('c0', 0.5, ['p00', 0.3], ['p01', 0.7]),
    col('c1', 0.5, ['p10', 0.6], ['p11', 0.4]),
  ];
  const r = computeLayout(cols);
  assert.match(r.columns[0].gridTemplateRows, /30\.00%/);
  assert.match(r.columns[1].gridTemplateRows, /60\.00%/);
});

// ─── Pane IDs in output match input ──────────────────────────────────────────

test('pane IDs in output match input order', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.columns[0].panes[0].id, 'p00');
  assert.equal(r.columns[0].panes[1].id, 'p01');
  assert.equal(r.columns[1].panes[0].id, 'p10');
  assert.equal(r.columns[1].panes[1].id, 'p11');
});

test('column IDs in output match input', () => {
  const r = computeLayout(TWO_BY_TWO);
  assert.equal(r.columns[0].id, 'c0');
  assert.equal(r.columns[1].id, 'c1');
});

// ─── buildTemplate: pixel corrections ────────────────────────────────────────

test('buildTemplate: edge panes use -1px correction', () => {
  const t = buildTemplate([0.5, 0.5]);
  // Both tracks are edge panes → both use -1px
  assert.ok(!t.includes('- 2px'), `unexpected -2px in: ${t}`);
  assert.match(t, /- 1px/);
});

test('buildTemplate: interior pane uses -2px correction', () => {
  const t = buildTemplate([0.25, 0.5, 0.25]);
  // Middle pane is interior → uses -2px
  assert.match(t, /- 2px/);
});

test('buildTemplate: non-unity sum still produces valid CSS', () => {
  // After a drag the ratios may not be exactly 1.0
  const t = buildTemplate([0.6001, 0.4001]);
  assert.match(t, /60\.01%/);
  assert.match(t, /40\.01%/);
});

// ─── computeLayout: immutability ──────────────────────────────────────────────

test('computeLayout: does not mutate input columns array', () => {
  const cols = [
    col('c0', 0.5, ['p00', 0.5], ['p01', 0.5]),
    col('c1', 0.5, ['p10', 0.5], ['p11', 0.5]),
  ];
  const before = JSON.stringify(cols);
  computeLayout(cols);
  assert.equal(JSON.stringify(cols), before);
});

// ─── redistributeRatios ───────────────────────────────────────────────────────

function panes(...ratios) {
  return ratios.map((h, i) => ({ id: `p${i}`, heightRatio: h }));
}

test('redistributeRatios: removes the pane at the given index', () => {
  const items = panes(0.5, 0.5);
  redistributeRatios(items, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'p1');
});

test('redistributeRatios: removing first pane gives ratio to second', () => {
  const items = panes(0.4, 0.6);
  redistributeRatios(items, 0);
  assert.equal(items.length, 1);
  assert.ok(Math.abs(items[0].heightRatio - 1.0) < 1e-9);
});

test('redistributeRatios: removing last pane gives ratio to pane above', () => {
  const items = panes(0.3, 0.7);
  redistributeRatios(items, 1);
  assert.equal(items.length, 1);
  assert.ok(Math.abs(items[0].heightRatio - 1.0) < 1e-9);
});

test('redistributeRatios: removing middle pane gives ratio to pane above', () => {
  const items = panes(0.25, 0.5, 0.25);
  redistributeRatios(items, 1);
  assert.equal(items.length, 2);
  // pane above (index 0) absorbs the removed pane's ratio
  assert.ok(Math.abs(items[0].heightRatio - 0.75) < 1e-9);
  assert.ok(Math.abs(items[1].heightRatio - 0.25) < 1e-9);
});

test('redistributeRatios: ratios still sum to 1 after removal', () => {
  const items = panes(0.2, 0.5, 0.3);
  redistributeRatios(items, 2);
  const sum = items.reduce((s, p) => s + p.heightRatio, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9);
});

test('redistributeRatios: removing sole pane leaves empty array', () => {
  const items = panes(1.0);
  redistributeRatios(items, 0);
  assert.equal(items.length, 0);
});

// ─── redistributeWidthRatios ──────────────────────────────────────────────────

function cols(...ratios) {
  return ratios.map((w, i) => ({ id: `c${i}`, widthRatio: w, panes: [] }));
}

test('redistributeWidthRatios: removes the column at the given index', () => {
  const columns = cols(0.5, 0.5);
  redistributeWidthRatios(columns, 1);
  assert.equal(columns.length, 1);
  assert.equal(columns[0].id, 'c0');
});

test('redistributeWidthRatios: removing first column gives ratio to second', () => {
  const columns = cols(0.4, 0.6);
  redistributeWidthRatios(columns, 0);
  assert.equal(columns.length, 1);
  assert.ok(Math.abs(columns[0].widthRatio - 1.0) < 1e-9);
});

test('redistributeWidthRatios: removing last column gives ratio to column left', () => {
  const columns = cols(0.3, 0.7);
  redistributeWidthRatios(columns, 1);
  assert.equal(columns.length, 1);
  assert.ok(Math.abs(columns[0].widthRatio - 1.0) < 1e-9);
});

test('redistributeWidthRatios: removing middle column gives ratio to column left', () => {
  const columns = cols(0.25, 0.5, 0.25);
  redistributeWidthRatios(columns, 1);
  assert.equal(columns.length, 2);
  assert.ok(Math.abs(columns[0].widthRatio - 0.75) < 1e-9);
  assert.ok(Math.abs(columns[1].widthRatio - 0.25) < 1e-9);
});

test('redistributeWidthRatios: ratios still sum to 1 after removal', () => {
  const columns = cols(0.2, 0.5, 0.3);
  redistributeWidthRatios(columns, 0);
  const sum = columns.reduce((s, c) => s + c.widthRatio, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9);
});

test('redistributeWidthRatios: removing sole column leaves empty array', () => {
  const columns = cols(1.0);
  redistributeWidthRatios(columns, 0);
  assert.equal(columns.length, 0);
});

// ─── buildTemplate: empty input ──────────────────────────────────────────────

test('buildTemplate: empty array → empty string', () => {
  assert.equal(buildTemplate([]), '');
});

// ─── computeLayout: column with no panes ─────────────────────────────────────

test('computeLayout: column with empty panes array → 1fr rows, no row separators', () => {
  const r = computeLayout([{ id: 'c0', widthRatio: 1, panes: [] }]);
  assert.equal(r.columns[0].gridTemplateRows, '');
  assert.equal(r.rowSeparators.length, 0);
});

// ─── redistribute: correct panes/columns survive ─────────────────────────────

test('redistributeRatios: correct panes survive when middle is removed', () => {
  const items = [
    { id: 'a', heightRatio: 0.25 },
    { id: 'b', heightRatio: 0.50 },
    { id: 'c', heightRatio: 0.25 },
  ];
  redistributeRatios(items, 1);
  assert.equal(items[0].id, 'a');
  assert.equal(items[1].id, 'c');
});

test('redistributeRatios: correct panes survive when first is removed', () => {
  const items = [
    { id: 'a', heightRatio: 0.3 },
    { id: 'b', heightRatio: 0.7 },
  ];
  redistributeRatios(items, 0);
  assert.equal(items[0].id, 'b');
});

test('redistributeWidthRatios: correct columns survive when middle is removed', () => {
  const columns = [
    { id: 'a', widthRatio: 0.25, panes: [] },
    { id: 'b', widthRatio: 0.50, panes: [] },
    { id: 'c', widthRatio: 0.25, panes: [] },
  ];
  redistributeWidthRatios(columns, 1);
  assert.equal(columns[0].id, 'a');
  assert.equal(columns[1].id, 'c');
});

test('redistributeWidthRatios: correct columns survive when first is removed', () => {
  const columns = [
    { id: 'a', widthRatio: 0.3, panes: [] },
    { id: 'b', widthRatio: 0.7, panes: [] },
  ];
  redistributeWidthRatios(columns, 0);
  assert.equal(columns[0].id, 'b');
});

// ─── Round-trip: redistribute → computeLayout ────────────────────────────────

test('round-trip: close bottom pane of 2 → single-pane layout', () => {
  const items = [{ id: 'p0', heightRatio: 0.5 }, { id: 'p1', heightRatio: 0.5 }];
  redistributeRatios(items, 1);
  const r = computeLayout([{ id: 'c0', widthRatio: 1, panes: items }]);
  assert.equal(r.columns[0].gridTemplateRows, '1fr');
  assert.equal(r.rowSeparators.length, 0);
  assert.equal(r.columns[0].panes[0].id, 'p0');
});

test('round-trip: close top pane of 3 → 2-pane layout with correct separator', () => {
  const items = [
    { id: 'p0', heightRatio: 0.33 },
    { id: 'p1', heightRatio: 0.34 },
    { id: 'p2', heightRatio: 0.33 },
  ];
  redistributeRatios(items, 0);
  const r = computeLayout([{ id: 'c0', widthRatio: 1, panes: items }]);
  assert.equal(r.columns[0].panes.length, 2);
  assert.equal(r.rowSeparators.length, 1);
  assert.equal(r.rowSeparators[0].topPaneId, 'p1');
  assert.equal(r.rowSeparators[0].bottomPaneId, 'p2');
  // ratios still sum to 1 → no NaN in template
  assert.ok(!r.columns[0].gridTemplateRows.includes('NaN'));
});

test('round-trip: close only column → empty layout', () => {
  const columns = [{ id: 'c0', widthRatio: 1, panes: [{ id: 'p0', heightRatio: 1 }] }];
  redistributeWidthRatios(columns, 0);
  const r = computeLayout(columns);
  assert.equal(r.columns.length, 0);
  assert.equal(r.colSeparators.length, 0);
});

// ─── normalizeRatios ──────────────────────────────────────────────────────────

test('normalizeRatios: exact sum → no change', () => {
  const items = [{ heightRatio: 0.5 }, { heightRatio: 0.5 }];
  normalizeRatios(items, 'heightRatio');
  assert.ok(Math.abs(items[0].heightRatio - 0.5) < 1e-9);
  assert.ok(Math.abs(items[1].heightRatio - 0.5) < 1e-9);
});

test('normalizeRatios: drifted sum → last item corrected', () => {
  // Simulate floating-point drift: 0.1 + 0.1 + 0.1 !== 0.3 in IEEE 754
  const items = [
    { heightRatio: 0.3333 },
    { heightRatio: 0.3333 },
    { heightRatio: 0.3333 },
  ];
  normalizeRatios(items, 'heightRatio');
  const sum = items.reduce((s, p) => s + p.heightRatio, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9);
  // Only last item should change
  assert.ok(Math.abs(items[0].heightRatio - 0.3333) < 1e-9);
  assert.ok(Math.abs(items[1].heightRatio - 0.3333) < 1e-9);
});

test('normalizeRatios: works with widthRatio key', () => {
  const cols = [{ widthRatio: 0.6001 }, { widthRatio: 0.4001 }];
  normalizeRatios(cols, 'widthRatio');
  const sum = cols.reduce((s, c) => s + c.widthRatio, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9);
});

test('normalizeRatios: single item → set to exactly 1', () => {
  const items = [{ heightRatio: 0.9999 }];
  normalizeRatios(items, 'heightRatio');
  assert.ok(Math.abs(items[0].heightRatio - 1.0) < 1e-9);
});

test('normalizeRatios: empty array → no-op', () => {
  assert.doesNotThrow(() => normalizeRatios([], 'heightRatio'));
});

test('round-trip: close left column of 2 → single-column layout', () => {
  const columns = [
    { id: 'c0', widthRatio: 0.5, panes: [{ id: 'p0', heightRatio: 1 }] },
    { id: 'c1', widthRatio: 0.5, panes: [{ id: 'p1', heightRatio: 1 }] },
  ];
  redistributeWidthRatios(columns, 0);
  const r = computeLayout(columns);
  assert.equal(r.gridTemplateColumns, '1fr');
  assert.equal(r.colSeparators.length, 0);
  assert.equal(r.columns[0].id, 'c1');
  assert.ok(Math.abs(columns[0].widthRatio - 1.0) < 1e-9);
});
