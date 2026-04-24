# quad-term

A four-pane terminal multiplexer built with Electron, xterm.js, and node-pty.

![quad-term screenshot](screenshot.png)

## Features

- 2×2 grid of independent terminal panes, each backed by a real PTY
- Multiple tabs (workspaces), each with their own set of 4 terminals
- Tabs named after galaxies by default
- Double-click a tab to rename it; right-click for context menu
- Resizable sidebar via drag handle
- Focused pane highlighted with accent border
- Shells keep running in the background when switching tabs

## Requirements

- macOS (primary target; Linux should work, Windows untested)
- Node.js 18+
- Xcode Command Line Tools (for native module compilation)

## Setup

```bash
npm install
npm start
```

`npm install` automatically rebuilds `node-pty` against Electron's Node ABI via the `postinstall` script.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Launch the app |
| `npm run dev` | Launch with DevTools open |

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+T` | New tab |
| `Ctrl/Cmd+W` | Close current tab |
| `Ctrl/Cmd+1–9` | Switch to tab N |
| `Ctrl/Cmd+Shift+[` / `]` | Previous / next tab |
| `Ctrl/Cmd+Shift+1–4` | Focus pane 1–4 |

## Stack

- [Electron](https://electronjs.org) — app shell
- [xterm.js](https://xtermjs.org) — terminal renderer
- [node-pty](https://github.com/microsoft/node-pty) — PTY spawning
