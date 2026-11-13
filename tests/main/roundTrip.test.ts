import { describe, expect, it } from 'vitest';
import { EXPORT_DETAILS } from '../../fixtures/expectedWorkbook';
import { referenceWorkbookData } from '../../fixtures/referenceWorkbook';
import { SAMPLE_CLASSES } from '../../fixtures/sampleExpectations';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { exportClassIds } from '../../src/domain/exportDetails';
import { importTimetable } from '../../src/domain/importTimetable';
import { suggestImport, type WorkbookData } from '../../src/domain/importWorkbook';
import type { TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import { fileProblem } from '../../src/domain/integrity';
import { workbookBytes } from '../../src/main/exportExcel';
import { readWorkbook } from '../../src/main/importExcel';

// IE-3 (SYSTEM_DESIGN §12.8): an export read back and imported gives the same timetable, and
// a workbook in the school's layout, imported and exported, gives the expected class sheets.

const nameOf = (list: readonly { id: string; name: string }[], id: string | undefined) =>
  list.find((item) => item.id === id)?.name;

const teacherName = (file: TimetableFile, id: string | null | undefined) =>
  file.teachers.find((t) => t.id === id)?.shortName;

/** Every placement as what it means, so two files with different ids compare. */
function placements(file: TimetableFile): string[] {
  const cards = new Map(file.cards.map((c) => [c.id, c]));
  return file.placements
    .map((p) => {
      const card = cards.get(p.cardId);
      return [
        nameOf(file.classes, p.classId),
        p.day,
        p.block,
        p.part,
        nameOf(file.subjects, card?.subjectId),
        teacherName(file, card?.teacherId),
      ].join(' | ');
    })
    .sort();
}

const teachers = (file: TimetableFile) =>
  file.teachers.map(({ shortName, fullName, email, phone, school }) => ({
    shortName,
    fullName,
    email,
    phone,
    school,
  }));

const homerooms = (file: TimetableFile) =>
  file.classes.map((c) => [
    c.name,
    teacherName(file, c.formTeacherId),
    teacherName(file, c.coTeacherId),
  ]);

/** Each card's subject and teacher that a placement uses, once each. */
const placedCards = (file: TimetableFile) => {
  const used = new Set(file.placements.map((p) => p.cardId));
  return file.cards
    .filter((c) => used.has(c.id))
    .map((c) => `${nameOf(file.subjects, c.subjectId)} | ${teacherName(file, c.teacherId)}`)
    .sort();
};

function allClasses(file: TimetableFile) {
  return exportClassIds(file, 'all', null);
}

const exportOf = (file: TimetableFile, classIds = allClasses(file)) =>
  workbookBytes(file, classIds, EXPORT_DETAILS).then((bytes) => readWorkbook(bytes, 'TKB.xlsx'));

function imported(data: WorkbookData) {
  return importTimetable(data, suggestImport(data), createEmptyTimetable());
}

describe('exporting, then importing (IE-3)', () => {
  it('gives the same timetable, with no rooms', async () => {
    const { file, problems } = imported(await exportOf(exampleSchool));
    expect(fileProblem(file)).toBeNull();

    expect(file.classes.map((c) => c.name)).toEqual([...SAMPLE_CLASSES]);
    expect(file.grades).toEqual(exampleSchool.grades);
    expect(homerooms(file)).toEqual(homerooms(exampleSchool));
    expect(teachers(file)).toEqual(teachers(exampleSchool));
    expect(file.subjects.map((s) => s.name).sort()).toEqual(
      exampleSchool.subjects.map((s) => s.name).sort(),
    );
    expect(placements(file)).toEqual(placements(exampleSchool));
    expect(placedCards(file)).toEqual([...new Set(placedCards(exampleSchool))]);
    expect(file.rooms).toEqual([]);
    expect(file.cards.every((c) => c.roomId === null)).toBe(true);

    // The one thing the sample school is short of, reported as for any import.
    expect(problems.map((p) => p.message)).toEqual([
      '9BA1 has no homeroom teacher, so it comes in without one.',
    ]);
  });

  it('brings in only the exported class and the teachers it uses', async () => {
    const { file } = imported(await exportOf(exampleSchool, ['c-8ce1']));
    expect(file.classes.map((c) => c.name)).toEqual(['8CE1']);
    expect(file.teachers.map((t) => t.shortName)).toEqual(['Cô Vy', 'Cô Trâm']);
    expect(homerooms(file)).toEqual([['8CE1', 'Cô Trâm', 'Cô Vy']]);
  });

  it('keeps homeroom teachers who share a full name apart (R5-3 review)', async () => {
    const second = {
      id: 't-ngan-2',
      shortName: 'Cô Ngân B',
      fullName: 'Lương Thị Ngân',
      email: 'ngan.b@example.com',
      conditions: [],
    };
    const school: TimetableFile = {
      ...exampleSchool,
      teachers: [...exampleSchool.teachers, second],
      classes: exampleSchool.classes.map((c) =>
        c.name === '6A2' ? { ...c, formTeacherId: second.id } : c,
      ),
    };
    const { file, problems } = imported(await exportOf(school));
    expect(homerooms(file)).toEqual(homerooms(school));
    expect(problems.map((p) => p.message)).not.toContainEqual(
      expect.stringContaining('More than one teacher'),
    );
  });

  it('gives the same workbook when the imported timetable is exported again', async () => {
    const first = await exportOf(exampleSchool);
    expect(await exportOf(imported(first).file)).toEqual(first);
  });
});

describe('importing the school’s layout, then exporting (IE-3)', () => {
  it('gives the class sheets the sample school exports', async () => {
    const { file } = imported(referenceWorkbookData());
    const exported = await exportOf(file);
    const expected = await exportOf(exampleSchool);

    for (const name of SAMPLE_CLASSES) {
      const rows = exported.sheets.find((s) => s.name === name)?.rows;
      // `ID GV 1S` saves this mobile as a number, so it comes back without its spaces.
      const want = expected.sheets
        .find((s) => s.name === name)
        ?.rows.map((row) => row.map((cell) => cell.replace('0912 345 678', '0912345678')));
      expect({ name, rows }).toEqual({ name, rows: want });
    }
  });
});
