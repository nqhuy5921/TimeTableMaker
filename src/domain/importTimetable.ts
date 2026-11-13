import { parseClassName } from './className';
import { parseSlotText } from './exportSheets';
import { gradesOf } from './grades';
import {
  findSheet,
  readTimetableLayout,
  type ClassField,
  type ImportChoices,
  type ListChoice,
  type TeacherField,
  type TimetableBlockRow,
  type TimetableLayout,
  type WorkbookData,
  type WorkbookSheet,
} from './importWorkbook';
import {
  DAY_NAMES,
  DAYS,
  type BlockIndex,
  type Card,
  type Day,
  type HomeSchool,
  type Id,
  type PlacementPart,
  type ScheduleRow,
  type SchoolClass,
  type Subject,
  type Teacher,
  type TimetableFile,
} from './model';
import { defaultColorKey } from './subjectColor';
import { cleanPhone, isEmail, isPhoneNumber } from './teachers';
import { cleanName, columnLetters, foldText, joinList, nameKey, plural, sameName } from './text';

// The import's second half (IE-1, SYSTEM_DESIGN §12.3–12.4): the workbook and the choices
// made on the Import screen, turned into a timetable. Test and Import both call it, and
// nothing in it can fail: each problem says what the import does about it.

/** One thing the import couldn't take as it stands. `sheet` and `cell` are empty when it's
    about the whole workbook or sheet. */
export interface ImportProblem {
  sheet: string;
  /** As in `F12`. */
  cell: string;
  message: string;
}

export interface ImportCount {
  added: number;
  /** Already in the timetable, and named in the workbook. */
  updated: number;
}

export interface ImportSummary {
  teachers: ImportCount;
  classes: ImportCount;
  subjects: ImportCount;
  cards: ImportCount;
  placements: number;
  cardsWithoutTeacher: number;
  /** Teachers in the teachers sheet nobody uses, who stay out. */
  teachersNotUsed: number;
  /** Classes already in the timetable whose grids the workbook's replace. */
  gridsReplaced: number;
  /** The sheet's block times aren't the profile's, which it keeps. */
  bellTimesDiffer: boolean;
}

export interface ImportResult {
  file: TimetableFile;
  summary: ImportSummary;
  problems: ImportProblem[];
}

const NO_COUNT: ImportCount = { added: 0, updated: 0 };

const NOTHING_IMPORTED: ImportSummary = {
  teachers: NO_COUNT,
  classes: NO_COUNT,
  subjects: NO_COUNT,
  cards: NO_COUNT,
  placements: 0,
  cardsWithoutTeacher: 0,
  teachersNotUsed: 0,
  gridsReplaced: 0,
  bellTimesDiffer: false,
};

// --- Problems ---

/** Rows and columns count from 0; -1 for a problem about the whole sheet. */
interface LocatedProblem {
  sheet: string;
  row: number;
  column: number;
  message: string;
}

type Report = (sheet: string, row: number, column: number, message: string) => void;

/** By sheet in workbook order, then row, then column, with each cell as `F12`. */
function orderedProblems(
  workbook: WorkbookData,
  problems: readonly LocatedProblem[],
): ImportProblem[] {
  const sheetOrder = new Map(workbook.sheets.map((s, index) => [s.name, index]));
  return [...problems]
    .sort(
      (a, b) =>
        (sheetOrder.get(a.sheet) ?? -1) - (sheetOrder.get(b.sheet) ?? -1) ||
        a.row - b.row ||
        a.column - b.column,
    )
    .map(({ sheet, row, column, message }) => ({
      sheet,
      cell: row < 0 ? '' : `${columnLetters(column + 1)}${row + 1}`,
      message,
    }));
}

const repeatedMessage = (name: string, firstRow: number, row: number) =>
  `${name} is on rows ${firstRow + 1} and ${row + 1}, so the first row is used and this one is left out.`;

// --- List sheets ---

interface ListRow<F extends string> {
  row: number;
  /** A field's cell, cleaned; empty when the field's column isn't chosen. */
  read: (field: F) => string;
  cells: readonly string[];
}

interface ListSheet<F extends string> {
  sheet: WorkbookSheet;
  columns: Record<F, number | null>;
  headerRow: number;
  rows: ListRow<F>[];
}

/** A list sheet's rows under its header, each with a value in the field it can't do without.
    A row with other values but not that one is a problem; a blank row is passed over. Null
    when the sheet is left out, or no column is chosen for that field. */
function readList<F extends string>(
  workbook: WorkbookData,
  choice: ListChoice<F>,
  required: F,
  requiredName: string,
  report: Report,
): ListSheet<F> | null {
  const sheet = findSheet(workbook, choice.sheet);
  if (!sheet) return null;
  const requiredColumn = choice.columns[required];
  if (requiredColumn === null) {
    report(
      sheet.name,
      -1,
      -1,
      `No column is chosen for the ${requiredName}, so this sheet is left out.`,
    );
    return null;
  }
  const chosen = Object.values<number | null>(choice.columns).filter((c) => c !== null);
  const rows: ListRow<F>[] = [];
  sheet.rows.forEach((cells, row) => {
    if (row <= choice.headerRow) return;
    const read = (field: F) => {
      const column = choice.columns[field];
      return column === null ? '' : cleanName(cells[column] ?? '');
    };
    if (read(required) !== '') {
      rows.push({ row, read, cells });
    } else if (chosen.some((column) => cleanName(cells[column] ?? '') !== '')) {
      report(sheet.name, row, requiredColumn, `This row has no ${requiredName}, so it's left out.`);
    }
  });
  return { sheet, columns: choice.columns, headerRow: choice.headerRow, rows };
}

/** A class-keyed list's rows by class name: a name that breaks the class-name rule is left
    out, and the first row of a class listed twice is the one used. */
function rowsByClass<F extends string>(
  list: ListSheet<F>,
  field: F,
  report: Report,
): Map<string, ListRow<F>> {
  const byClass = new Map<string, ListRow<F>>();
  const column = list.columns[field] ?? 0;
  for (const row of list.rows) {
    const text = row.read(field);
    const parsed = parseClassName(text);
    if (!parsed) {
      report(
        list.sheet.name,
        row.row,
        column,
        `${text} isn't a class name, so the row is left out.`,
      );
      continue;
    }
    const first = byClass.get(parsed.name);
    if (first) {
      report(list.sheet.name, row.row, column, repeatedMessage(parsed.name, first.row, row.row));
    } else {
      byClass.set(parsed.name, row);
    }
  }
  return byClass;
}

// --- Teachers ---

/** Where a teacher's name was read. */
interface Mention {
  name: string;
  sheet: string;
  row: number;
  column: number;
}

type TeacherDetails = Partial<Pick<Teacher, 'fullName' | 'email' | 'phone' | 'school'>>;

const schoolsNamed = (text: string) =>
  (['THCS', 'THPT'] as const).filter((school) => foldText(text).includes(school.toLowerCase()));

/** `THCS` or `THPT`, and both when the cell or the other column names the other school. */
function homeSchool(school: string, alsoAt: string): HomeSchool | undefined {
  const [home, other] = schoolsNamed(school);
  if (home === undefined) return undefined;
  if (other !== undefined || schoolsNamed(alsoAt).some((s) => s !== home)) return 'both';
  return home;
}

/** A row's details that have a value and can be used; each one that can't is a problem. */
function teacherDetails(
  row: ListRow<TeacherField>,
  list: ListSheet<TeacherField>,
  report: Report,
): TeacherDetails {
  const details: TeacherDetails = {};
  const leftOut = (field: TeacherField, text: string, what: string) =>
    report(
      list.sheet.name,
      row.row,
      list.columns[field] ?? 0,
      `${text} isn't ${what}, so it's left out.`,
    );

  const fullName = row.read('fullName');
  if (fullName !== '') details.fullName = fullName;

  const email = row.read('email');
  if (email !== '') {
    if (isEmail(email)) details.email = email;
    else leftOut('email', email, 'an email');
  }

  // Excel drops a mobile number's leading 0 when it's saved as a number.
  const typed = row.read('phone');
  const phone = cleanPhone(/^\d{9}$/.test(typed) ? `0${typed}` : typed);
  if (phone !== '') {
    if (isPhoneNumber(phone)) details.phone = phone;
    else leftOut('phone', typed, 'a phone number');
  }

  const schoolText = row.read('school');
  const school = homeSchool(schoolText, row.read('alsoAt'));
  if (school) details.school = school;
  else if (schoolText !== '') leftOut('school', schoolText, 'THCS or THPT');

  return details;
}

const emailKey = (email: string) => email.toLowerCase();

/** A phone's digits, without a leading 0, which Excel drops from a number. */
const phoneKey = (phone: string) => phone.replace(/\D/g, '').replace(/^0/, '');

/** The names whose value is `wanted`; all of them when `wanted` is empty or fits none. */
function narrowBy(
  names: readonly string[],
  wanted: string,
  valueOf: (name: string) => string,
): readonly string[] {
  const kept = wanted === '' ? [] : names.filter((name) => valueOf(name) === wanted);
  return kept.length > 0 ? kept : names;
}

/** Finding teachers by name in the teachers sheet and the timetable the import goes into. */
function teacherDirectory(list: ListSheet<TeacherField> | null, into: TimetableFile) {
  const rowsByShort = new Map<string, ListRow<TeacherField>>();
  const repeats: { key: string; first: ListRow<TeacherField>; row: number }[] = [];
  // Each full name's short names, the teachers sheet's before the timetable's.
  const fullNames = new Map<string, string[]>();
  const noteFullName = (fullName: string, shortName: string) => {
    const key = nameKey(fullName);
    if (key === '') return;
    const names = fullNames.get(key) ?? [];
    if (!names.some((name) => sameName(name, shortName))) {
      fullNames.set(key, [...names, shortName]);
    }
  };
  for (const row of list?.rows ?? []) {
    noteFullName(row.read('fullName'), row.read('shortName'));
    const key = nameKey(row.read('shortName'));
    const first = rowsByShort.get(key);
    if (first) repeats.push({ key, first, row: row.row });
    else rowsByShort.set(key, row);
  }
  const existing = new Map(into.teachers.map((t) => [nameKey(t.shortName), t]));
  for (const teacher of into.teachers) noteFullName(teacher.fullName ?? '', teacher.shortName);

  /** The short names of the teachers `name` fits, as `Data ` names them (§12.2): the teacher
      with that short name first, then those with that full name. */
  const staffMatches = (name: string): string[] => {
    const key = nameKey(name);
    const short = rowsByShort.has(key) || existing.has(key) ? [name] : [];
    const full = (fullNames.get(key) ?? []).filter((s) => !sameName(s, name));
    return [...short, ...full];
  };

  /** A teacher's email and phone, the teachers sheet's before the timetable's. */
  const contact = (shortName: string): { email: string; phone: string } => {
    const key = nameKey(shortName);
    const row = rowsByShort.get(key);
    const teacher = existing.get(key);
    const read = (field: 'email' | 'phone') => row?.read(field) || teacher?.[field] || '';
    return { email: emailKey(read('email')), phone: phoneKey(read('phone')) };
  };

  return { rowsByShort, repeats, existing, staffMatches, contact };
}

type TeacherDirectory = ReturnType<typeof teacherDirectory>;

// --- The timetable sheet ---

const periodsText = (block: BlockIndex) => `periods ${block * 2 + 1}–${block * 2 + 2}`;

/** The rows the grid is read from: the first for each day and block. Every row left out and
    every block with no row is a problem. */
function usableBlockRows(
  sheet: WorkbookSheet,
  layout: TimetableLayout,
  report: Report,
): TimetableBlockRow[] {
  const firstRow = new Map<string, number>();
  const usable: TimetableBlockRow[] = [];
  const atPeriod = (row: number, message: string) =>
    report(sheet.name, row, layout.periodColumn, message);
  for (const row of layout.blocks) {
    const key = `${row.day}-${row.block}`;
    const first = firstRow.get(key);
    if (first === undefined) {
      firstRow.set(key, row.row);
      usable.push(row);
    } else {
      atPeriod(
        row.row,
        `${DAY_NAMES[row.day]} ${periodsText(row.block)} is here a second time (first on row ${first + 1}), so this row is left out.`,
      );
    }
  }
  for (const row of layout.dayless) {
    atPeriod(row, "This row doesn't say which day it's on, so it's left out.");
  }
  for (const row of layout.weekend) {
    atPeriod(row, 'The grid has five days, Monday to Friday, so this row is left out.');
  }
  for (const day of DAYS) {
    for (const block of [0, 1, 2, 3, 4] as const) {
      if (!firstRow.has(`${day}-${block}`)) {
        report(
          sheet.name,
          -1,
          -1,
          `${DAY_NAMES[day]} has no row for ${periodsText(block)}, so that block stays empty.`,
        );
      }
    }
  }
  return usable;
}

/** "8:00 - 9:10" as "08:00-09:10", the bell schedule's way, or null for any other text. */
function timeRangeKey(text: string): string | null {
  const match = /^(\d{1,2})[:.h](\d{2})\s*[-–—]\s*(\d{1,2})[:.h](\d{2})$/i.exec(text);
  if (!match) return null;
  const [, startHour, startMinute, endHour, endMinute] = match;
  return `${startHour!.padStart(2, '0')}:${startMinute}-${endHour!.padStart(2, '0')}:${endMinute}`;
}

/** The time a row gives left of the classes, as `timeRangeKey` writes it, or null. */
function rowTime(sheet: WorkbookSheet, row: number, firstClassColumn: number): string | null {
  const cells = (sheet.rows[row] ?? []).slice(0, firstClassColumn);
  return cells.map(timeRangeKey).find((key) => key !== null) ?? null;
}

/** True when a block row gives a time that isn't the bell schedule's. */
function timesDiffer(
  sheet: WorkbookSheet,
  rows: readonly TimetableBlockRow[],
  firstClassColumn: number,
  schedule: readonly ScheduleRow[],
): boolean {
  const scheduled = new Map<BlockIndex, string>();
  for (const r of schedule) {
    if (r.kind === 'block') scheduled.set(r.block, `${r.start}-${r.end}`);
  }
  return rows.some(({ row, block }) => {
    const time = rowTime(sheet, row, firstClassColumn);
    return time !== null && time !== scheduled.get(block);
  });
}

/** The teacher a teaching assignments sheet gives a class and subject. */
type AssignmentLookup = (className: string, subject: string) => Mention | null;

function assignmentLookup(
  workbook: WorkbookData,
  choices: ImportChoices,
  report: Report,
): AssignmentLookup | null {
  if (choices.teacherFrom !== 'assignments') return null;
  const list = readList(workbook, choices.assignments, 'className', 'class', report);
  if (!list) return null;
  const rows = rowsByClass(list, 'className', report);
  const columns = new Map<string, number>();
  (list.sheet.rows[list.headerRow] ?? []).forEach((header, column) => {
    const key = nameKey(header);
    if (key !== '' && column !== list.columns.className && !columns.has(key)) {
      columns.set(key, column);
    }
  });
  return (className, subject) => {
    const row = rows.get(className);
    const column = columns.get(nameKey(subject));
    if (!row || column === undefined) return null;
    const name = cleanName(row.cells[column] ?? '');
    return name === '' ? null : { name, sheet: list.sheet.name, row: row.row, column };
  };
}

/** One card a grid cell holds, with its teacher already found. */
interface GridCard {
  className: string;
  day: Day;
  block: BlockIndex;
  part: PlacementPart;
  subject: string;
  /** Null: no teacher. */
  teacher: Mention | null;
}

/** Every card on the grid, in sheet order. With teaching assignments each half's teacher is
    looked up by its subject, or by the cell's own name, as a joined subject's is. */
function readGrid(
  sheet: WorkbookSheet,
  layout: TimetableLayout,
  rows: readonly TimetableBlockRow[],
  lookup: AssignmentLookup | null,
  assignmentsName: string,
  report: Report,
): GridCard[] {
  const blockRows = new Set([
    ...layout.blocks.map((b) => b.row),
    ...layout.dayless,
    ...layout.weekend,
  ]);
  const unassigned = new Set<string>();
  const cards: GridCard[] = [];
  for (const { row, day, block } of rows) {
    // A row with another block's code or its own time is a block or a break, not teachers.
    const below = rowTime(sheet, row + 1, layout.firstClassColumn);
    const isTeacherRow =
      !blockRows.has(row + 1) &&
      (below === null || below === rowTime(sheet, row, layout.firstClassColumn));
    const teacherRow = isTeacherRow ? row + 1 : -1;
    for (const { column, name: className } of layout.classes) {
      const subjectCell = sheet.rows[row]?.[column] ?? '';
      const teacherCell = lookup ? '' : (sheet.rows[teacherRow]?.[column] ?? '');
      for (const part of parseSlotText(subjectCell, teacherCell)) {
        let teacher: Mention | null =
          part.teacher === ''
            ? null
            : { name: part.teacher, sheet: sheet.name, row: teacherRow, column };
        if (lookup) {
          teacher = lookup(className, part.subject) ?? lookup(className, subjectCell);
          const key = `${className}|${nameKey(part.subject)}`;
          if (!teacher && !unassigned.has(key)) {
            unassigned.add(key);
            report(
              sheet.name,
              row,
              column,
              `${assignmentsName} has no teacher for ${part.subject} in ${className}, so the card has no teacher.`,
            );
          }
        }
        cards.push({ className, day, block, part: part.part, subject: part.subject, teacher });
      }
    }
  }
  return cards;
}

// --- Building the result ---

type ClassRows = Map<string, ListRow<ClassField>>;

/** A class's homeroom teacher and assistant, as short-name keys. */
interface ClassStaff {
  homeroom: string | null;
  assistant: string | null;
}

/** Who the workbook uses, each with where they were first named: every teacher on a placed
    card, and each homeroom teacher and assistant, with each class's two. */
function usedTeachers(
  gridCards: readonly GridCard[],
  classList: ListSheet<ClassField> | null,
  classRows: ClassRows,
  directory: TeacherDirectory,
  report: Report,
) {
  const used = new Map<string, Mention>();
  for (const { teacher } of gridCards) {
    if (!teacher) continue;
    const key = nameKey(teacher.name);
    if (!used.has(key)) used.set(key, teacher);
  }
  const staffKey = (row: ListRow<ClassField>, field: 'homeroom' | 'assistant') => {
    const name = row.read(field);
    if (name === '' || !classList) return null;
    const column = classList.columns[field] ?? 0;
    // The same row's email, then phone, tell apart teachers with the same name.
    const matches = narrowBy(
      narrowBy(
        directory.staffMatches(name),
        emailKey(row.read(`${field}Email`)),
        (s) => directory.contact(s).email,
      ),
      phoneKey(row.read(`${field}Phone`)),
      (s) => directory.contact(s).phone,
    );
    if (matches.length > 1) {
      report(
        classList.sheet.name,
        row.row,
        column,
        `More than one teacher is called ${name} (${joinList(matches, 'and')}), so ${matches[0]} is used.`,
      );
    }
    const key = nameKey(matches[0] ?? name);
    if (!used.has(key)) used.set(key, { name, sheet: classList.sheet.name, row: row.row, column });
    return key;
  };
  const staff = new Map<string, ClassStaff>();
  for (const [name, row] of classRows) {
    staff.set(name, { homeroom: staffKey(row, 'homeroom'), assistant: staffKey(row, 'assistant') });
  }
  return { used, staff };
}

/** The timetable's teachers with those the workbook uses added or updated, in the teachers
    sheet's order, then those it doesn't have. */
function buildTeachers(
  into: TimetableFile,
  directory: TeacherDirectory,
  used: ReadonlyMap<string, Mention>,
  list: ListSheet<TeacherField> | null,
  report: Report,
) {
  const teachers = [...into.teachers];
  const ids = new Map<string, Id>();
  const count = { ...NO_COUNT };
  const put = (key: string, shortName: string, details: TeacherDetails) => {
    const existing = directory.existing.get(key);
    if (existing) {
      teachers[teachers.indexOf(existing)] = { ...existing, ...details };
      ids.set(key, existing.id);
      count.updated++;
    } else {
      const teacher: Teacher = { id: crypto.randomUUID(), shortName, ...details, conditions: [] };
      teachers.push(teacher);
      ids.set(key, teacher.id);
      count.added++;
    }
  };
  if (list) {
    const column = list.columns.shortName ?? 0;
    for (const { key, first, row } of directory.repeats) {
      if (!used.has(key)) continue;
      const message = repeatedMessage(first.read('shortName'), first.row, row);
      report(list.sheet.name, row, column, message);
    }
    for (const [key, row] of directory.rowsByShort) {
      if (used.has(key)) put(key, row.read('shortName'), teacherDetails(row, list, report));
    }
  }
  for (const [key, mention] of used) {
    if (directory.rowsByShort.has(key)) continue;
    if (list && !directory.existing.has(key)) {
      report(
        mention.sheet,
        mention.row,
        mention.column,
        `${mention.name} isn't in ${list.sheet.name.trim()}, so they come in with only their short name.`,
      );
    }
    put(key, mention.name, {});
  }
  return { teachers, ids, count };
}

/** The timetable's classes with the workbook's added or updated: the timetable sheet's,
    then those only the classes sheet has. */
function buildClasses(
  into: TimetableFile,
  sheet: WorkbookSheet,
  layout: TimetableLayout,
  classList: ListSheet<ClassField> | null,
  classRows: ClassRows,
  staff: ReadonlyMap<string, ClassStaff>,
  teacherIds: ReadonlyMap<string, Id>,
  report: Report,
) {
  const classes = [...into.classes];
  const ids = new Map(into.classes.map((c) => [c.name, c.id]));
  const count = { ...NO_COUNT };
  const teacherId = (key: string | null | undefined) =>
    key === null || key === undefined ? undefined : teacherIds.get(key);
  const onGrid = layout.classes.map((c) => c.name);
  const homeroomColumn = classList?.columns.homeroom ?? null;
  for (const name of [...onGrid, ...[...classRows.keys()].filter((n) => !onGrid.includes(n))]) {
    const formTeacherId = teacherId(staff.get(name)?.homeroom);
    const coTeacherId = teacherId(staff.get(name)?.assistant);
    const people: Partial<SchoolClass> = {
      ...(formTeacherId !== undefined && { formTeacherId }),
      ...(coTeacherId !== undefined && { coTeacherId }),
    };
    const index = classes.findIndex((c) => c.name === name);
    let result: SchoolClass;
    if (index !== -1) {
      result = { ...classes[index]!, ...people };
      classes[index] = result;
      count.updated++;
    } else {
      result = { id: crypto.randomUUID(), ...parseClassName(name)!, ...people };
      classes.push(result);
      ids.set(name, result.id);
      count.added++;
    }
    if (result.formTeacherId === undefined && classList && homeroomColumn !== null) {
      const message = `${name} has no homeroom teacher, so it comes in without one.`;
      const row = classRows.get(name);
      if (row) report(classList.sheet.name, row.row, homeroomColumn, message);
      else {
        const column = layout.classes.find((c) => c.name === name)?.column ?? 0;
        report(sheet.name, layout.headerRow, column, message);
      }
    }
  }
  return { classes, ids, count };
}

/** The timetable's subjects and cards with those the grid needs, and the grid's placements. */
function buildGrid(
  into: TimetableFile,
  gridCards: readonly GridCard[],
  teacherIds: ReadonlyMap<string, Id>,
  classIds: ReadonlyMap<string, Id>,
) {
  const subjects = [...into.subjects];
  const subjectIds = new Map(into.subjects.map((s) => [nameKey(s.name), s.id]));
  const subjectCount = { ...NO_COUNT };
  const subjectsCounted = new Set<string>();
  const subjectIdOf = (name: string): Id => {
    const key = nameKey(name);
    const id = subjectIds.get(key);
    if (id === undefined) {
      const subject: Subject = { id: crypto.randomUUID(), name, colorKey: defaultColorKey(name) };
      subjects.push(subject);
      subjectIds.set(key, subject.id);
      subjectsCounted.add(key);
      subjectCount.added++;
      return subject.id;
    }
    if (!subjectsCounted.has(key)) {
      subjectsCounted.add(key);
      subjectCount.updated++;
    }
    return id;
  };

  const cards = [...into.cards];
  const cardKey = (subjectId: Id, teacherId: Id | null) => JSON.stringify([subjectId, teacherId]);
  const openCards = new Map<string, Card[]>();
  for (const card of into.cards) {
    const key = cardKey(card.subjectId, card.teacherId);
    openCards.set(key, [...(openCards.get(key) ?? []), card]);
  }
  const chosenCards = new Map<string, Id>();
  const cardCount = { ...NO_COUNT };
  let cardsWithoutTeacher = 0;
  const cardIdOf = (subjectId: Id, teacherId: Id | null): Id => {
    const key = cardKey(subjectId, teacherId);
    const chosen = chosenCards.get(key);
    if (chosen !== undefined) return chosen;
    // One card for this subject and teacher is that card, so its room is kept; among
    // several, the one with no room, since the workbook names none.
    const same = openCards.get(key) ?? [];
    const existing = same.length === 1 ? same[0] : same.find((c) => c.roomId === null);
    let id: Id;
    if (existing) {
      id = existing.id;
      cardCount.updated++;
    } else {
      id = crypto.randomUUID();
      cards.push({ id, subjectId, teacherId, roomId: null });
      cardCount.added++;
    }
    if (teacherId === null) cardsWithoutTeacher++;
    chosenCards.set(key, id);
    return id;
  };

  const placements = gridCards.map((card) => ({
    id: crypto.randomUUID(),
    cardId: cardIdOf(
      subjectIdOf(card.subject),
      card.teacher ? (teacherIds.get(nameKey(card.teacher.name)) ?? null) : null,
    ),
    classId: classIds.get(card.className)!,
    day: card.day,
    block: card.block,
    part: card.part,
  }));
  return { subjects, subjectCount, cards, cardCount, cardsWithoutTeacher, placements };
}

// --- What the Import screen shows of a result (layout spec "Import screen") ---

/** How many problems the results list shows; the rest are counted (§12.4). */
export const PROBLEMS_SHOWN = 200;

export interface ImportFoundRow {
  label: string;
  value: string;
  /** Beside the value, as in "42 more not used". */
  note?: string;
}

/** A count written as the layout spec writes it: `1 236`. */
function countText(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+$)/g, ' ');
}

/** The results panel's label-and-value pairs; into the open profile, what's replaced and
    updated too. */
export function importFoundRows(summary: ImportSummary, intoOpen: boolean): ImportFoundRow[] {
  const total = (count: ImportCount) => countText(count.added + count.updated);
  const rows: ImportFoundRow[] = [
    { label: 'Classes', value: total(summary.classes) },
    {
      label: 'Teachers',
      value: total(summary.teachers),
      ...(summary.teachersNotUsed > 0 && {
        note: `${countText(summary.teachersNotUsed)} more not used`,
      }),
    },
    { label: 'Subjects', value: total(summary.subjects) },
    {
      label: 'Cards',
      value: total(summary.cards),
      ...(summary.cardsWithoutTeacher > 0 && {
        note: `${countText(summary.cardsWithoutTeacher)} with no teacher`,
      }),
    },
    { label: 'Placements', value: countText(summary.placements) },
  ];
  if (!intoOpen) return rows;
  const updated = [
    ...(summary.teachers.updated > 0
      ? [plural(summary.teachers.updated, 'teacher', 'teachers')]
      : []),
    ...(summary.classes.updated > 0 ? [plural(summary.classes.updated, 'class', 'classes')] : []),
  ];
  return [
    ...rows,
    { label: 'Grids replaced', value: countText(summary.gridsReplaced) },
    { label: 'Updated', value: updated.join(', ') || 'None' },
  ];
}

/** True when the result brings in any class, so there's something for Import to do. With no
    timetable sheet, or one that isn't laid out as a timetable, nothing comes in. */
export function importsSomething(summary: ImportSummary): boolean {
  return summary.classes.added + summary.classes.updated > 0;
}

/** The line under Found when the sheet's block times aren't the timetable's, or null. */
export function bellTimesNote(summary: ImportSummary): string | null {
  return summary.bellTimesDiffer
    ? "The sheet's block times aren't this timetable's, which stay as they are."
    : null;
}

/** The problems the results list shows, and how many more there are. */
export function shownProblems(problems: readonly ImportProblem[]): {
  shown: readonly ImportProblem[];
  more: number;
} {
  return {
    shown: problems.slice(0, PROBLEMS_SHOWN),
    more: Math.max(0, problems.length - PROBLEMS_SHOWN),
  };
}

/** The question before importing into the open profile (layout spec "Import question"). */
export function importQuestion(
  summary: ImportSummary,
  profileName: string,
): { title: string; lines: string[] } {
  const grids = summary.gridsReplaced;
  const replaced =
    grids === 0
      ? ''
      : `The ${grids === 1 ? 'grid' : 'grids'} of ${plural(grids, 'class', 'classes')} ${grids === 1 ? 'is' : 'are'} replaced`;
  const updatedItems = [
    ...(summary.teachers.updated > 0
      ? [plural(summary.teachers.updated, 'teacher', 'teachers')]
      : []),
    ...(summary.classes.updated > 0 ? [plural(summary.classes.updated, 'class', 'classes')] : []),
  ];
  // "1 teacher is updated", but "1 teacher and 1 class are updated".
  const one = summary.teachers.updated + summary.classes.updated === 1;
  const updated =
    updatedItems.length === 0
      ? ''
      : `${joinList(updatedItems, 'and')} ${one ? 'is' : 'are'} updated`;
  const what =
    replaced !== '' && updated !== ''
      ? `${replaced}, and ${updated}.`
      : replaced !== ''
        ? `${replaced}.`
        : updated !== ''
          ? `${updated.charAt(0).toUpperCase()}${updated.slice(1)}.`
          : `Nothing already in ${profileName} is replaced or updated.`;
  return {
    title: `Import into ${profileName}?`,
    lines: [what, "A copy of the timetable as it is now is kept in the profile's folder."],
  };
}

/** What the notice says once an import is in (layout spec "Import notice"). */
export function importNoticeText(summary: ImportSummary, profileName: string): string {
  const total = (count: ImportCount) => count.added + count.updated;
  const items = [
    plural(total(summary.classes), 'class', 'classes'),
    plural(total(summary.teachers), 'teacher', 'teachers'),
    plural(total(summary.cards), 'card', 'cards'),
  ];
  return `Imported ${joinList(items, 'and')} into ${profileName}.`;
}

/** Where a problem is, as `HK1 F12`; empty when it's about the whole workbook. */
export function problemPlace(problem: ImportProblem): string {
  return [problem.sheet.trim(), problem.cell].filter((part) => part !== '').join(' ');
}

/** The timetable `workbook` holds under `choices`, built on `into`, with what it found and
    every problem (§12.4). `into` isn't changed. */
export function importTimetable(
  workbook: WorkbookData,
  choices: ImportChoices,
  into: TimetableFile,
): ImportResult {
  const located: LocatedProblem[] = [];
  const report: Report = (sheet, row, column, message) => {
    located.push({ sheet, row, column, message });
  };
  const nothing = (sheet: string, message: string): ImportResult => ({
    file: into,
    summary: NOTHING_IMPORTED,
    problems: orderedProblems(workbook, [{ sheet, row: -1, column: -1, message }]),
  });

  const sheet = findSheet(workbook, choices.timetable.sheet);
  if (!sheet) return nothing('', 'No sheet is chosen for the timetable, so nothing is imported.');
  const layout = readTimetableLayout(sheet);
  if (!layout) {
    return nothing(
      sheet.name,
      "This sheet isn't laid out as a timetable, with class names across the top and a period code on each block's row, so nothing is imported.",
    );
  }
  for (const { column, name } of layout.badClasses) {
    const message = `${name} isn't a class name, so its column is left out.`;
    report(sheet.name, layout.headerRow, column, message);
  }
  if (layout.stopped) {
    const { column, lost } = layout.stopped;
    report(
      sheet.name,
      layout.headerRow,
      column,
      `The class names stop at this column, with a blank or repeated cell, so ${joinList(lost, 'and')} ${lost.length === 1 ? 'is' : 'are'} left out.`,
    );
  }

  const teacherList = readList<TeacherField>(
    workbook,
    choices.teachers,
    'shortName',
    'short name',
    report,
  );
  const classList = readList<ClassField>(workbook, choices.classes, 'className', 'class', report);
  const classRows: ClassRows = classList
    ? rowsByClass<ClassField>(classList, 'className', report)
    : new Map();
  const blockRows = usableBlockRows(sheet, layout, report);
  const gridCards = readGrid(
    sheet,
    layout,
    blockRows,
    assignmentLookup(workbook, choices, report),
    (choices.assignments.sheet ?? '').trim(),
    report,
  );

  const directory = teacherDirectory(teacherList, into);
  const { used, staff } = usedTeachers(gridCards, classList, classRows, directory, report);
  const teachers = buildTeachers(into, directory, used, teacherList, report);
  const classes = buildClasses(
    into,
    sheet,
    layout,
    classList,
    classRows,
    staff,
    teachers.ids,
    report,
  );
  const grid = buildGrid(into, gridCards, teachers.ids, classes.ids);

  // Each timetable class's grid is the workbook's, and other classes keep theirs.
  const onGrid = new Set(layout.classes.map((c) => c.name));
  const replaced = new Set([...onGrid].map((name) => classes.ids.get(name)));

  return {
    file: {
      ...into,
      grades: gradesOf([...into.grades.map((grade) => ({ grade })), ...classes.classes]),
      subjects: grid.subjects,
      teachers: teachers.teachers,
      classes: classes.classes,
      cards: grid.cards,
      placements: [...into.placements.filter((p) => !replaced.has(p.classId)), ...grid.placements],
    },
    summary: {
      teachers: teachers.count,
      classes: classes.count,
      subjects: grid.subjectCount,
      cards: grid.cardCount,
      placements: grid.placements.length,
      cardsWithoutTeacher: grid.cardsWithoutTeacher,
      teachersNotUsed: [...directory.rowsByShort.keys()].filter((key) => !used.has(key)).length,
      gridsReplaced: into.classes.filter((c) => onGrid.has(c.name)).length,
      bellTimesDiffer: timesDiffer(sheet, blockRows, layout.firstClassColumn, into.bellSchedule),
    },
    problems: orderedProblems(workbook, located),
  };
}
