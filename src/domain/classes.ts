import type { AppState } from './appState';
import { parseClassName, type ParsedClassName } from './className';
import { placementPeriods } from './placements';
import {
  TRACKS,
  type Grade,
  type Id,
  type SchoolClass,
  type Teacher,
  type TimetableFile,
} from './model';
import { matchesSearch, plural } from './text';

// The class list (DM-2, SYSTEM_DESIGN §10.2). The class bar's "New class" adds a class by
// name only; the Classes page adds and edits one with its teachers. On screen the
// workbook's form teacher (GVCN) and co-teacher (PCN) are the homeroom teacher and the
// assistant homeroom teacher (renamed 2026-10-26 at the user's request); the file keeps
// `formTeacherId` and `coTeacherId`.

/** What the class form fills in. The homeroom teacher is required there and the assistant
    is optional (2026-10-26, at the user's request). */
export interface ClassFields {
  name: string;
  formTeacherId: Id | null;
  coTeacherId: Id | null;
}

/** The form field an error belongs to. */
export type ClassField = 'name' | 'formTeacher' | 'coTeacher';

type ClassError = { ok: false; error: string; field: ClassField };

export type AddClassResult = { ok: true; state: AppState; classId: Id } | ClassError;

export type ClassResult = { ok: true; file: TimetableFile; classId: Id } | ClassError;

type NameCheck = { ok: true; parsed: ParsedClassName } | ClassError;

/** The class-name rule. `selfId` is the class being edited, whose own name isn't taken. */
function checkClassName(file: TimetableFile, input: string, selfId: Id | null = null): NameCheck {
  const name = input.trim();
  if (name === '') return { ok: false, field: 'name', error: 'Enter a class name.' };
  const parsed = parseClassName(name);
  if (!parsed) {
    const upper = name.toUpperCase();
    return {
      ok: false,
      field: 'name',
      error: parseClassName(upper)
        ? `Write the track in capital letters: ${upper}.`
        : 'Use a grade, a track (A, AA, CE, B, or BA), and a section number, as in 6A1 or 8CE2.',
    };
  }
  if (!file.grades.includes(parsed.grade)) {
    return {
      ok: false,
      field: 'name',
      error: `There's no Grade ${parsed.grade} yet. Add it with Grades on the Classes page.`,
    };
  }
  if (file.classes.some((c) => c.id !== selfId && c.name === parsed.name)) {
    return { ok: false, field: 'name', error: `There's already a class called ${parsed.name}.` };
  }
  return { ok: true, parsed };
}

type TeachersCheck =
  { ok: true; teachers: Pick<SchoolClass, 'formTeacherId' | 'coTeacherId'> } | ClassError;

/** The class form's teachers: a homeroom teacher, and an assistant who isn't the same
    teacher, both from the teacher list. */
function checkTeachers(file: TimetableFile, fields: ClassFields): TeachersCheck {
  const exists = (teacherId: Id) => file.teachers.some((t) => t.id === teacherId);
  const { formTeacherId, coTeacherId } = fields;
  if (formTeacherId === null) {
    return { ok: false, field: 'formTeacher', error: 'Choose a homeroom teacher.' };
  }
  if (!exists(formTeacherId)) {
    return { ok: false, field: 'formTeacher', error: "That teacher isn't in the list any more." };
  }
  if (coTeacherId === null) return { ok: true, teachers: { formTeacherId } };
  if (!exists(coTeacherId)) {
    return { ok: false, field: 'coTeacher', error: "That teacher isn't in the list any more." };
  }
  if (coTeacherId === formTeacherId) {
    return {
      ok: false,
      field: 'coTeacher',
      error: 'Pick a teacher other than the homeroom teacher.',
    };
  }
  return { ok: true, teachers: { formTeacherId, coTeacherId } };
}

/** Adds a class and puts it on screen. Grade, track, and section come from the name. The
    class bar's "New class" gives only a name; the class form gives the teachers too, and
    then a homeroom teacher is required. */
export function addClass(
  state: AppState,
  input: string | ClassFields,
  newId: () => Id = () => crypto.randomUUID(),
): AddClassResult {
  const fields = typeof input === 'string' ? null : input;
  const check = checkClassName(state.file, typeof input === 'string' ? input : input.name);
  if (!check.ok) return check;
  const teachers = fields ? checkTeachers(state.file, fields) : null;
  if (teachers && !teachers.ok) return teachers;
  const added: SchoolClass = { id: newId(), ...check.parsed, ...teachers?.teachers };
  return {
    ok: true,
    classId: added.id,
    state: {
      file: { ...state.file, classes: [...state.file.classes, added] },
      selectedClassId: added.id,
    },
  };
}

/** Changes a class's name and teachers, keeping its id, so its placements and grid stay as
    they are. Grade, track, and section are read again from the name. */
export function editClass(file: TimetableFile, classId: Id, fields: ClassFields): ClassResult {
  const current = file.classes.find((c) => c.id === classId);
  if (!current) {
    return { ok: false, field: 'name', error: "That class isn't in the list any more." };
  }
  const check = checkClassName(file, fields.name, classId);
  if (!check.ok) return check;
  const teachers = checkTeachers(file, fields);
  if (!teachers.ok) return teachers;
  // Nothing changed, so the file isn't saved again or checked again (as for rooms and
  // subjects).
  const { formTeacherId, coTeacherId } = teachers.teachers;
  if (
    check.parsed.name === current.name &&
    formTeacherId === current.formTeacherId &&
    coTeacherId === current.coTeacherId
  ) {
    return { ok: true, classId, file };
  }
  const edited: SchoolClass = { id: classId, ...check.parsed, ...teachers.teachers };
  return {
    ok: true,
    classId,
    file: { ...file, classes: file.classes.map((c) => (c === current ? edited : c)) },
  };
}

/** What the delete question says (DM-2, layout spec "Delete questions"): how many periods
    are placed in the class and that they go with it while the cards stay, or that nothing
    is placed, and that it can't be undone. */
export function classDeletionLines(file: TimetableFile, classId: Id): string[] {
  const schoolClass = file.classes.find((c) => c.id === classId);
  if (!schoolClass) return [];
  const periods = placedPeriods(file, classId);
  const name = schoolClass.name;
  return [
    periods === 0
      ? `Nothing is placed in ${name}.`
      : `${plural(periods, 'period is', 'periods are')} placed in ${name}. ${
          periods === 1 ? "It'll" : "They'll"
        } be taken off its grid; the cards stay in the pool.`,
    "This can't be undone.",
  ];
}

/** Deletes a class and its placements. The cards stay in the pool; their classes come from
    their placements, so the class is gone from them by itself. When the class was on
    screen, the first class by grade takes its place, as when the app opens. */
export function deleteClass(state: AppState, classId: Id): AppState {
  return deleteClasses(state, [classId]);
}

/** Deletes classes and their placements, as `deleteClass` does for one; deleting a grade
    deletes its classes this way (DM-8). */
export function deleteClasses(state: AppState, classIds: readonly Id[]): AppState {
  const { file } = state;
  const gone = new Set(classIds);
  if (!file.classes.some((c) => gone.has(c.id))) return state;
  const next: TimetableFile = {
    ...file,
    classes: file.classes.filter((c) => !gone.has(c.id)),
    placements: file.placements.filter((p) => !gone.has(p.classId)),
  };
  // The first class by grade, as `createAppState` picks. Calling it would make this module
  // and appState.ts import each other.
  const selectedClassId =
    state.selectedClassId !== null && gone.has(state.selectedClassId)
      ? (classesByGrade(next.classes)[0]?.classes[0]?.id ?? null)
      : state.selectedClassId;
  return { file: next, selectedClassId };
}

/** Periods placed in each class: 2 for each full block and 1 for each half (TB-4). A
    class with nothing placed has no entry. */
export function placedPeriodsByClass(file: TimetableFile): Map<Id, number> {
  const placed = new Map<Id, number>();
  for (const p of file.placements) {
    placed.set(p.classId, (placed.get(p.classId) ?? 0) + placementPeriods(p));
  }
  return placed;
}

/** Periods placed in one class. */
export function placedPeriods(file: TimetableFile, classId: Id): number {
  return placedPeriodsByClass(file).get(classId) ?? 0;
}

export interface GradeGroup {
  grade: Grade;
  classes: SchoolClass[];
}

/** Classes grouped by grade, each group in track order (A, AA, CE, B, BA) and then by
    section, as the workbook lists them. */
export function classesByGrade(classes: readonly SchoolClass[]): GradeGroup[] {
  const sorted = [...classes].sort(
    (a, b) =>
      a.grade - b.grade ||
      TRACKS.indexOf(a.track) - TRACKS.indexOf(b.track) ||
      a.section - b.section,
  );
  const groups: GradeGroup[] = [];
  for (const c of sorted) {
    const last = groups.at(-1);
    if (last?.grade === c.grade) last.classes.push(c);
    else groups.push({ grade: c.grade, classes: [c] });
  }
  return groups;
}

/** A row of the Classes page. */
export interface ClassRow {
  schoolClass: SchoolClass;
  homeroom?: Teacher;
  assistant?: Teacher;
  /** Periods placed, out of `WEEKLY_PERIODS`. */
  placed: number;
}

/** The Classes page: classes in class-bar order matching the search by class name or
    either teacher's short or full name, ignoring case and accents (DM-2). */
export function classRows(file: TimetableFile, query: string): ClassRow[] {
  const teachers = new Map(file.teachers.map((t) => [t.id, t]));
  const placed = placedPeriodsByClass(file);
  const teacher = (id: Id | undefined) => (id === undefined ? undefined : teachers.get(id));
  return classesByGrade(file.classes)
    .flatMap((g) => g.classes)
    .map((schoolClass) => ({
      schoolClass,
      homeroom: teacher(schoolClass.formTeacherId),
      assistant: teacher(schoolClass.coTeacherId),
      placed: placed.get(schoolClass.id) ?? 0,
    }))
    .filter(
      (row) =>
        query.trim() === '' ||
        [
          row.schoolClass.name,
          row.homeroom?.shortName,
          row.homeroom?.fullName,
          row.assistant?.shortName,
          row.assistant?.fullName,
        ].some((text) => text && matchesSearch(text, query)),
    );
}
