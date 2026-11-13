import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import { createAppState } from '../../src/domain/appState';
import {
  addCard,
  cardClasses,
  cardName,
  cardView,
  clearCardField,
  clearCardFieldPreview,
  deleteCard,
  duplicateCardMessage,
  editCard,
  placementCount,
  poolCards,
  type CardFields,
  type CardResult,
} from '../../src/domain/cards';
import { addClass } from '../../src/domain/classes';
import { drop, removePlacement } from '../../src/domain/placements';
import { addRoom, addSubject, addTeacherByShortName, type AddResult } from '../../src/domain/lists';
import type { TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

function ok(result: AddResult | CardResult): TimetableFile {
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

/** Two classes, two subjects, two teachers, and two rooms, all with readable ids. */
function school(): TimetableFile {
  let state = createAppState(emptySchool());
  for (const name of ['6A1', '7B2']) {
    const result = addClass(state, name, () => name);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  let file = state.file;
  file = ok(addSubject(file, 'Toán', undefined, () => 'math'));
  file = ok(addSubject(file, 'SH lớp', undefined, () => 'homeroom'));
  file = ok(addTeacherByShortName(file, 'Lan', () => 'lan'));
  file = ok(addTeacherByShortName(file, 'Hùng', () => 'hung'));
  file = ok(addRoom(file, 'P101', () => 'p101'));
  file = ok(addRoom(file, 'P102', () => 'p102'));
  return file;
}

const toan: CardFields = { subjectId: 'math', teacherId: 'lan', roomId: 'p101' };

describe('addSubject, addTeacherByShortName, addRoom (TB-3)', () => {
  it('adds a subject with its color from the name', () => {
    const file = school();
    expect(file.subjects).toEqual([
      { id: 'math', name: 'Toán', colorKey: 'math' },
      { id: 'homeroom', name: 'SH lớp', colorKey: 'homeroom' },
    ]);
  });

  it('trims names and rejects empty ones', () => {
    const file = createEmptyTimetable();
    expect(ok(addTeacherByShortName(file, '  Lan ', () => 't')).teachers).toEqual([
      { id: 't', shortName: 'Lan', conditions: [] },
    ]);
    expect(addSubject(file, ' ')).toEqual({
      ok: false,
      error: 'Enter a subject name.',
    });
    expect(addTeacherByShortName(file, '')).toMatchObject({ ok: false });
    expect(addRoom(file, '')).toMatchObject({ ok: false });
  });

  it('rejects a name already in its list, whatever the case', () => {
    const file = school();
    expect(addSubject(file, 'toán')).toEqual({
      ok: false,
      error: "There's already a subject called Toán.",
    });
    expect(addTeacherByShortName(file, 'LAN')).toMatchObject({ ok: false });
    expect(addRoom(file, 'p101')).toMatchObject({ ok: false });
  });

  it('stores one Unicode form and single spaces, so look-alike names clash', () => {
    const decomposed = 'Toa\u0301n'; // "Toán" as a + combining acute, as pasted text can be
    expect(addSubject(school(), decomposed)).toMatchObject({
      ok: false,
      error: "There's already a subject called Toán.",
    });
    expect(addSubject(school(), 'SH  lớp').ok).toBe(false);
    const added = addRoom(createEmptyTimetable(), '  Lab \t 2 ', () => 'r');
    expect(added.ok && added.file.rooms).toEqual([{ id: 'r', name: 'Lab 2' }]);
  });

  it('keeps accents apart: Toan is not Toán', () => {
    expect(addSubject(school(), 'Toan').ok).toBe(true);
  });
});

const homeroom: CardFields = { subjectId: 'homeroom', teacherId: null, roomId: null };

describe('addCard (DM-5)', () => {
  it('adds a card to the pool, with no class', () => {
    const result = addCard(school(), toan, () => 'card1');
    expect(result.ok && result.file.cards).toEqual([{ id: 'card1', ...toan }]);
  });

  it('allows an empty teacher and room', () => {
    expect(addCard(school(), homeroom).ok).toBe(true);
  });

  it('refuses a subject, teacher, and room another card has', () => {
    const first = ok(addCard(school(), toan));
    expect(addCard(first, toan)).toEqual({
      ok: false,
      error: "There's already a card for Toán with Lan in P101.",
      field: 'subject',
    });
    const bare = { ...toan, teacherId: null, roomId: null };
    const second = ok(addCard(first, bare));
    expect(addCard(second, bare)).toEqual({
      ok: false,
      error: "There's already a card for Toán with no teacher in no room.",
      field: 'subject',
    });
  });

  it('allows the same subject with another teacher or room', () => {
    const first = ok(addCard(school(), toan));
    expect(addCard(first, { ...toan, teacherId: 'hung' }).ok).toBe(true);
    expect(addCard(first, { ...toan, roomId: 'p102' }).ok).toBe(true);
    expect(addCard(first, { ...toan, roomId: null }).ok).toBe(true);
    expect(addCard(first, { ...toan, teacherId: null }).ok).toBe(true);
  });

  it.each([
    [{ ...toan, subjectId: null }, 'subject'],
    [{ ...toan, subjectId: 'nope' }, 'subject'],
    [{ ...toan, teacherId: 'nope' }, 'teacher'],
    [{ ...toan, roomId: 'nope' }, 'room'],
  ])('rejects bad fields %#', (fields, field) => {
    expect(addCard(school(), fields)).toMatchObject({ ok: false, field });
  });
});

describe('duplicateCardMessage', () => {
  it('names the subject, teacher, and room, or says there is none', () => {
    expect(duplicateCardMessage(school(), toan)).toBe(
      "There's already a card for Toán with Lan in P101.",
    );
    expect(duplicateCardMessage(school(), { ...toan, teacherId: null, roomId: null })).toBe(
      "There's already a card for Toán with no teacher in no room.",
    );
  });
});

describe('editCard (DM-5)', () => {
  /** One Toán card placed in both classes. */
  function withCard() {
    const file = ok(addCard(school(), toan, () => 'card1'));
    return {
      ...file,
      placements: [
        { id: 'p1', cardId: 'card1', classId: '6A1', day: 0, block: 1, part: 'full' },
        { id: 'p2', cardId: 'card1', classId: '7B2', day: 2, block: 0, part: 'first' },
      ],
    } satisfies TimetableFile;
  }

  it('changes the teacher and room, and keeps the placements in every class', () => {
    const file = withCard();
    const result = editCard(file, 'card1', { ...toan, teacherId: null, roomId: null });
    expect(result.ok && result.file.cards).toEqual([
      { id: 'card1', subjectId: 'math', teacherId: null, roomId: null },
    ]);
    expect(result.ok && result.file.placements).toEqual(file.placements);
  });

  it('keeps its own values without clashing with itself', () => {
    expect(editCard(withCard(), 'card1', toan).ok).toBe(true);
  });

  it('refuses a subject, teacher, and room another card has', () => {
    const second = ok(addCard(withCard(), homeroom, () => 'card2'));
    expect(editCard(second, 'card2', toan)).toEqual({
      ok: false,
      error: "There's already a card for Toán with Lan in P101.",
      field: 'subject',
    });
  });

  it('rejects a card that does not exist', () => {
    expect(editCard(withCard(), 'nope', toan)).toMatchObject({ ok: false, field: 'card' });
  });
});

describe('deleteCard (DM-5)', () => {
  it('removes the card and its placements in every class, and nothing else', () => {
    const first = ok(addCard(school(), toan, () => 'card1'));
    const file: TimetableFile = {
      ...ok(addCard(first, homeroom, () => 'card2')),
      placements: [
        { id: 'p1', cardId: 'card1', classId: '6A1', day: 0, block: 0, part: 'full' },
        { id: 'p2', cardId: 'card2', classId: '6A1', day: 0, block: 1, part: 'first' },
        { id: 'p3', cardId: 'card1', classId: '7B2', day: 2, block: 3, part: 'full' },
      ],
    };
    expect(placementCount(file, 'card1')).toBe(2);

    const after = deleteCard(file, 'card1');
    expect(after.cards.map((c) => c.id)).toEqual(['card2']);
    expect(after.placements.map((p) => p.id)).toEqual(['p2']);
    expect(placementCount(after, 'card1')).toBe(0);
  });

  it('leaves the file as it is for a card that does not exist', () => {
    const file = school();
    expect(deleteCard(file, 'nope')).toBe(file);
  });
});

describe('poolCards', () => {
  it('lists subject order, then teacher-list order with no teacher last, then room name', () => {
    let file = school();
    // Added out of order on purpose; Hùng comes after Lan in the teacher list.
    for (const [id, subjectId, teacherId, roomId] of [
      ['home', 'homeroom', null, null],
      ['math-bare', 'math', null, null],
      ['math-hung', 'math', 'hung', 'p101'],
      ['math-lan-102', 'math', 'lan', 'p102'],
      ['math-lan-none', 'math', 'lan', null],
      ['math-lan-101', 'math', 'lan', 'p101'],
    ] as const) {
      file = ok(addCard(file, { subjectId, teacherId, roomId }, () => id));
    }
    expect(poolCards(file).map((c) => c.id)).toEqual([
      'math-lan-101',
      'math-lan-102',
      'math-lan-none',
      'math-hung',
      'math-bare',
      'home',
    ]);
  });
});

describe('poolCards room order', () => {
  it('sorts room names with numbers by value, so P9 comes before P10', () => {
    let file = ok(addRoom(ok(addRoom(school(), 'P10', () => 'p10')), 'P9', () => 'p9'));
    for (const [id, roomId] of [
      ['in-10', 'p10'],
      ['in-9', 'p9'],
    ] as const) {
      file = ok(addCard(file, { subjectId: 'math', teacherId: 'lan', roomId }, () => id));
    }
    expect(poolCards(file).map((c) => c.id)).toEqual(['in-9', 'in-10']);
  });
});

describe('cardClasses (DM-5)', () => {
  const placement = (id: string, classId: string, day: 0 | 1 | 2) =>
    ({ id, cardId: 'card1', classId, day, block: 0, part: 'full' }) as const;

  it("lists the classes it's on in class-bar order, once each", () => {
    const file = ok(addCard(school(), toan, () => 'card1'));
    const withPlacements: TimetableFile = {
      ...file,
      placements: [placement('p1', '7B2', 0), placement('p2', '6A1', 1), placement('p3', '7B2', 2)],
    };
    expect(cardClasses(withPlacements, 'card1').map((c) => c.name)).toEqual(['6A1', '7B2']);
  });

  it('orders by the class bar, not by the order of the file', () => {
    const base = ok(addCard(school(), toan, () => 'card1'));
    const aa = { id: '6AA1', name: '6AA1', grade: 6, track: 'AA', section: 1 } as const;
    const a = base.classes.find((c) => c.id === '6A1')!;
    const file: TimetableFile = {
      ...base,
      classes: [aa, a, ...base.classes.filter((c) => c.id !== '6A1')],
      placements: [placement('p1', '6AA1', 0), placement('p2', '6A1', 1)],
    };
    expect(file.classes[0]!.name).toBe('6AA1');
    expect(cardClasses(file, 'card1').map((c) => c.name)).toEqual(['6A1', '6AA1']);
  });

  it('cardClasses follows drops and removals', () => {
    const names = (f: TimetableFile) => cardClasses(f, 'card1').map((c) => c.name);
    const target = { day: 0, block: 0, part: 'full' } as const;
    const dropped = (f: TimetableFile, classId: string, id: string) => {
      const result = drop(f, 'card1', classId, target, () => id);
      if (!result.ok) throw new Error(result.error);
      return result.file;
    };
    let file = ok(addCard(school(), toan, () => 'card1'));
    file = dropped(file, '6A1', 'pa');
    expect(names(file)).toEqual(['6A1']);
    file = dropped(file, '7B2', 'pb');
    expect(names(file)).toEqual(['6A1', '7B2']);
    file = removePlacement(file, 'pa');
    expect(names(file)).toEqual(['7B2']);
    file = removePlacement(file, 'pb');
    expect(names(file)).toEqual([]);
  });

  it("is empty for a card that isn't placed", () => {
    const file = ok(addCard(school(), toan, () => 'card1'));
    expect(cardClasses(file, 'card1')).toEqual([]);
  });
});

describe('cardView (DM-7)', () => {
  it('looks up the subject, its colors, the teacher by short name, and the room', () => {
    let file = ok(addCard(school(), toan, () => 'c1'));
    file = ok(addCard(file, homeroom, () => 'c2'));
    expect(poolCards(file).map((card) => cardView(file, card))).toEqual([
      {
        id: 'c1',
        subject: 'Toán',
        colors: { key: 'math', custom: null },
        teacher: 'Lan',
        room: 'P101',
      },
      {
        id: 'c2',
        subject: 'SH lớp',
        colors: { key: 'homeroom', custom: null },
        teacher: null,
        room: null,
      },
    ]);
  });

  it('shows an edited card with its new details', () => {
    let file = ok(addCard(school(), toan, () => 'c1'));
    file = ok(editCard(file, 'c1', { ...toan, teacherId: 'hung', roomId: null }));
    expect(cardView(file, file.cards[0]!)).toMatchObject({ teacher: 'Hùng', room: null });
  });
});

describe('cardName', () => {
  it('names the subject, teacher, and room, leaving out the ones the card has not got', () => {
    expect(cardName({ subject: 'Toán', teacher: 'Thầy Phúc', room: 'P101' })).toBe(
      'Toán · Thầy Phúc · P101',
    );
    expect(cardName({ subject: 'Toán', teacher: null, room: 'P101' })).toBe('Toán · P101');
    expect(cardName({ subject: 'SH lớp', teacher: null, room: null })).toBe('SH lớp');
  });
});

describe('clearCardField (DM-1, DM-3)', () => {
  // Lan's Toán in P101 and P102, and a Toán in P101 with no teacher; Lan's in P101 is placed.
  function pool(): TimetableFile {
    let file = school();
    file = ok(addCard(file, toan, () => 'lan-101'));
    file = ok(addCard(file, { ...toan, roomId: 'p102' }, () => 'lan-102'));
    file = ok(addCard(file, { ...toan, teacherId: null }, () => 'none-101'));
    file = ok(addCard(file, { ...toan, roomId: null }, () => 'lan-none'));
    return {
      ...file,
      placements: [{ id: 'p', cardId: 'lan-101', classId: '6A1', day: 0, block: 0, part: 'full' }],
    };
  }

  it('empties the teacher, merging a card that then matches one with no teacher', () => {
    const preview = clearCardFieldPreview(pool(), 'teacherId', 'lan');
    expect(preview.cards.map((c) => c.id)).toEqual(['lan-101', 'lan-102', 'lan-none']);
    expect(preview.placements).toBe(1);
    expect(preview.merges.map((m) => [m.card.id, m.into.id])).toEqual([['lan-101', 'none-101']]);
    const file = clearCardField(pool(), 'teacherId', 'lan');
    expect(file.cards.map((c) => [c.id, c.teacherId])).toEqual([
      ['lan-102', null],
      ['none-101', null],
      ['lan-none', null],
    ]);
    expect(file.placements.map((p) => p.cardId)).toEqual(['none-101']);
  });

  it('empties the room the same way, merging into the card with no room', () => {
    const preview = clearCardFieldPreview(pool(), 'roomId', 'p101');
    expect(preview.merges.map((m) => [m.card.id, m.into.id])).toEqual([['lan-101', 'lan-none']]);
    const file = clearCardField(pool(), 'roomId', 'p101');
    expect(file.cards.map((c) => [c.id, c.roomId])).toEqual([
      ['lan-102', 'p102'],
      ['none-101', null],
      ['lan-none', null],
    ]);
    expect(file.placements.map((p) => p.cardId)).toEqual(['lan-none']);
  });

  it('returns the same file when no card has it', () => {
    const start = pool();
    expect(clearCardField(start, 'teacherId', 'hung')).toBe(start);
  });
});
