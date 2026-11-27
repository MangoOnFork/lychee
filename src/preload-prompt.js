'use strict';
// Bridge for the permission card (src/ui/prompt.html). It can only answer the request it was shown.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('permPrompt', {
  on: (fn) => ipcRenderer.on('prompt', (e, data) => fn(data)),
  answer: (id, choice) => ipcRenderer.send('prompt:answer', id, choice),
  size: (h) => ipcRenderer.send('prompt:size', h),
});
