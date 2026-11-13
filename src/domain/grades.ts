import type { AppState } from './appState';
import { classesByGrade, deleteClasses, placedPeriodsByClass } from './classes';
import { MAX_GRADE, MIN_GRADE, type Grade, type SchoolClass, type TimetableFile } from './model';
import { plural } from './text';

// The grade list (DM-8, SYSTEM_DESIGN §13.3). A grade is a number from 1 to 12, and a
// class's grade still comes from its name, so editing a grade renames its classes and
// deleting one deletes them. The list is kept in number order.

/** How a grade is named on screen: "Grade 10". */
export function gradeLabel(grade: Grade): string {
  return `Grade ${grade}`;
}

export type GradeResult =
  { ok: true; file: TimetableFile; grade: Grade } | { ok: false; error: string };

type GradeCheck = { ok: true; grade: Grade } | { ok: false; error: string };

/** The grade form's field: a whole number from 1 to 12 that no other grade has. `self` is
    the grade being edited, which may keep its number. */
export function checkGrade(file: TimetableFile, input: string, self: Grade | null): GradeCheck {
  const text = input.trim();
  const grade = /^\d{1,2}$/.test(text) ? Number(text) : NaN;
  if (!(grade >= MIN_GRADE && grade <= MAX_GRADE)) {
    return { ok: false, error: `Enter a grade from ${MIN_GRADE} to ${MAX_GRADE}.` };
  }
  if (grade !== self && file.grades.includes(grade)) {
    return { ok: false, error: `There's already a ${gradeLabel(grade)}.` };
  }
  return { ok: true, grade };
}

const inOrder = (grades: readonly Grade[]) => [...grades].sort((a, b) => a - b);

/** Adds a grade, in number order. */
export function addGrade(file: TimetableFile, input: string): GradeResult {
  const check = checkGrade(file, input, null);
  if (!check.ok) return check;
  return {
    ok: true,
    grade: check.grade,
    file: { ...file, grades: inOrder([...file.grades, check.grade]) },
  };
}

/** A class's name in another grade: the same track and section, as 6A1 becomes 10A1. */
function renamed(schoolClass: SchoolClass, grade: Grade): SchoolClass {
  const { track, section } = schoolClass;
  return { ...schoolClass, name: `${grade}${track}${section}`, grade };
}

/** Changes a grade's number and renames its classes to match, keeping their ids, so their
    grids, teachers, and the class on screen stay as they are. No class can already have a
    new name, since no class is in a grade that isn't on the list. An unchanged number
    gives back the same file, so nothing is saved or checked again. */
export function editGrade(file: TimetableFile, grade: Grade, input: string): GradeResult {
  if (!file.grades.includes(grade)) {
    return { ok: false, error: "That grade isn't in the list any more." };
  }
  const check = checkGrade(file, input, grade);
  if (!check.ok) return check;
  const next = check.grade;
  if (next === grade) return { ok: true, grade, file };
  return {
    ok: true,
    grade: next,
    file: {
      ...file,
      grades: inOrder(file.grades.map((g) => (g === grade ? next : g))),
      classes: file.classes.map((c) => (c.grade === grade ? renamed(c, next) : c)),
    },
  };
}

/** The grade's classes in class-bar order. */
function classesOf(file: TimetableFile, grade: Grade): SchoolClass[] {
  return classesByGrade(file.classes.filter((c) => c.grade === grade))[0]?.classes ?? [];
}

/** A row of the Grades dialog. */
export interface GradeRow {
  grade: Grade;
  /** How many classes it has. */
  classes: number;
}

/** The Grades dialog's list: every grade in number order with its class count. */
export function gradeRows(file: TimetableFile): GradeRow[] {
  return file.grades.map((grade) => ({
    grade,
    classes: file.classes.filter((c) => c.grade === grade).length,
  }));
}

/** The grade form's line under the field when editing a grade with classes: "Its 4
    classes are renamed to match, so 6A1 becomes 10A1.", naming an example only once a new
    number that can be used is typed. Null for a grade with no classes. */
export function gradeRenameLine(file: TimetableFile, grade: Grade, input: string): string | null {
  const classes = classesOf(file, grade);
  const first = classes[0];
  if (!first) return null;
  const line =
    classes.length === 1
      ? 'Its class is renamed to match'
      : `Its ${classes.length} classes are renamed to match`;
  const check = checkGrade(file, input, grade);
  if (!check.ok || check.grade === grade) return `${line}.`;
  return `${line}, so ${first.name} becomes ${renamed(first, check.grade).name}.`;
}

/** What the delete question says (DM-8, SYSTEM_DESIGN §13.5): the classes that go, how
    many periods are taken off their grids while the cards stay, or that the grade has no
    classes, and that it can't be undone. */
export function gradeDeletionLines(file: TimetableFile, grade: Grade): string[] {
  const classes = classesOf(file, grade);
  const undone = "This can't be undone.";
  if (classes.length === 0) return [`${gradeLabel(grade)} has no classes.`, undone];
  const placedIn = placedPeriodsByClass(file);
  const periods = classes.reduce((sum, c) => sum + (placedIn.get(c.id) ?? 0), 0);
  const names = classes.map((c) => c.name).join(', ');
  const one = classes.length === 1;
  const lines = [
    one
      ? `Its class ${names} goes with it.`
      : `Its ${classes.length} classes go with it: ${names}.`,
  ];
  if (periods > 0) {
    lines.push(
      `${plural(periods, 'period', 'periods')} placed on ${one ? 'its grid' : 'their grids'} ${
        periods === 1 ? 'is' : 'are'
      } taken off; the cards stay in the pool.`,
    );
  }
  return [...lines, undone];
}

/** Deletes a grade with its classes and their placements, as deleting each class would;
    the cards stay in the pool. When the class on screen was in it, the first class by
    grade takes its place. */
export function deleteGrade(state: AppState, grade: Grade): AppState {
  if (!state.file.grades.includes(grade)) return state;
  const gone = state.file.classes.filter((c) => c.grade === grade).map((c) => c.id);
  const next = deleteClasses(state, gone);
  return { ...next, file: { ...next.file, grades: next.file.grades.filter((g) => g !== grade) } };
}

/** The grades the classes are in, in number order, as a file saved before the grade list
    gets them (file format 6). */
export function gradesOf(classes: readonly Pick<SchoolClass, 'grade'>[]): Grade[] {
  return inOrder([...new Set(classes.map((c) => c.grade))]);
}
