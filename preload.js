const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pty', {
  create:  (opts) => ipcRenderer.invoke('pty-create', opts),
  write:   (opts) => ipcRenderer.send('pty-write', opts),
  resize:  (opts) => ipcRenderer.invoke('pty-resize', opts),
  kill:    (opts) => ipcRenderer.invoke('pty-kill', opts),
  onData:  (cb)   => ipcRenderer.on('pty-data', (_, payload) => cb(payload)),
  onExit:  (cb)   => ipcRenderer.on('pty-exit', (_, payload) => cb(payload)),
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('pty-data');
    ipcRenderer.removeAllListeners('pty-exit');
  },
  onThemeToggle: (cb) => ipcRenderer.on('theme-toggle', (_, mode) => cb(mode)),
  onFontSize:    (cb) => ipcRenderer.on('font-size',    (_, action) => cb(action)),
});

contextBridge.exposeInMainWorld('appSettings', {
  load: ()       => ipcRenderer.invoke('settings-load'),
  save: (s)      => ipcRenderer.invoke('settings-save', s),
});
