const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const pty = require('node-pty');
const path = require('path');
const os = require('os');

const ptyMap = new Map(); // termId -> IPty
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#eff1f5',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--inspect')) {
    win.webContents.openDevTools();
  }

  win.on('closed', () => {
    win = null;
    // Kill all PTY processes on window close
    for (const [termId, ptyProcess] of ptyMap) {
      try { ptyProcess.kill(); } catch (_) {}
    }
    ptyMap.clear();
  });
}

// IPC: create a new PTY process
ipcMain.handle('pty-create', (event, { termId, cols, rows, cwd, shell }) => {
  if (ptyMap.has(termId)) {
    return { success: false, error: 'termId already exists' };
  }

  const resolvedShell = shell || process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash');
  const resolvedCwd = cwd || os.homedir();
  const resolvedCols = Math.max(1, cols || 80);
  const resolvedRows = Math.max(1, rows || 24);

  try {
    const ptyProcess = pty.spawn(resolvedShell, [], {
      name: 'xterm-256color',
      cols: resolvedCols,
      rows: resolvedRows,
      cwd: resolvedCwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });

    ptyMap.set(termId, ptyProcess);

    ptyProcess.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('pty-data', { termId, data });
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      ptyMap.delete(termId);
      if (win && !win.isDestroyed()) {
        win.webContents.send('pty-exit', { termId, exitCode });
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: write data to PTY (fire-and-forget)
ipcMain.on('pty-write', (event, { termId, data }) => {
  const ptyProcess = ptyMap.get(termId);
  if (ptyProcess) {
    try { ptyProcess.write(data); } catch (_) {}
  }
});

// IPC: resize PTY
ipcMain.handle('pty-resize', (event, { termId, cols, rows }) => {
  const ptyProcess = ptyMap.get(termId);
  if (ptyProcess) {
    const c = Math.max(1, cols);
    const r = Math.max(1, rows);
    try { ptyProcess.resize(c, r); } catch (_) {}
  }
  return { success: true };
});

// IPC: kill PTY
ipcMain.handle('pty-kill', (event, { termId }) => {
  const ptyProcess = ptyMap.get(termId);
  if (ptyProcess) {
    try { ptyProcess.kill(); } catch (_) {}
    ptyMap.delete(termId);
  }
  return { success: true };
});

function buildMenu() {
  const isMac = process.platform === 'darwin';
  let isDark = false;

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dark Background',
          type: 'checkbox',
          checked: false,
          accelerator: 'CmdOrCtrl+Shift+D',
          click(menuItem) {
            isDark = menuItem.checked;
            if (win && !win.isDestroyed()) {
              win.webContents.send('theme-toggle', isDark ? 'dark' : 'light');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Increase Font Size',
          accelerator: 'CmdOrCtrl+=',
          click() { if (win && !win.isDestroyed()) win.webContents.send('font-size', 'increase'); },
        },
        {
          label: 'Decrease Font Size',
          accelerator: 'CmdOrCtrl+-',
          click() { if (win && !win.isDestroyed()) win.webContents.send('font-size', 'decrease'); },
        },
        {
          label: 'Reset Font Size',
          accelerator: 'CmdOrCtrl+0',
          click() { if (win && !win.isDestroyed()) win.webContents.send('font-size', 'reset'); },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createWindow();
  buildMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (win === null) createWindow();
});
