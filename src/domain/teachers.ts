import {
  cardClasses,
  cardView,
  clearCardField,
  clearCardFieldPreview,
  mergeLines,
  poolCards,
  type CardView,
  type FieldClearing,
} from './cards';
import { classesByGrade } from './classes';
import type { HomeSchool, Id, Subject, Teacher, TimetableFile } from './model';
import { placementPeriods } from './placements';
import { cleanName, joinList, matchesSearch, sameName } from './text';

// The teacher list (DM-1, SYSTEM_DESIGN §9.4): adding, editing, and deleting teachers from
// the Teachers page. The card form's "New teacher…" adds one by short name through
// `addTeacher` too (see lists.ts).

/** What the teacher form fills in. Empty text means not set. */
export interface TeacherFields {
  shortName: string;
  fullName?: string;
  email?: string;
  phone?: string;
  school?: HomeSchool | null;
}

/** How a home school reads on screen, in the form's order. */
export const HOME_SCHOOL_LABELS: Record<HomeSchool, string> = {
  THCS: 'THCS',
  THPT: 'THPT',
  both: 'Both',
};

/** The form field an error belongs to. */
export type TeacherField = 'shortName' | 'email' | 'phone';

export type TeacherResult =
  | { ok: true; file: TimetableFile; teacherId: Id }
  | { ok: false; error: string; field: TeacherField };

type NewId = () => Id;
const randomId: NewId = () => crypto.randomUUID();

/** Loose on purpose: something, an @, then something, with no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+$/;

export const isEmail = (text: string) => EMAIL.test(text);

const PHONE_MESSAGE = 'Enter a phone number like 0912 345 678.';

/** A phone number as it's kept: trimmed, with any run of spaces (non-breaking ones too, as
    a number pasted from a document often has) as one space, and any dash as "-". */
export function cleanPhone(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Digit groups split by one space, or by a dot or dash with a space either side or none. */
const PHONE = /^\+?\d+(?:(?: ?[.-] ?| )\d+)*$/;

/** A phone number (SYSTEM_DESIGN §11.2): 8 to 15 digits, which spaces, dots, and dashes
    may split, after an optional leading +, once cleaned (`cleanPhone`). The teacher form
    and the file's schema both check it. */
export function isPhoneNumber(text: string): boolean {
  const phone = cleanPhone(text);
  const digits = phone.replace(/\D/g, '').length;
  return PHONE.test(phone) && digits >= 8 && digits <= 15;
}

/** True when a teacher's phone matches the search: as text, or by its digits alone, so
    "0912345" finds "0912 345 678". */
function phoneMatches(phone: string, query: string): boolean {
  if (matchesSearch(phone, query)) return true;
  if (!/^[\d\s.+-]+$/.test(query.trim())) return false;
  const digits = query.replace(/\D/g, '');
  return digits !== '' && phone.replace(/\D/g, '').includes(digits);
}

type FieldsCheck =
  | { ok: true; details: Omit<Teacher, 'id' | 'conditions'> }
  | { ok: false; error: string; field: TeacherField };

/** Cleans the fields and checks them: a short name no other teacher has (case doesn't
    count, accents do), and an email and a phone number that look like one. */
function checkFields(file: TimetableFile, fields: TeacherFields, selfId: Id | null): FieldsCheck {
  const shortName = cleanName(fields.shortName);
  if (shortName === '') {
    return { ok: false, field: 'shortName', error: "Enter the teacher's short name." };
  }
  const twin = file.teachers.find((t) => t.id !== selfId && sameName(t.shortName, shortName));
  if (twin) {
    return {
      ok: false,
      field: 'shortName',
      error: `There's already a teacher called ${twin.shortName}.`,
    };
  }
  const email = (fields.email ?? '').trim();
  if (email !== '' && !isEmail(email)) {
    return { ok: false, field: 'email', error: 'Enter an email like name@school.edu.vn.' };
  }
  const phone = cleanPhone(fields.phone ?? '');
  if (phone !== '' && !isPhoneNumber(phone)) {
    return { ok: false, field: 'phone', error: PHONE_MESSAGE };
  }
  const fullName = cleanName(fields.fullName ?? '');
  const details: Omit<Teacher, 'id' | 'conditions'> = { shortName };
  if (fullName !== '') details.fullName = fullName;
  if (email !== '') details.email = email;
  if (phone !== '') details.phone = phone;
  if (fields.school) details.school = fields.school;
  return { ok: true, details };
}

/** Adds a teacher with no conditions. */
export function addTeacher(
  file: TimetableFile,
  fields: TeacherFields,
  newId: NewId = randomId,
): TeacherResult {
  const checked = checkFields(file, fields, null);
  if (!checked.ok) return checked;
  const teacher: Teacher = { id: newId(), ...checked.details, conditions: [] };
  return {
    ok: true,
    teacherId: teacher.id,
    file: { ...file, teachers: [...file.teachers, teacher] },
  };
}

/** Changes a teacher's details, keeping their id and conditions. Cards point at the teacher
    by id, so a new short name shows on every card at once. */
export function editTeacher(
  file: TimetableFile,
  teacherId: Id,
  fields: TeacherFields,
): TeacherResult {
  const teacher = file.teachers.find((t) => t.id === teacherId);
  if (!teacher)
    return { ok: false, field: 'shortName', error: "That teacher isn't in the list any more." };
  const checked = checkFields(file, fields, teacherId);
  if (!checked.ok) return checked;
  const edited: Teacher = { id: teacher.id, ...checked.details, conditions: teacher.conditions };
  return {
    ok: true,
    teacherId,
    file: { ...file, teachers: file.teachers.map((t) => (t === teacher ? edited : t)) },
  };
}

/** What deleting a teacher would do, for the question before it (DM-1): their cards, how
    many placements, and which cards merge (`clearCardFieldPreview`), plus the classes they
    stop being homeroom teacher ('form') or assistant homeroom teacher ('co') of, in
    class-bar order. */
export interface TeacherDeletion extends FieldClearing {
  roles: { className: string; role: 'form' | 'co' }[];
}

export function teacherDeletion(file: TimetableFile, teacherId: Id): TeacherDeletion {
  const roles: TeacherDeletion['roles'] = [];
  for (const c of classesByGrade(file.classes).flatMap((g) => g.classes)) {
    if (c.formTeacherId === teacherId) roles.push({ className: c.name, role: 'form' });
    if (c.coTeacherId === teacherId) roles.push({ className: c.name, role: 'co' });
  }
  return { ...clearCardFieldPreview(file, 'teacherId', teacherId), roles };
}

/** What the delete question says (DM-1, SYSTEM_DESIGN §9.4, layout spec "Delete
    questions"): what happens to the teacher's cards, a sentence per card that merges, the
    classes they stop being homeroom teacher or assistant of, their conditions, and that it
    can't be undone. */
export function teacherDeletionLines(file: TimetableFile, teacherId: Id): string[] {
  const teacher = file.teachers.find((t) => t.id === teacherId);
  if (!teacher) return [];
  const { cards, merges, roles } = teacherDeletion(file, teacherId);
  const lines = [
    cards.length === 0
      ? 'No cards use this teacher.'
      : cards.length === 1
        ? `1 card uses ${teacher.shortName}. It'll be left with no teacher and stay on the grid where it is.`
        : `${cards.length} cards use ${teacher.shortName}. They'll be left with no teacher and stay on the grid where they are.`,
    ...mergeLines(file, 'teacherId', merges),
  ];
  // The classes left with no homeroom teacher or assistant homeroom teacher (DM-2's names
  // for the workbook's form teacher and co-teacher).
  const of = (role: 'form' | 'co') =>
    joinList(
      roles.filter((r) => r.role === role).map((r) => r.className),
      'and',
    );
  const parts = [
    of('form') && `homeroom teacher of ${of('form')}`,
    of('co') && `assistant homeroom teacher of ${of('co')}`,
  ].filter(Boolean);
  if (parts.length > 0) lines.push(`${teacher.shortName} stops being ${parts.join(' and ')}.`);
  const conditions = teacher.conditions.length;
  if (conditions === 1) lines.push('Their condition goes too.');
  if (conditions > 1) lines.push(`Their ${conditions} conditions go too.`);
  lines.push("This can't be undone.");
  return lines;
}

/** Deletes a teacher and their conditions. Their cards are left with no teacher, merging
    where they match another card, and every placement stays where it is, pointing at the
    card it merged into (`clearCardField`). A class that had them as homeroom teacher or
    assistant has none. */
export function deleteTeacher(file: TimetableFile, teacherId: Id): TimetableFile {
  if (!file.teachers.some((t) => t.id === teacherId)) return file;
  return {
    ...clearCardField(file, 'teacherId', teacherId),
    teachers: file.teachers.filter((t) => t.id !== teacherId),
    classes: file.classes.map((c) => {
      if (c.formTeacherId !== teacherId && c.coTeacherId !== teacherId) return c;
      const { formTeacherId, coTeacherId, ...rest } = c;
      return {
        ...rest,
        ...(formTeacherId !== undefined && formTeacherId !== teacherId && { formTeacherId }),
        ...(coTeacherId !== undefined && coTeacherId !== teacherId && { coTeacherId }),
      };
    }),
  };
}

/** Each teacher's periods on the grid across all classes, 2 for a full block and 1 for a
    half, in one pass. A teacher with none has no entry. */
function periodsByTeacher(file: TimetableFile): Map<Id, number> {
  const teacherOfCard = new Map(file.cards.map((c) => [c.id, c.teacherId]));
  const periods = new Map<Id, number>();
  for (const p of file.placements) {
    const teacherId = teacherOfCard.get(p.cardId);
    if (teacherId) periods.set(teacherId, (periods.get(teacherId) ?? 0) + placementPeriods(p));
  }
  return periods;
}

/** Periods a teacher has on the grid across all classes: 2 for a full block, 1 for a half. */
export function teacherPeriods(file: TimetableFile, teacherId: Id): number {
  return periodsByTeacher(file).get(teacherId) ?? 0;
}

/** A row of the Teachers page. */
export interface TeacherRow {
  teacher: Teacher;
  cards: number;
  periods: number;
  conditions: number;
  conditionsOff: number;
}

/** The Teachers page: teachers in list order matching the search by short name, full name,
    email, or phone, ignoring case and accents. */
export function teacherRows(file: TimetableFile, query: string): TeacherRow[] {
  // One pass over the cards and placements, rather than one per teacher.
  const cards = new Map<Id, number>();
  for (const c of file.cards) {
    if (c.teacherId !== null) cards.set(c.teacherId, (cards.get(c.teacherId) ?? 0) + 1);
  }
  const periods = periodsByTeacher(file);
  return file.teachers
    .filter(
      (t) =>
        query.trim() === '' ||
        [t.shortName, t.fullName, t.email].some((text) => text && matchesSearch(text, query)) ||
        (t.phone !== undefined && phoneMatches(t.phone, query)),
    )
    .map((teacher) => ({
      teacher,
      cards: cards.get(teacher.id) ?? 0,
      periods: periods.get(teacher.id) ?? 0,
      conditions: teacher.conditions.length,
      conditionsOff: teacher.conditions.filter((c) => !c.on).length,
    }));
}

/** One of a teacher's cards on the detail screen, with the classes it's on. */
export type TeacherCard = CardView & { classes: string[] };

/** The teacher's cards in pool order, each with its classes in class-bar order. */
export function teacherCards(file: TimetableFile, teacherId: Id): TeacherCard[] {
  return poolCards(file)
    .filter((c) => c.teacherId === teacherId)
    .map((c) => ({ ...cardView(file, c), classes: cardClasses(file, c.id).map((k) => k.name) }));
}

/** The classes a teacher teaches in, in class-bar order, once each. */
export function teacherClasses(file: TimetableFile, teacherId: Id): string[] {
  const cards = new Set(file.cards.filter((c) => c.teacherId === teacherId).map((c) => c.id));
  const placedIn = new Set(
    file.placements.filter((p) => cards.has(p.cardId)).map((p) => p.classId),
  );
  return classesByGrade(file.classes.filter((c) => placedIn.has(c.id)))
    .flatMap((g) => g.classes)
    .map((c) => c.name);
}

/** The subjects a teacher has cards for, in subject-list order: the condition form's Subject
    choices (asked for on 2026-10-23). `keep` is listed too, so editing a subject limit keeps
    its subject even when the teacher no longer has a card of it. */
export function teacherSubjects(
  file: TimetableFile,
  teacherId: Id,
  keep: Id | null = null,
): Subject[] {
  const taught = new Set(
    file.cards.filter((c) => c.teacherId === teacherId).map((c) => c.subjectId),
  );
  return file.subjects.filter((s) => taught.has(s.id) || s.id === keep);
}
