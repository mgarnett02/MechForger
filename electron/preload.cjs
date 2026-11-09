// Exposes a small, file-only API to the page: save and open design files via native dialogs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mechforgerFiles', {
  /** Ask where to save, then write `text`. Resolves to the file name, or null if cancelled. */
  save: (suggestedName, text) => ipcRenderer.invoke('design:save', suggestedName, text),
  /** Ask which file to open. Resolves to { name, text }, or null if cancelled. */
  open: () => ipcRenderer.invoke('design:open'),
  /** Ask for a folder, then write each file into it. Resolves to the folder, or null if cancelled. */
  saveAll: (files) => ipcRenderer.invoke('design:saveAll', files),
});
