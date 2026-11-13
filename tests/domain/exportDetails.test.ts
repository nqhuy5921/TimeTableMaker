import { describe, expect, it } from 'vitest';
import { exampleSchool } from '../../src/domain/exampleSchool';
import {
  checkExportDetails,
  cleanExportDetails,
  dateInputValue,
  defaultExportDetails,
  EXPORT_DETAIL_MESSAGES,
  exportClassIds,
  exportIssuesLine,
  exportTitle,
  SCHOOL_NAME_MAX,
  schoolYearOf,
} from '../../src/domain/exportDetails';

// The Export dialog's details and wording (IE-2, TC-4, SYSTEM_DESIGN §11.4).

const ok = {
  schoolName: 'Trung học/Secondary School',
  schoolYear: '2026 - 2027',
  appliesFrom: '2026-09-03',
};

describe('the details an export starts with', () => {
  it('are the sample’s school, the school year the date is in, and today', () => {
    expect(defaultExportDetails(new Date(2026, 9, 28))).toEqual({
      schoolName: 'Trung học/Secondary School',
      schoolYear: '2026 - 2027',
      appliesFrom: '2026-10-28',
    });
  });

  it('start the school year in August', () => {
    expect(schoolYearOf(new Date(2026, 6, 31))).toBe('2025 - 2026');
    expect(schoolYearOf(new Date(2026, 7, 1))).toBe('2026 - 2027');
    expect(schoolYearOf(new Date(2027, 0, 5))).toBe('2026 - 2027');
  });

  it('write the date as a date input does, in local time', () => {
    expect(dateInputValue(new Date(2026, 8, 3, 23, 30))).toBe('2026-09-03');
  });
});

describe('checking the details', () => {
  it('takes good details', () => {
    expect(checkExportDetails(ok)).toEqual({});
  });

  it('asks for a school name of at most its length', () => {
    expect(checkExportDetails({ ...ok, schoolName: '' })).toEqual({
      schoolName: EXPORT_DETAIL_MESSAGES.schoolName,
    });
    expect(checkExportDetails({ ...ok, schoolName: 'x'.repeat(SCHOOL_NAME_MAX + 1) })).toEqual({
      schoolName: EXPORT_DETAIL_MESSAGES.schoolNameLong,
    });
  });

  it('counts characters as profile names do, an emoji as one (R4-8 review)', () => {
    expect(checkExportDetails({ ...ok, schoolName: '🏫'.repeat(SCHOOL_NAME_MAX) })).toEqual({});
  });

  it('asks for two years in a row as the school year', () => {
    for (const schoolYear of ['', '2026', '2026 - 2028', '2027 - 2026', '26 - 27', 'next year']) {
      expect(checkExportDetails({ ...ok, schoolYear })).toEqual({
        schoolYear: 'Enter the school year, as in 2026 - 2027.',
      });
    }
  });

  it('asks for a real day', () => {
    for (const appliesFrom of ['', '2026-02-30', '2026-13-01', '03/09/2026']) {
      expect(checkExportDetails({ ...ok, appliesFrom })).toEqual({
        appliesFrom: EXPORT_DETAIL_MESSAGES.appliesFrom,
      });
    }
    expect(checkExportDetails({ ...ok, appliesFrom: '2028-02-29' })).toEqual({});
  });

  it('tidies the text first, so a year typed with a plain dash is taken', () => {
    const cleaned = cleanExportDetails({
      schoolName: '  Trung học/Secondary   School ',
      schoolYear: ' 2026-2027 ',
      appliesFrom: ' 2026-09-03',
    });
    expect(cleaned).toEqual(ok);
    expect(cleanExportDetails({ ...ok, schoolYear: '2026 – 2027' }).schoolYear).toBe('2026 - 2027');
  });
});

describe('what an export writes', () => {
  it('is the class on screen, or every class in class-bar order', () => {
    expect(exportClassIds(exampleSchool, 'class', 'c-8ce1')).toEqual(['c-8ce1']);
    expect(exportClassIds(exampleSchool, 'class', null)).toEqual([]);
    const shuffled = { ...exampleSchool, classes: [...exampleSchool.classes].reverse() };
    expect(exportClassIds(shuffled, 'all', 'c-8ce1')).toEqual([
      'c-6a1',
      'c-6a2',
      'c-7aa1',
      'c-8ce1',
      'c-9b1',
      'c-9ba1',
    ]);
  });
});

describe('the Export dialog’s wording', () => {
  it('names what is exported in the title', () => {
    expect(exportTitle('class', '6A1', 34, 'xlsx')).toBe('Export 6A1 as Excel');
    expect(exportTitle('all', '6A1', 34, 'pdf')).toBe('Export all 34 classes as PDF');
    expect(exportTitle('all', '6A1', 1, 'xlsx')).toBe('Export the one class as Excel');
  });

  it('asks before exporting with errors or warnings (TC-4)', () => {
    expect(exportIssuesLine('class', '6A1', { errors: 2, warnings: 1 })).toBe(
      '6A1 has 2 errors and 1 warning. You can still export it.',
    );
    expect(exportIssuesLine('all', '6A1', { errors: 4, warnings: 2 })).toBe(
      'The timetable has 4 errors and 2 warnings. You can still export it.',
    );
    expect(exportIssuesLine('class', '6A1', { errors: 0, warnings: 3 })).toBe(
      '6A1 has 3 warnings. You can still export it.',
    );
    expect(exportIssuesLine('all', '6A1', { errors: 1, warnings: 0 })).toBe(
      'The timetable has 1 error. You can still export it.',
    );
    expect(exportIssuesLine('class', '6A1', { errors: 0, warnings: 0 })).toBeNull();
  });
});
