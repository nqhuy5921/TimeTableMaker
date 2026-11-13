import { classesByGrade } from './classes';
import type { ExportDetails, ExportFormat, ExportScope } from './exportSheets';
import type { IssueCounts } from './issues';
import type { Id, TimetableFile } from './model';
import { charCount, plural } from './text';

// The Export dialog's details and wording (IE-2, IE-4, TC-4, SYSTEM_DESIGN §11.4): what it
// starts with, how its fields are checked, and what it says about the issues.

/** The school line the sample workbook has. */
export const DEFAULT_SCHOOL_NAME = 'Trung học/Secondary School';

/** The longest school name the dialog takes, so a title row stays one line or two. */
export const SCHOOL_NAME_MAX = 120;

const pad = (n: number) => String(n).padStart(2, '0');

/** The date as a date input's value, yyyy-mm-dd, in local time. */
export function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The school year a date falls in: from August on, the year that starts then ("2026 -
    2027" on 2026-10-28), before August the one that started the year before. */
export function schoolYearOf(date: Date): string {
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start} - ${start + 1}`;
}

/** What the dialog starts with for a profile that hasn't exported yet. */
export function defaultExportDetails(today: Date): ExportDetails {
  return {
    schoolName: DEFAULT_SCHOOL_NAME,
    schoolYear: schoolYearOf(today),
    appliesFrom: dateInputValue(today),
  };
}

/** Each field's message, for the fields that can't be used. */
export type ExportDetailsErrors = Partial<Record<keyof ExportDetails, string>>;

export const EXPORT_DETAIL_MESSAGES = {
  schoolName: "Enter the school's name.",
  schoolNameLong: `Use at most ${SCHOOL_NAME_MAX} characters.`,
  schoolYear: 'Enter the school year, as in 2026 - 2027.',
  appliesFrom: 'Enter the date the timetable applies from.',
} as const;

const SCHOOL_YEAR = /^(\d{4}) - (\d{4})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real day written yyyy-mm-dd, as a date input gives it. */
function isDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The details with their text tidied (ends trimmed, the year's dash spaced as the sample
    has it), so "2026-2027" is taken as "2026 - 2027". */
export function cleanExportDetails(details: ExportDetails): ExportDetails {
  return {
    schoolName: details.schoolName.normalize('NFC').trim().replace(/\s+/g, ' '),
    schoolYear: details.schoolYear.trim().replace(/^(\d{4})\s*[-–]\s*(\d{4})$/, '$1 - $2'),
    appliesFrom: details.appliesFrom.trim(),
  };
}

/** The fields that can't be used, each with its message; empty when the details are fine.
    A school year is two years in a row; the date is a real day. Check cleaned details. */
export function checkExportDetails(details: ExportDetails): ExportDetailsErrors {
  const errors: ExportDetailsErrors = {};
  if (details.schoolName === '') errors.schoolName = EXPORT_DETAIL_MESSAGES.schoolName;
  else if (charCount(details.schoolName) > SCHOOL_NAME_MAX) {
    errors.schoolName = EXPORT_DETAIL_MESSAGES.schoolNameLong;
  }
  const year = SCHOOL_YEAR.exec(details.schoolYear);
  if (!year || Number(year[2]) !== Number(year[1]) + 1) {
    errors.schoolYear = EXPORT_DETAIL_MESSAGES.schoolYear;
  }
  if (!isDate(details.appliesFrom)) errors.appliesFrom = EXPORT_DETAIL_MESSAGES.appliesFrom;
  return errors;
}

/** The classes an export writes, in class-bar order: the class on screen, or all of them. */
export function exportClassIds(file: TimetableFile, scope: ExportScope, classId: Id | null): Id[] {
  const ordered = classesByGrade(file.classes).flatMap((g) => g.classes);
  if (scope === 'all') return ordered.map((c) => c.id);
  return ordered.filter((c) => c.id === classId).map((c) => c.id);
}

const FORMAT_NAMES: Record<ExportFormat, string> = { xlsx: 'Excel', pdf: 'PDF' };

/** The dialog's title: "Export 6A1 as Excel", "Export all 34 classes as PDF". */
export function exportTitle(
  scope: ExportScope,
  className: string,
  classCount: number,
  format: ExportFormat,
): string {
  const what =
    scope === 'class'
      ? className
      : classCount === 1
        ? 'the one class'
        : `all ${classCount} classes`;
  return `Export ${what} as ${FORMAT_NAMES[format]}`;
}

/** TC-4's question: "6A1 has 2 errors and 1 warning. You can still export it.", or for all
    classes "The timetable has …"; null with no issues, when the dialog says nothing. */
export function exportIssuesLine(
  scope: ExportScope,
  className: string,
  { errors, warnings }: IssueCounts,
): string | null {
  const counts = [
    errors > 0 && plural(errors, 'error', 'errors'),
    warnings > 0 && plural(warnings, 'warning', 'warnings'),
  ].filter(Boolean);
  if (counts.length === 0) return null;
  const who = scope === 'class' ? className : 'The timetable';
  return `${who} has ${counts.join(' and ')}. You can still export it.`;
}
