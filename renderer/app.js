'use strict';

// ─── State ──────────────────────────────────────────────────────────────────

const state = {
  tabs: [],
  activeTabId: null,
  activePaneTermId: null,
};

// Loaded from ~/.quad-term/settings.json before first tab is created
const settings = { defaultCols: 2, defaultRows: 2 };

// termId -> { xterm, fitAddon, domEl, paneEl, alive }
const terminals = new Map();

let contextMenuTargetTabId = null;

// ─── Galaxy names ─────────────────────────────────────────────────────────────

const GALAXY_NAMES = [
  'Andromeda', 'Whirlpool', 'Sombrero', 'Triangulum', 'Pinwheel',
  'Cartwheel', 'Centaurus', 'Sculptor', 'Fornax', 'Virgo',
  'Magellan', 'Bode', 'Cigar', 'Sunflower', 'Needle',
  'Antennae', 'Hoag', 'Mayall', 'Coma', 'Perseus',
  'Cygnus', 'Hydra', 'Phoenix', 'Draco', 'Lynx',
  'Ursa', 'Pegasus', 'Aquarius', 'Orion', 'Sagittarius',
];
const usedGalaxyNames = new Set();

function randomGalaxyName() {
  const available = GALAXY_NAMES.filter(n => !usedGalaxyNames.has(n));
  const pool = available.length > 0 ? available : GALAXY_NAMES;
  const name = pool[Math.floor(Math.random() * pool.length)];
  usedGalaxyNames.add(name);
  return name;
}

// ─── DOM refs ────────────────────────────────────────────────────────────────

const tabList     = document.getElementById('tab-list');
const workspace   = document.getElementById('workspace');
const btnNewTab   = document.getElementById('btn-new-tab');
const contextMenu = document.getElementById('context-menu');
const ctxRename   = document.getElementById('ctx-rename');
const ctxClose    = document.getElementById('ctx-close');
const resizeHandle   = document.getElementById('resize-handle');
const sidebar        = document.getElementById('sidebar');
const btnSettings    = document.getElementById('btn-settings');
const settingsPanel  = document.getElementById('settings-panel');
const settingsClose  = document.getElementById('settings-close');
const settingsCols   = document.getElementById('settings-cols');
const settingsRows   = document.getElementById('settings-rows');
const settingsSave   = document.getElementById('settings-save');

// ─── Themes ──────────────────────────────────────────────────────────────────

const THEMES = {
  light: {
    ui: {
      '--bg':            '#ffffff',
      '--sidebar-bg':    '#f5f5f4',
      '--border':        '#e2e2e0',
      '--accent':        '#0969da',
      '--fg':            '#1c1c1a',
      '--fg-muted':      '#6b7280',
      '--tab-active-bg': '#ebebea',
      '--danger':        '#cf222e',
    },
    term: {
      background:          '#ffffff',
      foreground:          '#1c1c1a',
      cursor:              '#0969da',
      cursorAccent:        '#ffffff',
      selectionBackground: 'rgba(9,105,218,0.15)',
      black:   '#3b3b39', red:     '#d20f39', green:   '#2d9f2d', yellow:  '#b45309',
      blue:    '#1e66f5', magenta: '#9333ea', cyan:    '#0891b2', white:   '#9ca3af',
      brightBlack:   '#6b7280', brightRed:     '#e53e3e', brightGreen:   '#38a169',
      brightYellow:  '#d97706', brightBlue:    '#3b82f6', brightMagenta: '#a855f7',
      brightCyan:    '#06b6d4', brightWhite:   '#f5f5f4',
    },
  },
  dark: {
    ui: {
      '--bg':            '#0d1117',
      '--sidebar-bg':    '#161b22',
      '--border':        '#30363d',
      '--accent':        '#58a6ff',
      '--fg':            '#c9d1d9',
      '--fg-muted':      '#8b949e',
      '--tab-active-bg': '#1c2128',
      '--danger':        '#f85149',
    },
    term: {
      background:          '#0d1117',
      foreground:          '#c9d1d9',
      cursor:              '#58a6ff',
      cursorAccent:        '#0d1117',
      selectionBackground: 'rgba(88,166,255,0.25)',
      black:   '#484f58', red:     '#ff7b72', green:   '#3fb950', yellow:  '#d29922',
      blue:    '#58a6ff', magenta: '#bc8cff', cyan:    '#00bfa5', white:   '#b1bac4',
      brightBlack:   '#6e7681', brightRed:     '#ffa198', brightGreen:   '#56d364',
      brightYellow:  '#e3b341', brightBlue:    '#79c0ff', brightMagenta: '#d2a8ff',
      brightCyan:    '#00bfa5', brightWhite:   '#f0f6fc',
    },
  },
};

let currentTheme = 'light';

function applyTheme(mode) {
  currentTheme = mode;
  const { ui, term } = THEMES[mode];
  const root = document.documentElement;
  for (const [key, val] of Object.entries(ui)) root.style.setProperty(key, val);
  for (const { xterm } of terminals.values()) xterm.options.theme = term;
}

window.pty.onThemeToggle((mode) => applyTheme(mode));

// ─── Font size ────────────────────────────────────────────────────────────────

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
let currentFontSize = DEFAULT_FONT_SIZE;

function applyFontSize(size) {
  currentFontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
  for (const { xterm } of terminals.values()) xterm.options.fontSize = currentFontSize;
  requestAnimationFrame(fitAllVisible);
}

window.pty.onFontSize((action) => {
  if (action === 'increase') applyFontSize(currentFontSize + 1);
  else if (action === 'decrease') applyFontSize(currentFontSize - 1);
  else if (action === 'reset') applyFontSize(DEFAULT_FONT_SIZE);
});

function currentTermTheme() { return THEMES[currentTheme].term; }

// ─── Utility ─────────────────────────────────────────────────────────────────

function genId() { return crypto.randomUUID(); }

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function getActiveTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || null;
}

function findPaneLocation(termId) {
  for (const tab of state.tabs) {
    for (let ci = 0; ci < tab.columns.length; ci++) {
      const col = tab.columns[ci];
      const pi = col.panes.findIndex(p => p.id === termId);
      if (pi !== -1) return { tab, col, ci, pi };
    }
  }
  return null;
}

// ─── Fit / resize ────────────────────────────────────────────────────────────

function fitAllVisible() {
  const tab = getActiveTab();
  if (!tab) return;
  for (const col of tab.columns) {
    for (const pane of col.panes) {
      const entry = terminals.get(pane.id);
      if (!entry) continue;
      try {
        entry.fitAddon.fit();
        const { cols, rows } = entry.xterm;
        window.pty.resize({ termId: pane.id, cols, rows });
      } catch (_) {}
    }
  }
}

const debouncedFit = debounce(fitAllVisible, 80);
window.addEventListener('resize', () => {
  const tab = getActiveTab();
  if (tab) updateWorkspaceLayout(tab);
  debouncedFit();
});

// ─── PTY listeners ───────────────────────────────────────────────────────────

window.pty.onData(({ termId, data }) => {
  const entry = terminals.get(termId);
  if (entry) entry.xterm.write(data);
});

window.pty.onExit(({ termId }) => {
  const entry = terminals.get(termId);
  if (!entry) return;
  entry.alive = false;
  closePane(termId);
});

// ─── Spawn pane ───────────────────────────────────────────────────────────────

async function spawnPane(termId, domEl, paneEl) {
  const xterm = new Terminal({
    fontFamily: 'JetBrains Mono, Fira Code, Menlo, DejaVu Sans Mono, Courier New, monospace',
    fontSize: currentFontSize,
    lineHeight: 1.2,
    letterSpacing: 0,
    theme: currentTermTheme(),
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 5000,
    allowTransparency: false,
    fastScrollModifier: 'alt',
    rightClickSelectsWord: false,
  });

  const fitAddon = new FitAddon.FitAddon();
  xterm.loadAddon(fitAddon);
  terminals.set(termId, { xterm, fitAddon, domEl, paneEl, alive: true });

  xterm.open(domEl);
  fitAddon.fit();

  const { cols, rows } = xterm;
  const result = await window.pty.create({ termId, cols, rows });
  if (!result.success) {
    xterm.write(`\r\n\x1b[31m[Failed to start shell: ${result.error}]\x1b[0m\r\n`);
    return;
  }

  xterm.onData(data => window.pty.write({ termId, data }));
  paneEl.addEventListener('mousedown', () => setActivePaneById(termId));
}

// ─── Close pane ───────────────────────────────────────────────────────────────


function closePane(termId) {
  const loc = findPaneLocation(termId);
  if (!loc) return;

  const { tab, col, ci, pi } = loc;

  // Kill PTY and dispose xterm
  window.pty.kill({ termId });
  const entry = terminals.get(termId);
  if (entry) { entry.xterm.dispose(); terminals.delete(termId); }

  // Determine focus target before mutating state
  const focusTarget = col.panes[pi - 1]?.id ?? col.panes[pi + 1]?.id
    ?? tab.columns[ci - 1]?.panes.at(-1)?.id
    ?? tab.columns[ci + 1]?.panes[0]?.id;

  // Remove pane from column
  redistributeRatios(col.panes, pi);

  // If column is now empty, remove the column too
  if (col.panes.length === 0) {
    redistributeWidthRatios(tab.columns, ci);
  }

  // If tab is now empty, close it
  if (tab.columns.length === 0) {
    closeTab(tab.id);
    return;
  }

  // Only update DOM if this tab is visible
  if (tab.id !== state.activeTabId) return;

  // Remove the pane's DOM element (and its col-wrapper if the column was removed)
  const paneEl = workspace.querySelector(`.term-pane[data-term-id="${termId}"]`);
  if (paneEl) paneEl.remove();
  // If the column was emptied, remove its wrapper too
  if (col.panes.length === 0) {
    const colWrapper = workspace.querySelector(`.col-wrapper[data-col-id="${col.id}"]`);
    if (colWrapper) colWrapper.remove();
  }

  updateWorkspaceLayout(tab);
  if (focusTarget) setActivePaneById(focusTarget);
  requestAnimationFrame(fitAllVisible);
}

// ─── Add pane / column ────────────────────────────────────────────────────────

async function addPaneBelow() {
  const loc = findPaneLocation(state.activePaneTermId);
  if (!loc) return;
  const { tab, col, pi } = loc;

  const newId = genId();
  const half = col.panes[pi].heightRatio / 2;
  col.panes[pi].heightRatio = half;
  col.panes.splice(pi + 1, 0, { id: newId, heightRatio: half });

  if (tab.id !== state.activeTabId) return;
  await addPaneToDom(tab, col, newId);
  updateWorkspaceLayout(tab);
  requestAnimationFrame(() => { fitAllVisible(); setActivePaneById(newId); });
}

async function addColumnRight() {
  const loc = findPaneLocation(state.activePaneTermId);
  if (!loc) return;
  const { tab, ci } = loc;

  const newColId = genId();
  const newPaneId = genId();
  const half = tab.columns[ci].widthRatio / 2;
  tab.columns[ci].widthRatio = half;
  tab.columns.splice(ci + 1, 0, {
    id: newColId,
    widthRatio: half,
    panes: [{ id: newPaneId, heightRatio: 1 }],
  });

  if (tab.id !== state.activeTabId) return;
  await addColumnToDom(tab, tab.columns[ci + 1]);
  updateWorkspaceLayout(tab);
  requestAnimationFrame(() => { fitAllVisible(); setActivePaneById(newPaneId); });
}

// Add a single pane DOM element inside its column wrapper (used by addPaneBelow)
async function addPaneToDom(tab, col, termId) {
  const colWrapper = workspace.querySelector(`.col-wrapper[data-col-id="${col.id}"]`);
  if (!colWrapper) return;

  const paneEl = document.createElement('div');
  paneEl.className = 'term-pane';
  paneEl.dataset.termId = termId;
  paneEl.dataset.colId = col.id;

  const xtermEl = document.createElement('div');
  xtermEl.className = 'term-pane-xterm';
  paneEl.appendChild(xtermEl);
  colWrapper.appendChild(paneEl);

  await spawnPane(termId, xtermEl, paneEl);
}

// Add a full column wrapper + its panes to the workspace (used by addColumnRight)
async function addColumnToDom(tab, col) {
  const colWrapper = document.createElement('div');
  colWrapper.className = 'col-wrapper';
  colWrapper.dataset.colId = col.id;
  workspace.appendChild(colWrapper);

  for (const pane of col.panes) {
    const paneEl = document.createElement('div');
    paneEl.className = 'term-pane';
    paneEl.dataset.termId = pane.id;
    paneEl.dataset.colId = col.id;

    const xtermEl = document.createElement('div');
    xtermEl.className = 'term-pane-xterm';
    paneEl.appendChild(xtermEl);
    colWrapper.appendChild(paneEl);

    await spawnPane(pane.id, xtermEl, paneEl);
  }
}

// ─── Tab management ──────────────────────────────────────────────────────────

function createTab(name) {
  const id = genId();
  const cols = Math.max(1, settings.defaultCols);
  const rows = Math.max(1, settings.defaultRows);
  const colWidth = 1 / cols;
  const rowHeight = 1 / rows;
  const columns = Array.from({ length: cols }, () => ({
    id: genId(),
    widthRatio: colWidth,
    panes: Array.from({ length: rows }, () => ({ id: genId(), heightRatio: rowHeight })),
  }));
  const tab = { id, name: name || randomGalaxyName(), columns };
  state.tabs.push(tab);
  renderSidebar();
  switchToTab(id);
}

async function closeTab(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  for (const col of tab.columns) {
    for (const pane of col.panes) {
      await window.pty.kill({ termId: pane.id });
      const entry = terminals.get(pane.id);
      if (entry) { entry.xterm.dispose(); terminals.delete(pane.id); }
    }
  }

  const idx = state.tabs.findIndex(t => t.id === tabId);
  state.tabs.splice(idx, 1);

  if (state.tabs.length === 0) {
    workspace.innerHTML = '';
    state.activeTabId = null;
    state.activePaneTermId = null;
    createTab();
  } else {
    const nextIdx = Math.min(idx, state.tabs.length - 1);
    renderSidebar();
    if (state.activeTabId === tabId) switchToTab(state.tabs[nextIdx].id);
    else renderSidebar();
  }
}

async function switchToTab(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  state.activeTabId = tabId;
  renderSidebar();
  workspace.innerHTML = '';

  for (const col of tab.columns) {
    const colWrapper = document.createElement('div');
    colWrapper.className = 'col-wrapper';
    colWrapper.dataset.colId = col.id;
    workspace.appendChild(colWrapper);

    for (const pane of col.panes) {
      const paneEl = document.createElement('div');
      paneEl.className = 'term-pane';
      paneEl.dataset.termId = pane.id;
      paneEl.dataset.colId = col.id;

      const xtermEl = document.createElement('div');
      xtermEl.className = 'term-pane-xterm';
      paneEl.appendChild(xtermEl);
      colWrapper.appendChild(paneEl);

      const existing = terminals.get(pane.id);
      if (existing) {
        existing.domEl = xtermEl;
        existing.paneEl = paneEl;
        existing.xterm.open(xtermEl);
        paneEl.addEventListener('mousedown', () => setActivePaneById(pane.id));
      } else {
        await spawnPane(pane.id, xtermEl, paneEl);
      }
    }
  }

  updateWorkspaceLayout(tab);

  requestAnimationFrame(() => {
    fitAllVisible();
    // Focus previously active pane if it's in this tab, else first pane
    const allPaneIds = tab.columns.flatMap(c => c.panes.map(p => p.id));
    const target = allPaneIds.includes(state.activePaneTermId)
      ? state.activePaneTermId : allPaneIds[0];
    if (target) setActivePaneById(target);
  });
}

// ─── Workspace layout ─────────────────────────────────────────────────────────

function updateWorkspaceLayout(tab) {
  const layout = computeLayout(tab.columns);

  workspace.style.gridTemplateColumns = layout.gridTemplateColumns;
  // Workspace rows: always a single 1fr row — col-wrappers fill the full height
  workspace.style.gridTemplateRows = '1fr';

  for (const lcol of layout.columns) {
    const colWrapper = workspace.querySelector(`.col-wrapper[data-col-id="${lcol.id}"]`);
    if (!colWrapper) continue;
    colWrapper.style.gridColumn = lcol.gridColumn;
    colWrapper.style.gridRow = '1';
    colWrapper.style.gridTemplateRows = lcol.gridTemplateRows;

    for (const lpane of lcol.panes) {
      const paneEl = colWrapper.querySelector(`.term-pane[data-term-id="${lpane.id}"]`);
      if (paneEl) paneEl.style.gridRow = lpane.gridRow;
    }
  }

  rebuildSeparators(tab, layout);
}

// ─── Separators ───────────────────────────────────────────────────────────────

let activeSeparatorDrag = null;

function rebuildSeparators(tab, layout) {
  // Remove existing separators
  workspace.querySelectorAll('.pane-separator').forEach(el => el.remove());

  // Column separators — direct children of workspace
  for (const sep of layout.colSeparators) {
    const el = document.createElement('div');
    el.className = 'pane-separator pane-separator-col';
    el.dataset.leftColId = sep.leftColId;
    el.dataset.rightColId = sep.rightColId;
    el.style.gridColumn = sep.gridColumn;
    el.style.gridRow = '1';
    workspace.appendChild(el);

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const leftCol  = tab.columns.find(c => c.id === sep.leftColId);
      const rightCol = tab.columns.find(c => c.id === sep.rightColId);
      activeSeparatorDrag = {
        type: 'col',
        tabId: tab.id,
        leftColId: sep.leftColId,
        rightColId: sep.rightColId,
        startX: e.clientX,
        startLeftRatio: leftCol.widthRatio,
        startRightRatio: rightCol.widthRatio,
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
  }

  // Row separators — children of their col-wrapper
  for (const sep of layout.rowSeparators) {
    const colWrapper = workspace.querySelector(`.col-wrapper[data-col-id="${sep.colId}"]`);
    if (!colWrapper) continue;

    const el = document.createElement('div');
    el.className = 'pane-separator pane-separator-row';
    el.dataset.colId = sep.colId;
    el.dataset.topPaneId = sep.topPaneId;
    el.dataset.bottomPaneId = sep.bottomPaneId;
    el.style.gridRow = sep.gridRow;
    colWrapper.appendChild(el);

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const col = tab.columns.find(c => c.id === sep.colId);
      const topPane    = col.panes.find(p => p.id === sep.topPaneId);
      const bottomPane = col.panes.find(p => p.id === sep.bottomPaneId);
      activeSeparatorDrag = {
        type: 'row',
        tabId: tab.id,
        colId: sep.colId,
        topPaneId: sep.topPaneId,
        bottomPaneId: sep.bottomPaneId,
        startY: e.clientY,
        startTopRatio: topPane.heightRatio,
        startBottomRatio: bottomPane.heightRatio,
      };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
}

document.addEventListener('mousemove', (e) => {
  if (!activeSeparatorDrag) return;
  const tab = state.tabs.find(t => t.id === activeSeparatorDrag.tabId);
  if (!tab) return;

  const MIN = 0.05;

  if (activeSeparatorDrag.type === 'col') {
    const rect = workspace.getBoundingClientRect();
    const totalRatio = activeSeparatorDrag.startLeftRatio + activeSeparatorDrag.startRightRatio;
    const deltaRatio = (e.clientX - activeSeparatorDrag.startX) / rect.width * totalRatio;
    const newLeft = Math.max(MIN, Math.min(totalRatio - MIN, activeSeparatorDrag.startLeftRatio + deltaRatio));
    const leftCol  = tab.columns.find(c => c.id === activeSeparatorDrag.leftColId);
    const rightCol = tab.columns.find(c => c.id === activeSeparatorDrag.rightColId);
    leftCol.widthRatio  = newLeft;
    rightCol.widthRatio = totalRatio - newLeft;
  } else {
    const col = tab.columns.find(c => c.id === activeSeparatorDrag.colId);
    const colWrapper = workspace.querySelector(`.col-wrapper[data-col-id="${col.id}"]`);
    const rect = colWrapper.getBoundingClientRect();
    const totalRatio = activeSeparatorDrag.startTopRatio + activeSeparatorDrag.startBottomRatio;
    const deltaRatio = (e.clientY - activeSeparatorDrag.startY) / rect.height * totalRatio;
    const newTop = Math.max(MIN, Math.min(totalRatio - MIN, activeSeparatorDrag.startTopRatio + deltaRatio));
    const topPane    = col.panes.find(p => p.id === activeSeparatorDrag.topPaneId);
    const bottomPane = col.panes.find(p => p.id === activeSeparatorDrag.bottomPaneId);
    topPane.heightRatio    = newTop;
    bottomPane.heightRatio = totalRatio - newTop;
  }

  updateWorkspaceLayout(tab);
  debouncedFit();
});

document.addEventListener('mouseup', () => {
  if (!activeSeparatorDrag) return;
  const tab = state.tabs.find(t => t.id === activeSeparatorDrag.tabId);
  if (tab) {
    if (activeSeparatorDrag.type === 'col') {
      normalizeRatios(tab.columns, 'widthRatio');
    } else {
      const col = tab.columns.find(c => c.id === activeSeparatorDrag.colId);
      if (col) normalizeRatios(col.panes, 'heightRatio');
    }
  }
  activeSeparatorDrag = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  fitAllVisible();
});

// ─── Pane focus ──────────────────────────────────────────────────────────────

function setActivePaneById(termId) {
  state.activePaneTermId = termId;
  workspace.querySelectorAll('.term-pane').forEach(el => {
    el.classList.toggle('focused-pane', el.dataset.termId === termId);
  });
  const entry = terminals.get(termId);
  if (entry) entry.xterm.focus();
}

function focusPaneByIndex(index) {
  const tab = getActiveTab();
  if (!tab) return;
  const allPanes = tab.columns.flatMap(c => c.panes.map(p => p.id));
  const termId = allPanes[index];
  if (termId) setActivePaneById(termId);
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  tabList.innerHTML = '';
  for (const tab of state.tabs) {
    const li = document.createElement('li');
    li.className = `tab-item${tab.id === state.activeTabId ? ' active' : ''}`;
    li.dataset.tabId = tab.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = tab.name;
    nameSpan.setAttribute('contenteditable', 'false');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close tab';

    li.appendChild(nameSpan);
    li.appendChild(closeBtn);
    tabList.appendChild(li);

    let clickTimer = null;
    li.addEventListener('click', (e) => {
      if (e.target === closeBtn) return;
      if (nameSpan.getAttribute('contenteditable') === 'true') return;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => switchToTab(tab.id), 220);
    });

    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      clearTimeout(clickTimer);
      startRename(tab.id);
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, tab.id);
    });
  }
}

// ─── Inline rename ───────────────────────────────────────────────────────────

function startRename(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;
  const li = tabList.querySelector(`[data-tab-id="${tabId}"]`);
  if (!li) return;
  const nameSpan = li.querySelector('.tab-name');
  if (!nameSpan) return;

  nameSpan.setAttribute('contenteditable', 'true');
  nameSpan.focus();

  const range = document.createRange();
  range.selectNodeContents(nameSpan);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  function commit() {
    if (nameSpan.getAttribute('contenteditable') !== 'true') return;
    const newName = nameSpan.textContent.trim();
    tab.name = newName || tab.name;
    nameSpan.textContent = tab.name;
    nameSpan.setAttribute('contenteditable', 'false');
    nameSpan.removeEventListener('blur', commit);
    nameSpan.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') {
      nameSpan.textContent = tab.name;
      nameSpan.setAttribute('contenteditable', 'false');
      nameSpan.removeEventListener('blur', commit);
      nameSpan.removeEventListener('keydown', onKey);
    }
  }

  nameSpan.addEventListener('keydown', onKey);
  setTimeout(() => nameSpan.addEventListener('blur', commit), 100);
}

// ─── Context menu ────────────────────────────────────────────────────────────

function showContextMenu(x, y, tabId) {
  contextMenuTargetTabId = tabId;
  contextMenu.classList.remove('hidden');
  const vw = window.innerWidth, vh = window.innerHeight;
  contextMenu.style.left = `${Math.min(x, vw - 148)}px`;
  contextMenu.style.top  = `${Math.min(y, vh - 78)}px`;
}

ctxRename.addEventListener('click', () => {
  if (contextMenuTargetTabId) startRename(contextMenuTargetTabId);
  hideContextMenu();
});
ctxClose.addEventListener('click', () => {
  if (contextMenuTargetTabId) closeTab(contextMenuTargetTabId);
  hideContextMenu();
});
function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextMenuTargetTabId = null;
}
document.addEventListener('click', (e) => { if (!contextMenu.contains(e.target)) hideContextMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); }, { capture: true });

// ─── Sidebar resize handle ───────────────────────────────────────────────────

let isResizing = false, resizeStartX = 0, resizeStartWidth = 0;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizeStartX = e.clientX;
  resizeStartWidth = sidebar.offsetWidth;
  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = Math.max(120, Math.min(400, resizeStartWidth + (e.clientX - resizeStartX)));
  sidebar.style.width = `${newWidth}px`;
  document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
});

document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  resizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  debouncedFit();
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  if (e.key === 't' && !e.shiftKey) { e.preventDefault(); createTab(); return; }
  if (e.key === 'w' && !e.shiftKey) { e.preventDefault(); if (state.activeTabId) closeTab(state.activeTabId); return; }

  // Cmd+D: add pane below current
  if (e.key === 'd' && !e.shiftKey) { e.preventDefault(); addPaneBelow(); return; }
  // Cmd+Shift+D: add column to the right of current
  if (e.key === 'd' && e.shiftKey)  { e.preventDefault(); addColumnRight(); return; }

  if (e.shiftKey) {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 9) { e.preventDefault(); focusPaneByIndex(num - 1); return; }
    if (e.key === '[' || e.key === '{') { e.preventDefault(); cycleTab(-1); return; }
    if (e.key === ']' || e.key === '}') { e.preventDefault(); cycleTab(1);  return; }
  }

  if (!e.shiftKey) {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 9) { e.preventDefault(); const t = state.tabs[num - 1]; if (t) switchToTab(t.id); return; }
  }
});

function cycleTab(dir) {
  if (state.tabs.length === 0) return;
  const idx = state.tabs.findIndex(t => t.id === state.activeTabId);
  switchToTab(state.tabs[(idx + dir + state.tabs.length) % state.tabs.length].id);
}

// ─── New tab button ───────────────────────────────────────────────────────────

btnNewTab.addEventListener('click', () => createTab());

// ─── Settings panel ───────────────────────────────────────────────────────────

btnSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle('hidden');
});

settingsClose.addEventListener('click', () => settingsPanel.classList.add('hidden'));

settingsSave.addEventListener('click', () => {
  const cols = Math.max(1, Math.min(8, parseInt(settingsCols.value, 10) || 2));
  const rows = Math.max(1, Math.min(8, parseInt(settingsRows.value, 10) || 2));
  settings.defaultCols = cols;
  settings.defaultRows = rows;
  settingsCols.value = cols;
  settingsRows.value = rows;
  window.appSettings.save({ defaultCols: cols, defaultRows: rows });
  settingsPanel.classList.add('hidden');
});

document.addEventListener('click', (e) => {
  if (!settingsPanel.classList.contains('hidden') &&
      !settingsPanel.contains(e.target) &&
      e.target !== btnSettings) {
    settingsPanel.classList.add('hidden');
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const saved = await window.appSettings.load();
    Object.assign(settings, saved);
    settingsCols.value = settings.defaultCols;
    settingsRows.value = settings.defaultRows;
  } catch (_) {}
  createTab();
})();
