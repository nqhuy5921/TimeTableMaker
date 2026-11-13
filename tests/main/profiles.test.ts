import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import { createAppState } from '../../src/domain/appState';
import { addClass } from '../../src/domain/classes';
import type { TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import { BEFORE_PROFILES_FILE, PROFILES_FILE, createProfileManager } from '../../src/main/profiles';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

let root: string;
const NOW = () => new Date('2026-10-28T09:15:30.000Z');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ttm-profiles-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Ids p1, p2, … in the order they're asked for. */
function ids() {
  let n = 0;
  return () => `p${++n}`;
}

const manager = () => createProfileManager(root, NOW, ids());

function withClasses(...names: string[]): TimetableFile {
  let state = createAppState(emptySchool());
  for (const [i, name] of names.entries()) {
    const result = addClass(state, name, () => `c${i + 1}`);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state.file;
}

const read = (...path: string[]) => readFile(join(root, ...path), 'utf8');
const write = (path: string, text: string) => writeFile(join(root, path), text);
const rootFiles = async () => (await readdir(root)).sort();
const profileFiles = async (id: string) => (await readdir(join(root, 'profiles', id))).sort();
const listFile = async () => JSON.parse(await read(PROFILES_FILE)) as unknown;

/** A release 3 data folder: the timetable, its backup, and the class on screen. */
async function release3Folder() {
  const main = serializeTimetableFile(withClasses('6A1', '7B2'));
  const backup = serializeTimetableFile(withClasses('6A1'));
  const settings = `${JSON.stringify({ selectedClassId: 'c2' })}\n`;
  await write('timetable.json', main);
  await write('timetable.json.bak', backup);
  await write('settings.json', settings);
  return { main, backup, settings };
}

describe('the first start (PF-1)', () => {
  it('makes an empty profile named Timetable', async () => {
    const profiles = manager();
    const result = await (await profiles.store()).load();
    expect(result).toEqual({
      status: 'ok',
      file: createEmptyTimetable(),
      settings: { selectedClassId: null },
    });
    expect(await listFile()).toEqual({ profiles: [{ id: 'p1', name: 'Timetable' }], openId: 'p1' });
    expect(await rootFiles()).toEqual(['profiles', PROFILES_FILE]);
    expect(await profileFiles('p1')).toEqual(['timetable.json']);
  });

  it('opens the profile it had open, on its own files', async () => {
    const first = manager();
    await first.create('Draft');
    await first.open('p2');
    await (await first.store()).save(withClasses('9BA1'));
    await first.idle();

    const again = createProfileManager(root, NOW, ids());
    const result = await (await again.store()).load();
    expect(result.status === 'ok' && result.file.classes.map((c) => c.name)).toEqual(['9BA1']);
    expect(await profileFiles('p1')).toEqual(['timetable.json']);
  });
});

describe('the upgrade from release 3 (PF-3)', () => {
  it('moves the timetable into a profile and keeps the old file as a copy', async () => {
    const before = await release3Folder();
    const profiles = manager();
    const result = await (await profiles.store()).load();

    expect(result).toEqual({
      status: 'ok',
      file: withClasses('6A1', '7B2'),
      settings: { selectedClassId: 'c2' },
    });
    expect(await listFile()).toEqual({ profiles: [{ id: 'p1', name: 'Timetable' }], openId: 'p1' });
    expect(await rootFiles()).toEqual(['profiles', PROFILES_FILE, BEFORE_PROFILES_FILE]);
    expect(await read(BEFORE_PROFILES_FILE)).toBe(before.main);
    expect(await read('profiles', 'p1', 'timetable.json')).toBe(before.main);
    expect(await read('profiles', 'p1', 'timetable.json.bak')).toBe(before.backup);
    expect(await read('profiles', 'p1', 'settings.json')).toBe(before.settings);
  });

  it('copies a damaged file as it is, so the profile opens on the damaged-file screen', async () => {
    await write('timetable.json', '{"schemaVersion": 1, "classes": [');
    const result = await (await manager().store()).load();
    expect(result.status).toBe('damaged');
    expect(await read('profiles', 'p1', 'timetable.json')).toBe(
      '{"schemaVersion": 1, "classes": [',
    );
  });

  it('keeps a backup with no timetable, so the profile asks before starting empty', async () => {
    await write('timetable.json.bak', serializeTimetableFile(withClasses('6A1')));
    const result = await (await manager().store()).load();
    expect(result).toMatchObject({ status: 'damaged', missing: true, backup: 'ok' });
    expect(await rootFiles()).toEqual(['profiles', PROFILES_FILE]);
  });

  it('does it again after a crash before the list was written', async () => {
    const before = await release3Folder();
    // A half-made folder from the first try.
    await mkdir(join(root, 'profiles', '.new-old'), { recursive: true });
    await write('profiles/.new-old/timetable.json', before.main);

    await manager().store();
    expect(await readdir(join(root, 'profiles'))).toEqual(['p1']);
    expect(await read('profiles', 'p1', 'timetable.json')).toBe(before.main);
    expect(await read(BEFORE_PROFILES_FILE)).toBe(before.main);
  });

  it('finishes after a crash between writing the list and moving the folder', async () => {
    const before = await release3Folder();
    await mkdir(join(root, 'profiles', '.new-x1'), { recursive: true });
    await write('profiles/.new-x1/timetable.json', before.main);
    await write('profiles/.new-x1/timetable.json.bak', before.backup);
    await write('profiles/.new-x1/settings.json', before.settings);
    await write(
      PROFILES_FILE,
      JSON.stringify({ profiles: [{ id: 'x1', name: 'Timetable' }], openId: 'x1' }),
    );

    const profiles = manager();
    const result = await (await profiles.store()).load();
    expect(result).toMatchObject({ status: 'ok', settings: { selectedClassId: 'c2' } });
    expect((await profiles.list()).profiles.map((p) => p.id)).toEqual(['x1']);
    expect(await readdir(join(root, 'profiles'))).toEqual(['x1']);
    expect(await rootFiles()).toEqual(['profiles', PROFILES_FILE, BEFORE_PROFILES_FILE]);
  });

  it('finishes after a crash before the old files were put away', async () => {
    const before = await release3Folder();
    await mkdir(join(root, 'profiles', 'x1'), { recursive: true });
    await write('profiles/x1/timetable.json', before.main);
    await write('profiles/x1/timetable.json.bak', before.backup);
    await write(
      PROFILES_FILE,
      JSON.stringify({ profiles: [{ id: 'x1', name: 'Timetable' }], openId: 'x1' }),
    );

    const profiles = manager();
    expect((await profiles.list()).profiles.map((p) => p.id)).toEqual(['x1']);
    expect(await rootFiles()).toEqual(['profiles', PROFILES_FILE, BEFORE_PROFILES_FILE]);
    expect(await read(BEFORE_PROFILES_FILE)).toBe(before.main);
  });

  it('makes a timetable an older copy of the app wrote later into a profile of its own', async () => {
    const before = await release3Folder();
    await manager().store();
    // An older copy of the app run afterwards writes a timetable of its own.
    const later = serializeTimetableFile(withClasses('8CE1'));
    await write('timetable.json', later);

    const again = createProfileManager(root, NOW, () => 'later');
    const result = await (await again.store()).load();
    expect(result.status === 'ok' && result.file.classes.map((c) => c.name)).toEqual(['8CE1']);
    expect(await again.list()).toMatchObject({
      openId: 'later',
      profiles: [{ name: 'Timetable' }, { id: 'later', name: 'Timetable 2' }],
    });
    expect(await read(BEFORE_PROFILES_FILE)).toBe(before.main);
    expect(await read('timetable.before-profiles-2026-10-28T09-15-30.json')).toBe(later);
    expect(await rootFiles()).not.toContain('timetable.json');
  });
});

describe('new, duplicate, rename, and delete (PF-2)', () => {
  it('makes a profile with an empty timetable without opening it', async () => {
    const profiles = manager();
    const result = await profiles.create('  Draft term 2 ');
    expect(result).toEqual({
      ok: true,
      id: 'p2',
      list: {
        openId: 'p1',
        profiles: [
          expect.objectContaining({ id: 'p1', name: 'Timetable' }),
          expect.objectContaining({ id: 'p2', name: 'Draft term 2', classes: 0, cards: 0 }),
        ],
      },
    });
    expect(await profileFiles('p2')).toEqual(['timetable.json']);
    expect(await readdir(join(root, 'profiles'))).toEqual(['p1', 'p2']);
  });

  it('refuses a name that is empty or taken', async () => {
    const profiles = manager();
    expect(await profiles.create('')).toEqual({ ok: false, error: 'Enter a profile name.' });
    expect(await profiles.create('TIMETABLE')).toEqual({
      ok: false,
      error: "There's already a profile called Timetable.",
    });
    expect((await profiles.list()).profiles).toHaveLength(1);
  });

  it('duplicates the timetable and settings, not the backup, after waiting saves', async () => {
    await release3Folder();
    const profiles = manager();
    const store = await profiles.store();
    void store.save(withClasses('6A1', '7B2', '9BA1'));

    const result = await profiles.duplicate('p1', 'Timetable copy');
    expect(result.ok && result.list.profiles.map((p) => [p.name, p.classes])).toEqual([
      ['Timetable', 3],
      ['Timetable copy', 3],
    ]);
    expect(await profileFiles('p2')).toEqual(['settings.json', 'timetable.json']);
    expect(await read('profiles', 'p2', 'timetable.json')).toBe(
      await read('profiles', 'p1', 'timetable.json'),
    );
    expect(await read('profiles', 'p2', 'settings.json')).toBe(
      await read('profiles', 'p1', 'settings.json'),
    );
  });

  it('renames a profile, keeping its own name free', async () => {
    const profiles = manager();
    await profiles.create('Draft');
    expect(await profiles.rename('p2', 'Timetable')).toEqual({
      ok: false,
      error: "There's already a profile called Timetable.",
    });
    const result = await profiles.rename('p1', 'Năm học 2026');
    expect(result.ok && result.list.profiles.map((p) => p.name)).toEqual(['Năm học 2026', 'Draft']);
    expect(await listFile()).toMatchObject({
      profiles: [{ name: 'Năm học 2026' }, { name: 'Draft' }],
    });
  });

  it('deletes a profile and its folder', async () => {
    const profiles = manager();
    await profiles.create('Draft');
    const result = await profiles.remove('p2');
    expect(result.ok && result.list.profiles.map((p) => p.id)).toEqual(['p1']);
    expect(await readdir(join(root, 'profiles'))).toEqual(['p1']);
  });

  it('refuses deleting the last profile or the open one', async () => {
    const profiles = manager();
    expect(await profiles.remove('p1')).toEqual({
      ok: false,
      error: "The last profile can't be deleted.",
    });
    await profiles.create('Draft');
    expect(await profiles.remove('p1')).toEqual({
      ok: false,
      error: "The open profile can't be deleted. Open another one first.",
    });
    expect(await profiles.remove('nope')).toEqual({
      ok: false,
      error: "That profile isn't in the list any more.",
    });
    expect((await profiles.list()).profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('opening a profile (PF-1)', () => {
  it('waits for the open profile to finish saving, then loads the other one', async () => {
    const profiles = manager();
    await profiles.create('Draft');
    const store = await profiles.store();
    void store.save(withClasses('6A1'));

    const result = await profiles.open('p2');
    expect(result).toEqual({
      status: 'ok',
      file: createEmptyTimetable(),
      settings: { selectedClassId: null },
    });
    const first = JSON.parse(await read('profiles', 'p1', 'timetable.json')) as TimetableFile;
    expect(first.classes.map((c) => c.name)).toEqual(['6A1']);
    expect(await listFile()).toMatchObject({ openId: 'p2' });

    // Saves now go to the profile that's open.
    await (await profiles.store()).save(withClasses('9BA1'));
    const second = JSON.parse(await read('profiles', 'p2', 'timetable.json')) as TimetableFile;
    expect(second.classes.map((c) => c.name)).toEqual(['9BA1']);
  });

  it("refuses a profile that isn't in the list", async () => {
    await expect(manager().open('../outside')).rejects.toThrow(
      "That profile isn't in the list any more.",
    );
  });
});

describe('importing (IE-1)', () => {
  it('makes a profile holding the imported timetable, with its id, without opening it', async () => {
    const profiles = manager();
    const imported = withClasses('6A1', '7B2');
    const result = await profiles.createFrom(' TKB school ', imported);
    expect(result).toEqual({
      ok: true,
      id: 'p2',
      list: {
        openId: 'p1',
        profiles: [
          expect.objectContaining({ id: 'p1', name: 'Timetable' }),
          expect.objectContaining({ id: 'p2', name: 'TKB school', classes: 2, cards: 0 }),
        ],
      },
    });
    expect(await read('profiles', 'p2', 'timetable.json')).toBe(serializeTimetableFile(imported));
    expect(await profiles.createFrom('TKB SCHOOL', imported)).toEqual({
      ok: false,
      error: "There's already a profile called TKB school.",
    });
  });

  it("refuses a timetable that doesn't fit the file format, making no profile", async () => {
    const profiles = manager();
    await expect(profiles.createFrom('Bad', { version: 6, classes: 'none' })).rejects.toThrow(
      "The imported timetable doesn't match the file format",
    );
    expect((await profiles.list()).profiles).toHaveLength(1);
  });

  it('keeps a copy of the open timetable in its folder once its saves are done', async () => {
    const profiles = manager();
    await profiles.create('Draft');
    await profiles.open('p2');
    const store = await profiles.store();
    void store.save(withClasses('6A1'));

    await profiles.keepBeforeImport();
    const kept = 'timetable.before-import-2026-10-28T09-15-30.json';
    expect(await profileFiles('p2')).toEqual([kept, 'timetable.json', 'timetable.json.bak']);
    expect(await read('profiles', 'p2', kept)).toBe(serializeTimetableFile(withClasses('6A1')));

    // A second import in the same second keeps its own copy.
    await store.save(withClasses('6A1', '7B2'));
    await profiles.keepBeforeImport();
    const second = 'timetable.before-import-2026-10-28T09-15-30-2.json';
    expect(await read('profiles', 'p2', second)).toBe(
      serializeTimetableFile(withClasses('6A1', '7B2')),
    );
    expect(await read('profiles', 'p2', kept)).toBe(serializeTimetableFile(withClasses('6A1')));
  });

  it('keeps nothing for a profile with nothing saved yet', async () => {
    const profiles = manager();
    await profiles.store();
    await rm(join(root, 'profiles', 'p1', 'timetable.json'));
    await profiles.keepBeforeImport();
    expect(await profileFiles('p1')).toEqual([]);
  });

  it("says why the timetable couldn't be read", async () => {
    const profiles = manager();
    await profiles.store();
    // A folder in the timetable's place stands in for a file the disk won't hand over.
    await rm(join(root, 'profiles', 'p1', 'timetable.json'));
    await mkdir(join(root, 'profiles', 'p1', 'timetable.json'));
    await expect(profiles.keepBeforeImport()).rejects.toThrow(
      /^timetable\.json in .* couldn't be read: /,
    );
  });

  it.skipIf(process.getuid?.() === 0)("says why the copy couldn't be written", async () => {
    const profiles = manager();
    await profiles.store();
    const folder = join(root, 'profiles', 'p1');
    await chmod(folder, 0o555);
    try {
      await expect(profiles.keepBeforeImport()).rejects.toThrow(
        /^timetable\.before-import-2026-10-28T09-15-30\.json in .* couldn't be written\./,
      );
    } finally {
      await chmod(folder, 0o755);
    }
  });
});

describe('the list on disk', () => {
  it('reads counts and the last change from each timetable', async () => {
    await write('timetable.json', serializeTimetableFile(withClasses('6A1', '7B2')));
    const profiles = manager();
    await profiles.create('Draft');
    await write('profiles/p2/timetable.json', 'not json');

    const list = await profiles.list();
    expect(list.profiles).toEqual([
      { id: 'p1', name: 'Timetable', classes: 2, cards: 0, modified: expect.any(String) },
      { id: 'p2', name: 'Draft', classes: null, cards: null, modified: expect.any(String) },
    ]);
  });

  it('gives the names and the open one without reading the timetables', async () => {
    await write('timetable.json', serializeTimetableFile(withClasses('6A1')));
    const profiles = manager();
    await profiles.create('Draft');
    await write('profiles/p2/timetable.json', 'not json');

    expect(await profiles.names()).toEqual({
      openId: 'p1',
      profiles: [
        { id: 'p1', name: 'Timetable' },
        { id: 'p2', name: 'Draft' },
      ],
    });
  });

  it('rebuilds a damaged list from the folders, keeping the damaged one aside', async () => {
    const profiles = manager();
    await profiles.create('Draft');
    await profiles.idle();
    await write(PROFILES_FILE, '{"profiles": [');

    const again = createProfileManager(root, NOW, ids());
    const list = await again.list();
    expect(list).toMatchObject({
      openId: 'p1',
      profiles: [
        { id: 'p1', name: 'Profile 1' },
        { id: 'p2', name: 'Profile 2' },
      ],
    });
    expect(await read('profiles.damaged-2026-10-28T09-15-30.json')).toBe('{"profiles": [');
    expect(await listFile()).toMatchObject({ openId: 'p1' });
  });

  it("rebuilds a list that doesn't fit the format, such as an id with a path in it", async () => {
    await manager().store();
    await write(
      PROFILES_FILE,
      JSON.stringify({ profiles: [{ id: '../x', name: 'A' }], openId: '../x' }),
    );
    const list = await createProfileManager(root, NOW, ids()).list();
    expect(list.profiles).toMatchObject([{ id: 'p1', name: 'Profile 1' }]);
  });

  it('drops listed profiles with no folder and removes half-made and deleted folders', async () => {
    const profiles = manager();
    await profiles.create('Draft');
    await profiles.idle();
    await rm(join(root, 'profiles', 'p2'), { recursive: true });
    await mkdir(join(root, 'profiles', '.new-p7'));
    await mkdir(join(root, 'profiles', '.deleted-p8'));
    await write('profiles/notes.txt', '');

    const list = await createProfileManager(root, NOW, ids()).list();
    expect(list.profiles.map((p) => p.id)).toEqual(['p1']);
    // Anything that isn't a profile folder is left alone.
    expect(await readdir(join(root, 'profiles'))).toEqual(['notes.txt', 'p1']);
    expect(await listFile()).toEqual({ profiles: [{ id: 'p1', name: 'Timetable' }], openId: 'p1' });
  });

  it("lists again a profile folder the list doesn't name, rather than deleting it", async () => {
    const profiles = manager();
    await profiles.create('Draft');
    await profiles.idle();
    await writeFile(
      join(root, 'profiles', 'p2', 'timetable.json'),
      serializeTimetableFile(withClasses('6A1')),
    );
    // The folder goes missing for a start (moved away, or held by antivirus)…
    await rename(join(root, 'profiles', 'p2'), join(root, 'away'));
    expect((await createProfileManager(root, NOW, ids()).list()).profiles).toHaveLength(1);
    // …and comes back: it's a profile again, with its timetable.
    await rename(join(root, 'away'), join(root, 'profiles', 'p2'));
    await mkdir(join(root, 'profiles', 'stray'));

    const list = await createProfileManager(root, NOW, ids()).list();
    expect(list.profiles).toMatchObject([
      { id: 'p1', name: 'Timetable' },
      { id: 'p2', name: 'Recovered profile', classes: 1 },
      { id: 'stray', name: 'Recovered profile 2', classes: 0 },
    ]);
    expect(await readdir(join(root, 'profiles'))).toEqual(['p1', 'p2', 'stray']);
  });

  it("puts back a profile whose delete didn't reach the list", async () => {
    const profiles = manager();
    await profiles.create('Draft');
    await profiles.idle();
    // A crash after the folder was moved aside, before the list was written.
    await rename(join(root, 'profiles', 'p2'), join(root, 'profiles', '.deleted-p2'));

    const list = await createProfileManager(root, NOW, ids()).list();
    expect(list.profiles.map((p) => p.name)).toEqual(['Timetable', 'Draft']);
    expect(await readdir(join(root, 'profiles'))).toEqual(['p1', 'p2']);
  });

  it('reads the counts again after a change only for what changed and the open profile', async () => {
    const profiles = manager();
    await profiles.create('Draft');
    await profiles.list();
    await writeFile(
      join(root, 'profiles', 'p2', 'timetable.json'),
      serializeTimetableFile(withClasses('6A1', '7B2')),
    );

    const renamed = await profiles.rename('p1', 'Main');
    expect(renamed.ok && renamed.list.profiles).toMatchObject([
      { name: 'Main', classes: 0 },
      { name: 'Draft', classes: 0 },
    ]);
    expect((await profiles.list()).profiles).toMatchObject([
      { name: 'Main', classes: 0 },
      { name: 'Draft', classes: 2 },
    ]);
  });
});

describe('when the disk refuses a change', () => {
  const asRoot = process.getuid?.() === 0;

  it("leaves the list as it was when profiles.json can't be written", async () => {
    const profiles = manager();
    await profiles.create('Draft');
    // A folder where the temp file goes makes the write fail.
    await mkdir(join(root, `${PROFILES_FILE}.tmp`));

    await expect(profiles.open('p2')).rejects.toThrow();
    expect((await profiles.list()).openId).toBe('p1');
    expect(await profiles.remove('p1')).toEqual({
      ok: false,
      error: "The open profile can't be deleted. Open another one first.",
    });
    await expect(profiles.rename('p2', 'Other')).rejects.toThrow();
    expect((await profiles.list()).profiles.map((p) => p.name)).toEqual(['Timetable', 'Draft']);
  });

  it("takes a new profile off the list again when its folder can't be moved into place", async () => {
    const profiles = manager();
    await profiles.store();
    // Something already in the way where the new folder should go.
    await mkdir(join(root, 'profiles', 'p2'));
    await write('profiles/p2/in-the-way', '');

    await expect(profiles.create('Draft')).rejects.toThrow();
    expect((await profiles.list()).profiles.map((p) => p.id)).toEqual(['p1']);
    expect(await listFile()).toEqual({ profiles: [{ id: 'p1', name: 'Timetable' }], openId: 'p1' });
    expect(await readdir(join(root, 'profiles'))).toEqual(['p1', 'p2']);
  });

  it.skipIf(asRoot)(
    "deletes a profile whose folder can't go yet, and removes it next start",
    async () => {
      const profiles = manager();
      await profiles.create('Draft');
      await chmod(join(root, 'profiles', 'p2'), 0o555);
      try {
        const result = await profiles.remove('p2');
        expect(result.ok && result.list.profiles.map((p) => p.id)).toEqual(['p1']);
        // Moved aside, so the next start knows it was deleted.
        expect(await readdir(join(root, 'profiles'))).toEqual(['.deleted-p2', 'p1']);
      } finally {
        await chmod(join(root, 'profiles', '.deleted-p2'), 0o755);
      }
      await createProfileManager(root, NOW, ids()).store();
      expect(await readdir(join(root, 'profiles'))).toEqual(['p1']);
    },
  );

  it.skipIf(asRoot)(
    "keeps a profile whose folder can't be moved, and says why it isn't deleted",
    async () => {
      const profiles = manager();
      await profiles.create('Draft');
      await chmod(join(root, 'profiles'), 0o555);
      try {
        expect(await profiles.remove('p2')).toEqual({
          ok: false,
          error:
            "Draft couldn't be deleted: another program, such as antivirus or OneDrive, has " +
            'its folder open. Try again in a moment.',
        });
        expect((await profiles.list()).profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
      } finally {
        await chmod(join(root, 'profiles'), 0o755);
      }
    },
  );

  it.skipIf(asRoot)(
    "doesn't take a profiles.json the disk won't hand over for a damaged one",
    async () => {
      const profiles = manager();
      await profiles.create('Draft');
      await profiles.idle();
      await chmod(join(root, PROFILES_FILE), 0o000);
      try {
        await expect(createProfileManager(root, NOW, ids()).store()).rejects.toThrow();
        expect(await rootFiles()).toEqual(['profiles', PROFILES_FILE]);
      } finally {
        await chmod(join(root, PROFILES_FILE), 0o644);
      }
      // Once it can be read, the names are all there.
      const list = await createProfileManager(root, NOW, ids()).list();
      expect(list.profiles.map((p) => p.name)).toEqual(['Timetable', 'Draft']);
    },
  );

  it.skipIf(asRoot)(
    'opens a release 3 timetable where it is when the folder is read-only',
    async () => {
      await release3Folder();
      await chmod(root, 0o555);
      try {
        const profiles = manager();
        const store = await profiles.store();
        expect(await store.load()).toMatchObject({
          status: 'ok',
          settings: { selectedClassId: 'c2' },
        });
        await expect(store.save(withClasses('6A1'))).rejects.toThrow("couldn't be written");
        expect(await profiles.list()).toMatchObject({
          openId: 'timetable',
          profiles: [{ id: 'timetable', name: 'Timetable', classes: 2 }],
        });
        expect(await profiles.create('Draft')).toEqual({
          ok: false,
          error:
            "The data folder can't be written to, so profiles can't be changed. Your timetable " +
            'is open where it was.',
        });
      } finally {
        await chmod(root, 0o755);
      }
      // Once it can be written, the next start upgrades it.
      await manager().store();
      expect(await rootFiles()).toEqual(['profiles', PROFILES_FILE, BEFORE_PROFILES_FILE]);
    },
  );
});

describe('names in a hand-edited list', () => {
  it('are tidied: cleaned, kept unique, and cut to 60 characters', async () => {
    await manager().create('Draft');
    await write(
      PROFILES_FILE,
      JSON.stringify({
        profiles: [
          { id: 'p1', name: '  Timetable ' },
          { id: 'p2', name: 'timetable' },
        ],
        openId: 'p1',
      }),
    );
    const list = await createProfileManager(root, NOW, ids()).list();
    expect(list.profiles.map((p) => p.name)).toEqual(['Timetable', 'timetable 2']);
    expect(await listFile()).toMatchObject({
      profiles: [{ name: 'Timetable' }, { name: 'timetable 2' }],
    });
  });
});
