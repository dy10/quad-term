#!/usr/bin/env node
'use strict';
// Rebuild native modules (node-pty) against Electron's Node ABI.
// Uses @electron/rebuild's JS API to avoid the CLI's yargs ESM compatibility
// issues on newer Node versions.
const { rebuild } = require('@electron/rebuild');
const electronVersion = require('./node_modules/electron/package.json').version;

rebuild({ buildPath: __dirname, electronVersion, force: true })
  .then(() => { console.log('electron-rebuild: OK'); })
  .catch(err => { console.error('electron-rebuild failed:', err.message); process.exit(1); });
