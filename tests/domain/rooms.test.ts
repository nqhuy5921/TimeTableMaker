import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import { fileProblem } from '../../src/domain/integrity';
import { addRoom } from '../../src/domain/lists';
import type { Card, Placement, TimetableFile } from '../../src/domain/model';
import {
  deleteRoom,
  editRoom,
  roomDeletion,
  roomDeletionLines,
  roomRows,
  type RoomResult,
} from '../../src/domain/rooms';

function ok(result: RoomResult): TimetableFile {
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

const card = (id: string, subjectId: string, teacherId: string | null, roomId: string | null) =>
  ({ id, subjectId, teacherId, roomId }) satisfies Card;
const placed = (id: string, cardId: string, classId: string, day: 0 | 1, part: Placement['part']) =>
  ({ id, cardId, classId, day, block: 0, part }) satisfies Placement;

// Three rooms and cards that collide once P101 is gone: Phúc's Toán in P101 matches his Toán
// in no room. P201 has a card that isn't placed, and Phòng Lab has none.
function school(): TimetableFile {
  return {
    ...emptySchool(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'van', name: 'Ngữ văn', colorKey: 'literature' },
    ],
    teachers: [
      { id: 'phuc', shortName: 'Thầy Phúc', conditions: [] },
      { id: 'lan', shortName: 'Cô Lan', conditions: [] },
    ],
    rooms: [
      { id: 'p101', name: 'P101' },
      { id: 'p201', name: 'P201' },
      { id: 'lab', name: 'Phòng Lab' },
    ],
    classes: [
      { id: 'c7', name: '7B1', grade: 7, track: 'B', section: 1 },
      { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
      { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
    ],
    cards: [
      card('k-toan-none', 'toan', 'phuc', null),
      card('k-toan-101', 'toan', 'phuc', 'p101'),
      card('k-van-101', 'van', 'lan', 'p101'),
      card('k-van-201', 'van', 'phuc', 'p201'),
    ],
    placements: [
      placed('p1', 'k-toan-101', 'c7', 0, 'full'),
      placed('p2', 'k-toan-none', 'c2', 0, 'full'),
      placed('p3', 'k-van-101', 'c1', 1, 'first'),
      placed('p4', 'k-toan-101', 'c1', 1, 'second'),
    ],
  };
}

describe('roomRows (DM-3)', () => {
  it('lists rooms in list order with their cards and classes in class-bar order', () => {
    const rows = roomRows(school(), '');
    expect(rows.map((r) => [r.room.name, r.cards, r.classes.map((c) => c.name)])).toEqual([
      ['P101', 2, ['6A1', '7B1']],
      ['P201', 1, []],
      ['Phòng Lab', 0, []],
    ]);
  });

  it('searches by room name, ignoring case and accents', () => {
    expect(roomRows(school(), 'phong').map((r) => r.room.name)).toEqual(['Phòng Lab']);
    expect(roomRows(school(), ' p1 ').map((r) => r.room.name)).toEqual(['P101']);
    expect(roomRows(school(), 'P9')).toEqual([]);
  });
});

describe('editRoom (DM-3)', () => {
  it('renames a room, keeping its id, so its cards show the new name', () => {
    const file = ok(editRoom(school(), 'p101', '  Phòng  101 '));
    expect(file.rooms[0]).toEqual({ id: 'p101', name: 'Phòng 101' });
    expect(file.cards).toEqual(school().cards);
  });

  it('allows its own name in another case', () => {
    expect(ok(editRoom(school(), 'lab', 'PHÒNG LAB')).rooms[2]?.name).toBe('PHÒNG LAB');
  });

  it("refuses an empty name or one another room has (case doesn't count, accents do)", () => {
    expect(editRoom(school(), 'p201', '  ')).toEqual({ ok: false, error: 'Enter a room name.' });
    expect(editRoom(school(), 'p201', 'p101')).toEqual({
      ok: false,
      error: "There's already a room called P101.",
    });
    expect(ok(editRoom(school(), 'p201', 'Phong Lab')).rooms[1]?.name).toBe('Phong Lab');
  });

  it('keeps the same file when the name is unchanged, so nothing is saved', () => {
    const start = school();
    expect(editRoom(start, 'p101', ' P101 ')).toEqual({ ok: true, roomId: 'p101', file: start });
    expect(ok(editRoom(start, 'p101', ' P101 '))).toBe(start);
  });

  it('refuses a room that is gone', () => {
    expect(editRoom(school(), 'nowhere', 'P301')).toMatchObject({ ok: false });
  });

  it('shares the name rule with addRoom', () => {
    expect(addRoom(school(), 'P101 ')).toEqual({
      ok: false,
      error: "There's already a room called P101.",
    });
  });
});

describe('deleteRoom (DM-3)', () => {
  it('says which cards are affected, how many placements, and which merge', () => {
    const deletion = roomDeletion(school(), 'p101');
    expect(deletion.cards.map((c) => c.id)).toEqual(['k-toan-101', 'k-van-101']);
    expect(deletion.placements).toBe(3);
    expect(deletion.merges.map((m) => [m.card.id, m.into.id])).toEqual([
      ['k-toan-101', 'k-toan-none'],
    ]);
  });

  it('leaves the cards with no room, merges identical ones, and keeps every placement', () => {
    const file = deleteRoom(school(), 'p101');
    expect(file.rooms.map((r) => r.id)).toEqual(['p201', 'lab']);
    expect(file.cards).toEqual([
      card('k-toan-none', 'toan', 'phuc', null),
      card('k-van-101', 'van', 'lan', null),
      card('k-van-201', 'van', 'phuc', 'p201'),
    ]);
    expect(file.placements).toEqual([
      placed('p1', 'k-toan-none', 'c7', 0, 'full'),
      placed('p2', 'k-toan-none', 'c2', 0, 'full'),
      placed('p3', 'k-van-101', 'c1', 1, 'first'),
      placed('p4', 'k-toan-none', 'c1', 1, 'second'),
    ]);
    expect(fileProblem(file)).toBeNull();
  });

  it('does what its preview says', () => {
    const start = school();
    const { cards, merges } = roomDeletion(start, 'p101');
    const file = deleteRoom(start, 'p101');
    const merged = new Set(merges.map((m) => m.card.id));
    for (const c of cards) {
      const kept = file.cards.find((k) => k.id === c.id);
      expect(kept ? kept.roomId : 'merged').toBe(merged.has(c.id) ? 'merged' : null);
    }
    expect(file.placements).toHaveLength(start.placements.length);
  });

  it('deletes a room no card uses with nothing else changed', () => {
    const start = school();
    expect(roomDeletion(start, 'lab')).toEqual({ cards: [], placements: 0, merges: [] });
    const file = deleteRoom(start, 'lab');
    expect(file.rooms.map((r) => r.id)).toEqual(['p101', 'p201']);
    expect(file.cards).toBe(start.cards);
    expect(file.placements).toBe(start.placements);
  });

  it('changes nothing for a room that is gone', () => {
    const start = school();
    expect(deleteRoom(start, 'nowhere')).toBe(start);
  });
});

describe('roomDeletionLines (DM-3, layout spec "Delete questions")', () => {
  const undone = "This can't be undone.";

  it('says how many cards and placements, and which card merges', () => {
    expect(roomDeletionLines(school(), 'p101')).toEqual([
      "2 cards use P101, on the grid 3 times. They'll be left with no room and stay on the grid where they are.",
      "Toán · Thầy Phúc becomes the same as a card that has no room, so the two are merged, keeping both cards' places on the grid.",
      undone,
    ]);
  });

  it('says "once" for one card placed once', () => {
    const start = school();
    start.placements = [placed('p1', 'k-van-201', 'c1', 0, 'full')];
    expect(roomDeletionLines(start, 'p201')).toEqual([
      "1 card uses P201, on the grid once. It'll be left with no room and stay on the grid where it is.",
      undone,
    ]);
  });

  it('says when none of the cards is on the grid', () => {
    expect(roomDeletionLines(school(), 'p201')).toEqual([
      "1 card uses P201, and it isn't on the grid. It'll be left with no room.",
      undone,
    ]);
    const start = school();
    start.placements = [];
    expect(roomDeletionLines(start, 'p101')[0]).toBe(
      "2 cards use P101, and none is on the grid. They'll be left with no room.",
    );
  });

  it('says only that nothing uses a room with no cards', () => {
    expect(roomDeletionLines(school(), 'lab')).toEqual(['Nothing uses Phòng Lab.', undone]);
  });

  it('says nothing for a room that is gone', () => {
    expect(roomDeletionLines(school(), 'nowhere')).toEqual([]);
  });
});
