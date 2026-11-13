import { classesByGrade } from './classes';
import type { Card, Id, SchoolClass, Subject, Teacher, TimetableFile } from './model';
import { formColorFields, subjectColorChoice, type SubjectColorChoice } from './subjectColor';
import { checkUniqueName, joinList, matchesSearch, plural, type NameCheck } from './text';

// The subject list (DM-4, SYSTEM_DESIGN §10.2): renaming and deleting subjects from the
// Subjects page. Adding one is `addSubject` in lists.ts, shared with the card form's
// "New subject…".

export type SubjectResult =
  { ok: true; file: TimetableFile; subjectId: Id } | { ok: false; error: string };

/** A subject name no other subject has: case doesn't count, accents do. `selfId` is the
    subject being renamed, whose own name isn't taken. */
export function checkSubjectName(
  file: TimetableFile,
  input: string,
  selfId: Id | null = null,
): NameCheck {
  return checkUniqueName(file.subjects, 'subject', input, selfId);
}

/** What custom colors that aren't '#rrggbb' are told. The subject form's color inputs
    can't give one; a caller passing its own could. */
export const BAD_COLOR = 'Colors are written as #rrggbb, such as #1b3c7a.';

function sameColors(a: Subject, b: Subject): boolean {
  return (
    a.colorKey === b.colorKey &&
    a.colorSource === b.colorSource &&
    a.customColors?.bg === b.customColors?.bg &&
    a.customColors?.ink === b.customColors?.ink
  );
}

/** Renames a subject and sets its colors from the subject form (SYSTEM_DESIGN §10.5).
    Without `colors` it keeps the choice it has. Colors from the name follow the new name; a
    picked palette or custom colors stay. Cards point at the subject by id, so the name and
    colors show everywhere at once. */
export function editSubject(
  file: TimetableFile,
  subjectId: Id,
  nameInput: string,
  colors?: SubjectColorChoice,
): SubjectResult {
  const subject = file.subjects.find((s) => s.id === subjectId);
  if (!subject) return { ok: false, error: "That subject isn't in the list any more." };
  const check = checkSubjectName(file, nameInput, subjectId);
  if (!check.ok) return check;
  const fields = formColorFields(subject, check.name, colors ?? subjectColorChoice(subject));
  if (!fields) return { ok: false, error: BAD_COLOR };
  const renamed: Subject = { id: subject.id, name: check.name, ...fields };
  // Nothing changed changes nothing, so the file isn't saved again or checked again.
  if (renamed.name === subject.name && sameColors(renamed, subject)) {
    return { ok: true, subjectId, file };
  }
  return {
    ok: true,
    subjectId,
    file: { ...file, subjects: file.subjects.map((s) => (s === subject ? renamed : s)) },
  };
}

/** What deleting a subject would do, for the question before it (DM-4). */
export interface SubjectDeletion {
  /** The teachers whose subject limits name it, in teacher-list order, with how many of
      their limits do (switched off or not). Those limits are deleted with it. */
  limits: { teacher: Teacher; count: number }[];
  /** The subject's cards, deleted with it. */
  cards: Card[];
  /** How many times those cards are on the grid. */
  placements: number;
  /** The classes they're placed in, in class-bar order. */
  classes: SchoolClass[];
}

/** The teachers whose subject limits name a subject, as `SubjectDeletion.limits`. */
function subjectLimits(file: TimetableFile, subjectId: Id): SubjectDeletion['limits'] {
  return file.teachers.flatMap((teacher) => {
    const count = teacher.conditions.filter(
      (c) => c.type === 'subjectLimit' && c.subjectId === subjectId,
    ).length;
    return count > 0 ? [{ teacher, count }] : [];
  });
}

export function subjectDeletion(file: TimetableFile, subjectId: Id): SubjectDeletion {
  const limits = subjectLimits(file, subjectId);
  const cards = file.cards.filter((c) => c.subjectId === subjectId);
  const cardIds = new Set(cards.map((c) => c.id));
  const placed = file.placements.filter((p) => cardIds.has(p.cardId));
  const classIds = new Set(placed.map((p) => p.classId));
  const classes = classesByGrade(file.classes)
    .flatMap((g) => g.classes)
    .filter((c) => classIds.has(c.id));
  return { limits, cards, placements: placed.length, classes };
}

/** "Thầy Hiếu's subject limit on Tin học goes too.", naming the teachers whose subject
    limits are deleted with the subject, or null when there are none. */
function limitsLine(limits: SubjectDeletion['limits'], subjectName: string): string | null {
  if (limits.length === 0) return null;
  const many = limits.length > 1 || limits[0]!.count > 1;
  const owners = joinList(
    limits.map((l) => `${l.teacher.shortName}'s`),
    'and',
  );
  return `${owners} ${many ? 'subject limits' : 'subject limit'} on ${subjectName} ${
    many ? 'go' : 'goes'
  } too.`;
}

/** What the delete question says (DM-4, layout spec "Delete questions"): how many cards
    of the subject there are, how many times they're on the grid and in which classes, that
    they go with it, which teachers' subject limits go too, and that it can't be undone.
    With no cards, that nothing uses it, or that no cards do when a limit names it. */
export function subjectDeletionLines(file: TimetableFile, subjectId: Id): string[] {
  const subject = file.subjects.find((s) => s.id === subjectId);
  if (!subject) return [];
  const { limits, cards, placements, classes } = subjectDeletion(file, subjectId);
  const ending = [limitsLine(limits, subject.name), "This can't be undone."].filter(
    (line) => line !== null,
  );
  if (cards.length === 0) {
    return [
      limits.length > 0 ? `No cards use ${subject.name}.` : `Nothing uses ${subject.name}.`,
      ...ending,
    ];
  }
  const one = cards.length === 1;
  const ofSubject = `${plural(cards.length, 'card', 'cards')} of ${subject.name}`;
  if (placements === 0) {
    return [
      one
        ? `There's ${ofSubject}, and it isn't on the grid. The card is deleted.`
        : `There are ${ofSubject}, and none is on the grid. The cards are deleted.`,
      ...ending,
    ];
  }
  const times = placements === 1 ? 'once' : `${placements} times`;
  const where = joinList(
    classes.map((c) => c.name),
    'and',
  );
  // Several cards placed once in all have one place between them, not one each.
  const goes = one
    ? `The card and its ${placements === 1 ? 'place' : 'places'} on the grid are deleted.`
    : placements === 1
      ? 'The cards and that place on the grid are deleted.'
      : 'The cards and their places on the grid are deleted.';
  return [
    `${ofSubject} ${one ? 'is' : 'are'} on the grid ${times}, in ${where}. ${goes}`,
    ...ending,
  ];
}

/** Deletes a subject with its cards, their placements, and the teachers' subject limits
    that name it, switched on or off (changed 2026-10-27 from refusing, SYSTEM_DESIGN §10.5).
    Teachers with no such limit keep the same object. A subject that's gone changes nothing. */
export function deleteSubject(file: TimetableFile, subjectId: Id): TimetableFile {
  if (!file.subjects.some((s) => s.id === subjectId)) return file;
  const cardIds = new Set(file.cards.filter((c) => c.subjectId === subjectId).map((c) => c.id));
  const names = (c: Teacher['conditions'][number]) =>
    c.type === 'subjectLimit' && c.subjectId === subjectId;
  return {
    ...file,
    subjects: file.subjects.filter((s) => s.id !== subjectId),
    teachers: file.teachers.map((t) =>
      t.conditions.some(names) ? { ...t, conditions: t.conditions.filter((c) => !names(c)) } : t,
    ),
    cards: file.cards.filter((c) => !cardIds.has(c.id)),
    placements: file.placements.filter((p) => !cardIds.has(p.cardId)),
  };
}

/** A row of the Subjects page. */
export interface SubjectRow {
  subject: Subject;
  /** How many cards have the subject. */
  cards: number;
}

/** The Subjects page: subjects in subject order matching the search by name, ignoring case
    and accents (DM-4). */
export function subjectRows(file: TimetableFile, query: string): SubjectRow[] {
  const cards = new Map<Id, number>();
  for (const c of file.cards) cards.set(c.subjectId, (cards.get(c.subjectId) ?? 0) + 1);
  return file.subjects
    .filter((subject) => query.trim() === '' || matchesSearch(subject.name, query))
    .map((subject) => ({ subject, cards: cards.get(subject.id) ?? 0 }));
}
