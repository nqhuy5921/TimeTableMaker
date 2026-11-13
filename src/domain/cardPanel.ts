import { cardView, poolCards, type CardView } from './cards';
import { classesByGrade } from './classes';
import type { Card, Grade, Id, TimetableFile } from './model';
import { matchesSearch } from './text';

// The Subjects tab's card list (DM-7): search by subject or teacher, ignoring accents,
// and group by subject or by teacher. Layout: docs/design/TIMETABLE_SCREEN_LAYOUT.md.
// Also the Cards page's table of the pool.

export type CardGrouping = 'subject' | 'teacher';

/** A run of cards in the panel. Grouped by subject there's one group with no heading. */
export interface CardGroup {
  /** Stays the same while the search changes, for use as a list key. */
  key: string;
  /** The teacher's short name, "No teacher", or null when grouped by subject. */
  heading: string | null;
  cards: Card[];
}

/** The pool's cards that match `query`, grouped for the panel. Empty groups are left out. */
export function cardPanelGroups(
  file: TimetableFile,
  query: string,
  groupBy: CardGrouping,
): CardGroup[] {
  const teacherOf = new Map(file.teachers.map((t) => [t.id, t]));
  const cards = poolCards(file).filter((card) => cardMatches(file, card, query));
  if (cards.length === 0) return [];
  if (groupBy === 'subject') return [{ key: 'all', heading: null, cards }];

  // Teachers in list order, then cards with no teacher (or a teacher no longer listed).
  const groups: CardGroup[] = file.teachers.map((t) => ({
    key: `teacher-${t.id}`,
    heading: t.shortName,
    cards: cards.filter((c) => c.teacherId === t.id),
  }));
  groups.push({
    key: 'no-teacher',
    heading: 'No teacher',
    cards: cards.filter((c) => c.teacherId === null || !teacherOf.has(c.teacherId)),
  });
  return groups.filter((group) => group.cards.length > 0);
}

/** True when `query` is in the card's subject or its teacher's short or full name, or,
    with `classNames`, in the name of one of its classes. Case and accents don't count. */
function cardMatches(
  file: TimetableFile,
  card: Card,
  query: string,
  classNames: string[] = [],
): boolean {
  const subject = file.subjects.find((s) => s.id === card.subjectId);
  const teacher = file.teachers.find((t) => t.id === card.teacherId);
  return [...classNames, subject?.name, teacher?.shortName, teacher?.fullName].some(
    (text) => text !== undefined && matchesSearch(text, query),
  );
}

/** A row of the Cards page: a card and the names of the classes it's placed in, in
    class-bar order. Empty when the card isn't placed ("Not placed" is the screen's job). */
export type CardTableRow = CardView & { classes: string[] };

/** The Cards page's filters (asked for on 2026-10-21). */
export interface CardTableFilter {
  /** Cards placed in any class of this grade, cards on no grid ('unplaced'), or all. */
  grade: Grade | 'unplaced' | null;
  /** This teacher's cards, cards with no teacher ('none'), or all. */
  teacher: Id | 'none' | null;
}

export const ALL_CARDS: CardTableFilter = { grade: null, teacher: null };

/** The grades the grade filter offers: those that have classes, in order. */
export function cardFilterGrades(file: TimetableFile): Grade[] {
  return classesByGrade(file.classes).map((g) => g.grade);
}

/** `filter` with any grade or teacher that's no longer offered put back to all, so the
    dropdowns and the table always agree. */
export function currentCardFilter(file: TimetableFile, filter: CardTableFilter): CardTableFilter {
  const { grade, teacher } = filter;
  return {
    grade: typeof grade === 'number' && !cardFilterGrades(file).includes(grade) ? null : grade,
    teacher:
      teacher !== null && teacher !== 'none' && !file.teachers.some((t) => t.id === teacher)
        ? null
        : teacher,
  };
}

/** The pool for the Cards page (DM-7), in pool order, for cards that pass `filter` and
    match `query` by subject, teacher, or the name of a class they're placed in. */
export function cardTableRows(
  file: TimetableFile,
  query: string,
  filter: CardTableFilter = ALL_CARDS,
): CardTableRow[] {
  // One pass over the placements, then each card's class names in class-bar order.
  const order = new Map(
    classesByGrade(file.classes)
      .flatMap((g) => g.classes)
      .map((c, i) => [c.id, i]),
  );
  const classOf = new Map(file.classes.map((c) => [c.id, c]));
  const teacherIds = new Set(file.teachers.map((t) => t.id));
  const placedIn = new Map<string, Set<string>>();
  for (const p of file.placements) {
    if (!order.has(p.classId)) continue;
    const set = placedIn.get(p.cardId) ?? new Set<string>();
    set.add(p.classId);
    placedIn.set(p.cardId, set);
  }
  const passes = (card: Card, classIds: Id[]) => {
    const { grade, teacher } = filter;
    if (grade === 'unplaced' && classIds.length > 0) return false;
    if (typeof grade === 'number' && !classIds.some((id) => classOf.get(id)!.grade === grade)) {
      return false;
    }
    if (teacher === 'none') return card.teacherId === null || !teacherIds.has(card.teacherId);
    return teacher === null || card.teacherId === teacher;
  };
  return poolCards(file).flatMap((card) => {
    const classIds = [...(placedIn.get(card.id) ?? [])].sort(
      (a, b) => order.get(a)! - order.get(b)!,
    );
    if (!passes(card, classIds)) return [];
    const classes = classIds.map((id) => classOf.get(id)!.name);
    return cardMatches(file, card, query, classes) ? [{ ...cardView(file, card), classes }] : [];
  });
}
