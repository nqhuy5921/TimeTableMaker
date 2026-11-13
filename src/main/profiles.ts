import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readdir, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FIRST_PROFILE_NAME,
  checkProfileName,
  tidyProfileNames,
  uniqueProfileName,
  type ProfileEntry,
} from '../domain/profiles';
import type { TimetableFile } from '../domain/model';
import { createEmptyTimetable } from '../domain/timetableFile';
import { readTimetableFile, serializeTimetableFile } from '../shared/fileFormat';
import type {
  LoadResult,
  NewProfileResult,
  ProfileList,
  ProfileNames,
  ProfileResult,
  ProfileSummary,
} from '../shared/ipc';
import { PROFILE_ID, profilesFileSchema } from '../shared/schema';
import {
  BACKUP_FILE,
  SETTINGS_FILE,
  TIMETABLE_FILE,
  checkedTimetable,
  copyToFreeName,
  createTimetableStore,
  exists,
  fileStamp,
  isMissing,
  readIfExists,
  renameWithRetry,
  writeAtomic,
  writeFailureReason,
  type TimetableStore,
} from './store';

// Profiles on disk (PF-1, PF-3, SYSTEM_DESIGN §11.1). Each profile is a folder of its own
// under `profiles/`, holding exactly the files a timetable store keeps, and
// `profiles.json` lists them in the order made with the open one:
//
// - A profile is built in `profiles/.new-<id>`, then listed in `profiles.json`, and only
//   then renamed to `profiles/<id>`. A crash before the list is written leaves a `.new-`
//   folder, removed on the next start; a crash after it leaves a listed `.new-` folder,
//   renamed into place on the next start. Deleting first renames the folder to
//   `profiles/.deleted-<id>`, then writes the list, then removes the folder; a crash before
//   the list is written puts it back on the next start, and one after removes it.
// - A profile folder the list doesn't name is never deleted: the next start lists it again
//   as "Recovered profile", so a folder that was missing for a while (and taken off the
//   list) isn't lost when it comes back (R4-8 review). Only `.new-` and `.deleted-` folders
//   are removed.
// - The list in memory changes only once `profiles.json` has been written, so the two
//   never disagree about which profiles there are or which one is open.
// - A timetable in the data folder itself (release 3's, or one an older copy of the app
//   wrote later) becomes a profile that way, named "Timetable" ("Timetable 2" if that's
//   taken) and opened, and only then is the old `timetable.json` kept as
//   `timetable.before-profiles.json` and its backup and settings deleted. A crash part
//   way does it again, or finishes it, on the next start: files already copied into a
//   profile, byte for byte, aren't copied again.
// - A `profiles.json` that doesn't parse is set aside as `profiles.damaged-<time>.json`
//   and rebuilt from the folders ("Profile 1", "Profile 2"…), so nothing is lost. One the
//   disk won't hand over (held open by antivirus, say) isn't damaged: the start fails, and
//   the load-error screen's Try again reads it again (R4-8 review).
// - The profile screen's counts come from each profile's timetable. They're read for all
//   of them when the screen asks for the list, and after a change only for the profiles
//   it touched and the open one (R4-8 review).
// - Importing (IE-1, SYSTEM_DESIGN §12.6) makes a profile with the imported timetable as
//   New profile does, or, into the open profile, first copies its `timetable.json` to
//   `timetable.before-import-<time>.json` in its folder, which nothing removes.
// - A data folder that can't be written to with a release 3 timetable still in it opens
//   that timetable where it is, as release 3 did: it can be looked at, saves fail with the
//   save notice, and profiles can't be changed until the folder can be written.

export const PROFILES_FILE = 'profiles.json';
export const PROFILES_FOLDER = 'profiles';
export const BEFORE_PROFILES_FILE = 'timetable.before-profiles.json';
/** The start of the copies an import into the open profile keeps. */
export const BEFORE_IMPORT_PREFIX = 'timetable.before-import-';
const NEW_PREFIX = '.new-';
const DELETED_PREFIX = '.deleted-';
/** The name a profile folder the list didn't name is listed under again. */
const RECOVERED_NAME = 'Recovered profile';
/** The one profile of a read-only data folder: the release 3 timetable where it is. */
const IN_PLACE_ID = 'timetable';
const READ_ONLY_ERROR =
  "The data folder can't be written to, so profiles can't be changed. Your timetable is " +
  'open where it was.';
/** Errors that mean the folder can't be written to. */
const WRITE_DENIED = new Set(['EACCES', 'EPERM', 'EROFS']);
/** On Windows a file held open for a moment (antivirus, indexing) stops a folder going. */
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;

export interface ProfileManager {
  /** The open profile's store: every timetable and settings call goes to it. */
  store(): Promise<TimetableStore>;
  /** The profiles' names and the open one, without reading their timetables. */
  names(): Promise<ProfileNames>;
  /** The profiles with their counts and when each last changed, read from their files. */
  list(): Promise<ProfileList>;
  /** Waits for the open profile's saves, then opens another and loads it. */
  open(id: string): Promise<LoadResult>;
  /** Makes a profile with an empty timetable, with its id. It isn't opened. */
  create(name: string): Promise<NewProfileResult>;
  /** Makes a profile holding `file`, an imported timetable, with its id. It isn't opened.
      Fails when the file doesn't fit the file format. */
  createFrom(name: string, file: unknown): Promise<NewProfileResult>;
  /** Once the open profile's saves are done, copies its timetable to
      `timetable.before-import-<time>.json` in its folder (IE-1). Fails with why in words. */
  keepBeforeImport(): Promise<void>;
  /** Copies a profile's timetable and settings (not its backup) under a new name. */
  duplicate(id: string, name: string): Promise<ProfileResult>;
  rename(id: string, name: string): Promise<ProfileResult>;
  /** Deletes a profile and its folder. The open one and the last one can't be. */
  remove(id: string): Promise<ProfileResult>;
  /** Resolves once the open profile's saves have finished. */
  idle(): Promise<void>;
}

export function createProfileManager(
  root: string,
  now: () => Date = () => new Date(),
  newId: () => string = randomUUID,
): ProfileManager {
  const listPath = join(root, PROFILES_FILE);
  const profilesDir = join(root, PROFILES_FOLDER);

  let entries: ProfileEntry[] = [];
  let openId = '';
  let current: TimetableStore | null = null;
  /** True when the data folder can't be written to (see the note at the top). */
  let inPlace = false;
  /** What `profiles.json` holds, so a list that hasn't changed isn't written again. */
  let written = '';

  const folderOf = (id: string) => (inPlace ? root : join(profilesDir, id));
  const listText = (list: ProfileEntry[], open: string) =>
    `${JSON.stringify({ profiles: list, openId: open }, null, 2)}\n`;

  // Profile changes run one at a time, after the folder has been read.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      await ready();
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  }

  // A start that failed (a folder that can't be read, say) is tried again on the next call,
  // so the load-error screen's Try again works.
  let starting: Promise<void> | null = null;
  function ready(): Promise<void> {
    starting ??= start().catch((error: unknown) => {
      starting = null;
      throw error;
    });
    return starting;
  }

  /** Writes the list, and only then takes it as the list (see the note at the top). */
  async function commit(list: ProfileEntry[], open: string): Promise<void> {
    const text = listText(list, open);
    await writeAtomic(listPath, text);
    written = text;
    entries = list;
    openId = open;
  }

  /** Makes `.new-<id>` and fills it. A failure removes the half-made folder. */
  async function build(id: string, fill: (folder: string) => Promise<void>): Promise<string> {
    const building = join(profilesDir, NEW_PREFIX + id);
    await mkdir(building);
    try {
      await fill(building);
    } catch (error) {
      await rm(building, RM_OPTIONS).catch(() => undefined);
      throw error;
    }
    return building;
  }

  /** Lists a profile built in `building` and moves it into place. If it can't be moved,
      the list is put back, so no profile is listed without its folder; if even that
      fails, the next start moves the folder into place. */
  async function addBuilt(entry: ProfileEntry, building: string, openIt = false): Promise<void> {
    const before = { list: entries, open: openId };
    await commit([...entries, entry], openIt ? entry.id : openId);
    try {
      await renameWithRetry(building, folderOf(entry.id));
    } catch (error) {
      try {
        await commit(before.list, before.open);
        await rm(building, RM_OPTIONS).catch(() => undefined);
      } catch {
        // Left listed with its `.new-` folder, for the next start to finish.
      }
      throw error;
    }
  }

  async function start(): Promise<void> {
    inPlace = false;
    try {
      await startProfiles();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      const oldTimetable =
        (await exists(join(root, TIMETABLE_FILE)).catch(() => false)) ||
        (await exists(join(root, BACKUP_FILE)).catch(() => false));
      if (code === undefined || !WRITE_DENIED.has(code) || !oldTimetable) throw error;
      inPlace = true;
      entries = [{ id: IN_PLACE_ID, name: FIRST_PROFILE_NAME }];
      openId = IN_PLACE_ID;
    }
    current = createTimetableStore(folderOf(openId), now);
  }

  async function startProfiles(): Promise<void> {
    await mkdir(profilesDir, { recursive: true });
    const read = await readList();
    if (read.status === 'ok') {
      written = read.text;
      entries = tidyProfileNames(read.entries);
      openId = read.openId;
      await tidyFolders();
    } else {
      if (read.status === 'damaged') await setAsideDamagedList();
      written = '';
      entries = await folderEntries();
      openId = entries[0]?.id ?? '';
    }
    await adoptOldTimetable();
    if (entries.length === 0) {
      const id = newId();
      const building = await build(id, (folder) =>
        writeAtomic(join(folder, TIMETABLE_FILE), serializeTimetableFile(createEmptyTimetable())),
      );
      await addBuilt({ id, name: FIRST_PROFILE_NAME }, building, true);
    }
    if (listText(entries, openId) !== written) await commit(entries, openId);
  }

  async function readList(): Promise<
    | { status: 'ok'; entries: ProfileEntry[]; openId: string; text: string }
    | { status: 'missing' | 'damaged' }
  > {
    // A file the disk won't hand over throws: it isn't damaged (see the note at the top).
    const text = await readIfExists(listPath);
    if (text === null) return { status: 'missing' };
    try {
      const parsed = profilesFileSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return { status: 'damaged' };
      const { profiles, openId: id } = parsed.data;
      return {
        status: 'ok',
        entries: profiles,
        openId: profiles.some((p) => p.id === id) ? id : profiles[0]!.id,
        text,
      };
    } catch {
      return { status: 'damaged' };
    }
  }

  /** With a good list: puts back a listed profile still in its `.new-` folder (listed
      before it was moved into place) or `.deleted-` folder (its delete never reached the
      list), removes the other `.new-` and `.deleted-` folders, drops listed profiles whose
      folder is gone, and lists again any profile folder the list doesn't name (see the
      note at the top). The list is written at the end of the start. */
  async function tidyFolders(): Promise<void> {
    const names = await readdir(profilesDir);
    for (const entry of entries) {
      if (names.includes(entry.id)) continue;
      const left = [NEW_PREFIX, DELETED_PREFIX].find((p) => names.includes(p + entry.id));
      if (left) await renameWithRetry(join(profilesDir, left + entry.id), folderOf(entry.id));
    }
    const listed = new Set(entries.map((e) => e.id));
    const unlisted: string[] = [];
    for (const name of [...names].sort()) {
      if (isPassing(name)) await rm(join(profilesDir, name), RM_OPTIONS);
      else if (!listed.has(name) && (await isProfileFolder(name))) unlisted.push(name);
    }
    const kept: ProfileEntry[] = [];
    for (const entry of entries) {
      if (await isFolder(folderOf(entry.id))) kept.push(entry);
    }
    for (const id of unlisted) kept.push({ id, name: uniqueProfileName(kept, RECOVERED_NAME) });
    entries = kept;
    if (!entries.some((e) => e.id === openId)) openId = entries[0]?.id ?? '';
  }

  /** With no good list: one profile per folder, in folder order, after removing any
      half-made or deleted ones. */
  async function folderEntries(): Promise<ProfileEntry[]> {
    const ids: string[] = [];
    for (const name of (await readdir(profilesDir)).sort()) {
      if (isPassing(name)) await rm(join(profilesDir, name), RM_OPTIONS);
      else if (await isProfileFolder(name)) ids.push(name);
    }
    return ids.map((id, i) => ({ id, name: `Profile ${i + 1}` }));
  }

  /** A folder on its way in or out, which a start puts back if it's listed, or removes. */
  const isPassing = (name: string) =>
    name.startsWith(NEW_PREFIX) || name.startsWith(DELETED_PREFIX);

  /** A folder under `profiles/` with a profile's name. Anything else there is left alone. */
  const isProfileFolder = async (name: string) =>
    PROFILE_ID.test(name) && (await isFolder(join(profilesDir, name)));

  /** Makes a timetable in the data folder itself into a profile and opens it, unless a
      profile already has those files, then puts the old files away (see the note at the
      top). */
  async function adoptOldTimetable(): Promise<void> {
    const present: [string, string][] = [];
    for (const file of [TIMETABLE_FILE, BACKUP_FILE]) {
      const text = await readIfExists(join(root, file));
      if (text !== null) present.push([file, text]);
    }
    if (present.length > 0 && !(await adoptedAlready(present))) {
      const id = newId();
      const building = await build(id, async (folder) => {
        for (const file of [TIMETABLE_FILE, BACKUP_FILE, SETTINGS_FILE]) {
          await copyIfExists(join(root, file), join(folder, file));
        }
      });
      await addBuilt({ id, name: uniqueProfileName(entries, FIRST_PROFILE_NAME) }, building, true);
    }
    const oldMain = join(root, TIMETABLE_FILE);
    if (await exists(oldMain)) await renameWithRetry(oldMain, await keptName());
    await unlink(join(root, BACKUP_FILE)).catch(ignoreMissing);
    await unlink(join(root, SETTINGS_FILE)).catch(ignoreMissing);
  }

  /** True when a listed profile holds the same files, so an earlier start copied them. */
  async function adoptedAlready(present: [string, string][]): Promise<boolean> {
    for (const entry of entries) {
      let same = true;
      for (const [file, text] of present) {
        const copy = await readIfExists(join(folderOf(entry.id), file)).catch(() => null);
        if (copy !== text) same = false;
      }
      if (same) return true;
    }
    return false;
  }

  /** `timetable.before-profiles.json`, or a name with the time if that's kept already. */
  async function keptName(): Promise<string> {
    const first = join(root, BEFORE_PROFILES_FILE);
    if (!(await exists(first))) return first;
    return freeName((n) => `timetable.before-profiles-${fileStamp(now())}${n}.json`);
  }

  async function setAsideDamagedList(): Promise<void> {
    await renameWithRetry(
      listPath,
      await freeName((n) => `profiles.damaged-${fileStamp(now())}${n}.json`),
    );
  }

  /** The first of `name('')`, `name('-2')`, `name('-3')`… not in the data folder yet. */
  async function freeName(name: (suffix: string) => string): Promise<string> {
    for (let n = 1; ; n++) {
      const path = join(root, name(n === 1 ? '' : `-${n}`));
      if (!(await exists(path))) return path;
    }
  }

  async function summary(entry: ProfileEntry): Promise<ProfileSummary> {
    const folder = folderOf(entry.id);
    const path = join(folder, TIMETABLE_FILE);
    const text = await readIfExists(path).catch(() => null);
    if (text === null) {
      // No file yet is an empty timetable, unless a backup says it went missing.
      const missing = await exists(join(folder, BACKUP_FILE)).catch(() => true);
      return { ...entry, classes: missing ? null : 0, cards: missing ? null : 0, modified: null };
    }
    const read = readTimetableFile(text);
    const modified = await stat(path).then(
      (s) => s.mtime.toISOString(),
      () => null,
    );
    return read.ok
      ? { ...entry, classes: read.file.classes.length, cards: read.file.cards.length, modified }
      : { ...entry, classes: null, cards: null, modified };
  }

  /** Each profile's counts and time as last read, by id (see the note at the top). */
  const summaries = new Map<string, ProfileSummary>();

  /** The list with every profile's counts: read again for all of them, or only for the open
      one and any not read yet, the name always from the list. */
  async function listNow(readAll: boolean): Promise<ProfileList> {
    const profiles = await Promise.all(
      entries.map(async (entry) => {
        const known = summaries.get(entry.id);
        const fresh =
          readAll || !known || entry.id === openId ? await summary(entry) : { ...known, ...entry };
        summaries.set(entry.id, fresh);
        return fresh;
      }),
    );
    for (const id of summaries.keys()) {
      if (!entries.some((e) => e.id === id)) summaries.delete(id);
    }
    return { openId, profiles };
  }

  const findEntry = (id: string) => entries.find((e) => e.id === id);
  const gone = { ok: false, error: "That profile isn't in the list any more." } as const;
  const readOnly = { ok: false, error: READ_ONLY_ERROR } as const;

  /** A profile holding `file`, listed last and not opened (New profile, and an import into
      a new profile). */
  const make = (nameInput: string, file: TimetableFile) =>
    enqueue(async (): Promise<NewProfileResult> => {
      if (inPlace) return readOnly;
      const check = checkProfileName(entries, nameInput);
      if (!check.ok) return check;
      const id = newId();
      const building = await build(id, (folder) =>
        writeAtomic(join(folder, TIMETABLE_FILE), serializeTimetableFile(file)),
      );
      await addBuilt({ id, name: check.name }, building);
      return { ok: true, list: await listNow(false), id };
    });

  return {
    store: async () => {
      await ready();
      return current!;
    },

    names: () => enqueue(async () => ({ openId, profiles: entries.map((e) => ({ ...e })) })),

    list: () => enqueue(() => listNow(true)),

    open: (id) =>
      enqueue(async () => {
        if (!findEntry(id)) throw new Error(gone.error);
        await current!.idle();
        if (!inPlace) await commit(entries, id);
        current = createTimetableStore(folderOf(id), now);
        return current.load();
      }),

    create: (nameInput) => make(nameInput, createEmptyTimetable()),

    createFrom: async (nameInput, file) =>
      make(nameInput, checkedTimetable(file, 'The imported timetable')),

    keepBeforeImport: () =>
      enqueue(async () => {
        await current!.idle();
        const folder = folderOf(openId);
        // Read first, so a timetable that can't be read isn't worded as a copy that can't
        // be written. Nothing saved yet is an empty timetable, with nothing to keep.
        const main = join(folder, TIMETABLE_FILE);
        try {
          if ((await readIfExists(main)) === null) return;
        } catch (error) {
          throw new Error(`${TIMETABLE_FILE} in ${folder} couldn't be read: ${errorText(error)}`, {
            cause: error,
          });
        }
        const stamp = fileStamp(now());
        try {
          await copyToFreeName(main, folder, BEFORE_IMPORT_PREFIX, stamp);
        } catch (error) {
          const name = `${BEFORE_IMPORT_PREFIX}${stamp}.json`;
          throw new Error(writeFailureReason(error, name, folder, 'save'), { cause: error });
        }
      }),

    duplicate: (sourceId, nameInput) =>
      enqueue(async (): Promise<ProfileResult> => {
        if (inPlace) return readOnly;
        if (!findEntry(sourceId)) return gone;
        const check = checkProfileName(entries, nameInput);
        if (!check.ok) return check;
        if (sourceId === openId) await current!.idle();
        const id = newId();
        const building = await build(id, async (folder) => {
          for (const file of [TIMETABLE_FILE, SETTINGS_FILE]) {
            await copyIfExists(join(folderOf(sourceId), file), join(folder, file));
          }
        });
        await addBuilt({ id, name: check.name }, building);
        return { ok: true, list: await listNow(false) };
      }),

    rename: (id, nameInput) =>
      enqueue(async (): Promise<ProfileResult> => {
        if (inPlace) return readOnly;
        const entry = findEntry(id);
        if (!entry) return gone;
        const check = checkProfileName(entries, nameInput, id);
        if (!check.ok) return check;
        if (check.name !== entry.name) {
          await commit(
            entries.map((e) => (e === entry ? { ...e, name: check.name } : e)),
            openId,
          );
        }
        return { ok: true, list: await listNow(false) };
      }),

    remove: (id) =>
      enqueue(async (): Promise<ProfileResult> => {
        if (inPlace) return readOnly;
        const entry = findEntry(id);
        if (!entry) return gone;
        if (entries.length === 1) return { ok: false, error: "The last profile can't be deleted." };
        if (id === openId) {
          return { ok: false, error: "The open profile can't be deleted. Open another one first." };
        }
        // Moved aside first, so a profile folder still there at the next start is never a
        // deleted one (see the note at the top). A folder that's already gone needs no move.
        const deleting = join(profilesDir, DELETED_PREFIX + id);
        let moved = true;
        try {
          await renameWithRetry(folderOf(id), deleting);
        } catch (error) {
          if (!isMissing(error)) {
            return {
              ok: false,
              error:
                `${entry.name} couldn't be deleted: another program, such as antivirus or ` +
                'OneDrive, has its folder open. Try again in a moment.',
            };
          }
          moved = false;
        }
        try {
          await commit(
            entries.filter((e) => e.id !== id),
            openId,
          );
        } catch (error) {
          if (moved) await renameWithRetry(deleting, folderOf(id)).catch(() => undefined);
          throw error;
        }
        // Once it's off the list it's deleted; a folder that can't go yet is removed on
        // the next start.
        if (moved) await rm(deleting, RM_OPTIONS).catch(() => undefined);
        return { ok: true, list: await listNow(false) };
      }),

    idle: async () => {
      // Never fails, since a closing window waits on it.
      await ready().catch(() => undefined);
      await queue;
      await current?.idle();
    },
  };
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${message.replace(/\.$/, '')}.`;
}

async function copyIfExists(from: string, to: string): Promise<void> {
  try {
    await copyFile(from, to);
  } catch (error) {
    ignoreMissing(error);
  }
}

async function isFolder(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    ignoreMissing(error);
    return false;
  }
}

function ignoreMissing(error: unknown): void {
  if (!isMissing(error)) throw error;
}
