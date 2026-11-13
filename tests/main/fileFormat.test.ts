import { describe, expect, it } from 'vitest';
import type { TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import {
  SCHEMA_VERSION,
  readTimetableFile,
  serializeTimetableFile,
} from '../../src/shared/fileFormat';

describe('readTimetableFile (TB-7)', () => {
  it('reads back what was written', () => {
    const file = createEmptyTimetable();
    expect(readTimetableFile(serializeTimetableFile(file))).toEqual({
      ok: true,
      file,
      upgradedFrom: null,
    });
  });

  it('writes the current version', () => {
    expect(createEmptyTimetable().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('upgrades an older version with its migration', () => {
    // Makes up a version 0 that had no rooms, with its own migrations and current version.
    const current = createEmptyTimetable();
    const v0: Record<string, unknown> = { ...current, schemaVersion: 0 };
    delete v0.rooms;
    const migrations = {
      0: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 1, rooms: [] }),
      1: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 2 }),
      2: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 3 }),
      3: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 4 }),
      4: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 5 }),
      5: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 6 }),
    };
    expect(readTimetableFile(JSON.stringify(v0), migrations, 6)).toEqual({
      ok: true,
      file: current,
      upgradedFrom: 0,
    });
  });

  it('upgrades a version 1 file to the card pool, and on to the current format', () => {
    const v1 = {
      ...createEmptyTimetable(),
      schemaVersion: 1,
      subjects: [
        { id: 's-toan', name: 'Toán', colorKey: 'math' },
        { id: 's-van', name: 'Ngữ văn', colorKey: 'literature' },
      ],
      teachers: [{ id: 't1', shortName: 'Phúc' }],
      rooms: [{ id: 'r1', name: 'P101' }],
      classes: [
        { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
        { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
      ],
      cards: [
        { id: 'k1', classId: 'c1', subjectId: 's-toan', teacherId: 't1', roomId: 'r1' },
        { id: 'k2', classId: 'c2', subjectId: 's-toan', teacherId: 't1', roomId: 'r1' },
        { id: 'k3', classId: 'c2', subjectId: 's-van', teacherId: null, roomId: null },
      ],
      placements: [
        { id: 'p1', cardId: 'k1', day: 0, block: 0, part: 'full' },
        { id: 'p2', cardId: 'k2', day: 1, block: 0, part: 'first' },
        { id: 'p3', cardId: 'k3', day: 1, block: 0, part: 'second' },
      ],
    };
    const result = readTimetableFile(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.upgradedFrom).toBe(1);
    expect(result.file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.file.teachers).toEqual([{ id: 't1', shortName: 'Phúc', conditions: [] }]);
    expect(result.file.cards).toEqual([
      { id: 'k1', subjectId: 's-toan', teacherId: 't1', roomId: 'r1' },
      { id: 'k3', subjectId: 's-van', teacherId: null, roomId: null },
    ]);
    expect(result.file.placements).toEqual([
      { id: 'p1', cardId: 'k1', classId: 'c1', day: 0, block: 0, part: 'full' },
      { id: 'p2', cardId: 'k1', classId: 'c2', day: 1, block: 0, part: 'first' },
      { id: 'p3', cardId: 'k3', classId: 'c2', day: 1, block: 0, part: 'second' },
    ]);
  });

  it.each([
    ['a null card', { cards: [null] }],
    ['a null placement', { placements: [null] }],
    ['cards that are not a list', { cards: 'none' }],
  ])('refuses a version 1 file with %s without throwing', (_name, changes) => {
    const v1 = { ...createEmptyTimetable(), schemaVersion: 1, ...changes };
    expect(readTimetableFile(JSON.stringify(v1)).ok).toBe(false);
  });

  it('upgrades a version 2 file by giving every teacher no conditions (release 2)', () => {
    const v2 = {
      ...createEmptyTimetable(),
      schemaVersion: 2,
      subjects: [{ id: 's-toan', name: 'Toán', colorKey: 'math' }],
      teachers: [
        { id: 't1', shortName: 'Phúc', fullName: 'Tạ Văn Phúc', school: 'both' },
        { id: 't2', shortName: 'Lan' },
      ],
      classes: [{ id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 }],
      cards: [{ id: 'k1', subjectId: 's-toan', teacherId: 't1', roomId: null }],
      placements: [{ id: 'p1', cardId: 'k1', classId: 'c1', day: 0, block: 0, part: 'full' }],
    };
    const result = readTimetableFile(JSON.stringify(v2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.upgradedFrom).toBe(2);
    expect(result.file).toEqual({
      ...v2,
      schemaVersion: 6,
      grades: [6],
      teachers: [
        { id: 't1', shortName: 'Phúc', fullName: 'Tạ Văn Phúc', school: 'both', conditions: [] },
        { id: 't2', shortName: 'Lan', conditions: [] },
      ],
    });
  });

  it('upgrades a version 3 file by raising the version only: every subject keeps its name’s colors (R3-5b)', () => {
    const v3 = {
      ...createEmptyTimetable(),
      schemaVersion: 3,
      subjects: [{ id: 's-toan', name: 'Toán', colorKey: 'math' }],
      teachers: [{ id: 't1', shortName: 'Phúc', conditions: [] }],
    };
    expect(readTimetableFile(JSON.stringify(v3))).toEqual({
      ok: true,
      file: { ...v3, schemaVersion: 6 },
      upgradedFrom: 3,
    });
  });

  it('upgrades a version 4 file by raising the version only: no teacher has a phone yet (R4-3)', () => {
    const v4 = {
      ...createEmptyTimetable(),
      schemaVersion: 4,
      teachers: [{ id: 't1', shortName: 'Phúc', email: 'phuc@example.com', conditions: [] }],
    };
    expect(readTimetableFile(JSON.stringify(v4))).toEqual({
      ok: true,
      file: { ...v4, schemaVersion: 6 },
      upgradedFrom: 4,
    });
  });

  it("upgrades a version 5 file with its classes' grades, in order, as its grade list (DM-8)", () => {
    const v5: Record<string, unknown> = {
      ...createEmptyTimetable(),
      schemaVersion: 5,
      classes: [
        { id: 'c1', name: '9A1', grade: 9, track: 'A', section: 1 },
        { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
        { id: 'c3', name: '6A1', grade: 6, track: 'A', section: 1 },
      ],
    };
    delete v5.grades;
    expect(readTimetableFile(JSON.stringify(v5))).toEqual({
      ok: true,
      file: { ...v5, schemaVersion: 6, grades: [6, 9] },
      upgradedFrom: 5,
    });
    // With no classes there are no grades, as in a new timetable.
    const empty: Record<string, unknown> = { ...createEmptyTimetable(), schemaVersion: 5 };
    delete empty.grades;
    expect(readTimetableFile(JSON.stringify(empty))).toEqual({
      ok: true,
      file: createEmptyTimetable(),
      upgradedFrom: 5,
    });
  });

  it('refuses a grade list with a grade outside 1 to 12 (DM-8)', () => {
    const file = { ...createEmptyTimetable(), grades: [6, 13] };
    expect(readTimetableFile(JSON.stringify(file)).ok).toBe(false);
  });

  it("reads a teacher's phone back as it was saved, and refuses one that isn't a phone (R4-3)", () => {
    const file = {
      ...createEmptyTimetable(),
      teachers: [{ id: 't1', shortName: 'Phúc', phone: '+84 912 345 678', conditions: [] }],
    } satisfies TimetableFile;
    expect(readTimetableFile(serializeTimetableFile(file))).toEqual({
      ok: true,
      file,
      upgradedFrom: null,
    });
    // A hand-edited phone reads as the teacher form would have saved it.
    const edited = (phone: string) =>
      readTimetableFile(JSON.stringify({ ...file, teachers: [{ ...file.teachers[0], phone }] }));
    const teacher = (result: ReturnType<typeof readTimetableFile>) =>
      result.ok ? result.file.teachers[0] : null;
    expect(teacher(edited(' 0912\u00a0345  678 '))?.phone).toBe('0912 345 678');
    expect(teacher(edited('  '))).toEqual({ id: 't1', shortName: 'Phúc', conditions: [] });
    expect(serializeTimetableFile((edited('') as { file: TimetableFile }).file)).not.toMatch(
      /phone/,
    );
    const bad = { ...file, teachers: [{ ...file.teachers[0], phone: 'call the office' }] };
    expect(readTimetableFile(JSON.stringify(bad))).toEqual({
      ok: false,
      reason:
        "The file doesn't match the timetable format at teachers.0.phone: Phone numbers have 8 to 15 digits.",
    });
  });

  it('reads picked palettes and custom colors back as they were saved (R3-5b)', () => {
    const file = {
      ...createEmptyTimetable(),
      subjects: [
        { id: 'a', name: 'Toán', colorKey: 'music', colorSource: 'palette' },
        {
          id: 'b',
          name: 'Robotics',
          colorKey: 'homeroom',
          colorSource: 'custom',
          customColors: { bg: '#ffeedd', ink: '#112233' },
        },
      ],
    } satisfies TimetableFile;
    expect(readTimetableFile(serializeTimetableFile(file))).toEqual({
      ok: true,
      file,
      upgradedFrom: null,
    });
  });

  it.each([
    ['custom colors without colorSource', { customColors: { bg: '#ffeedd', ink: '#112233' } }],
    ["colorSource 'custom' without colors", { colorSource: 'custom' }],
    [
      'custom colors with a picked palette',
      {
        colorSource: 'palette',
        customColors: { bg: '#ffeedd', ink: '#112233' },
      },
    ],
    [
      'a color that is not #rrggbb',
      { colorSource: 'custom', customColors: { bg: '#fed', ink: '#112233' } },
    ],
    ['an unknown colorSource', { colorSource: 'rainbow' }],
  ])('refuses a subject with %s', (_name, colors) => {
    const file = {
      ...createEmptyTimetable(),
      subjects: [{ id: 'a', name: 'Toán', colorKey: 'math', ...colors }],
    };
    const result = readTimetableFile(JSON.stringify(file));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/subjects\.0/);
  });

  it('refuses a file whose migration throws', () => {
    const migrations = {
      1: () => {
        throw new Error('boom');
      },
    };
    const v1 = { ...createEmptyTimetable(), schemaVersion: 1 };
    expect(readTimetableFile(JSON.stringify(v1), migrations)).toEqual({
      ok: false,
      reason: "The file couldn't be upgraded from format 1.",
    });
  });

  it('merges identical cards of three classes into the first one', () => {
    const names = ['6A1', '6A2', '6A3'];
    const v1 = {
      ...createEmptyTimetable(),
      schemaVersion: 1,
      subjects: [{ id: 's1', name: 'Toán', colorKey: 'math' }],
      classes: names.map((name, i) => ({
        id: `c${i + 1}`,
        name,
        grade: 6,
        track: 'A',
        section: i + 1,
      })),
      cards: [1, 2, 3].map((i) => ({
        id: `k${i}`,
        classId: `c${i}`,
        subjectId: 's1',
        teacherId: null,
        roomId: null,
      })),
      placements: [1, 2, 3].map((i) => ({
        id: `p${i}`,
        cardId: `k${i}`,
        day: 0,
        block: 0,
        part: 'full',
      })),
    };
    const result = readTimetableFile(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.cards).toEqual([
      { id: 'k1', subjectId: 's1', teacherId: null, roomId: null },
    ]);
    expect(result.file.placements.map((p) => [p.cardId, p.classId])).toEqual([
      ['k1', 'c1'],
      ['k1', 'c2'],
      ['k1', 'c3'],
    ]);
  });

  it('refuses a version 1 file whose placement points at a missing card', () => {
    const v1 = {
      ...createEmptyTimetable(),
      schemaVersion: 1,
      placements: [{ id: 'p1', cardId: 'k-gone', day: 0, block: 0, part: 'full' }],
    };
    const result = readTimetableFile(JSON.stringify(v1));
    expect(result.ok).toBe(false);
  });

  it('refuses an older version it has no migration for', () => {
    const old = { ...createEmptyTimetable(), schemaVersion: 0 };
    expect(readTimetableFile(JSON.stringify(old))).toEqual({
      ok: false,
      reason: "Files in format 0 can't be upgraded.",
    });
  });

  it.each([
    ['', /isn't valid JSON/],
    ['[]', /doesn't hold a timetable/],
    ['{"classes": []}', /which format version/],
    ['{"schemaVersion": 9}', /newer version/],
    ['{"schemaVersion": 1}', /doesn't match the timetable format/],
  ])('refuses %j', (text, reason) => {
    const result = readTimetableFile(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(reason);
  });
});
