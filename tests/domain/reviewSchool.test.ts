import { describe, expect, it } from 'vitest';
import { REVIEW_CLASS_ID, reviewSchool } from '../../fixtures/reviewSchool';
import { cardTableRows } from '../../src/domain/cardPanel';
import { checkTimetable } from '../../src/domain/checks';
import { classesByGrade, placedPeriods } from '../../src/domain/classes';
import { setConditionOn } from '../../src/domain/conditions';
import { WEEKLY_PERIODS } from '../../src/domain/model';
import {
  DATA_HEADER,
  DATA_LOOKUP_COLUMNS,
  dataSheet,
  EXPORT_LABELS,
} from '../../src/domain/exportSheets';
import { periodsBySubject } from '../../src/domain/placements';
import { readTimetableFile, serializeTimetableFile } from '../../src/shared/fileFormat';

// The review school is for looking at the screens by eye (npm run dev:review). These
// checks keep it a valid file that still shows what it's for.

describe('the review school', () => {
  it('loads as a saved timetable file', () => {
    const read = readTimetableFile(serializeTimetableFile(reviewSchool));
    expect(read).toEqual({ ok: true, file: reviewSchool, upgradedFrom: null });
  });

  it("fills 6A1 with enough subjects for the summary's tags to wrap", () => {
    expect(periodsBySubject(reviewSchool, REVIEW_CLASS_ID)).toHaveLength(17);
    expect(placedPeriods(reviewSchool, REVIEW_CLASS_ID)).toBe(46);
  });

  it('has a grade with enough classes for the class bar to scroll', () => {
    const grade6 = classesByGrade(reviewSchool.classes).find((g) => g.grade === 6);
    expect(grade6?.classes).toHaveLength(11);
  });

  it('has a card on every grade 6 class, and cards on no grid', () => {
    const rows = cardTableRows(reviewSchool, '');
    expect(rows.find((r) => r.id === 'td-tung')?.classes).toHaveLength(11);
    expect(rows.filter((r) => r.classes.length === 0).length).toBeGreaterThan(5);
  });

  it('never puts more than a full week on a grid', () => {
    for (const c of reviewSchool.classes) {
      expect(placedPeriods(reviewSchool, c.id)).toBeLessThanOrEqual(WEEKLY_PERIODS);
    }
  });

  it('shows clashes, broken and met conditions, a switched-off one, and a warning', () => {
    const issues = checkTimetable(reviewSchool);
    expect(issues.some((i) => i.kind === 'teacherTwice')).toBe(true);
    expect(issues.some((i) => i.kind === 'roomTwice')).toBe(true);
    expect(issues.filter((i) => i.conditionId !== null).map((i) => i.message)).toEqual([
      'Cô Ngân: 4 periods on Monday, limit is 3',
      'Thầy Phúc: 3 free blocks between lessons on Thursday, limit is 2',
    ]);
    expect(issues.filter((i) => i.severity === 'warning').map((i) => i.message)).toEqual([
      '6AA2 has Toán twice on Thursday',
    ]);
    // Thầy Hiếu's day off is there and met.
    const teacher = (name: string) => reviewSchool.teachers.find((t) => t.shortName === name)!;
    expect(teacher('Thầy Hiếu').conditions.map((c) => [c.id, c.on])).toEqual([
      ['cond-hieu-off', true],
    ]);
    // Cô Vy's is switched off, and would be broken if it were on.
    expect(teacher('Cô Vy').conditions.map((c) => [c.id, c.on])).toEqual([['cond-vy-days', false]]);
    const on = setConditionOn(reviewSchool, teacher('Cô Vy').id, 'cond-vy-days', true);
    expect(checkTimetable(on).some((i) => i.conditionId === 'cond-vy-days')).toBe(true);
  });

  it("fills the export's headers and Data , with a few gaps (R4-7)", () => {
    const rows = dataSheet(
      reviewSchool,
      reviewSchool.classes.map((c) => c.id),
    ).rows;
    expect(rows).toHaveLength(21);
    const column = (index: number) => (row: string[]) => row[index - 1] ?? '';
    const homeroom = column(DATA_LOOKUP_COLUMNS.fullName);
    const assistant = column(DATA_HEADER.indexOf(EXPORT_LABELS.assistant) + 1);
    // Every class but 9BA1 has a homeroom teacher with a full name, and every third an
    // assistant.
    const withHomeroom = rows.filter((r) => homeroom(r) !== '');
    expect(rows.filter((r) => homeroom(r) === '').map((r) => r[0])).toEqual(['9BA1']);
    expect(rows.filter((r) => assistant(r) !== '')).toHaveLength(7);
    // Some homeroom teachers have no phone or no email.
    const phones = withHomeroom.map(column(DATA_LOOKUP_COLUMNS.phone));
    const emails = withHomeroom.map(column(DATA_LOOKUP_COLUMNS.email));
    expect(phones.filter((p) => p !== '').length).toBeGreaterThan(10);
    expect(phones).toContain('');
    expect(emails.filter((e) => e !== '').length).toBeGreaterThan(10);
    expect(emails).toContain('');
    expect(rows[0]).toEqual([
      '6A1',
      'Vũ Kim Ngân',
      'Âu Sơn Tùng',
      '0901 234 501',
      '0901 234 508',
      'ngan.vk@example.com',
      '',
    ]);
  });
});
