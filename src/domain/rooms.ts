import { clearCardField, clearCardFieldPreview, mergeLines, type FieldClearing } from './cards';
import { classesByGrade } from './classes';
import type { Id, Room, SchoolClass, TimetableFile } from './model';
import { checkUniqueName, matchesSearch, plural, type NameCheck } from './text';

// The room list (DM-3, SYSTEM_DESIGN §10.2): renaming and deleting rooms from the Rooms
// page. Adding one is `addRoom` in lists.ts, shared with the card form's "New room…".

export type RoomResult =
  { ok: true; file: TimetableFile; roomId: Id } | { ok: false; error: string };

/** A room name no other room has: case doesn't count, accents do. `selfId` is the room
    being renamed, whose own name isn't taken. */
export function checkRoomName(
  file: TimetableFile,
  input: string,
  selfId: Id | null = null,
): NameCheck {
  return checkUniqueName(file.rooms, 'room', input, selfId);
}

/** Renames a room. Cards point at it by id, so the new name shows everywhere at once. */
export function editRoom(file: TimetableFile, roomId: Id, nameInput: string): RoomResult {
  const room = file.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false, error: "That room isn't in the list any more." };
  const check = checkRoomName(file, nameInput, roomId);
  if (!check.ok) return check;
  // The same name changes nothing, so the file isn't saved again or checked again.
  if (check.name === room.name) return { ok: true, roomId, file };
  const renamed: Room = { ...room, name: check.name };
  return {
    ok: true,
    roomId,
    file: { ...file, rooms: file.rooms.map((r) => (r === room ? renamed : r)) },
  };
}

/** What deleting a room would do, for the question before it: its cards, how many
    placements, and which cards merge once they have no room. */
export function roomDeletion(file: TimetableFile, roomId: Id): FieldClearing {
  return clearCardFieldPreview(file, 'roomId', roomId);
}

/** What the delete question says (DM-3, layout spec "Delete questions"): how many cards
    use the room and how many times they're on the grid, a sentence per card that merges,
    as for a teacher, and that it can't be undone. With no cards, only that nothing uses it. */
export function roomDeletionLines(file: TimetableFile, roomId: Id): string[] {
  const room = file.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const { cards, placements, merges } = roomDeletion(file, roomId);
  const undone = "This can't be undone.";
  if (cards.length === 0) return [`Nothing uses ${room.name}.`, undone];
  const one = cards.length === 1;
  const use = `${plural(cards.length, 'card uses', 'cards use')} ${room.name}`;
  const lines = [
    placements === 0
      ? `${use}, and ${one ? "it isn't" : 'none is'} on the grid. ${one ? "It'll" : "They'll"} be left with no room.`
      : `${use}, on the grid ${placements === 1 ? 'once' : `${placements} times`}. ${
          one
            ? "It'll be left with no room and stay on the grid where it is."
            : "They'll be left with no room and stay on the grid where they are."
        }`,
  ];
  return [...lines, ...mergeLines(file, 'roomId', merges), undone];
}

/** Deletes a room. Its cards are left with no room, a card that's then the same as another
    (same subject, same teacher, no room) merging into it, and every placement stays where
    it is, as when a teacher is deleted. */
export function deleteRoom(file: TimetableFile, roomId: Id): TimetableFile {
  if (!file.rooms.some((r) => r.id === roomId)) return file;
  return {
    ...clearCardField(file, 'roomId', roomId),
    rooms: file.rooms.filter((r) => r.id !== roomId),
  };
}

/** A row of the Rooms page. */
export interface RoomRow {
  room: Room;
  /** How many cards use the room. */
  cards: number;
  /** The classes those cards are placed in, in class-bar order, once each. */
  classes: SchoolClass[];
}

/** The Rooms page: rooms in list order matching the search by name, ignoring case and
    accents (DM-3). */
export function roomRows(file: TimetableFile, query: string): RoomRow[] {
  // One pass over the cards and placements, rather than one per room.
  const roomOfCard = new Map(file.cards.map((c) => [c.id, c.roomId]));
  const cards = new Map<Id, number>();
  for (const c of file.cards) {
    if (c.roomId !== null) cards.set(c.roomId, (cards.get(c.roomId) ?? 0) + 1);
  }
  const classIds = new Map<Id, Set<Id>>();
  for (const p of file.placements) {
    const roomId = roomOfCard.get(p.cardId);
    if (!roomId) continue;
    const ids = classIds.get(roomId) ?? new Set<Id>();
    ids.add(p.classId);
    classIds.set(roomId, ids);
  }
  const ordered = classesByGrade(file.classes).flatMap((g) => g.classes);
  return file.rooms
    .filter((room) => query.trim() === '' || matchesSearch(room.name, query))
    .map((room) => {
      const used = classIds.get(room.id);
      return {
        room,
        cards: cards.get(room.id) ?? 0,
        classes: used ? ordered.filter((c) => used.has(c.id)) : [],
      };
    });
}
