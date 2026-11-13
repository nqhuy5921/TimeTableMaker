import type {
  BlockIndex,
  Day,
  Id,
  PlacementPart,
  ScheduleRow,
  SchoolClass,
  TimetableFile,
} from './model';
import { DAYS } from './model';
import { cleanName, sameName } from './text';

// What every exported cell says (IE-2, IE-4, SYSTEM_DESIGN §11.3), worked out from the
// timetable with no Excel or Electron in it. The workbook writer (src/main/exportExcel.ts)
// and the PDF writer (src/main/exportPdf.ts) turn these models into sheets and pages, and
// place them; the model only orders the rows and columns.

/** The details asked for when exporting (SYSTEM_DESIGN §11.4). */
export interface ExportDetails {
  /** As in "Trung học/Secondary School". */
  schoolName: string;
  /** As in "2026 - 2027". */
  schoolYear: string;
  /** The date the timetable applies from, as yyyy-mm-dd (a date input's value). */
  appliesFrom: string;
}

export type ExportScope = 'class' | 'all';
export type ExportFormat = 'xlsx' | 'pdf';

/** The sample workbook's bilingual wording (NF-2), "Vietnamese/ English" with its own
    spacing, which is copied as it is. */
export const EXPORT_LABELS = {
  title: (year: string) => `THỜI KHÓA BIỂU NĂM HỌC ${year}`,
  titleEnglish: (year: string) => `SCHOOL SCHEDULE ${year}`,
  appliesFrom: (date: string) => `(Áp dụng từ ngày ${date})`,
  school: (name: string) => `Trường/School: ${name}`,
  class: 'Lớp/Class: ',
  homeroom: 'GVCN/Form Teacher:',
  assistant: 'PCN/Co-teacher',
  phone: 'SĐT',
  email: 'Email:',
  period: 'Tiết/\nPeriod',
  time: 'Thời gian/\nTime',
  days: {
    0: 'Thứ hai/ Monday',
    1: 'Thứ ba/ Tuesday',
    2: 'Thứ tư/ Wednesday',
    3: 'Thứ Năm/ Thursday',
    4: 'Thứ Sáu/ Friday',
  } satisfies Record<Day, string>,
  finish: 'Kết thúc / Finish',
  gridFinish: 'Kết thúc/ Finish',
  firstHalf: (subject: string) => `${subject} (first half)`,
  secondHalf: (subject: string) => `${subject} (second half)`,
} as const;

/** The class sheets' wording for the bell schedule's fixed rows and their day labels, by
    their English label in DEFAULT_BELL_SCHEDULE (the app has no way to edit the schedule, and
    a test checks every row of it is here). A row the table doesn't have, as in a hand-edited
    file, is written as "note/ label". */
export const CLASS_SHEET_ROW_LABELS: Readonly<Record<string, string>> = {
  Breakfast: 'Đón học sinh, ăn sáng / Breakfast',
  'Flag salute': 'Chào cờ',
  'Getting ready': 'Hoạt động đầu ngày/Getting ready',
  Break: 'Giờ chơi/ Break',
  'Lunch break': 'Ăn trưa & Nghỉ trưa/ Lunch time & Nap time',
  'Snack break': 'Ăn nhẹ/Snack time',
};

/** `TKB tổng hợp`'s wording for the same rows, as the sample's `HK1` has it: one getting
    ready row on every day, flag salute and all. HK1 splits lunch into Lunch time and Nap
    time, but the bell schedule has one lunch row, so it's one row here. */
export const GRID_ROW_LABELS: Readonly<Record<string, string>> = {
  Breakfast: 'Ăn sáng/ Breakfast',
  'Getting ready': 'Chào cờ/ Hoạt động đầu ngày',
  Break: 'Giờ chơi/ Break',
  'Lunch break': 'Ăn trưa & Nghỉ trưa/ Lunch time & Nap time',
  'Snack break': 'Ăn nhẹ/ Snack time',
};

function rowLabel(
  labels: Readonly<Record<string, string>>,
  label: string,
  note: string | undefined,
): string {
  return labels[label] ?? (note ? `${note}/ ${label}` : label);
}

type FixedRow = Extract<ScheduleRow, { kind: 'break' }>;

/** A fixed row's text on one day of a class sheet: Monday's flag salute in place of getting
    ready. */
function classSheetRowText(row: FixedRow, day: Day): string {
  const special = row.dayLabels?.find((d) => d.day === day);
  const { label, note } = special ?? row;
  return rowLabel(CLASS_SHEET_ROW_LABELS, label, note);
}

/** "08:00" as the sample writes it, "8:00". */
function shortTime(time: string): string {
  return time.replace(/^0(\d)/, '$1');
}

const timeRange = (row: { start: string; end: string }) =>
  `${shortTime(row.start)} - ${shortTime(row.end)}`;

/** "2026-09-03" as "03/09/2026"; anything else as it is. */
function dayMonthYear(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

// --- Slots ---

/** One block of one class: its subject cell and its teacher cell. */
export interface SlotText {
  subject: string;
  teacher: string;
}

const EMPTY_SLOT: SlotText = { subject: '', teacher: '' };

type SlotReader = (classId: Id, day: Day, block: BlockIndex) => SlotText;

/** Two halves' texts: one when they're the same ("Toán" taught by two teachers, or one
    teacher for both halves), otherwise both, part by part, so the teacher cell lines up with
    the subject cell. A half with no teacher is an empty part: "T. Hoa +". */
function joinHalves(first: string, second: string): string {
  return first === second ? first : `${first} + ${second}`.trim();
}

/** Each file's slot reader, so a sheet reading 25 slots a class, or `slotText` called per
    cell, goes over the placements once. Files are never changed in place. */
const readers = new WeakMap<TimetableFile, SlotReader>();

function slotReader(file: TimetableFile): SlotReader {
  let reader = readers.get(file);
  if (!reader) {
    reader = buildSlotReader(file);
    readers.set(file, reader);
  }
  return reader;
}

function buildSlotReader(file: TimetableFile): SlotReader {
  const subjects = new Map(file.subjects.map((s) => [s.id, s.name]));
  const teachers = new Map(file.teachers.map((t) => [t.id, t.shortName]));
  const cards = new Map(file.cards.map((c) => [c.id, c]));
  type Part = { subject: string; teacher: string };
  const slots = new Map<string, { full?: Part; first?: Part; second?: Part }>();
  for (const p of file.placements) {
    const card = cards.get(p.cardId);
    if (!card) continue;
    const key = `${p.classId}|${p.day}|${p.block}`;
    const slot = slots.get(key) ?? {};
    slot[p.part] = {
      subject: subjects.get(card.subjectId) ?? '',
      teacher: card.teacherId === null ? '' : (teachers.get(card.teacherId) ?? ''),
    };
    slots.set(key, slot);
  }
  return (classId, day, block) => {
    const slot = slots.get(`${classId}|${day}|${block}`);
    if (!slot) return EMPTY_SLOT;
    if (slot.full) return slot.full;
    const { first, second } = slot;
    if (first && second) {
      return {
        subject: joinHalves(first.subject, second.subject),
        teacher: joinHalves(first.teacher, second.teacher),
      };
    }
    if (first) return { subject: EXPORT_LABELS.firstHalf(first.subject), teacher: first.teacher };
    if (second) {
      return { subject: EXPORT_LABELS.secondHalf(second.subject), teacher: second.teacher };
    }
    return EMPTY_SLOT;
  };
}

/** The subject and teacher text of one block: a full card's subject and teacher short
    name; two halves joined with " + " (`joinHalves`); one half alone with its half, as in
    "Toán (first half)"; empty when nothing's there. */
export function slotText(file: TimetableFile, classId: Id, day: Day, block: BlockIndex): SlotText {
  return slotReader(file)(classId, day, block);
}

/** One card a grid cell holds: its part of the block, subject, and teacher short name
    (empty: no teacher). */
export interface SlotPart {
  part: PlacementPart;
  subject: string;
  teacher: string;
}

/** Subjects the school's workbook writes as one cell for two half blocks (IE-1): a cell
    starting with `text` is `first` and `second`. */
export const JOINED_SUBJECTS = [
  { text: 'SH lớp-GDPC', first: 'Sinh hoạt lớp', second: 'Giáo dục phẩm chất' },
] as const;

const HALF_ALONE = /^(.+) \((first|second) half\)$/;

/** A cell's two halves, split on " + " with its spaces (so `Life+` stays whole), or null
    when it isn't exactly two. */
function splitHalves(text: string): [string, string] | null {
  const [first, second, ...rest] = text.split(' + ');
  return first !== undefined && second !== undefined && rest.length === 0 ? [first, second] : null;
}

/** The teacher cell's two sides: a lone side is a half with no teacher ("T. Hoa +"), and one
    name is both halves' teacher. */
function teacherHalves(teacher: string): [string, string] {
  if (teacher.endsWith(' +')) return [teacher.slice(0, -2), ''];
  if (teacher.startsWith('+ ')) return ['', teacher.slice(2)];
  return splitHalves(teacher) ?? [teacher, teacher];
}

function joinedSubject(subject: string): [string, string] | null {
  const joined = JOINED_SUBJECTS.find((j) => sameName(subject.slice(0, j.text.length), j.text));
  return joined ? [joined.first, joined.second] : null;
}

/** What a block's two cells hold, the inverse of `slotText` (SYSTEM_DESIGN §12.3): nothing
    for an empty subject, one half alone, two halves, one subject with two teachers (in both
    halves), or a full block. */
export function parseSlotText(subjectCell: string, teacherCell: string): SlotPart[] {
  const subject = cleanName(subjectCell);
  const teacher = cleanName(teacherCell);
  if (subject === '') return [];
  const alone = HALF_ALONE.exec(subject);
  if (alone) {
    return [{ part: alone[2] as 'first' | 'second', subject: alone[1]!, teacher }];
  }
  const [firstTeacher, secondTeacher] = teacherHalves(teacher);
  const [firstSubject, secondSubject] = joinedSubject(subject) ??
    splitHalves(subject) ?? [subject, subject];
  if (firstSubject === secondSubject && firstTeacher === secondTeacher) {
    return [{ part: 'full', subject: firstSubject, teacher: firstTeacher }];
  }
  return [
    { part: 'first', subject: firstSubject, teacher: firstTeacher },
    { part: 'second', subject: secondSubject, teacher: secondTeacher },
  ];
}

// --- Teachers ---

interface PersonDetails {
  fullName: string;
  phone: string;
  email: string;
}

const NO_PERSON: PersonDetails = { fullName: '', phone: '', email: '' };

/** A teacher's details for a header or `Data `; the short name stands in for a missing full
    name. */
function personDetails(file: TimetableFile, teacherId: Id | undefined): PersonDetails {
  const teacher =
    teacherId === undefined ? undefined : file.teachers.find((t) => t.id === teacherId);
  if (!teacher) return NO_PERSON;
  return {
    fullName: teacher.fullName ?? teacher.shortName,
    phone: teacher.phone ?? '',
    email: teacher.email ?? '',
  };
}

function findClass(file: TimetableFile, classId: Id): SchoolClass {
  const found = file.classes.find((c) => c.id === classId);
  if (!found) throw new Error(`No class ${classId} to export`);
  return found;
}

// --- Class sheet ---

/** Text across the day columns, `firstDay` to `lastDay`: days next to each other that read
    the same are one span, written as one merged cell. */
export interface DaySpan {
  firstDay: Day;
  lastDay: Day;
  text: string;
}

export type ClassSheetRow =
  | {
      kind: 'block';
      block: BlockIndex;
      /** "1-2". */
      label: string;
      /** "8:00 - 9:10". */
      time: string;
      /** Monday to Friday. */
      subjects: string[];
    }
  | {
      kind: 'fixed';
      type: FixedRow['type'] | 'finish';
      /** "9:10 - 9:20", or the finish row's "16:00". */
      time: string;
      /** The row's text, with neighbouring days that read the same in one span. */
      spans: DaySpan[];
    };

export interface ClassSheet {
  /** The class name, which names the sheet. */
  name: string;
  /** The three title lines. */
  title: [string, string, string];
  /** "Trường/School: Trung học/Secondary School". */
  school: string;
  homeroom: PersonDetails;
  rows: ClassSheetRow[];
}

/** Monday to Friday's texts, with neighbouring days that read the same joined. */
function daySpans(textOf: (day: Day) => string): DaySpan[] {
  const spans: DaySpan[] = [];
  for (const day of DAYS) {
    const text = textOf(day);
    const last = spans.at(-1);
    if (last?.text === text) last.lastDay = day;
    else spans.push({ firstDay: day, lastDay: day, text });
  }
  return spans;
}

/** The finish row's time: the last block's end. */
function finishTime(schedule: readonly ScheduleRow[]): string | null {
  const lastBlock = schedule.filter((r) => r.kind === 'block').at(-1);
  return lastBlock ? shortTime(lastBlock.end) : null;
}

function classSheetRows(file: TimetableFile, classId: Id): ClassSheetRow[] {
  const read = slotReader(file);
  const rows: ClassSheetRow[] = file.bellSchedule.map((row) =>
    row.kind === 'block'
      ? {
          kind: 'block',
          block: row.block,
          label: row.label,
          time: timeRange(row),
          subjects: DAYS.map((day) => read(classId, day, row.block).subject),
        }
      : {
          kind: 'fixed',
          type: row.type,
          time: timeRange(row),
          spans: daySpans((day) => classSheetRowText(row, day)),
        },
  );
  const finish = finishTime(file.bellSchedule);
  if (finish !== null) {
    rows.push({
      kind: 'fixed',
      type: 'finish',
      time: finish,
      spans: daySpans(() => EXPORT_LABELS.finish),
    });
  }
  return rows;
}

function sheetTitle(details: ExportDetails): [string, string, string] {
  return [
    EXPORT_LABELS.title(details.schoolYear),
    EXPORT_LABELS.titleEnglish(details.schoolYear),
    EXPORT_LABELS.appliesFrom(dayMonthYear(details.appliesFrom)),
  ];
}

/** One class's printable sheet, as the sample's class sheets (`6A1` …): the title, the
    homeroom teacher, and the bell schedule's rows with each block's five subjects. */
export function classSheet(file: TimetableFile, classId: Id, details: ExportDetails): ClassSheet {
  const schoolClass = findClass(file, classId);
  return {
    name: schoolClass.name,
    title: sheetTitle(details),
    school: EXPORT_LABELS.school(details.schoolName),
    homeroom: personDetails(file, schoolClass.formTeacherId),
    rows: classSheetRows(file, classId),
  };
}

// --- TKB tổng hợp ---

export const GRID_SHEET_NAME = 'TKB tổng hợp';

/** The sample's `HK1` heads its short day code column with a lone non-breaking space. */
const NBSP = String.fromCharCode(0xa0);

/** The grid sheet's first columns, before a column per class, as the sample's `HK1`: the day,
    its two codes, the period, and the time. */
export const GRID_HEADER = ['Thứ\nDay', NBSP, 'Tiết\nPeriod', 'Thời gian\nTime'] as const;

export const GRID_DAY_NAMES: Record<Day, string> = {
  0: 'Thứ Hai / Monday',
  1: 'Thứ Ba / Tuesday',
  2: 'Thứ Tư / Wednesday',
  3: 'Thứ Năm / Thursday',
  4: 'Thứ Sáu / Friday',
};

/** `Th2` to `Th6`, as `HK1` and `TKB 1S` name the days, and the short `T2` to `T6` beside. */
export const dayCode = (day: Day) => `Th${day + 2}`;
export const shortDayCode = (day: Day) => `T${day + 2}`;

/** `THCS12` to `THCS910`. */
export const periodCode = (block: BlockIndex) => `THCS${block * 2 + 1}${block * 2 + 2}`;

export type GridRow =
  | { kind: 'fixed'; day: Day; type: FixedRow['type'] | 'finish'; time: string; text: string }
  | {
      kind: 'subject';
      day: Day;
      block: BlockIndex;
      /** "THCS12". */
      periodCode: string;
      time: string;
      /** One per class, in the sheet's class order. */
      cells: string[];
    }
  | { kind: 'teacher'; day: Day; block: BlockIndex; cells: string[] };

export interface GridSheet {
  name: typeof GRID_SHEET_NAME;
  classIds: Id[];
  classNames: string[];
  /** Day by day: each fixed row, each block's subject row then teacher row, and the finish. */
  rows: GridRow[];
}

/** `TKB tổng hợp`: every exported class's grid, laid out as the sample's `HK1`. The teacher
    rows are values: one class can have a subject with two teachers (IE-2). */
export function gridSheet(file: TimetableFile, classIds: readonly Id[]): GridSheet {
  const read = slotReader(file);
  const finish = finishTime(file.bellSchedule);
  const rows: GridRow[] = [];
  for (const day of DAYS) {
    for (const row of file.bellSchedule) {
      if (row.kind === 'break') {
        rows.push({
          kind: 'fixed',
          day,
          type: row.type,
          time: timeRange(row),
          text: rowLabel(GRID_ROW_LABELS, row.label, row.note),
        });
        continue;
      }
      const slots = classIds.map((id) => read(id, day, row.block));
      rows.push({
        kind: 'subject',
        day,
        block: row.block,
        periodCode: periodCode(row.block),
        time: timeRange(row),
        cells: slots.map((s) => s.subject),
      });
      rows.push({ kind: 'teacher', day, block: row.block, cells: slots.map((s) => s.teacher) });
    }
    if (finish !== null) {
      rows.push({
        kind: 'fixed',
        day,
        type: 'finish',
        time: finish,
        text: EXPORT_LABELS.gridFinish,
      });
    }
  }
  return {
    name: GRID_SHEET_NAME,
    classIds: [...classIds],
    classNames: classIds.map((id) => findClass(file, id).name),
    rows,
  };
}

/** Where a block's subject row is in `rows`, for a class sheet's formula into the grid
    sheet; -1 when the bell schedule has no such block. */
export function gridRowIndex(grid: GridSheet, day: Day, block: BlockIndex): number {
  return grid.rows.findIndex((r) => r.kind === 'subject' && r.day === day && r.block === block);
}

// --- Data ---

export const DATA_SHEET_NAME = 'Data ';

export const DATA_HEADER = [
  'Lớp',
  EXPORT_LABELS.homeroom,
  EXPORT_LABELS.assistant,
  'Mob CN',
  'Mob PCN',
  'Email CN',
  'Email PCN',
] as const;

/** The 1-based columns of `DATA_HEADER` a class sheet's header looks up by class name, as
    the sample's `VLOOKUP`s do: the homeroom teacher's name (2), phone (4), and email (6). */
export const DATA_LOOKUP_COLUMNS = {
  fullName: DATA_HEADER.indexOf(EXPORT_LABELS.homeroom) + 1,
  phone: DATA_HEADER.indexOf('Mob CN') + 1,
  email: DATA_HEADER.indexOf('Email CN') + 1,
};

export interface DataSheet {
  name: typeof DATA_SHEET_NAME;
  header: readonly string[];
  /** One per class, in `DATA_HEADER`'s order. */
  rows: string[][];
}

/** `Data `: a row per class with its homeroom teacher and assistant homeroom teacher, their
    full names, phones, and emails. */
export function dataSheet(file: TimetableFile, classIds: readonly Id[]): DataSheet {
  return {
    name: DATA_SHEET_NAME,
    header: DATA_HEADER,
    rows: classIds.map((id) => {
      const schoolClass = findClass(file, id);
      const homeroom = personDetails(file, schoolClass.formTeacherId);
      const assistant = personDetails(file, schoolClass.coTeacherId);
      return [
        schoolClass.name,
        homeroom.fullName,
        assistant.fullName,
        homeroom.phone,
        assistant.phone,
        homeroom.email,
        assistant.email,
      ];
    }),
  };
}

// --- Giáo viên ---

export const TEACHER_SHEET_NAME = 'Giáo viên';

export const TEACHER_HEADER = [
  'TT',
  'Họ tên/ Full name',
  'Tên ngắn/ Short name',
  'Điện thoại/ Phone',
  'Email',
  'Trường dạy chính/ Home school',
  'Trường kiêm nhiệm/ Also teaches at',
] as const;

export interface TeacherSheet {
  name: typeof TEACHER_SHEET_NAME;
  header: readonly string[];
  /** One per teacher, in `TEACHER_HEADER`'s order, the first cell counting from 1. */
  rows: [number, ...string[]][];
}

/** The teachers the classes use: on a card placed in one of them, or as its homeroom teacher
    or assistant. */
function usedTeacherIds(file: TimetableFile, classIds: readonly Id[]): Set<Id> {
  const exported = new Set(classIds);
  const cards = new Map(file.cards.map((c) => [c.id, c]));
  const used = new Set<Id>();
  for (const p of file.placements) {
    const teacherId = exported.has(p.classId) ? cards.get(p.cardId)?.teacherId : null;
    if (teacherId) used.add(teacherId);
  }
  for (const id of classIds) {
    const { formTeacherId, coTeacherId } = findClass(file, id);
    if (formTeacherId) used.add(formTeacherId);
    if (coTeacherId) used.add(coTeacherId);
  }
  return used;
}

/** `Giáo viên` (a change to IE-2 for release 5, SYSTEM_DESIGN §12.5): a row per teacher the
    classes use, in teacher-list order, so an import can join the short names on the grid to
    their details. A teacher at both schools is at THCS and also at THPT. */
export function teacherSheet(file: TimetableFile, classIds: readonly Id[]): TeacherSheet {
  const used = usedTeacherIds(file, classIds);
  return {
    name: TEACHER_SHEET_NAME,
    header: TEACHER_HEADER,
    rows: file.teachers
      .filter((t) => used.has(t.id))
      .map((t, index) => [
        index + 1,
        t.fullName ?? '',
        t.shortName,
        t.phone ?? '',
        t.email ?? '',
        t.school === 'both' ? 'THCS' : (t.school ?? ''),
        t.school === 'both' ? 'THPT' : '',
      ]),
  };
}

// --- File name ---

/** The save dialog's suggested name: "TKB 6A1.xlsx", "TKB all classes.pdf". */
export function exportFileName(
  scope: ExportScope,
  className: string,
  format: ExportFormat,
): string {
  return `TKB ${scope === 'class' ? className : 'all classes'}.${format}`;
}
