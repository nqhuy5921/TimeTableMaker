import { parseClassName } from './className';
import { DAY_NAMES, DAYS, type BlockIndex, type Day } from './model';
import { columnLetters, foldText, joinList, plural } from './text';

// The import's first half (IE-1, SYSTEM_DESIGN §12.1–12.3): a workbook as plain data, the
// four kinds of sheet you match against the example, and the app's suggestions for which
// sheet and which columns hold each kind's data. Nothing here reads a file: the main
// process turns the .xlsx into `WorkbookData` (src/main/importExcel.ts), so every rule
// after reading is here and unit-tested.

/** One sheet, each cell as its text as Excel shows it (a formula's saved result), trimmed,
    with every cell of a merged range holding the range's text. Rows are as long as their
    last non-empty cell; trailing empty rows are dropped. */
export interface WorkbookSheet {
  name: string;
  hidden: boolean;
  rows: string[][];
}

export interface WorkbookData {
  fileName: string;
  sheets: WorkbookSheet[];
}

/** The four kinds of sheet the import knows (§12.2). */
export const IMPORT_KINDS = ['timetable', 'teachers', 'classes', 'assignments'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const TEACHER_FIELDS = [
  'shortName',
  'fullName',
  'email',
  'phone',
  'school',
  'alsoAt',
] as const;
export type TeacherField = (typeof TEACHER_FIELDS)[number];

export const CLASS_FIELDS = [
  'className',
  'homeroom',
  'assistant',
  'homeroomPhone',
  'assistantPhone',
  'homeroomEmail',
  'assistantEmail',
] as const;
export type ClassField = (typeof CLASS_FIELDS)[number];

export const ASSIGNMENT_FIELDS = ['className'] as const;
export type AssignmentField = (typeof ASSIGNMENT_FIELDS)[number];

/** A list sheet's choices: the sheet (null: left out), its header row, and the column of
    each field (null: not imported). Rows and columns count from 0. */
export interface ListChoice<F extends string> {
  sheet: string | null;
  headerRow: number;
  columns: Record<F, number | null>;
}

export type TeacherSource = 'row' | 'assignments';

export interface ImportChoices {
  timetable: { sheet: string | null };
  teachers: ListChoice<TeacherField>;
  classes: ListChoice<ClassField>;
  assignments: ListChoice<AssignmentField>;
  /** Where a placed card's teacher comes from: the row under each subject, or the teaching
      assignments sheet's cell for the class and subject. */
  teacherFrom: TeacherSource;
}

/** The fields each list kind has, with the one it can't do without first. */
export const LIST_FIELDS = {
  teachers: TEACHER_FIELDS,
  classes: CLASS_FIELDS,
  assignments: ASSIGNMENT_FIELDS,
} as const;
export type ListKind = keyof typeof LIST_FIELDS;
export type FieldOf<K extends ListKind> = (typeof LIST_FIELDS)[K][number];

/** How far down a list sheet's header row may be (`Data `'s is row 6). */
const HEADER_ROWS_SEARCHED = 10;

// --- Matching names and headers ---

/** Text compared without case, accents, or punctuation: "GVCN/Form Teacher:" is
    "gvcn form teacher", and "ID GV 1S" is "id gv 1s". */
export function matchKey(text: string): string {
  return foldText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A header's parts: the whole header and each side of a "/" ("Lớp/ Class" is "lop/ class",
    "lop", and "class"), each as a `matchKey`. */
function headerParts(header: string): string[] {
  const parts = header.split('/').map(matchKey);
  return [matchKey(header), ...parts].filter((part) => part !== '');
}

interface FieldHeaders {
  /** A part of the header is exactly one of these. */
  exact?: readonly string[];
  /** The header holds one of these as whole words. */
  words?: readonly string[];
}

// The headers each field is known by: the example's (one per column, bilingual) and the
// school's (`ID GV 1S`, `Data `, `Phan cong`). Fields are tried in this order, so
// "Phó chủ nhiệm" is the assistant before "chủ nhiệm" could make it the homeroom teacher, and
// "Tên ngắn/ Short name" is the short name before "name" could make it the full name.
const FIELD_HEADERS: Record<ListKind, readonly (readonly [string, FieldHeaders])[]> = {
  teachers: [
    ['shortName', { words: ['ten ngan', 'short name', 'ten viet tat'] }],
    ['alsoAt', { words: ['truong kiem nhiem', 'kiem nhiem', 'also teaches'] }],
    ['school', { words: ['truong day chinh', 'home school', 'main school'] }],
    ['fullName', { words: ['ho ten', 'ho va ten', 'full name'], exact: ['name', 'ten'] }],
    ['email', { words: ['email', 'e mail'] }],
    ['phone', { words: ['dien thoai', 'phone', 'mobile', 'sdt'] }],
  ],
  classes: [
    ['className', { exact: ['lop', 'class', 'lop hoc', 'class name'] }],
    ['homeroomPhone', { exact: ['mob cn'] }],
    ['assistantPhone', { exact: ['mob pcn'] }],
    ['homeroomEmail', { exact: ['email cn'] }],
    ['assistantEmail', { exact: ['email pcn'] }],
    ['assistant', { exact: ['pcn'], words: ['pho chu nhiem', 'co teacher', 'assistant'] }],
    ['homeroom', { exact: ['gvcn'], words: ['chu nhiem', 'form teacher', 'homeroom'] }],
  ],
  assignments: [['className', { exact: ['lop', 'class', 'lop hoc', 'class name'] }]],
};

/** The field a header names, of the kind's fields, or null. */
export function headerField<K extends ListKind>(kind: K, header: string): FieldOf<K> | null {
  const parts = headerParts(header);
  const whole = parts[0];
  if (whole === undefined) return null;
  for (const [field, known] of FIELD_HEADERS[kind]) {
    if (known.exact?.some((name) => parts.includes(name))) return field as FieldOf<K>;
    if (known.words?.some((name) => ` ${whole} `.includes(` ${name} `))) return field as FieldOf<K>;
  }
  return null;
}

/** Each field's column in a header row, by `headerField`: the first column naming it. When
    two columns are both headed as a full name and none as a short name, as `ID GV 1S`'s two
    `HỌ TÊN` columns are, the second is the short name. */
export function headerColumns<K extends ListKind>(
  kind: K,
  header: readonly string[],
): Record<FieldOf<K>, number | null> {
  const columns: Record<string, number | null> = {};
  for (const field of LIST_FIELDS[kind]) columns[field] = null;
  const fullNames: number[] = [];
  header.forEach((text, column) => {
    const field: string | null = headerField(kind, text);
    if (field === null) return;
    if (field === 'fullName') fullNames.push(column);
    if (columns[field] === null) columns[field] = column;
  });
  if (kind === 'teachers' && columns.shortName === null && fullNames.length >= 2) {
    columns.shortName = fullNames[1] ?? null;
  }
  return columns as Record<FieldOf<K>, number | null>;
}

/** The row among the first 10 that names the most of the kind's fields (the first of
    equals), with how many it names, or null when none names the field the kind can't do
    without. */
function bestHeader(kind: ListKind, sheet: WorkbookSheet): { row: number; score: number } | null {
  const required: string = LIST_FIELDS[kind][0];
  let best: { row: number; score: number } | null = null;
  const rows = sheet.rows.slice(0, HEADER_ROWS_SEARCHED);
  for (const [index, row] of rows.entries()) {
    const columns: Record<string, number | null> = headerColumns(kind, row);
    if (columns[required] === null) continue;
    const score = Object.values(columns).filter((c) => c !== null).length;
    if (best === null || score > best.score) best = { row: index, score };
  }
  return best;
}

/** The row among the first 10 that names the most of the kind's fields (the first of
    equals), or null when none names the field the kind can't do without. */
export function findHeaderRow(kind: ListKind, sheet: WorkbookSheet): number | null {
  return bestHeader(kind, sheet)?.row ?? null;
}

/** A list kind's choices for a sheet: its header row and each field's column, or the first
    row with every field not imported when no row heads it. */
export function suggestColumns<K extends ListKind>(
  kind: K,
  sheet: WorkbookSheet | undefined,
): ListChoice<FieldOf<K>> {
  const headerRow = sheet ? findHeaderRow(kind, sheet) : null;
  const header = sheet && headerRow !== null ? (sheet.rows[headerRow] ?? []) : [];
  return {
    sheet: sheet?.name ?? null,
    headerRow: headerRow ?? 0,
    columns: headerColumns(kind, header),
  };
}

// --- The timetable sheet's layout (§12.3) ---

/** How the classes are found: the first of the first 5 rows holding a class name. */
const CLASS_HEADER_ROWS_SEARCHED = 5;

export interface TimetableColumn {
  column: number;
  name: string;
}

export interface TimetableBlockRow {
  /** The block's subject row; its teacher row is the next one. */
  row: number;
  day: Day;
  block: BlockIndex;
}

export interface TimetableLayout {
  headerRow: number;
  classes: TimetableColumn[];
  /** Header cells between the classes that try to be a class name and break the rule. */
  badClasses: TimetableColumn[];
  /** The column the classes start in, a mistyped name included. */
  firstClassColumn: number;
  /** Where the classes stop at a blank or repeated cell with class names still to come, and
      those names, which aren't read; null when none come after. */
  stopped: { column: number; lost: string[] } | null;
  periodColumn: number;
  /** Every block row whose day and block were read, in sheet order, repeats included. */
  blocks: TimetableBlockRow[];
  /** Rows with a period code but no day the import can read, on the row or above it. */
  dayless: number[];
  /** Rows with a period code on a Saturday or Sunday: the grid has five days. */
  weekend: number[];
}

const BLOCK_CODES: Readonly<Record<string, BlockIndex>> = {
  '12': 0,
  '34': 1,
  '56': 2,
  '78': 3,
  '910': 4,
};

/** `THCS12` to `THCS910`, or the bell schedule's `1-2` to `9-10`. A plain number such as
    `12` isn't a block, since `HK1` has counts beside its grid. Excel turns a typed `1-2`
    into a date, read as `02/01/2026` or `01/02/2026` by the computer's date order, so a date
    whose day and month are a block's two periods, either way round, is that block. */
export function blockFromCode(text: string): BlockIndex | null {
  const cell = text.trim();
  const date = /^(\d{2})\/(\d{2})\/\d{4}$/.exec(cell);
  if (date) {
    const [low, high] = [Number(date[1]), Number(date[2])].sort((a, b) => a - b);
    return BLOCK_CODES[`${low}${high}`] ?? null;
  }
  const code =
    /^THCS\s*(\d+)$/i.exec(cell)?.[1] ?? /^(\d+)\s*-\s*(\d+)$/.exec(cell)?.slice(1).join('');
  return code === undefined ? null : (BLOCK_CODES[code] ?? null);
}

// Day names as the sample's `HK1` and the app's export write them, and the `Th2`–`Th6` codes.
const DAY_WORDS: readonly (readonly string[])[] = [
  ['thu hai', 'monday', 'thu 2'],
  ['thu ba', 'tuesday', 'thu 3'],
  ['thu tu', 'wednesday', 'thu 4'],
  ['thu nam', 'thursday', 'thu 5'],
  ['thu sau', 'friday', 'thu 6'],
];

const WEEKEND_WORDS: readonly string[] = ['thu bay', 'saturday', 'thu 7', 'chu nhat', 'sunday'];

/** The day a cell names: `Th2`–`Th6`, `T2`–`T6`, or a day name such as `Thứ Hai / Monday`. */
export function dayFromText(text: string): Day | null {
  const key = matchKey(text);
  const code = /^th?([2-6])$/.exec(key.replace(/ /g, ''));
  if (code) return (Number(code[1]) - 2) as Day;
  for (const day of DAYS) {
    if (DAY_WORDS[day]?.some((word) => ` ${key} `.includes(` ${word} `))) return day;
  }
  return null;
}

/** True for a cell naming a day past Friday: `Th7`, `T7`, `CN`, or a name such as `Thứ Bảy /
    Saturday`. */
function isWeekend(text: string): boolean {
  const key = matchKey(text);
  if (/^(th?7|cn)$/.test(key.replace(/ /g, ''))) return true;
  return WEEKEND_WORDS.some((word) => ` ${key} `.includes(` ${word} `));
}

/** A header cell that's trying to be a class name, a grade then letters, as `6Z1` is. */
const CLASS_LIKE = /^\d{1,2}\s*[A-Za-z]/;

/** Where a timetable sheet's classes and blocks are, or null when it has no class header
    row, no period column, or no block rows. */
export function readTimetableLayout(sheet: WorkbookSheet): TimetableLayout | null {
  const headerRow = sheet.rows
    .slice(0, CLASS_HEADER_ROWS_SEARCHED)
    .findIndex((row) => row.some((cell) => parseClassName(cell) !== null));
  if (headerRow === -1) return null;
  const header = sheet.rows[headerRow] ?? [];
  // The first class name, or the mistyped ones just before it.
  let first = header.findIndex((cell) => parseClassName(cell) !== null);
  while (first > 0 && CLASS_LIKE.test(header[first - 1] ?? '')) first--;

  // The class columns run until a cell that isn't a class name or repeats one, so `HK1`'s
  // "Tiết" and counting columns after them are never read. A cell that's a mistyped class
  // name, as `6Z1` is, is noted and passed over, so the classes after it still come in.
  const classes: TimetableColumn[] = [];
  const badClasses: TimetableColumn[] = [];
  const seen = new Set<string>();
  let stop = header.length;
  for (let column = first; column < header.length; column++) {
    const cell = header[column] ?? '';
    const parsed = parseClassName(cell);
    if (parsed === null && CLASS_LIKE.test(cell)) {
      badClasses.push({ column, name: cell });
      continue;
    }
    if (parsed === null || seen.has(parsed.name)) {
      stop = column;
      break;
    }
    seen.add(parsed.name);
    classes.push({ column, name: parsed.name });
  }
  const lost = [
    ...new Set(header.slice(stop).flatMap((cell) => parseClassName(cell)?.name ?? [])),
  ].filter((name) => !seen.has(name));
  const stopped = lost.length > 0 ? { column: stop, lost } : null;

  // The period column is the column, left of the classes, holding the most block codes.
  const counts = Array.from(
    { length: first },
    (_, column) => sheet.rows.filter((row) => blockFromCode(row[column] ?? '') !== null).length,
  );
  const most = Math.max(0, ...counts);
  if (most === 0) return null;
  const periodColumn = counts.indexOf(most);

  // A row's day is the one named left of the classes, or else the last one named above it,
  // so a day written once, unmerged, still covers the rows under it.
  const blocks: TimetableBlockRow[] = [];
  const dayless: number[] = [];
  const weekend: number[] = [];
  let day: Day | 'weekend' | null = null;
  sheet.rows.forEach((row, index) => {
    if (index <= headerRow) return;
    const left = row.slice(0, first).filter((_, column) => column !== periodColumn);
    const named = left.map(dayFromText).find((d) => d !== null);
    if (named !== undefined && named !== null) day = named;
    else if (left.some(isWeekend)) day = 'weekend';
    const block = blockFromCode(row[periodColumn] ?? '');
    if (block === null) return;
    if (day === null) dayless.push(index);
    else if (day === 'weekend') weekend.push(index);
    else blocks.push({ row: index, day, block });
  });
  if (blocks.length === 0 && dayless.length === 0 && weekend.length === 0) return null;
  return {
    headerRow,
    classes,
    badClasses,
    firstClassColumn: first,
    stopped,
    periodColumn,
    blocks,
    dayless,
    weekend,
  };
}

// --- Suggestions (§12.2) ---

// The sheet names each kind is suggested by first: the example's and the school's.
const KIND_SHEET_NAMES: Record<ImportKind, readonly string[]> = {
  timetable: ['tkb tong hop', 'hk1'],
  teachers: ['giao vien', 'id gv 1s', 'teachers'],
  classes: ['data', 'classes', 'lop', 'lop hoc'],
  assignments: ['phan cong'],
};

/** The sheet a kind would choose: the first named as the example or the school names it,
    then the first laid out for it (only for the timetable, teachers, and classes: a teaching
    assignments sheet looks like a class list). Visible sheets come before hidden ones. */
function suggestSheet(
  kind: ImportKind,
  sheets: readonly WorkbookSheet[],
): WorkbookSheet | undefined {
  const ordered = sheetOptions(sheets);
  const names = KIND_SHEET_NAMES[kind];
  const named = ordered.find((s) => names.includes(matchKey(s.name)));
  if (named) return named;
  switch (kind) {
    case 'timetable':
      return ordered.find((s) => readTimetableLayout(s) !== null);
    case 'teachers':
    case 'classes':
      // A list of this kind names its required field and at least one other.
      return ordered.find((s) => (bestHeader(kind, s)?.score ?? 0) >= 2);
    case 'assignments':
      return undefined;
  }
}

/** The import's starting choices for a workbook: a sheet per kind (or none), each list's
    header row and columns, and the teacher from the row under each subject. */
export function suggestImport(workbook: WorkbookData): ImportChoices {
  const timetable = suggestSheet('timetable', workbook.sheets);
  return {
    timetable: { sheet: timetable?.name ?? null },
    teachers: suggestColumns('teachers', suggestSheet('teachers', workbook.sheets)),
    classes: suggestColumns('classes', suggestSheet('classes', workbook.sheets)),
    assignments: suggestColumns('assignments', suggestSheet('assignments', workbook.sheets)),
    teacherFrom: 'row',
  };
}

/** The sheets in the order a Sheet dropdown offers them, and suggestions look at them:
    workbook order, hidden ones last. */
export function sheetOptions(sheets: readonly WorkbookSheet[]): WorkbookSheet[] {
  return [...sheets.filter((s) => !s.hidden), ...sheets.filter((s) => s.hidden)];
}

// --- Changing the choices on the Import screen (§12.2, layout spec "Import screen") ---

export const FIELD_LABELS: { [K in ListKind]: Record<FieldOf<K>, string> } = {
  teachers: {
    shortName: 'Short name',
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone',
    school: 'Home school',
    alsoAt: 'Also teaches at',
  },
  classes: {
    className: 'Class',
    homeroom: 'Homeroom teacher',
    assistant: 'Assistant homeroom teacher',
    homeroomPhone: 'Homeroom phone',
    assistantPhone: 'Assistant phone',
    homeroomEmail: 'Homeroom email',
    assistantEmail: 'Assistant email',
  },
  assignments: { className: 'Class' },
};

/** What a list kind's required column holds, for the message when it's left out. */
const REQUIRED_COLUMN: Record<ListKind, string> = {
  teachers: 'short names',
  classes: 'class names',
  assignments: 'class names',
};

/** The sheet chosen by name, or none for a kind left out. */
export function findSheet(workbook: WorkbookData, name: string | null): WorkbookSheet | undefined {
  return name === null ? undefined : workbook.sheets.find((s) => s.name === name);
}

/** True when two sets of choices would import the same way, so a result Test gave for one
    holds for the other. */
export function sameChoices(a: ImportChoices, b: ImportChoices): boolean {
  if (a.timetable.sheet !== b.timetable.sheet || a.teacherFrom !== b.teacherFrom) return false;
  return (Object.keys(LIST_FIELDS) as ListKind[]).every((kind) => {
    const x: ListChoice<string> = a[kind];
    const y: ListChoice<string> = b[kind];
    return (
      x.sheet === y.sheet &&
      x.headerRow === y.headerRow &&
      LIST_FIELDS[kind].every((field: string) => x.columns[field] === y.columns[field])
    );
  });
}

/** The kind's new sheet (null: left out), with its columns started again from the
    suggestions. With no teaching assignments sheet, a card's teacher comes from the row
    under each subject, the only choice left. */
export function chooseListSheet(
  workbook: WorkbookData,
  choices: ImportChoices,
  kind: ListKind,
  name: string | null,
): ImportChoices {
  const next = { ...choices, [kind]: suggestColumns(kind, findSheet(workbook, name)) };
  return kind === 'assignments' && name === null ? { ...next, teacherFrom: 'row' } : next;
}

/** The kind's new header row, with its columns suggested from that row's headers, since
    the Column dropdowns offer that row's cells. */
export function chooseHeaderRow(
  workbook: WorkbookData,
  choices: ImportChoices,
  kind: ListKind,
  headerRow: number,
): ImportChoices {
  const sheet = findSheet(workbook, choices[kind].sheet);
  const columns = headerColumns(kind, sheet?.rows[headerRow] ?? []);
  return { ...choices, [kind]: { ...choices[kind], headerRow, columns } };
}

/** A field's new column (null: not imported). */
export function chooseColumn(
  choices: ImportChoices,
  kind: ListKind,
  field: string,
  column: number | null,
): ImportChoices {
  const list = choices[kind];
  return { ...choices, [kind]: { ...list, columns: { ...list.columns, [field]: column } } };
}

/** What the Column dropdowns offer: the header row's cells that hold something, as
    `H · Lớp`. */
export function columnOptions(
  sheet: WorkbookSheet | undefined,
  headerRow: number,
): { column: number; label: string }[] {
  return (sheet?.rows[headerRow] ?? []).flatMap((text, column) =>
    text === '' ? [] : [{ column, label: `${columnLetters(column + 1)} · ${text}` }],
  );
}

/** The first three values under a column's header, skipping empty cells, joined by ", ". */
export function firstValues(sheet: WorkbookSheet, headerRow: number, column: number): string {
  const values: string[] = [];
  for (let row = headerRow + 1; row < sheet.rows.length && values.length < 3; row++) {
    const text = sheet.rows[row]?.[column] ?? '';
    if (text !== '') values.push(text);
  }
  return values.join(', ');
}

/** The message under a required field left at Not imported, or null. A sheet left out
    needs no columns, nor does a teaching assignments sheet while a card's teacher comes from
    the row under each subject, since it isn't read then. */
export function requiredColumnMessage(kind: ListKind, choices: ImportChoices): string | null {
  const list: ListChoice<string> = choices[kind];
  const required = LIST_FIELDS[kind][0];
  if (list.sheet === null || list.columns[required] !== null) return null;
  if (kind === 'assignments' && choices.teacherFrom !== 'assignments') return null;
  return `Choose the column with the ${REQUIRED_COLUMN[kind]}.`;
}

/** What the Timetable section says it found in a sheet: "34 classes, Monday to Friday, 5
    blocks a day". */
export function timetableFound(sheet: WorkbookSheet): string {
  const layout = readTimetableLayout(sheet);
  if (!layout) return "This sheet isn't laid out as a timetable.";
  const days = DAYS.filter((day) => layout.blocks.some((b) => b.day === day));
  const [first, last] = [days[0], days.at(-1)];
  const classes = plural(layout.classes.length, 'class', 'classes');
  if (first === undefined || last === undefined) return `${classes}, with no day or block read`;
  const names =
    first === last
      ? DAY_NAMES[first]
      : last - first === days.length - 1
        ? `${DAY_NAMES[first]} to ${DAY_NAMES[last]}`
        : joinList(
            days.map((day) => DAY_NAMES[day]),
            'and',
          );
  const perDay = days.map(
    (day) => new Set(layout.blocks.filter((b) => b.day === day).map((b) => b.block)).size,
  );
  return `${classes}, ${names}, ${plural(Math.max(...perDay), 'block', 'blocks')} a day`;
}

/** A new profile's starting name: the file's, without `.xlsx`. */
export function importProfileName(fileName: string): string {
  return fileName.replace(/\.xlsx$/i, '');
}
