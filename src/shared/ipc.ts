// The API the preload script exposes to the renderer as `window.api`.

import type { ExportDetails, ExportFormat, ExportScope } from '../domain/exportSheets';
import type { WorkbookData } from '../domain/importWorkbook';
import type { Id, TimetableFile } from '../domain/model';

export const IPC = {
  getAppInfo: 'app:get-info',
  loadTimetable: 'timetable:load',
  saveTimetable: 'timetable:save',
  openBackup: 'timetable:open-backup',
  startNewTimetable: 'timetable:start-new',
  saveSettings: 'settings:save',
  listProfileNames: 'profiles:names',
  listProfiles: 'profiles:list',
  openProfile: 'profiles:open',
  newProfile: 'profiles:new',
  newProfileFrom: 'profiles:new-from',
  duplicateProfile: 'profiles:duplicate',
  renameProfile: 'profiles:rename',
  deleteProfile: 'profiles:delete',
  exportTimetable: 'export:timetable',
  saveExample: 'export:save-example',
  showInFolder: 'export:show-in-folder',
  chooseImportFile: 'import:choose-file',
  keepBeforeImport: 'import:keep-before',
  /** Main → renderer: the window wants to close, so finish any pending save. */
  closeRequest: 'window:close-request',
  /** Renderer → main: pending saves are done, the window can close. */
  closeReady: 'window:close-ready',
} as const;

export interface AppInfo {
  version: string;
  platform: string;
}

/** Remembered between runs, kept in `settings.json` apart from the timetable. */
export interface Settings {
  /** The class that was on screen when the app closed. */
  selectedClassId: Id | null;
  /** The details of the profile's last export, which the Export dialog starts with
      (SYSTEM_DESIGN §11.4). Saved by the main process once an export is written. */
  exportDetails?: ExportDetails;
}

/** What's known about `timetable.json.bak` when the main file can't be read. */
export type BackupState = 'ok' | 'missing' | 'damaged';

export type LoadResult =
  | { status: 'ok'; file: TimetableFile; settings: Settings }
  | {
      status: 'damaged';
      /** Why the file couldn't be read, in words for the user. */
      reason: string;
      /** True when `timetable.json` is gone rather than damaged, so there's nothing to keep. */
      missing: boolean;
      backup: BackupState;
      /** The data folder, where the damaged file stays. */
      folder: string;
    };

/** A profile on the profile screen (PF-2): its counts and when it last changed are read
    from its `timetable.json`. Counts are null when the file can't be read. */
export interface ProfileSummary {
  id: string;
  name: string;
  classes: number | null;
  cards: number | null;
  /** When `timetable.json` was last written, as an ISO time, or null with none yet. */
  modified: string | null;
}

/** The profiles' names in the order made, and the open one: all the header needs, so
    starting up doesn't read every profile's timetable. */
export interface ProfileNames {
  openId: string;
  profiles: { id: string; name: string }[];
}

/** The profiles in the order made with their counts, and the open one. */
export interface ProfileList extends ProfileNames {
  profiles: ProfileSummary[];
}

/** A profile change, or why it was refused in words for the user. */
export type ProfileResult = { ok: true; list: ProfileList } | { ok: false; error: string };

/** A new profile (an empty one, or one made from an imported timetable, IE-1), with its id
    so it can be opened. */
export type NewProfileResult =
  { ok: true; list: ProfileList; id: string } | { ok: false; error: string };

/** What to export (IE-2, IE-4): the timetable on screen, so a save still waiting is in it,
    and the classes in class-bar order. */
export interface ExportRequest {
  file: TimetableFile;
  classIds: Id[];
  scope: ExportScope;
  format: ExportFormat;
  details: ExportDetails;
  /** Try again after a failure: write where the failed export was going, without asking
      again. */
  retry?: boolean;
}

/** How an export went. A failure's reason is in words for the user. */
export type ExportResult =
  | { status: 'saved'; path: string; fileName: string; folder: string }
  | { status: 'cancelled' }
  | { status: 'failed'; fileName: string; reason: string };

/** A workbook chosen to import (IE-1), or why it couldn't be read, in words for the user. */
export type ImportFileResult =
  | { status: 'read'; workbook: WorkbookData }
  | { status: 'cancelled' }
  | { status: 'failed'; fileName: string; reason: string };

export interface TimetableApi {
  getAppInfo(): Promise<AppInfo>;
  /** Reads the saved timetable, or a new one if there's none yet. */
  loadTimetable(): Promise<LoadResult>;
  /** Writes the timetable. Refused while a damaged file hasn't been dealt with. */
  saveTimetable(file: TimetableFile): Promise<void>;
  /** Sets the damaged file aside and opens the backup instead. */
  openBackup(): Promise<LoadResult>;
  /** Sets the damaged file aside and starts an empty timetable. */
  startNewTimetable(): Promise<LoadResult>;
  /** Replaces the settings given, keeping the others. */
  saveSettings(settings: Partial<Settings>): Promise<void>;
  listProfileNames(): Promise<ProfileNames>;
  listProfiles(): Promise<ProfileList>;
  /** Waits for the open profile's saves, then opens another one and loads it. */
  openProfile(id: string): Promise<LoadResult>;
  /** A profile with an empty timetable. It isn't opened. */
  newProfile(name: string): Promise<NewProfileResult>;
  /** A profile holding an imported timetable (IE-1). It isn't opened. */
  newProfileFrom(name: string, file: TimetableFile): Promise<NewProfileResult>;
  /** A copy of a profile's timetable and settings under a new name. */
  duplicateProfile(id: string, name: string): Promise<ProfileResult>;
  renameProfile(id: string, name: string): Promise<ProfileResult>;
  /** Refused for the open profile and the last one. */
  deleteProfile(id: string): Promise<ProfileResult>;
  /** Asks where to save with the system's save dialog, then writes the file. */
  exportTimetable(request: ExportRequest): Promise<ExportResult>;
  /** Asks where to save the made-up example workbook, then writes it. With `retry`, writes
      where the failed save was going without asking again. */
  saveExample(retry?: boolean): Promise<ExportResult>;
  /** Opens the folder of a file this run exported, with the file selected. */
  showInFolder(path: string): Promise<void>;
  /** Asks for an .xlsx workbook with the system's open dialog, then reads it. */
  chooseImportFile(): Promise<ImportFileResult>;
  /** Waits for the open profile's saves, then keeps a copy of its timetable in its folder
      before an import replaces it (IE-1). Fails with why in words. */
  keepBeforeImport(): Promise<void>;
  /** Runs before the window closes. The window waits for the promise, up to a few
      seconds. Returns a function that removes the handler. */
  onCloseRequest(handler: () => Promise<void>): () => void;
}
