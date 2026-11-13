import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type TimetableApi } from '../shared/ipc';

let closeHandler: (() => Promise<void>) | null = null;

// The window asks before it closes. Answer once the handler (the renderer's pending save)
// is done, or straight away if there's none.
ipcRenderer.on(IPC.closeRequest, () => {
  void (async () => {
    try {
      await closeHandler?.();
    } finally {
      ipcRenderer.send(IPC.closeReady);
    }
  })();
});

const api: TimetableApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  loadTimetable: () => ipcRenderer.invoke(IPC.loadTimetable),
  saveTimetable: (file) => ipcRenderer.invoke(IPC.saveTimetable, file),
  openBackup: () => ipcRenderer.invoke(IPC.openBackup),
  startNewTimetable: () => ipcRenderer.invoke(IPC.startNewTimetable),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),
  listProfileNames: () => ipcRenderer.invoke(IPC.listProfileNames),
  listProfiles: () => ipcRenderer.invoke(IPC.listProfiles),
  openProfile: (id) => ipcRenderer.invoke(IPC.openProfile, id),
  newProfile: (name) => ipcRenderer.invoke(IPC.newProfile, name),
  newProfileFrom: (name, file) => ipcRenderer.invoke(IPC.newProfileFrom, name, file),
  duplicateProfile: (id, name) => ipcRenderer.invoke(IPC.duplicateProfile, id, name),
  renameProfile: (id, name) => ipcRenderer.invoke(IPC.renameProfile, id, name),
  deleteProfile: (id) => ipcRenderer.invoke(IPC.deleteProfile, id),
  exportTimetable: (request) => ipcRenderer.invoke(IPC.exportTimetable, request),
  saveExample: (retry) => ipcRenderer.invoke(IPC.saveExample, retry),
  showInFolder: (path) => ipcRenderer.invoke(IPC.showInFolder, path),
  chooseImportFile: () => ipcRenderer.invoke(IPC.chooseImportFile),
  keepBeforeImport: () => ipcRenderer.invoke(IPC.keepBeforeImport),
  onCloseRequest: (handler) => {
    closeHandler = handler;
    return () => {
      if (closeHandler === handler) closeHandler = null;
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
