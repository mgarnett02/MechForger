// Electron entry point: shows the built MechForger UI (dist/) in a desktop window.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Design files: each design is saved as its own .json file, by default in Documents\MechForger.
const JSON_FILTERS = [{ name: 'MechForger design', extensions: ['json'] }];
let lastFolder = null;

function designFolder() {
  if (lastFolder && fs.existsSync(lastFolder)) return lastFolder;
  const folder = path.join(app.getPath('documents'), 'MechForger');
  try { fs.mkdirSync(folder, { recursive: true }); } catch { return app.getPath('documents'); }
  return folder;
}

/** Keep a file name to safe characters and a .json extension. */
function safeName(name) {
  const base = String(name).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/[. ]+$/, '').slice(0, 120) || 'Unnamed';
  return /\.json$/i.test(base) ? base : `${base}.json`;
}

ipcMain.handle('design:save', async (event, suggestedName, text) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save design',
    defaultPath: path.join(designFolder(), safeName(suggestedName)),
    filters: JSON_FILTERS,
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, String(text), 'utf8');
  lastFolder = path.dirname(filePath);
  return path.basename(filePath);
});

ipcMain.handle('design:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Load design',
    defaultPath: designFolder(),
    filters: JSON_FILTERS,
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  lastFolder = path.dirname(filePaths[0]);
  return { name: path.basename(filePaths[0]), text: fs.readFileSync(filePaths[0], 'utf8') };
});

// Record sheets: the system print dialog would otherwise start from the printer's own orientation,
// so ask for portrait on the chosen paper size.
ipcMain.handle('sheet:print', (event, paper) => new Promise((resolve) => {
  event.sender.print(
    { landscape: false, pageSize: paper === 'a4' ? 'A4' : 'Letter', printBackground: true },
    (success) => resolve(success),
  );
}));

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    title: 'MechForger',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    // Show the window straight away (in the page's background colour) rather than after the first
    // render, so there is immediate feedback while the app starts.
    backgroundColor: '#f4f2ee',
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // No text fields need spell checking; skipping it avoids loading the dictionaries at startup.
      spellcheck: false,
      // Cache compiled JavaScript so later launches skip most of the parsing.
      v8CacheOptions: 'bypassHeatCheck',
    },
  });

  // Open any external links in the user's browser instead of inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

const menu = Menu.buildFromTemplate([
  { role: 'fileMenu' },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  { role: 'windowMenu' },
]);

app.whenReady().then(() => {
  Menu.setApplicationMenu(menu);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
