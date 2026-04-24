'use strict';

// ─── State ──────────────────────────────────────────────────────────────────

const state = {
  tabs: [],
  activeTabId: null,
  activePaneTermId: null,
};

// termId -> { xterm: Terminal, fitAddon: FitAddon, domEl: HTMLElement, alive: bool }
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

const tabList = document.getElementById('tab-list');
const workspace = document.getElementById('workspace');
const btnNewTab = document.getElementById('btn-new-tab');
const contextMenu = document.getElementById('context-menu');
const ctxRename = document.getElementById('ctx-rename');
const ctxClose = document.getElementById('ctx-close');
const resizeHandle = document.getElementById('resize-handle');
const sidebar = document.getElementById('sidebar');

// ─── Themes ──────────────────────────────────────────────────────────────────

const THEMES = {
  light: {
    ui: {
      '--bg':              '#eff1f5',
      '--sidebar-bg':      '#e6e9ef',
      '--border':          '#d0d7de',
      '--accent':          '#0969da',
      '--fg':              '#1f2328',
      '--fg-muted':        '#656d76',
      '--tab-active-bg':   '#eaeef2',
      '--danger':          '#cf222e',
    },
    term: {
      background:          '#eff1f5',
      foreground:          '#4c4f69',
      cursor:              '#dc8a78',
      cursorAccent:        '#eff1f5',
      selectionBackground: 'rgba(76,79,105,0.2)',
      black:               '#5c5f77',
      red:                 '#d20f39',
      green:               '#40a02b',
      yellow:              '#df8e1d',
      blue:                '#1e66f5',
      magenta:             '#ea76cb',
      cyan:                '#179299',
      white:               '#acb0be',
      brightBlack:         '#6c6f85',
      brightRed:           '#de293e',
      brightGreen:         '#49af3d',
      brightYellow:        '#eea02d',
      brightBlue:          '#456eff',
      brightMagenta:       '#fe85d8',
      brightCyan:          '#2d9fa8',
      brightWhite:         '#eff1f5',
    },
  },
  dark: {
    ui: {
      '--bg':              '#0d1117',
      '--sidebar-bg':      '#161b22',
      '--border':          '#30363d',
      '--accent':          '#58a6ff',
      '--fg':              '#c9d1d9',
      '--fg-muted':        '#8b949e',
      '--tab-active-bg':   '#1c2128',
      '--danger':          '#f85149',
    },
    term: {
      background:          '#0d1117',
      foreground:          '#c9d1d9',
      cursor:              '#58a6ff',
      cursorAccent:        '#0d1117',
      selectionBackground: 'rgba(88,166,255,0.25)',
      black:               '#484f58',
      red:                 '#ff7b72',
      green:               '#3fb950',
      yellow:              '#d29922',
      blue:                '#58a6ff',
      magenta:             '#bc8cff',
      cyan:                '#00bfa5',
      white:               '#b1bac4',
      brightBlack:         '#6e7681',
      brightRed:           '#ffa198',
      brightGreen:         '#56d364',
      brightYellow:        '#e3b341',
      brightBlue:          '#79c0ff',
      brightMagenta:       '#d2a8ff',
      brightCyan:          '#00bfa5',
      brightWhite:         '#f0f6fc',
    },
  },
};

let currentTheme = 'light';

function applyTheme(mode) {
  currentTheme = mode;
  const { ui, term } = THEMES[mode];

  // Update CSS variables
  const root = document.documentElement;
  for (const [key, val] of Object.entries(ui)) {
    root.style.setProperty(key, val);
  }

  // Update all live xterm instances
  for (const { xterm } of terminals.values()) {
    xterm.options.theme = term;
  }
}

window.pty.onThemeToggle((mode) => applyTheme(mode));

// ─── Font size ────────────────────────────────────────────────────────────────

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
let currentFontSize = DEFAULT_FONT_SIZE;

function applyFontSize(size) {
  currentFontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
  for (const { xterm } of terminals.values()) {
    xterm.options.fontSize = currentFontSize;
  }
  // Refit after font change so cols/rows recalculate
  requestAnimationFrame(fitAllVisible);
}

window.pty.onFontSize((action) => {
  if (action === 'increase') applyFontSize(currentFontSize + 1);
  else if (action === 'decrease') applyFontSize(currentFontSize - 1);
  else if (action === 'reset') applyFontSize(DEFAULT_FONT_SIZE);
});

// Active term theme (used when spawning new terminals)
function currentTermTheme() {
  return THEMES[currentTheme].term;
}


// ─── Utility ─────────────────────────────────────────────────────────────────

function genId() {
  return crypto.randomUUID();
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function getActiveTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || null;
}

// ─── PTY global listeners ─────────────────────────────────────────────────────

window.pty.onData(({ termId, data }) => {
  const entry = terminals.get(termId);
  if (entry) entry.xterm.write(data);
});

window.pty.onExit(({ termId, exitCode }) => {
  const entry = terminals.get(termId);
  if (!entry) return;
  entry.alive = false;
  // Write exit notice to terminal
  entry.xterm.write(`\r\n\x1b[38;5;240m[Process exited with code ${exitCode ?? 0}]\x1b[0m\r\n`);
  // Show restart overlay
  showExitOverlay(termId, entry.paneEl);
});

function showExitOverlay(termId, domEl) {
  // Remove any existing overlay
  const old = domEl.querySelector('.pane-exit-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'pane-exit-overlay';
  overlay.innerHTML = `<span>Shell exited</span>
    <button class="restart-btn">Restart</button>`;
  overlay.querySelector('.restart-btn').addEventListener('click', () => {
    overlay.remove();
    restartPane(termId);
  });
  domEl.appendChild(overlay);
}

// ─── Spawn / restart pane ────────────────────────────────────────────────────

async function spawnPane(termId, domEl, paneIndex, paneEl) {
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

  // Register entry before open/spawn so pty-data callbacks find it
  terminals.set(termId, { xterm, fitAddon, domEl, paneEl: paneEl || domEl, alive: true });

  xterm.open(domEl);
  fitAddon.fit();

  const { cols, rows } = xterm;

  const result = await window.pty.create({ termId, cols, rows });
  if (!result.success) {
    xterm.write(`\r\n\x1b[31m[Failed to start shell: ${result.error}]\x1b[0m\r\n`);
    return;
  }

  xterm.onData(data => window.pty.write({ termId, data }));

  // Click anywhere on the pane (label or terminal) focuses it
  const clickTarget = paneEl || domEl;
  clickTarget.addEventListener('mousedown', () => setActivePaneById(termId));
}

async function restartPane(termId) {
  const entry = terminals.get(termId);
  if (!entry) return;

  // Kill old pty if still tracked
  await window.pty.kill({ termId });

  const { xterm, fitAddon, domEl } = entry;

  // Clear terminal and re-spawn
  xterm.clear();
  xterm.reset();
  entry.alive = true;

  fitAddon.fit();
  const { cols, rows } = xterm;

  const result = await window.pty.create({ termId, cols, rows });
  if (!result.success) {
    xterm.write(`\r\n\x1b[31m[Failed to restart shell: ${result.error}]\x1b[0m\r\n`);
  }
}

// ─── Tab management ──────────────────────────────────────────────────────────

function createTab(name) {
  const id = genId();
  const tabName = name || randomGalaxyName();
  const panes = [genId(), genId(), genId(), genId()]; // 4 termIds

  const tab = { id, name: tabName, panes };
  state.tabs.push(tab);

  renderSidebar();
  switchToTab(id);
}

async function closeTab(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Kill all PTYs for this tab
  for (const termId of tab.panes) {
    await window.pty.kill({ termId });
    const entry = terminals.get(termId);
    if (entry) {
      entry.xterm.dispose();
      terminals.delete(termId);
    }
  }

  const idx = state.tabs.findIndex(t => t.id === tabId);
  state.tabs.splice(idx, 1);

  if (state.tabs.length === 0) {
    // Create a new default tab if all closed
    workspace.innerHTML = '';
    state.activeTabId = null;
    state.activePaneTermId = null;
    createTab();
  } else {
    // Switch to adjacent tab
    const nextIdx = Math.min(idx, state.tabs.length - 1);
    renderSidebar();
    if (state.activeTabId === tabId) {
      switchToTab(state.tabs[nextIdx].id);
    } else {
      renderSidebar();
    }
  }
}

async function switchToTab(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  state.activeTabId = tabId;
  renderSidebar();

  // Clear workspace and rebuild pane grid
  workspace.innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const termId = tab.panes[i];
    const paneEl = document.createElement('div');
    paneEl.className = 'term-pane';
    paneEl.dataset.termId = termId;

    const xtermEl = document.createElement('div');
    xtermEl.className = 'term-pane-xterm';
    paneEl.appendChild(xtermEl);

    workspace.appendChild(paneEl);

    const existing = terminals.get(termId);
    if (existing) {
      // Re-attach existing xterm to new xterm container
      existing.domEl = xtermEl;
      existing.paneEl = paneEl;
      existing.xterm.open(xtermEl);
      paneEl.addEventListener('mousedown', () => setActivePaneById(termId));
    } else {
      await spawnPane(termId, xtermEl, i, paneEl);
    }
  }

  // Fit all after layout settles
  requestAnimationFrame(() => {
    fitAllVisible();
    const firstTermId = tab.panes[state.activePaneTermId && tab.panes.includes(state.activePaneTermId)
      ? tab.panes.indexOf(state.activePaneTermId)
      : 0];
    setActivePaneById(firstTermId);
  });
}

// ─── Pane focus ──────────────────────────────────────────────────────────────

function setActivePaneById(termId) {
  state.activePaneTermId = termId;

  // Update focused-pane class on all panes in workspace
  workspace.querySelectorAll('.term-pane').forEach(el => {
    el.classList.toggle('focused-pane', el.dataset.termId === termId);
  });

  const entry = terminals.get(termId);
  if (entry) entry.xterm.focus();
}

function focusPaneByIndex(index) {
  const tab = getActiveTab();
  if (!tab) return;
  const termId = tab.panes[index];
  if (termId) setActivePaneById(termId);
}

// ─── Fit / resize ────────────────────────────────────────────────────────────

function fitAllVisible() {
  const tab = getActiveTab();
  if (!tab) return;

  for (const termId of tab.panes) {
    const entry = terminals.get(termId);
    if (!entry) continue;
    try {
      entry.fitAddon.fit();
      const { cols, rows } = entry.xterm;
      window.pty.resize({ termId, cols, rows });
    } catch (_) {}
  }
}

const debouncedFit = debounce(fitAllVisible, 80);
window.addEventListener('resize', debouncedFit);

// ─── Sidebar render ──────────────────────────────────────────────────────────

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

    // Click to switch (with dblclick guard)
    let clickTimer = null;
    li.addEventListener('click', (e) => {
      if (e.target === closeBtn) return;
      if (nameSpan.getAttribute('contenteditable') === 'true') return;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => switchToTab(tab.id), 220);
    });

    // Double-click to rename
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      clearTimeout(clickTimer);
      startRename(tab.id);
    });

    // Close button
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    // Right-click context menu
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

  // Always look up the live DOM element
  const li = tabList.querySelector(`[data-tab-id="${tabId}"]`);
  if (!li) return;
  const nameSpan = li.querySelector('.tab-name');
  if (!nameSpan) return;

  nameSpan.setAttribute('contenteditable', 'true');
  nameSpan.focus();

  // Select all text
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
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      nameSpan.textContent = tab.name;
      nameSpan.setAttribute('contenteditable', 'false');
      nameSpan.removeEventListener('blur', commit);
      nameSpan.removeEventListener('keydown', onKey);
    }
  }

  nameSpan.addEventListener('keydown', onKey);
  // Delay blur listener so it doesn't fire from the triggering mouseup
  setTimeout(() => nameSpan.addEventListener('blur', commit), 100);
}

// ─── Context menu ────────────────────────────────────────────────────────────

function showContextMenu(x, y, tabId) {
  contextMenuTargetTabId = tabId;
  contextMenu.classList.remove('hidden');

  const menuW = 140;
  const menuH = 70;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  contextMenu.style.left = `${Math.min(x, vw - menuW - 8)}px`;
  contextMenu.style.top  = `${Math.min(y, vh - menuH - 8)}px`;
}

ctxRename.addEventListener('click', () => {
  if (contextMenuTargetTabId) {
    startRename(contextMenuTargetTabId);
  }
  hideContextMenu();
});

ctxClose.addEventListener('click', () => {
  if (contextMenuTargetTabId) {
    closeTab(contextMenuTargetTabId);
  }
  hideContextMenu();
});

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextMenuTargetTabId = null;
}

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) hideContextMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu();
}, { capture: true });

// ─── Sidebar resize handle ───────────────────────────────────────────────────

let isResizing = false;
let resizeStartX = 0;
let resizeStartWidth = 0;

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
  const delta = e.clientX - resizeStartX;
  const newWidth = Math.max(120, Math.min(400, resizeStartWidth + delta));
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

  // Ctrl+T or Cmd+T: new tab
  if (e.key === 't' && !e.shiftKey) {
    e.preventDefault();
    createTab();
    return;
  }

  // Ctrl+W: close current tab
  if (e.key === 'w' && !e.shiftKey) {
    e.preventDefault();
    if (state.activeTabId) closeTab(state.activeTabId);
    return;
  }

  // Ctrl+Shift+1/2/3/4: focus pane by index
  if (e.shiftKey) {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 4) {
      e.preventDefault();
      focusPaneByIndex(num - 1);
      return;
    }
  }

  // Ctrl+1..9: switch to tab by position
  if (!e.shiftKey) {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 9) {
      e.preventDefault();
      const tab = state.tabs[num - 1];
      if (tab) switchToTab(tab.id);
      return;
    }
  }

  // Ctrl+Shift+[ / ] or Cmd+Shift+[ / ]: previous/next tab
  if (e.shiftKey && (e.key === '[' || e.key === '{')) {
    e.preventDefault();
    cycleTab(-1);
    return;
  }
  if (e.shiftKey && (e.key === ']' || e.key === '}')) {
    e.preventDefault();
    cycleTab(1);
    return;
  }
});

function cycleTab(dir) {
  if (state.tabs.length === 0) return;
  const idx = state.tabs.findIndex(t => t.id === state.activeTabId);
  const next = (idx + dir + state.tabs.length) % state.tabs.length;
  switchToTab(state.tabs[next].id);
}

// ─── New tab button ───────────────────────────────────────────────────────────

btnNewTab.addEventListener('click', () => createTab());

// ─── Init ────────────────────────────────────────────────────────────────────

createTab();
