import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { IPC, type AppInfo } from '../shared/ipc';
import { createExporter } from './exportTimetable';
import { createImportReader } from './importExcel';
import { createProfileManager } from './profiles';

// Lets tests run against a throwaway data folder instead of the real one.
if (process.env.TTM_USER_DATA) {
  app.setPath('userData', process.env.TTM_USER_DATA);
}

// One copy of the app per data folder: two would each keep their own profile list and
// saves and overwrite each other's files (R4-8 review). Starting it again brings the open
// window forward instead. The lock is taken on the data folder, so tests and the review
// school each run their own copy.
const firstCopy = app.requestSingleInstanceLock();
if (!firstCopy) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

// Each profile is a timetable in a folder of its own (PF-1); the open one's store answers
// the timetable calls.
const profiles = createProfileManager(app.getPath('userData'));

// Exports ask where to save with the system's save dialog, over the app's window. The
// dialog is read when it's called, so the end-to-end tests can stand in for it.
const exporter = createExporter({
  askWhere: async (defaultPath, format) => {
    const options: Electron.SaveDialogOptions = {
      defaultPath,
      filters:
        format === 'xlsx'
          ? [{ name: 'Excel workbook', extensions: ['xlsx'] }]
          : [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const answer = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    return answer.canceled || !answer.filePath ? null : answer.filePath;
  },
  documentsFolder: () => app.getPath('documents'),
  saveDetails: async (exportDetails) => (await profiles.store()).saveSettings({ exportDetails }),
});

// Imports ask which workbook with the system's open dialog, read when it's called, as the
// save dialog is.
const chooseImportFile = createImportReader({
  askWhich: async () => {
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
    };
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const answer = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return answer.canceled ? null : (answer.filePaths[0] ?? null);
  },
});

// How long a closing window waits for the renderer to finish its pending save.
const CLOSE_TIMEOUT_MS = 3000;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    title: 'TimeTableMaker',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  finishSavesBeforeClose(win);

  // Links open in the user's browser, never in a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // The window never leaves the app: a file dropped on it or a stray link would otherwise
  // replace the app, losing the save still waiting in the renderer (TB-7), and the page
  // that loaded would get `window.api`.
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/** Holds the window open until the renderer has sent its pending save and the store has
    written it (TB-7). A renderer that doesn't answer in time is closed anyway. */
function finishSavesBeforeClose(win: BrowserWindow): void {
  let stage: 'open' | 'saving' | 'closing' = 'open';
  win.on('close', (event) => {
    if (stage === 'closing') return;
    event.preventDefault();
    if (stage === 'saving') return;
    stage = 'saving';

    const onReady = (readyEvent: Electron.IpcMainEvent) => {
      if (readyEvent.sender === win.webContents) finish();
    };
    const timer = setTimeout(finish, CLOSE_TIMEOUT_MS);
    function finish() {
      clearTimeout(timer);
      ipcMain.removeListener(IPC.closeReady, onReady);
      void profiles.idle().then(() => {
        stage = 'closing';
        if (!win.isDestroyed()) win.close();
      });
    }
    ipcMain.on(IPC.closeReady, onReady);
    if (win.webContents.isCrashed()) finish();
    else win.webContents.send(IPC.closeRequest);
  });
}

ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({
  version: app.getVersion(),
  platform: process.platform,
}));
ipcMain.handle(IPC.loadTimetable, async () => (await profiles.store()).load());
ipcMain.handle(IPC.saveTimetable, async (_event, file: unknown) =>
  (await profiles.store()).save(file),
);
ipcMain.handle(IPC.openBackup, async () => (await profiles.store()).openBackup());
ipcMain.handle(IPC.startNewTimetable, async () => (await profiles.store()).startNew());
ipcMain.handle(IPC.saveSettings, async (_event, settings: unknown) =>
  (await profiles.store()).saveSettings(settings),
);
ipcMain.handle(IPC.listProfileNames, () => profiles.names());
ipcMain.handle(IPC.listProfiles, () => profiles.list());
ipcMain.handle(IPC.openProfile, (_event, id: unknown) => profiles.open(String(id)));
ipcMain.handle(IPC.newProfile, (_event, name: unknown) => profiles.create(String(name)));
ipcMain.handle(IPC.newProfileFrom, (_event, name: unknown, file: unknown) =>
  profiles.createFrom(String(name), file),
);
ipcMain.handle(IPC.duplicateProfile, (_event, id: unknown, name: unknown) =>
  profiles.duplicate(String(id), String(name)),
);
ipcMain.handle(IPC.renameProfile, (_event, id: unknown, name: unknown) =>
  profiles.rename(String(id), String(name)),
);
ipcMain.handle(IPC.deleteProfile, (_event, id: unknown) => profiles.remove(String(id)));
ipcMain.handle(IPC.exportTimetable, (_event, request: unknown) => exporter.run(request));
ipcMain.handle(IPC.saveExample, (_event, retry: unknown) => exporter.saveExample(retry));
ipcMain.handle(IPC.showInFolder, (_event, path: unknown) => {
  // Only a file this run exported, so the renderer can't open any folder it names.
  if (typeof path === 'string' && exporter.exported(path)) shell.showItemInFolder(path);
});

ipcMain.handle(IPC.chooseImportFile, () => chooseImportFile());
ipcMain.handle(IPC.keepBeforeImport, () => profiles.keepBeforeImport());

void app.whenReady().then(() => {
  if (!firstCopy) return;
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
