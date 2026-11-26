'use strict';
// Bridge for the browser chrome (tab strip, toolbar). Only loaded in the main window UI.
const { contextBridge, ipcRenderer } = require('electron');

const SEND = new Set([
  'ui:ready', 'ui:newTab', 'ui:closeTab', 'ui:activate', 'ui:moveTab', 'ui:tabMenu', 'ui:muteTab',
  'ui:navigate', 'ui:back', 'ui:forward', 'ui:reload', 'ui:stop', 'ui:home', 'ui:openPage',
  'ui:toggleBookmark', 'ui:toggleAdblock', 'ui:zoomReset', 'ui:focusPage', 'ui:find', 'ui:findState',
  'ui:panic', 'ui:newTabMenu',
]);
const RECV = new Set(['tabs', 'settings', 'downloads', 'found', 'focus-omnibox', 'find-open', 'find-close', 'tor', 'update']);

contextBridge.exposeInMainWorld('browser', {
  platform: process.platform,
  send: (ch, ...args) => { if (SEND.has(ch)) ipcRenderer.send(ch, ...args); },
  autocomplete: (prefix) => ipcRenderer.invoke('ui:autocomplete', prefix),
  on: (ch, fn) => { if (RECV.has(ch)) ipcRenderer.on(ch, (e, ...args) => fn(...args)); },
});
