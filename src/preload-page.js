'use strict';
// Runs in every tab, but only gives the lychee:// pages an API. Websites get nothing.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Google sign-in: Lychee presents itself as Firefox there (see main.js). Firefox has no
// navigator.userAgentData, so hide Chromium's before Google's scripts run.
if (location.hostname === 'accounts.google.com') {
  webFrame.executeJavaScript(`try {
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true });
  } catch (e) {}`);
}

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
