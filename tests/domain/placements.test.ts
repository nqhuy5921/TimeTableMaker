import { describe, expect, it } from 'vitest';
import type { Card, Placement, PlacementPart, TimetableFile } from '../../src/domain/model';
import {
  drop,
  movePlacement,
  periodsBySubject,
  removePlacement,
  slotPlacements,
  type DropTarget,
} from '../../src/domain/placements';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

function card(id: string, subjectId: string, teacherId: string | null = null): Card {
  return { id, subjectId, teacherId, roomId: null };
}

function placed(
  id: string,
  cardId: string,
  part: PlacementPart,
  block = 1,
  classId = '6A1',
): Placement {
  return { id, cardId, classId, day: 0, block: block as Placement['block'], part };
}

/** A pool of Toán, Ngữ văn, SH lớp, and a second Toán card, for 6A1 and 7B2. */
function school(placements: Placement[] = []): TimetableFile {
  return {
    ...createEmptyTimetable(),
    classes: [
      { id: '6A1', name: '6A1', grade: 6, track: 'A', section: 1 },
      { id: '7B2', name: '7B2', grade: 7, track: 'B', section: 2 },
    ],
    subjects: [
      { id: 'math', name: 'Toán', colorKey: 'math' },
      { id: 'lit', name: 'Ngữ văn', colorKey: 'literature' },
      { id: 'home', name: 'SH lớp', colorKey: 'homeroom' },
    ],
    cards: [
      card('toan', 'math'),
      card('van', 'lit'),
      card('sh', 'home'),
      card('toan7', 'math', 'lan'),
    ],
    placements,
  };
}

const at = (part: PlacementPart): DropTarget => ({ day: 0, block: 1, part });

function dropOk(file: TimetableFile, cardId: string, target: DropTarget, classId = '6A1') {
  const result = drop(file, cardId, classId, target, () => 'new');
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** What's in Monday's block 1 of 6A1, as "card:part", sorted. */
function slot(file: TimetableFile): string[] {
  return slotPlacements(file, '6A1', 0, 1)
    .map((p) => `${p.cardId}:${p.part}`)
    .sort();
}

describe('drop (TB-4, the drop table in SYSTEM_DESIGN §3)', () => {
  it('middle on an empty slot: the card fills the block', () => {
    const result = dropOk(school(), 'toan', at('full'));
    expect(slot(result.file)).toEqual(['toan:full']);
    expect(result.file.placements).toEqual([
      { id: 'new', cardId: 'toan', classId: '6A1', day: 0, block: 1, part: 'full' },
    ]);
    expect(result.removed).toEqual([]);
  });

  it('middle on a full block: the old card is removed', () => {
    const old = placed('p1', 'van', 'full');
    const result = dropOk(school([old]), 'toan', at('full'));
    expect(slot(result.file)).toEqual(['toan:full']);
    expect(result.removed).toEqual([old]);
  });

  it('middle on two halves: both are removed', () => {
    const first = placed('p1', 'sh', 'first');
    const second = placed('p2', 'van', 'second');
    const result = dropOk(school([first, second]), 'toan', at('full'));
    expect(slot(result.file)).toEqual(['toan:full']);
    expect(result.removed).toEqual([first, second]);
  });

  it('a half on an empty slot: the card goes into that half', () => {
    expect(slot(dropOk(school(), 'sh', at('first')).file)).toEqual(['sh:first']);
    expect(slot(dropOk(school(), 'sh', at('second')).file)).toEqual(['sh:second']);
  });

  it('a half when only the other half is filled: the two share the block', () => {
    const first = placed('p1', 'sh', 'first');
    const result = dropOk(school([first]), 'van', at('second'));
    expect(slot(result.file)).toEqual(['sh:first', 'van:second']);
    expect(result.removed).toEqual([]);
  });

  it('a half with a card in that half: that card is removed, the other half stays', () => {
    const first = placed('p1', 'sh', 'first');
    const second = placed('p2', 'van', 'second');
    const result = dropOk(school([first, second]), 'toan', at('first'));
    expect(slot(result.file)).toEqual(['toan:first', 'van:second']);
    expect(result.removed).toEqual([first]);
  });

  it('a half on a full block: the full block is removed and the other half left empty', () => {
    const full = placed('p1', 'van', 'full');
    const result = dropOk(school([full]), 'sh', at('second'));
    expect(slot(result.file)).toEqual(['sh:second']);
    expect(result.removed).toEqual([full]);
  });

  it("leaves other slots and other classes' placements alone", () => {
    const otherBlock = placed('p1', 'van', 'full', 2);
    const otherDay = { ...placed('p2', 'van', 'full'), day: 3 as const };
    const otherClass = placed('p3', 'toan7', 'full', 1, '7B2');
    const result = dropOk(school([otherBlock, otherDay, otherClass]), 'toan', at('full'));
    expect(result.removed).toEqual([]);
    expect(result.file.placements).toEqual([
      otherBlock,
      otherDay,
      otherClass,
      { id: 'new', cardId: 'toan', classId: '6A1', day: 0, block: 1, part: 'full' },
    ]);
  });

  it('dropping a card where it already is changes nothing', () => {
    const file = school([placed('p1', 'toan', 'full')]);
    const result = dropOk(file, 'toan', at('full'));
    expect(result.file).toBe(file);
    expect(result.removed).toEqual([]);
  });

  it('places the same card more than once in a week', () => {
    const file = dropOk(school(), 'toan', at('full')).file;
    const again = drop(file, 'toan', '6A1', { day: 2, block: 3, part: 'full' }, () => 'again');
    expect(again.ok && again.file.placements).toHaveLength(2);
  });

  it("puts the card on the given class's grid, the same card on several classes", () => {
    const onFirst = dropOk(school(), 'toan', at('full'), '6A1').file;
    const onBoth = dropOk(onFirst, 'toan', at('full'), '7B2').file;
    expect(onBoth.placements.map((p) => [p.cardId, p.classId])).toEqual([
      ['toan', '6A1'],
      ['toan', '7B2'],
    ]);
    expect(slot(onBoth)).toEqual(['toan:full']);
  });

  it("refuses a class that doesn't exist", () => {
    expect(drop(school(), 'toan', 'gone', at('full'))).toEqual({
      ok: false,
      error: "That class isn't in the list.",
    });
  });

  it('refuses a card that no longer exists', () => {
    const result = drop(school(), 'gone', '6A1', at('full'));
    expect(result).toEqual({ ok: false, error: "That card doesn't exist any more." });
  });
});

describe('movePlacement (TB-5)', () => {
  const on = (day: number, block: number, part: PlacementPart): DropTarget => ({
    day: day as DropTarget['day'],
    block: block as DropTarget['block'],
    part,
  });

  function moveOk(file: TimetableFile, placementId: string, target: DropTarget) {
    const result = movePlacement(file, placementId, target);
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  it('moves a card to an empty slot, keeping its id', () => {
    const result = moveOk(school([placed('p1', 'toan', 'full')]), 'p1', on(2, 3, 'full'));
    expect(result.file.placements).toEqual([
      { id: 'p1', cardId: 'toan', classId: '6A1', day: 2, block: 3, part: 'full' },
    ]);
    expect(result.removed).toEqual([]);
  });

  it('the part it lands on sets its size, the same as a drop', () => {
    const file = school([placed('p1', 'toan', 'full'), placed('p2', 'sh', 'first', 2)]);
    const half = moveOk(file, 'p1', on(3, 1, 'second'));
    expect(half.file.placements).toContainEqual({
      id: 'p1',
      cardId: 'toan',
      classId: '6A1',
      day: 3,
      block: 1,
      part: 'second',
    });
    const full = moveOk(file, 'p2', on(3, 1, 'full'));
    expect(full.file.placements).toContainEqual({
      id: 'p2',
      cardId: 'sh',
      classId: '6A1',
      day: 3,
      block: 1,
      part: 'full',
    });
  });

  it('replaces what is in the target slot, the same as a drop', () => {
    const moving = { ...placed('p1', 'toan', 'full'), day: 4 as const };
    const first = placed('p2', 'sh', 'first');
    const second = placed('p3', 'van', 'second');
    const whole = moveOk(school([moving, first, second]), 'p1', at('full'));
    expect(slot(whole.file)).toEqual(['toan:full']);
    expect(whole.removed).toEqual([first, second]);

    const half = moveOk(school([moving, first, second]), 'p1', at('second'));
    expect(slot(half.file)).toEqual(['sh:first', 'toan:second']);
    expect(half.removed).toEqual([second]);
  });

  it('moves within its own slot, from a full block to a half or between halves', () => {
    const toHalf = moveOk(school([placed('p1', 'toan', 'full')]), 'p1', at('first'));
    expect(slot(toHalf.file)).toEqual(['toan:first']);
    expect(toHalf.removed).toEqual([]);

    const second = placed('p2', 'van', 'second');
    const swap = moveOk(school([placed('p1', 'sh', 'first'), second]), 'p1', at('second'));
    expect(slot(swap.file)).toEqual(['sh:second']);
    expect(swap.removed).toEqual([second]);
  });

  it('moving onto the same card in the same part leaves one of them', () => {
    const there = placed('p2', 'toan', 'full');
    const result = moveOk(
      school([{ ...placed('p1', 'toan', 'full'), day: 4 }, there]),
      'p1',
      at('full'),
    );
    expect(result.file.placements).toEqual([there]);
  });

  it('putting a card back where it was changes nothing', () => {
    const file = school([placed('p1', 'toan', 'first')]);
    const result = moveOk(file, 'p1', at('first'));
    expect(result.file).toBe(file);
    expect(result.removed).toEqual([]);
  });

  it("keeps the placement's class", () => {
    const file = school([placed('p1', 'toan', 'full', 1, '7B2')]);
    const result = moveOk(file, 'p1', on(2, 3, 'full'));
    expect(result.file.placements).toEqual([
      { id: 'p1', cardId: 'toan', classId: '7B2', day: 2, block: 3, part: 'full' },
    ]);
  });

  it('refuses a placement that is gone', () => {
    expect(movePlacement(school(), 'gone', at('full'))).toEqual({
      ok: false,
      error: "That card isn't on the grid any more.",
    });
  });
});

describe('removePlacement (TB-5)', () => {
  it('takes the card off the grid and leaves the rest', () => {
    const keep = placed('p2', 'van', 'second');
    const file = removePlacement(school([placed('p1', 'sh', 'first'), keep]), 'p1');
    expect(file.placements).toEqual([keep]);
    expect(file.cards).toHaveLength(4);
    expect(periodsBySubject(file, '6A1')).toEqual([{ subjectId: 'lit', periods: 1 }]);
  });

  it('changes nothing for a placement that is gone', () => {
    const file = school([placed('p1', 'sh', 'first')]);
    expect(removePlacement(file, 'gone')).toBe(file);
  });
});

describe('periodsBySubject (DM-7)', () => {
  it('counts 2 per full block and 1 per half, per subject in subject order', () => {
    const file = school([
      placed('p1', 'sh', 'first'),
      placed('p2', 'toan', 'full', 2),
      placed('p3', 'toan', 'full', 3),
      placed('p4', 'van', 'second'),
      placed('p5', 'toan7', 'full', 4, '7B2'),
    ]);
    expect(periodsBySubject(file, '6A1')).toEqual([
      { subjectId: 'math', periods: 4 },
      { subjectId: 'lit', periods: 1 },
      { subjectId: 'home', periods: 1 },
    ]);
  });

  it('sums every card of a subject', () => {
    const file = school([placed('p1', 'toan', 'full', 2), placed('p2', 'toan7', 'full', 3)]);
    expect(periodsBySubject(file, '6A1')).toEqual([{ subjectId: 'math', periods: 4 }]);
  });

  it('leaves out subjects with nothing placed', () => {
    expect(periodsBySubject(school(), '6A1')).toEqual([]);
  });
});
