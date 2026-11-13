import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import { addClass } from '../../src/domain/classes';
import { createAppState } from '../../src/domain/appState';
import type { TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import { SCHEMA_VERSION, serializeTimetableFile } from '../../src/shared/fileFormat';
import {
  BACKUP_FILE,
  SETTINGS_FILE,
  TIMETABLE_FILE,
  createTimetableStore,
  renameWithRetry,
  saveFailureReason,
  writeAtomic,
} from '../../src/main/store';

let folder: string;
const NOW = () => new Date('2026-10-19T08:30:15.123Z');

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'ttm-store-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function withClasses(...names: string[]): TimetableFile {
  let state = createAppState(emptySchool());
  for (const [i, name] of names.entries()) {
    const result = addClass(state, name, () => `c${i + 1}`);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state.file;
}

const read = (name: string) => readFile(join(folder, name), 'utf8');
const files = async () => (await readdir(folder)).sort();

describe('timetable store (TB-7)', () => {
  it('starts an empty timetable when nothing is saved yet', async () => {
    const result = await createTimetableStore(folder).load();
    expect(result).toEqual({
      status: 'ok',
      file: createEmptyTimetable(),
      settings: { selectedClassId: null },
    });
    expect(await files()).toEqual([]);
  });

  it('loads what was saved', async () => {
    const file = withClasses('6A1', '7B2');
    await createTimetableStore(folder).save(file);

    const result = await createTimetableStore(folder).load();
    expect(result.status === 'ok' && result.file).toEqual(file);
  });

  it('writes through a temp file and leaves none behind', async () => {
    await createTimetableStore(folder).save(withClasses('6A1'));
    expect(await files()).toEqual([TIMETABLE_FILE]);
  });

  it('keeps the old file whole when a write fails', async () => {
    const store = createTimetableStore(folder);
    const first = withClasses('6A1');
    await store.save(first);
    // A folder where the temp file goes makes the write fail before the rename.
    await mkdir(join(folder, `${TIMETABLE_FILE}.tmp`));

    await expect(store.save(withClasses('6A1', '7B2'))).rejects.toThrow();
    expect(await read(TIMETABLE_FILE)).toBe(serializeTimetableFile(first));
  });

  it('keeps the version before the latest save as the backup', async () => {
    const store = createTimetableStore(folder);
    const first = withClasses('6A1');
    const second = withClasses('6A1', '7B2');
    await store.save(first);
    expect(await files()).toEqual([TIMETABLE_FILE]);

    await store.save(second);
    expect(await read(BACKUP_FILE)).toBe(serializeTimetableFile(first));
    expect(await read(TIMETABLE_FILE)).toBe(serializeTimetableFile(second));
  });

  it('writes saves in the order they were asked for', async () => {
    const store = createTimetableStore(folder);
    const last = withClasses('6A1', '7B2', '8CE1');
    void store.save(withClasses('6A1'));
    void store.save(withClasses('6A1', '7B2'));
    void store.save(last);
    await store.idle();
    expect(await read(TIMETABLE_FILE)).toBe(serializeTimetableFile(last));
  });

  it('refuses to save a timetable that does not hold together, saying why', async () => {
    const file = withClasses('6A1');
    const stray = {
      id: 'p1',
      cardId: 'gone',
      classId: 'c1',
      day: 0,
      block: 0,
      part: 'full',
    } as const;
    await expect(
      createTimetableStore(folder).save({ ...file, placements: [stray] }),
    ).rejects.toThrow("placement p1 is of a card that isn't in the file.");
  });

  it('refuses to save something that is not a timetable', async () => {
    const store = createTimetableStore(folder);
    await expect(store.save({ schemaVersion: 1 })).rejects.toThrow();
    expect(await files()).toEqual([]);
  });

  it('remembers the class on screen apart from the timetable', async () => {
    const store = createTimetableStore(folder);
    const file = withClasses('6A1', '7B2');
    await store.save(file);
    await store.saveSettings({ selectedClassId: 'c2' });

    const result = await createTimetableStore(folder).load();
    expect(result.status === 'ok' && result.settings).toEqual({ selectedClassId: 'c2' });
    expect(await files()).toEqual([SETTINGS_FILE, TIMETABLE_FILE]);
  });

  it('keeps the other settings when one changes, as the export details do', async () => {
    const store = createTimetableStore(folder);
    const exportDetails = {
      schoolName: 'Trung học/Secondary School',
      schoolYear: '2026 - 2027',
      appliesFrom: '2026-09-03',
    };
    await store.saveSettings({ selectedClassId: 'c2' });
    await store.saveSettings({ exportDetails });
    await store.saveSettings({ selectedClassId: 'c1' });

    const result = await createTimetableStore(folder).load();
    expect(result.status === 'ok' && result.settings).toEqual({
      selectedClassId: 'c1',
      exportDetails,
    });
    await expect(store.saveSettings({ other: 1 })).rejects.toThrow('Settings are not valid.');
  });

  it('ignores a settings file it cannot read', async () => {
    await writeFile(join(folder, SETTINGS_FILE), '{ not json');
    const result = await createTimetableStore(folder).load();
    expect(result.status === 'ok' && result.settings).toEqual({ selectedClassId: null });
  });
});

/** A version 1 file as raw JSON: cards belonged to a class, placements had no classId. */
function versionOneText(): string {
  const base = withClasses('6A1', '7B2');
  const [c1, c2] = base.classes;
  const v1 = {
    ...base,
    schemaVersion: 1,
    subjects: [
      { id: 's-toan', name: 'Toán', colorKey: 'math' },
      { id: 's-ly', name: 'Vật lí', colorKey: 'physics' },
    ],
    teachers: [{ id: 't1', shortName: 'Lan', fullName: 'Cô Lan' }],
    rooms: [{ id: 'r1', name: 'P101' }],
    cards: [
      { id: 'k1', classId: c1!.id, subjectId: 's-toan', teacherId: 't1', roomId: 'r1' },
      { id: 'k2', classId: c2!.id, subjectId: 's-toan', teacherId: 't1', roomId: 'r1' },
      { id: 'k3', classId: c2!.id, subjectId: 's-ly', teacherId: null, roomId: null },
    ],
    placements: [
      { id: 'p1', cardId: 'k1', day: 0, block: 0, part: 'full' },
      { id: 'p2', cardId: 'k2', day: 1, block: 2, part: 'first' },
      { id: 'p3', cardId: 'k3', day: 4, block: 4, part: 'second' },
    ],
  };
  return JSON.stringify(v1, null, 2);
}

describe('a version 1 timetable (TB-7)', () => {
  it('upgrades a version 1 timetable when it loads, and keeps the original as the backup on the first save', async () => {
    const text = versionOneText();
    await writeFile(join(folder, TIMETABLE_FILE), text);
    await writeFile(join(folder, SETTINGS_FILE), JSON.stringify({ selectedClassId: 'c2' }));
    const store = createTimetableStore(folder, NOW);

    const loaded = await store.load();
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.settings).toEqual({ selectedClassId: 'c2' });
    expect(loaded.file.cards.map((c) => c.id)).toEqual(['k1', 'k3']);
    const [c1, c2] = loaded.file.classes;
    expect(
      loaded.file.placements.map((p) => [p.id, p.cardId, p.classId, p.day, p.block, p.part]),
    ).toEqual([
      ['p1', 'k1', c1!.id, 0, 0, 'full'],
      ['p2', 'k1', c2!.id, 1, 2, 'first'],
      ['p3', 'k3', c2!.id, 4, 4, 'second'],
    ]);
    expect(await read(TIMETABLE_FILE)).toBe(text);

    await store.save(loaded.file);
    expect(await read(BACKUP_FILE)).toBe(text);
    expect(JSON.parse(await read(TIMETABLE_FILE)).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('opens a version 1 backup next to a damaged file', async () => {
    await writeFile(join(folder, TIMETABLE_FILE), '{"schemaVersion": 1, "classes": [');
    await writeFile(join(folder, BACKUP_FILE), versionOneText());
    const store = createTimetableStore(folder, NOW);

    expect(await store.load()).toMatchObject({ status: 'damaged', backup: 'ok' });
    const opened = await store.openBackup();
    expect(opened.status).toBe('ok');
    expect(opened.status === 'ok' && opened.file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(opened.status === 'ok' && opened.file.cards.map((c) => c.id)).toEqual(['k1', 'k3']);
  });
});

describe('a damaged timetable file (TB-7)', () => {
  const DAMAGED = '{"schemaVersion": 1, "classes": [';

  async function damage(backup: TimetableFile | string | null) {
    await writeFile(join(folder, TIMETABLE_FILE), DAMAGED);
    if (backup !== null) {
      const text = typeof backup === 'string' ? backup : serializeTimetableFile(backup);
      await writeFile(join(folder, BACKUP_FILE), text);
    }
  }

  it('says so, offers the backup, and leaves the file untouched', async () => {
    await damage(withClasses('6A1'));
    const store = createTimetableStore(folder, NOW);

    const result = await store.load();
    expect(result).toMatchObject({ status: 'damaged', backup: 'ok', folder });
    expect(result.status === 'damaged' && result.reason).toMatch(/isn't valid JSON/);

    await expect(store.save(withClasses('9BA1'))).rejects.toThrow(/damaged/);
    expect(await read(TIMETABLE_FILE)).toBe(DAMAGED);
  });

  it('tells whether the backup is missing or damaged too', async () => {
    await damage(null);
    expect(await createTimetableStore(folder).load()).toMatchObject({ backup: 'missing' });

    await damage('[]');
    expect(await createTimetableStore(folder).load()).toMatchObject({ backup: 'damaged' });
  });

  it('refuses a file that fails the schema, naming where', async () => {
    const bad = { ...createEmptyTimetable(), classes: [{ id: 'c1', name: '6A1', grade: 13 }] };
    await writeFile(join(folder, TIMETABLE_FILE), JSON.stringify(bad));
    const result = await createTimetableStore(folder).load();
    expect(result.status === 'damaged' && result.reason).toMatch(/at classes\.0\.grade/);
  });

  it('refuses a file from a newer version', async () => {
    const newer = { ...createEmptyTimetable(), schemaVersion: SCHEMA_VERSION + 1 };
    await writeFile(join(folder, TIMETABLE_FILE), JSON.stringify(newer));
    const result = await createTimetableStore(folder).load();
    expect(result.status === 'damaged' && result.reason).toMatch(/newer version/);
    expect(await read(TIMETABLE_FILE)).toBe(JSON.stringify(newer));
  });

  it('opens the backup, keeping the damaged file under another name', async () => {
    const backup = withClasses('6A1');
    await damage(backup);
    const store = createTimetableStore(folder, NOW);
    await store.load();

    const result = await store.openBackup();
    expect(result.status === 'ok' && result.file).toEqual(backup);
    expect(await files()).toEqual([
      'timetable.damaged-2026-10-19T08-30-15.json',
      TIMETABLE_FILE,
      BACKUP_FILE,
    ]);
    expect(await read('timetable.damaged-2026-10-19T08-30-15.json')).toBe(DAMAGED);
    expect(await read(TIMETABLE_FILE)).toBe(serializeTimetableFile(backup));
    expect(await read(BACKUP_FILE)).toBe(serializeTimetableFile(backup));

    // Saving works again, and the next run opens the restored timetable.
    const next = withClasses('6A1', '7B2');
    await store.save(next);
    const reopened = await createTimetableStore(folder).load();
    expect(reopened.status === 'ok' && reopened.file).toEqual(next);
  });

  it('stays damaged if the backup cannot be read', async () => {
    await damage('[]');
    const store = createTimetableStore(folder, NOW);
    await store.load();

    expect(await store.openBackup()).toMatchObject({ status: 'damaged', backup: 'damaged' });
    expect(await read(TIMETABLE_FILE)).toBe(DAMAGED);
    await expect(store.save(withClasses('6A1'))).rejects.toThrow(/damaged/);
  });

  it('starts a new timetable, keeping the damaged file under another name', async () => {
    await damage(null);
    const store = createTimetableStore(folder, NOW);
    await store.load();
    await writeFile(join(folder, 'timetable.damaged-2026-10-19T08-30-15.json'), 'older');

    const result = await store.startNew();
    expect(result).toEqual({
      status: 'ok',
      file: createEmptyTimetable(),
      settings: { selectedClassId: null },
    });
    expect(await read('timetable.damaged-2026-10-19T08-30-15-2.json')).toBe(DAMAGED);
    expect(await read('timetable.damaged-2026-10-19T08-30-15.json')).toBe('older');

    await store.save(withClasses('6A1'));
    expect(await files()).toContain(TIMETABLE_FILE);
  });

  it('keeps the profile’s export details when starting a new timetable (R4-5 review)', async () => {
    const exportDetails = {
      schoolName: 'Trường Thử Nghiệm',
      schoolYear: '2026 - 2027',
      appliesFrom: '2026-09-03',
    };
    await writeFile(
      join(folder, SETTINGS_FILE),
      JSON.stringify({ selectedClassId: 'c1', exportDetails }),
    );
    await damage(null);
    const store = createTimetableStore(folder, NOW);
    await store.load();

    const result = await store.startNew();
    expect(result.status === 'ok' && result.settings).toEqual({
      selectedClassId: null,
      exportDetails,
    });
  });
});

describe('a missing timetable file next to a backup (R1-9)', () => {
  it('asks instead of starting empty, so the backup is never overwritten', async () => {
    const backup = withClasses('6A1', '8CE1');
    await writeFile(join(folder, BACKUP_FILE), serializeTimetableFile(backup));
    const store = createTimetableStore(folder, NOW);

    expect(await store.load()).toMatchObject({ status: 'damaged', missing: true, backup: 'ok' });
    await expect(store.save(createEmptyTimetable())).rejects.toThrow(/damaged/);
    expect(await read(BACKUP_FILE)).toBe(serializeTimetableFile(backup));

    const opened = await store.openBackup();
    expect(opened.status === 'ok' && opened.file).toEqual(backup);
    expect(await files()).toEqual([TIMETABLE_FILE, BACKUP_FILE]);
  });

  it('starts empty on the very first run, with no backup', async () => {
    expect(await createTimetableStore(folder).load()).toMatchObject({ status: 'ok' });
  });

  it('a new timetable is written straight away, so the next run opens it', async () => {
    await writeFile(join(folder, BACKUP_FILE), serializeTimetableFile(withClasses('6A1')));
    const store = createTimetableStore(folder, NOW);
    await store.load();
    await store.startNew();
    const next = await createTimetableStore(folder).load();
    expect(next).toEqual({
      status: 'ok',
      file: createEmptyTimetable(),
      settings: { selectedClassId: null },
    });
  });
});

describe('renameWithRetry (R1-9)', () => {
  const busy = (code: string) => Object.assign(new Error(code), { code });

  it('tries again while the file is busy, as Windows reports it', async () => {
    const codes = ['EPERM', 'EBUSY', 'EACCES'];
    const waits: number[] = [];
    let calls = 0;
    await renameWithRetry(
      'a',
      'b',
      async () => {
        const code = codes[calls++];
        if (code) throw busy(code);
      },
      async (ms) => void waits.push(ms),
    );
    expect(calls).toBe(4);
    expect(waits).toEqual([50, 100, 200]);
  });

  it('gives up after about a second and a half', async () => {
    let calls = 0;
    const waits: number[] = [];
    await expect(
      renameWithRetry(
        'a',
        'b',
        async () => {
          calls++;
          throw busy('EPERM');
        },
        async (ms) => void waits.push(ms),
      ),
    ).rejects.toThrow('EPERM');
    expect(calls).toBe(6);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(1550);
  });

  it("doesn't retry other errors", async () => {
    let calls = 0;
    await expect(
      renameWithRetry(
        'a',
        'b',
        async () => {
          calls++;
          throw busy('ENOSPC');
        },
        async () => undefined,
      ),
    ).rejects.toThrow('ENOSPC');
    expect(calls).toBe(1);
  });
});

describe('save failures in words the user can act on', () => {
  const errno = (code: string) => Object.assign(new Error(`${code}: boom`), { code });

  it('names the file and folder, and the likely cause', () => {
    expect(saveFailureReason(errno('ENOSPC'), '/data')).toBe(
      "The disk is full, so timetable.json in /data couldn't be written. Free some space.",
    );
    expect(saveFailureReason(errno('EPERM'), '/data')).toMatch(
      /^timetable\.json in \/data couldn't be written\. Another program, such as antivirus/,
    );
    expect(saveFailureReason(errno('ENOENT'), '/data')).toBe(
      'The data folder /data is missing. It may have been moved or deleted.',
    );
    expect(saveFailureReason(new Error('odd'), '/data')).toBe(
      "timetable.json in /data couldn't be written: odd.",
    );
    expect(saveFailureReason(new Error('Odd.'), '/data')).toBe(
      "timetable.json in /data couldn't be written: Odd.",
    );
  });

  // Root can write to a read-only folder, so this can only be checked as another user.
  it.skipIf(process.getuid?.() === 0)(
    'a save into a folder that cannot be written says so',
    async () => {
      const store = createTimetableStore(folder);
      await chmod(folder, 0o555);
      try {
        await expect(store.save(withClasses('6A1'))).rejects.toThrow(
          `timetable.json in ${folder} couldn't be written. Another program`,
        );
      } finally {
        await chmod(folder, 0o755);
      }
    },
  );
});

describe('writeAtomic (R4-8 review)', () => {
  it('writes the file and leaves no temp file', async () => {
    const path = join(folder, 'out.txt');
    await writeAtomic(path, 'hello');
    expect(await readFile(path, 'utf8')).toBe('hello');
    expect(await readdir(folder)).toEqual(['out.txt']);
  });

  it('leaves what was there, and no temp file, when the write itself fails', async () => {
    const path = join(folder, 'TKB all classes.xlsx');
    await writeFile(path, 'before');
    // Data the file can't take fails part way through the write, as a full disk would.
    await expect(writeAtomic(path, 42 as unknown as string)).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('before');
    expect(await readdir(folder)).toEqual(['TKB all classes.xlsx']);
  });
});
