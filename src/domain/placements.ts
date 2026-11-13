import type { BlockIndex, Day, Id, Placement, PlacementPart, TimetableFile } from './model';

// Putting cards on the grid (TB-4), moving and removing them (TB-5). The drop table is in
// docs/design/SYSTEM_DESIGN.md §3.

/** Where a card is dropped: a slot and the part under the pointer, `full` for the
    block's middle, `first` or `second` for its top or bottom. */
export interface DropTarget {
  day: Day;
  block: BlockIndex;
  part: PlacementPart;
}

export type DropResult =
  { ok: true; file: TimetableFile; removed: Placement[] } | { ok: false; error: string };

/** The placements in one class's slot. */
export function slotPlacements(
  file: TimetableFile,
  classId: Id,
  day: Day,
  block: BlockIndex,
): Placement[] {
  return file.placements.filter((p) => p.classId === classId && p.day === day && p.block === block);
}

/** Puts a card in a slot of the given class. A full block replaces everything in the slot;
    a half replaces the card in that half or a full block, and keeps the other half. */
export function drop(
  file: TimetableFile,
  cardId: Id,
  classId: Id,
  target: DropTarget,
  newId: () => Id = () => crypto.randomUUID(),
): DropResult {
  if (!file.cards.some((c) => c.id === cardId)) {
    return { ok: false, error: "That card doesn't exist any more." };
  }
  if (!file.classes.some((c) => c.id === classId)) {
    return { ok: false, error: "That class isn't in the list." };
  }
  const inSlot = slotPlacements(file, classId, target.day, target.block);
  if (inSlot.some((p) => p.cardId === cardId && p.part === target.part)) {
    return { ok: true, file, removed: [] };
  }

  const removed = inSlot.filter(
    (p) => target.part === 'full' || p.part === 'full' || p.part === target.part,
  );
  const placement: Placement = { id: newId(), cardId, classId, ...target };
  return {
    ok: true,
    removed,
    file: {
      ...file,
      placements: [...file.placements.filter((p) => !removed.includes(p)), placement],
    },
  };
}

/** Moves a placed card to another slot of its class (it stays in that class): a removal
    from its old slot followed by the same drop, so the target part sets its size (settled
    at R1-6) and whatever is there is replaced. The moved placement keeps its id. */
export function movePlacement(
  file: TimetableFile,
  placementId: Id,
  target: DropTarget,
): DropResult {
  const placement = file.placements.find((p) => p.id === placementId);
  if (!placement) return { ok: false, error: "That card isn't on the grid any more." };
  if (
    placement.day === target.day &&
    placement.block === target.block &&
    placement.part === target.part
  ) {
    return { ok: true, file, removed: [] };
  }
  const without = { ...file, placements: file.placements.filter((p) => p !== placement) };
  return drop(without, placement.cardId, placement.classId, target, () => placement.id);
}

/** Takes a placed card off the grid. The card stays in the panel. */
export function removePlacement(file: TimetableFile, placementId: Id): TimetableFile {
  const placements = file.placements.filter((p) => p.id !== placementId);
  return placements.length === file.placements.length ? file : { ...file, placements };
}

/** The periods a placement fills: 2 for a full block, 1 for a half (TB-4, TC-2). */
export const placementPeriods = (p: Placement) => (p.part === 'full' ? 2 : 1);

export interface SubjectPeriods {
  subjectId: Id;
  periods: number;
}

/** Periods placed per subject in one class, in subject order, leaving out subjects
    with none placed: 2 per full block and 1 per half, summed over every card of the
    subject. */
export function periodsBySubject(file: TimetableFile, classId: Id): SubjectPeriods[] {
  const subjectOfCard = new Map(file.cards.map((c) => [c.id, c.subjectId]));
  const bySubject = new Map<Id, number>();
  for (const p of file.placements) {
    const subjectId = subjectOfCard.get(p.cardId);
    if (p.classId !== classId || subjectId === undefined) continue;
    bySubject.set(subjectId, (bySubject.get(subjectId) ?? 0) + placementPeriods(p));
  }
  return file.subjects
    .filter((s) => bySubject.has(s.id))
    .map((s) => ({ subjectId: s.id, periods: bySubject.get(s.id)! }));
}
