'use strict';
// Runs in every tab, but only gives the lychee:// pages an API. Websites get nothing.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'lychee:') {
  const listeners = new Map();
  ipcRenderer.on('lychee:event', (e, msg) => {
    for (const fn of listeners.get(msg.channel) || []) fn(msg.data);
  });
  contextBridge.exposeInMainWorld('lychee', {
    call: (op, ...args) => ipcRenderer.invoke('page', op, ...args),
    on: (channel, fn) => {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel).push(fn);
    },
  });
}
