import type { Issue, IssueKind, Severity } from './checks';
import type { Id } from './model';
import { plural } from './text';

// Helpers that turn the checks engine's issues into what the screens show (SYSTEM_DESIGN
// §9.2): one class's issues, counts, slot marks, and the Issues tab's filters.

/** The issues with a slot in the class. An issue across classes belongs to each of them,
    and a whole-week limit to every class the teacher teaches in. */
export function issuesForClass(issues: readonly Issue[], classId: Id): Issue[] {
  return issues.filter((i) => i.classIds.includes(classId));
}

export interface IssueCounts {
  errors: number;
  warnings: number;
}

export function issueCounts(issues: readonly Issue[]): IssueCounts {
  const errors = issues.filter((i) => i.severity === 'error').length;
  return { errors, warnings: issues.length - errors };
}

/** Which colors a count shows in: pink with errors, amber with only warnings, grey at 0
    (the Issues tab badge and the class bar's Issues pill). */
export function issueTone({ errors, warnings }: IssueCounts): 'error' | 'warning' | 'none' {
  return errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'none';
}

/** "2 errors, 1 warning", leaving out a count of 0; empty with no issues. For tooltips and
    accessible names. */
export function issueCountsText({ errors, warnings }: IssueCounts): string {
  return [
    errors > 0 && plural(errors, 'error', 'errors'),
    warnings > 0 && plural(warnings, 'warning', 'warnings'),
  ]
    .filter(Boolean)
    .join(', ');
}

/** Each class's counts, for the class tiles. A class with no issues has no entry. */
export function issueCountsByClass(issues: readonly Issue[]): Map<Id, IssueCounts> {
  const counts = new Map<Id, IssueCounts>();
  for (const issue of issues) {
    for (const classId of issue.classIds) {
      const c = counts.get(classId) ?? { errors: 0, warnings: 0 };
      if (issue.severity === 'error') c.errors++;
      else c.warnings++;
      counts.set(classId, c);
    }
  }
  return counts;
}

/** Each teacher's errors, for the Teachers page's Errors column: their conditions broken and
    their clashes. A teacher with none has no entry. */
export function errorsByTeacher(issues: readonly Issue[]): Map<Id, number> {
  const errors = new Map<Id, number>();
  for (const { severity, teacherId } of issues) {
    if (severity === 'error' && teacherId !== null) {
      errors.set(teacherId, (errors.get(teacherId) ?? 0) + 1);
    }
  }
  return errors;
}

/** How many places each condition is broken in right now, for "Not met in 2 places" on the
    teacher's screen. A condition that's met has no entry. */
export function issuesByCondition(issues: readonly Issue[]): Map<Id, number> {
  const broken = new Map<Id, number>();
  for (const { conditionId } of issues) {
    if (conditionId !== null) broken.set(conditionId, (broken.get(conditionId) ?? 0) + 1);
  }
  return broken;
}

export interface SlotMark extends IssueCounts {
  /** An error wins when a slot is in both. */
  severity: Severity;
  /** One line per issue for the slot's tooltip, in the issues' order. Two issues with the
      same words (a teacher can have the same condition twice) are two lines, so the lines
      always match the counts. */
  messages: string[];
}

/** Placement id → its mark. A placement in no issue has no entry. */
export function slotMarks(issues: readonly Issue[]): Map<Id, SlotMark> {
  const marks = new Map<Id, SlotMark>();
  for (const issue of issues) {
    for (const placementId of issue.placementIds) {
      const mark = marks.get(placementId) ?? {
        severity: 'warning',
        errors: 0,
        warnings: 0,
        messages: [],
      };
      mark.messages.push(issue.message);
      if (issue.severity === 'error') {
        mark.severity = 'error';
        mark.errors++;
      } else {
        mark.warnings++;
      }
      marks.set(placementId, mark);
    }
  }
  return marks;
}

export interface IssueFilters {
  /** The class on screen, or null for all classes. */
  scope: Id | null;
  severity: Severity | 'all';
  /** One teacher, or null for all teachers. */
  teacherId: Id | null;
  /** One check, or null for all checks. */
  kind: IssueKind | null;
}

export const NO_ISSUE_FILTERS: IssueFilters = {
  scope: null,
  severity: 'all',
  teacherId: null,
  kind: null,
};

/** The Issues tab's list: the scope, severity, teacher, and check filters together, in the
    issues' order. */
export function filterIssues(issues: readonly Issue[], filters: IssueFilters): Issue[] {
  return issues.filter(
    (i) =>
      (filters.scope === null || i.classIds.includes(filters.scope)) &&
      (filters.severity === 'all' || i.severity === filters.severity) &&
      (filters.teacherId === null || i.teacherId === filters.teacherId) &&
      (filters.kind === null || i.kind === filters.kind),
  );
}

export interface IssueList {
  /** For the severity switch: the scope and the teacher and check filters, whatever
      severity is chosen. */
  counts: IssueCounts;
  /** What all four filters let through, in the issues' order. */
  errors: Issue[];
  warnings: Issue[];
}

/** The Issues tab's list (TC-3): errors first, then warnings, and the counts beside the
    severity switch. */
export function issueList(issues: readonly Issue[], filters: IssueFilters): IssueList {
  const anySeverity = filterIssues(issues, { ...filters, severity: 'all' });
  const shows = (severity: Severity) => filters.severity === 'all' || filters.severity === severity;
  return {
    counts: issueCounts(anySeverity),
    errors: shows('error') ? anySeverity.filter((i) => i.severity === 'error') : [],
    warnings: shows('warning') ? anySeverity.filter((i) => i.severity === 'warning') : [],
  };
}
