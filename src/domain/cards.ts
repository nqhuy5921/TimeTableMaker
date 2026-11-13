import { classesByGrade } from './classes';
import type { Card, Id, SchoolClass, TimetableFile } from './model';
import { subjectColors, type SubjectColors } from './subjectColor';

// The card pool (DM-5): one subject with a teacher and a room, for the whole school; any
// card can go on any class's grid. Cards had periods per week until 2026-10-19 and a class
// until 2026-10-21.

/** What the card form fills in. */
export interface CardFields {
  subjectId: Id | null;
  teacherId: Id | null;
  roomId: Id | null;
}

/** The form field an error belongs to, or 'card' when it isn't about one field. */
export type CardField = 'subject' | 'teacher' | 'room' | 'card';

export type CardResult =
  { ok: true; file: TimetableFile; cardId: Id } | { ok: false; error: string; field: CardField };

type FieldsCheck =
  { ok: true; card: Omit<Card, 'id'> } | { ok: false; error: string; field: CardField };

/** "There's already a card for Toán with Thầy Phúc in P101." for the fields given. A
    teacher is named by short name; an empty teacher or room reads "no teacher" or "no room". */
export function duplicateCardMessage(file: TimetableFile, fields: CardFields): string {
  const subject = file.subjects.find((s) => s.id === fields.subjectId)?.name ?? '';
  const teacher = file.teachers.find((t) => t.id === fields.teacherId)?.shortName ?? 'no teacher';
  const room = file.rooms.find((r) => r.id === fields.roomId)?.name ?? 'no room';
  return `There's already a card for ${subject} with ${teacher} in ${room}.`;
}

function checkFields(file: TimetableFile, fields: CardFields, cardId: Id | null): FieldsCheck {
  const subject = file.subjects.find((s) => s.id === fields.subjectId);
  if (!subject) return { ok: false, error: 'Choose a subject.', field: 'subject' };
  if (fields.teacherId !== null && !file.teachers.some((t) => t.id === fields.teacherId)) {
    return { ok: false, error: "That teacher isn't in the list.", field: 'teacher' };
  }
  if (fields.roomId !== null && !file.rooms.some((r) => r.id === fields.roomId)) {
    return { ok: false, error: "That room isn't in the list.", field: 'room' };
  }
  const taken = file.cards.some(
    (c) =>
      c.id !== cardId &&
      c.subjectId === subject.id &&
      c.teacherId === fields.teacherId &&
      c.roomId === fields.roomId,
  );
  if (taken) {
    return { ok: false, error: duplicateCardMessage(file, fields), field: 'subject' };
  }
  return {
    ok: true,
    card: {
      subjectId: subject.id,
      teacherId: fields.teacherId,
      roomId: fields.roomId,
    },
  };
}

/** Adds a card to the pool. No two cards have the same subject, teacher, and room. */
export function addCard(
  file: TimetableFile,
  fields: CardFields,
  newId: () => Id = () => crypto.randomUUID(),
): CardResult {
  const check = checkFields(file, fields, null);
  if (!check.ok) return check;
  const card: Card = { id: newId(), ...check.card };
  return { ok: true, cardId: card.id, file: { ...file, cards: [...file.cards, card] } };
}

/** Changes a card's subject, teacher, or room. Its placements stay where they are, in
    every class, and show the new details, since they point at the card. */
export function editCard(file: TimetableFile, cardId: Id, fields: CardFields): CardResult {
  if (!file.cards.some((c) => c.id === cardId)) {
    return { ok: false, error: "That card doesn't exist any more.", field: 'card' };
  }
  const check = checkFields(file, fields, cardId);
  if (!check.ok) return check;
  return {
    ok: true,
    cardId,
    file: {
      ...file,
      cards: file.cards.map((c) => (c.id === cardId ? { ...c, ...check.card } : c)),
    },
  };
}

/** Removes a card and its placements in every class. */
export function deleteCard(file: TimetableFile, cardId: Id): TimetableFile {
  if (!file.cards.some((c) => c.id === cardId)) return file;
  return {
    ...file,
    cards: file.cards.filter((c) => c.id !== cardId),
    placements: file.placements.filter((p) => p.cardId !== cardId),
  };
}

/** How many times a card is on the grid, so deleting it can ask first. */
export function placementCount(file: TimetableFile, cardId: Id): number {
  return file.placements.filter((p) => p.cardId === cardId).length;
}

/** The whole pool in the order the panel and the Cards page list it: subject order (the
    order subjects were added), then teacher-list order, then room name. Cards with no
    teacher come after those with one, and cards with no room after those with one. */
export function poolCards(file: TimetableFile): Card[] {
  const subjectOrder = new Map(file.subjects.map((s, i) => [s.id, i]));
  const teacherOrder = new Map(file.teachers.map((t, i) => [t.id, i]));
  const roomName = new Map(file.rooms.map((r) => [r.id, r.name]));
  const teacherRank = (c: Card) => teacherOrder.get(c.teacherId ?? '') ?? Infinity;
  return [...file.cards].sort((a, b) => {
    const bySubject = (subjectOrder.get(a.subjectId) ?? 0) - (subjectOrder.get(b.subjectId) ?? 0);
    if (bySubject !== 0) return bySubject;
    const aTeacher = teacherRank(a);
    const bTeacher = teacherRank(b);
    if (aTeacher !== bTeacher) return aTeacher < bTeacher ? -1 : 1;
    const aRoom = roomName.get(a.roomId ?? '');
    const bRoom = roomName.get(b.roomId ?? '');
    if (aRoom === bRoom) return 0;
    if (aRoom === undefined) return 1;
    if (bRoom === undefined) return -1;
    return aRoom.localeCompare(bRoom, undefined, { numeric: true });
  });
}

/** The classes a card is placed in, in class-bar order (grade, track, section), once each. */
export function cardClasses(file: TimetableFile, cardId: Id): SchoolClass[] {
  const placedIn = new Set(
    file.placements.filter((p) => p.cardId === cardId).map((p) => p.classId),
  );
  return classesByGrade(file.classes.filter((c) => placedIn.has(c.id))).flatMap((g) => g.classes);
}

/** A card with its subject, teacher, and room looked up, as the Subjects panel and the
    Cards page show it. A teacher is shown by short name. */
export interface CardView {
  id: Id;
  subject: string;
  colors: SubjectColors;
  teacher: string | null;
  room: string | null;
}

export function cardView(file: TimetableFile, card: Card): CardView {
  const subject = file.subjects.find((s) => s.id === card.subjectId);
  return {
    id: card.id,
    subject: subject?.name ?? '',
    colors: subjectColors(subject),
    teacher: file.teachers.find((t) => t.id === card.teacherId)?.shortName ?? null,
    room: file.rooms.find((r) => r.id === card.roomId)?.name ?? null,
  };
}

/** A card's "teacher · room" line, the same in the Subjects panel and on the grid (DM-5).
    A card with no teacher says so; one with no room leaves it out. */
export function cardDetails(card: Pick<CardView, 'teacher' | 'room'>): string {
  return [card.teacher ?? 'No teacher', card.room].filter(Boolean).join(' · ');
}

/** "Toán · Thầy Phúc · P101": the subject, teacher, and room, leaving out the ones the card
    hasn't got. The card form's edit title and the Cards page's Edit and Delete buttons. */
export function cardName(card: Pick<CardView, 'subject' | 'teacher' | 'room'>): string {
  return [card.subject, card.teacher, card.room].filter(Boolean).join(' · ');
}

/** The card field a deleted teacher or room leaves empty. */
export type ClearedField = 'teacherId' | 'roomId';

/** What emptying one field on the cards would do, for the question before deleting a
    teacher (DM-1) or a room (DM-3). */
export interface FieldClearing {
  /** The cards with that teacher or room, in pool order. */
  cards: Card[];
  /** How many times those cards are on the grid. */
  placements: number;
  /** Cards that become the same as another card once the field is empty, and the card
      each merges into. */
  merges: { card: Card; into: Card }[];
}

/** A card with the field set to `id` becomes one with it empty. One that's then the same
    as another card merges into that card, which already had it empty. Two of the cleared
    cards never merge: they already differ in one of the other two fields. */
export function clearCardFieldPreview(
  file: TimetableFile,
  field: ClearedField,
  id: Id,
): FieldClearing {
  const cards = poolCards(file).filter((c) => c[field] === id);
  const ids = new Set(cards.map((c) => c.id));
  // What's left of a card once the field is empty.
  const cleared = (c: Card) =>
    JSON.stringify([
      c.subjectId,
      field === 'teacherId' ? null : c.teacherId,
      field === 'roomId' ? null : c.roomId,
    ]);
  const empty = new Map<string, Card>();
  for (const card of file.cards) if (card[field] === null) empty.set(cleared(card), card);
  const merges: FieldClearing['merges'] = [];
  for (const card of cards) {
    const into = empty.get(cleared(card));
    if (into) merges.push({ card, into });
  }
  return {
    cards,
    placements: file.placements.filter((p) => ids.has(p.cardId)).length,
    merges,
  };
}

/** A sentence per card that merges once the field is empty, as the delete-teacher and
    delete-room questions say it (layout spec "Delete questions"). */
export function mergeLines(
  file: TimetableFile,
  field: ClearedField,
  merges: FieldClearing['merges'],
): string[] {
  const what = field === 'teacherId' ? 'teacher' : 'room';
  return merges.map(
    ({ card }) =>
      `${cardName(cardView(file, { ...card, [field]: null }))} becomes the same as a card that has no ${what}, so the two are merged, keeping both cards' places on the grid.`,
  );
}

/** Empties the field on every card that has `id` in it, merging where a card then matches
    another (`clearCardFieldPreview`). Every placement stays where it is, pointing at the
    card it merged into. Deleting a teacher and deleting a room both go through here, so
    the two can't drift apart (SYSTEM_DESIGN §10.2). */
export function clearCardField(file: TimetableFile, field: ClearedField, id: Id): TimetableFile {
  const { cards, merges } = clearCardFieldPreview(file, field, id);
  if (cards.length === 0) return file;
  const mergedInto = new Map(merges.map((m) => [m.card.id, m.into.id]));
  return {
    ...file,
    cards: file.cards
      .filter((c) => !mergedInto.has(c.id))
      .map((c) => (c[field] === id ? { ...c, [field]: null } : c)),
    placements: file.placements.map((p) => {
      const into = mergedInto.get(p.cardId);
      return into === undefined ? p : { ...p, cardId: into };
    }),
  };
}
