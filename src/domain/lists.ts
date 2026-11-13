import type { Id, Room, Subject, TimetableFile } from './model';
import { checkRoomName } from './rooms';
import { formColorFields, type SubjectColorChoice } from './subjectColor';
import { BAD_COLOR, checkSubjectName } from './subjects';
import { addTeacher } from './teachers';

// Adding a subject, teacher, or room on the spot from the card form (TB-3). The list
// pages add them with these too and do the rest (teachers.ts, rooms.ts, subjects.ts).

export type AddResult = { ok: true; file: TimetableFile; id: Id } | { ok: false; error: string };

type NewId = () => Id;
const randomId: NewId = () => crypto.randomUUID();

/** Adds a subject. Its colors come from its name, as the card form's "New subject…"
    gives them, unless the Subjects page's form picks them (SYSTEM_DESIGN §10.5). */
export function addSubject(
  file: TimetableFile,
  nameInput: string,
  colors: SubjectColorChoice = { source: 'name' },
  newId: NewId = randomId,
): AddResult {
  const check = checkSubjectName(file, nameInput);
  if (!check.ok) return check;
  const fields = formColorFields(undefined, check.name, colors);
  if (!fields) return { ok: false, error: BAD_COLOR };
  const subject: Subject = { id: newId(), name: check.name, ...fields };
  return { ok: true, id: subject.id, file: { ...file, subjects: [...file.subjects, subject] } };
}

/** Adds a teacher by short name, from the card form's "New teacher…" (TB-3). Short names
    are unique (DM-1); the Teachers page adds the other details (teachers.ts). */
export function addTeacherByShortName(
  file: TimetableFile,
  shortNameInput: string,
  newId: NewId = randomId,
): AddResult {
  const result = addTeacher(file, { shortName: shortNameInput }, newId);
  return result.ok ? { ok: true, file: result.file, id: result.teacherId } : result;
}

export function addRoom(
  file: TimetableFile,
  nameInput: string,
  newId: NewId = randomId,
): AddResult {
  const check = checkRoomName(file, nameInput);
  if (!check.ok) return check;
  const room: Room = { id: newId(), name: check.name };
  return { ok: true, id: room.id, file: { ...file, rooms: [...file.rooms, room] } };
}
