import { constants, copyFile, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { TimetableFile } from '../domain/model';
import { createEmptyTimetable } from '../domain/timetableFile';
import { readTimetableFile, serializeTimetableFile } from '../shared/fileFormat';
import type { BackupState, LoadResult, Settings } from '../shared/ipc';
import { settingsChangeSchema, settingsSchema, timetableFileSchema } from '../shared/schema';

// The saved timetable in the user's data folder (TB-7, SYSTEM_DESIGN §4):
//
// - `timetable.json`: written to a temp file first and then renamed over, so a crash
//   mid-save never leaves half a file.
// - `timetable.json.bak`: the version before the latest save.
// - `settings.json`: the class on screen and the last export's details, kept apart so
//   picking a class doesn't touch the timetable or its backup.
//
// A file that can't be read is never overwritten. Saves are refused until the user opens
// the backup or starts a new timetable, and either way the damaged file is copied to
// `timetable.damaged-<time>.json` first. A missing `timetable.json` next to a backup is
// treated the same way, so the backup isn't overwritten by an empty timetable.
//
// On Windows a rename can fail for a moment while antivirus or indexing holds the file,
// so renames are tried a few times before a save is reported as failed.

export const TIMETABLE_FILE = 'timetable.json';
export const BACKUP_FILE = 'timetable.json.bak';
export const SETTINGS_FILE = 'settings.json';

const DEFAULT_SETTINGS: Settings = { selectedClassId: null };

export interface TimetableStore {
  load(): Promise<LoadResult>;
  save(file: unknown): Promise<void>;
  openBackup(): Promise<LoadResult>;
  startNew(): Promise<LoadResult>;
  /** Replaces the settings given, keeping the others. */
  saveSettings(settings: unknown): Promise<void>;
  /** Resolves once every save asked for so far has finished. */
  idle(): Promise<void>;
}

export function createTimetableStore(
  folder: string,
  now: () => Date = () => new Date(),
): TimetableStore {
  const mainPath = join(folder, TIMETABLE_FILE);
  const backupPath = join(folder, BACKUP_FILE);
  const settingsPath = join(folder, SETTINGS_FILE);

  // True while `timetable.json` is damaged and the user hasn't chosen what to do.
  let blocked = false;

  // Writes run one at a time, in the order they were asked for.
  let queue: Promise<void> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function backupState(): Promise<BackupState> {
    const text = await readIfExists(backupPath);
    if (text === null) return 'missing';
    return readTimetableFile(text).ok ? 'ok' : 'damaged';
  }

  async function loadSettings(): Promise<Settings> {
    const text = await readIfExists(settingsPath).catch(() => null);
    if (text === null) return DEFAULT_SETTINGS;
    try {
      const parsed = settingsSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async function damaged(reason: string, missing = false): Promise<LoadResult> {
    blocked = true;
    return { status: 'damaged', reason, missing, backup: await backupState(), folder };
  }

  /** Copies the damaged file to a name of its own so it's kept. The file stays in place
      until it's replaced in one rename, so `timetable.json` is never missing. */
  async function setAsideDamaged(): Promise<void> {
    await copyToFreeName(mainPath, folder, 'timetable.damaged-', fileStamp(now()));
  }

  async function writeTimetable(file: TimetableFile, keepBackup: boolean): Promise<void> {
    if (keepBackup && (await exists(mainPath))) {
      await copyFile(mainPath, `${backupPath}.tmp`);
      await renameWithRetry(`${backupPath}.tmp`, backupPath);
    }
    await writeAtomic(mainPath, serializeTimetableFile(file));
  }

  const store: TimetableStore = {
    load: () =>
      enqueue(async () => {
        let text: string | null;
        try {
          text = await readIfExists(mainPath);
        } catch (error) {
          return damaged(`The file couldn't be read: ${errorMessage(error)}`);
        }
        if (text === null) {
          // No timetable but a backup: something removed the file, so ask rather than
          // start empty and overwrite the backup two saves later.
          if (await exists(backupPath).catch(() => true)) {
            return damaged("The timetable file is missing, but there's a backup.", true);
          }
          blocked = false;
          return { status: 'ok', file: createEmptyTimetable(), settings: await loadSettings() };
        }
        const read = readTimetableFile(text);
        if (!read.ok) return damaged(read.reason);
        blocked = false;
        return { status: 'ok', file: read.file, settings: await loadSettings() };
      }),

    save: (file) => {
      if (blocked) {
        return Promise.reject(new Error("The saved timetable is damaged, so it isn't replaced."));
      }
      let checked: TimetableFile;
      try {
        checked = checkedTimetable(file, 'The timetable');
      } catch (error) {
        return Promise.reject(error as Error);
      }
      return enqueue(() =>
        writeTimetable(checked, true).catch((error: unknown) => {
          throw new Error(saveFailureReason(error, folder));
        }),
      );
    },

    openBackup: () =>
      enqueue(async () => {
        if (!blocked) throw new Error('There is no damaged file to replace.');
        const text = await readIfExists(backupPath).catch(() => null);
        const read = text === null ? null : readTimetableFile(text);
        if (!read?.ok) {
          return {
            status: 'damaged',
            reason: "The backup couldn't be read either.",
            missing: !(await exists(mainPath).catch(() => true)),
            backup: text === null ? 'missing' : 'damaged',
            folder,
          };
        }
        await setAsideDamaged();
        // Written straight away, so the backup is what opens next time even if nothing
        // changes. The backup itself stays as it is.
        await writeTimetable(read.file, false);
        blocked = false;
        return { status: 'ok', file: read.file, settings: await loadSettings() };
      }),

    startNew: () =>
      enqueue(async () => {
        if (!blocked) throw new Error('There is no damaged file to replace.');
        await setAsideDamaged();
        // Written straight away, so the next run opens the new timetable instead of
        // asking again.
        const file = createEmptyTimetable();
        await writeTimetable(file, false);
        blocked = false;
        // A new timetable has none of the old one's classes, but the profile's export
        // details still hold.
        return {
          status: 'ok',
          file,
          settings: { ...(await loadSettings()), selectedClassId: null },
        };
      }),

    saveSettings: (settings) => {
      const checked = settingsChangeSchema.safeParse(settings);
      if (!checked.success) return Promise.reject(new Error('Settings are not valid.'));
      return enqueue(async () => {
        const next = { ...(await loadSettings()), ...checked.data };
        await writeAtomic(settingsPath, `${JSON.stringify(next)}\n`);
      });
    },

    idle: () => queue,
  };
  return store;
}

/** Writes text (as UTF-8) or bytes to a temp file beside `path`, then renames it over, so
    a write that fails part way leaves what was there before, and no temp file (R4-8
    review: a full disk left a half-written `.xlsx.tmp` in the user's folder). */
export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = `${path}.tmp`;
  try {
    const handle = await open(temp, 'w');
    try {
      await handle.writeFile(data, typeof data === 'string' ? 'utf8' : undefined);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/** Errors a rename on Windows gives while another program has the file open. */
const BUSY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** Waits between tries, about 1.5 seconds in all. */
const RETRY_DELAYS_MS = [50, 100, 200, 400, 800];

/** Renames, trying again for a moment if the file is busy (see the note at the top). */
export async function renameWithRetry(
  from: string,
  to: string,
  renameFile: (from: string, to: string) => Promise<void> = rename,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(from, to);
      return;
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (delay === undefined || code === undefined || !BUSY_CODES.has(code)) throw error;
      await wait(delay);
    }
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** `file` as a timetable that fits the file format, or an error naming the first problem,
    which starts with `what` ("The timetable doesn't match the file format: …"). */
export function checkedTimetable(file: unknown, what: string): TimetableFile {
  const checked = timetableFileSchema.safeParse(file);
  if (checked.success) return checked.data;
  const issue = checked.error.issues[0];
  throw new Error(`${what} doesn't match the file format: ${issue?.message ?? 'unknown problem'}.`);
}

/** Copies `from` to `<prefix><stamp>.json` in `folder`, or with `-2`, `-3`… when that name
    is taken, never replacing a file: the copy's name, or null when `from` is missing. */
export async function copyToFreeName(
  from: string,
  folder: string,
  prefix: string,
  stamp: string,
): Promise<string | null> {
  for (let n = 1; ; n++) {
    const name = `${prefix}${stamp}${n === 1 ? '' : `-${n}`}.json`;
    try {
      await copyFile(from, join(folder, name), constants.COPYFILE_EXCL);
      return name;
    } catch (error) {
      if (isMissing(error)) return null;
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
  }
}

/** A time for a file name, such as `2026-10-28T09-15-30`, for copies set aside. */
export function fileStamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/:/g, '-');
}

/** Why a save failed, in words the user can act on (the save notice shows this). */
export function saveFailureReason(error: unknown, folder: string): string {
  return writeFailureReason(error, TIMETABLE_FILE, folder, 'save');
}

/** Why a file couldn't be written, in words the user can act on: `timetable.json` in the
    data folder for the save notice, or an exported file for the export notice, which
    names the file alone and suggests another folder. */
export function writeFailureReason(
  error: unknown,
  fileName: string,
  folder: string,
  kind: 'save' | 'export',
): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const where = kind === 'save' ? `${fileName} in ${folder}` : fileName;
  // An exported file held open, by Excel above all. A busy data file reads as the save's
  // other permission problems.
  if (code === 'EBUSY' && kind === 'export') {
    return `${fileName} is open in another program. Close it and try again.`;
  }
  switch (code) {
    case 'ENOSPC':
      return `The disk is full, so ${where} couldn't be written. Free some space.`;
    case 'EROFS':
      return kind === 'save'
        ? `${where} is on a drive that can't be written to.`
        : `${where} is on a drive that can't be written to. Choose another folder.`;
    case 'EACCES':
    case 'EPERM':
    case 'EBUSY':
      return kind === 'save'
        ? `${where} couldn't be written. Another program, such as antivirus, OneDrive, or a ` +
            'backup tool, may have it open, or the folder may be read-only.'
        : `${fileName} couldn't be written in ${folder}. It may be open in another program, ` +
            'such as Excel, or the folder may be read-only. Close it and try again, or ' +
            'choose another folder.';
    case 'ENOENT':
      return `The ${kind === 'save' ? 'data folder' : 'folder'} ${folder} is missing. It may have been moved or deleted.`;
    default:
      return `${where} couldn't be written: ${errorMessage(error).replace(/\.$/, '')}.`;
  }
}

export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
