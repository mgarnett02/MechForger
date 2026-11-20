// Exposes a small, file-only API to the page: save and open design files via native dialogs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mechforgerFiles', {
  /** Ask where to save, then write `text`. Resolves to the file name, or null if cancelled. */
  save: (suggestedName, text) => ipcRenderer.invoke('design:save', suggestedName, text),
  /** Ask which file to open. Resolves to { name, text }, or null if cancelled. */
  open: () => ipcRenderer.invoke('design:open'),
});

contextBridge.exposeInMainWorld('mechforgerPrint', {
  /** Print the page in portrait on 'letter' or 'a4' paper. Resolves to true if it was sent to the printer. */
  print: (paper) => ipcRenderer.invoke('sheet:print', paper),
});
