import { describe, expect, it } from 'vitest';
import type { Issue } from '../../src/domain/checks';
import {
  errorsByTeacher,
  filterIssues,
  issueCounts,
  issueCountsByClass,
  issueCountsText,
  issueTone,
  issuesByCondition,
  issueList,
  issuesForClass,
  NO_ISSUE_FILTERS,
  slotMarks,
} from '../../src/domain/issues';

// The screens' helpers over the checks engine's issues (SYSTEM_DESIGN §9.2).

function issue(id: string, fields: Partial<Issue>): Issue {
  return {
    id,
    severity: 'error',
    kind: 'teacherTwice',
    teacherId: null,
    conditionId: null,
    message: id,
    where: '',
    placementIds: [],
    classIds: [],
    ...fields,
  };
}

/** Thầy Phúc in 6A1 and 7B1 at once, his week limit across 6A1, 6A2, and 7B1, Cô Lan's day
    off in 6A2, and Toán twice in 6A1. */
const issues: Issue[] = [
  issue('clash', { teacherId: 'phuc', placementIds: ['a', 'b'], classIds: ['6A1', '7B1'] }),
  issue('dayOff', {
    kind: 'daysOff',
    teacherId: 'lan',
    conditionId: 'c2',
    placementIds: ['c'],
    classIds: ['6A2'],
  }),
  issue('week', {
    kind: 'maxPeriodsPerWeek',
    teacherId: 'phuc',
    conditionId: 'c1',
    placementIds: ['a', 'b', 'd'],
    classIds: ['6A1', '6A2', '7B1'],
  }),
  issue('twice', {
    severity: 'warning',
    kind: 'subjectTwiceInDay',
    placementIds: ['a', 'e'],
    classIds: ['6A1'],
  }),
];

describe('issuesForClass', () => {
  it('gives each class its issues, an issue across classes in each of them', () => {
    expect(issuesForClass(issues, '6A1').map((i) => i.id)).toEqual(['clash', 'week', 'twice']);
    expect(issuesForClass(issues, '7B1').map((i) => i.id)).toEqual(['clash', 'week']);
    expect(issuesForClass(issues, '6A2').map((i) => i.id)).toEqual(['dayOff', 'week']);
    expect(issuesForClass(issues, '9A1')).toEqual([]);
  });
});

describe('issueCounts and issueCountsByClass', () => {
  it('counts errors and warnings', () => {
    expect(issueCounts(issues)).toEqual({ errors: 3, warnings: 1 });
    expect(issueCounts([])).toEqual({ errors: 0, warnings: 0 });
  });

  it('says the counts in words, leaving out a count of 0', () => {
    expect(issueCountsText({ errors: 2, warnings: 1 })).toBe('2 errors, 1 warning');
    expect(issueCountsText({ errors: 1, warnings: 0 })).toBe('1 error');
    expect(issueCountsText({ errors: 0, warnings: 2 })).toBe('2 warnings');
    expect(issueCountsText({ errors: 0, warnings: 0 })).toBe('');
  });

  it('shows errors pink, only warnings amber, and none grey', () => {
    expect(issueTone({ errors: 1, warnings: 3 })).toBe('error');
    expect(issueTone({ errors: 0, warnings: 3 })).toBe('warning');
    expect(issueTone({ errors: 0, warnings: 0 })).toBe('none');
  });

  it('counts an issue across classes in each class, and leaves out classes with none', () => {
    expect(Object.fromEntries(issueCountsByClass(issues))).toEqual({
      '6A1': { errors: 2, warnings: 1 },
      '6A2': { errors: 2, warnings: 0 },
      '7B1': { errors: 2, warnings: 0 },
    });
  });
});

describe('errorsByTeacher and issuesByCondition', () => {
  it("counts each teacher's errors, not warnings or issues about no teacher", () => {
    const withWarning = [
      ...issues,
      issue('lanWarn', { severity: 'warning', kind: 'subjectTwiceInDay', teacherId: 'lan' }),
    ];
    expect(Object.fromEntries(errorsByTeacher(withWarning))).toEqual({ phuc: 2, lan: 1 });
  });

  it('counts the places each condition is broken in', () => {
    const twice = [
      ...issues,
      issue('dayOff2', { kind: 'daysOff', teacherId: 'lan', conditionId: 'c2' }),
    ];
    expect(Object.fromEntries(issuesByCondition(twice))).toEqual({ c1: 1, c2: 2 });
  });
});

describe('slotMarks', () => {
  it('marks each slot, error over warning, with its messages in order', () => {
    const marks = slotMarks(issues);
    expect(marks.get('a')).toEqual({
      severity: 'error',
      errors: 2,
      warnings: 1,
      messages: ['clash', 'week', 'twice'],
    });
    expect(marks.get('e')).toEqual({
      severity: 'warning',
      errors: 0,
      warnings: 1,
      messages: ['twice'],
    });
    expect(marks.get('c')).toEqual({
      severity: 'error',
      errors: 1,
      warnings: 0,
      messages: ['dayOff'],
    });
    expect(marks.has('z')).toBe(false);
  });

  it('turns a warning slot into an error when a later issue is an error', () => {
    const marks = slotMarks([
      issue('w', { severity: 'warning', placementIds: ['a'] }),
      issue('e', { placementIds: ['a'] }),
    ]);
    expect(marks.get('a')).toEqual({
      severity: 'error',
      errors: 1,
      warnings: 1,
      messages: ['w', 'e'],
    });
  });
});

describe('slotMarks with issues of the same words', () => {
  it('keeps a line per issue, so the lines match the counts', () => {
    const same = 'Thầy Phúc: 8 periods on Monday, limit is 6';
    const marks = slotMarks([
      issue('c1', { kind: 'maxPeriodsPerDay', message: same, placementIds: ['a'] }),
      issue('c2', { kind: 'maxPeriodsPerDay', message: same, placementIds: ['a'] }),
    ]);
    expect(marks.get('a')).toEqual({
      severity: 'error',
      errors: 2,
      warnings: 0,
      messages: [same, same],
    });
  });
});

describe('filterIssues', () => {
  const ids = (filters: Partial<typeof NO_ISSUE_FILTERS>) =>
    filterIssues(issues, { ...NO_ISSUE_FILTERS, ...filters }).map((i) => i.id);

  it('keeps everything with no filters', () => {
    expect(ids({})).toEqual(['clash', 'dayOff', 'week', 'twice']);
  });

  it('filters by scope, severity, teacher, and check', () => {
    expect(ids({ scope: '6A2' })).toEqual(['dayOff', 'week']);
    expect(ids({ severity: 'warning' })).toEqual(['twice']);
    expect(ids({ severity: 'error' })).toEqual(['clash', 'dayOff', 'week']);
    expect(ids({ teacherId: 'phuc' })).toEqual(['clash', 'week']);
    expect(ids({ kind: 'daysOff' })).toEqual(['dayOff']);
  });

  it('applies the filters together', () => {
    expect(ids({ scope: '6A1', teacherId: 'phuc' })).toEqual(['clash', 'week']);
    expect(ids({ scope: '6A1', teacherId: 'phuc', kind: 'maxPeriodsPerWeek' })).toEqual(['week']);
    expect(ids({ scope: '6A2', severity: 'warning' })).toEqual([]);
  });
});

describe('issueList', () => {
  const list = (filters: Partial<typeof NO_ISSUE_FILTERS>) => {
    const { counts, errors, warnings } = issueList(issues, { ...NO_ISSUE_FILTERS, ...filters });
    return { counts, errors: errors.map((i) => i.id), warnings: warnings.map((i) => i.id) };
  };

  it('splits the issues into errors and warnings, in order', () => {
    expect(list({})).toEqual({
      counts: { errors: 3, warnings: 1 },
      errors: ['clash', 'dayOff', 'week'],
      warnings: ['twice'],
    });
  });

  it('counts the scope and the two filters whatever severity is chosen', () => {
    expect(list({ scope: '6A1', severity: 'warning' })).toEqual({
      counts: { errors: 2, warnings: 1 },
      errors: [],
      warnings: ['twice'],
    });
    expect(list({ teacherId: 'phuc', severity: 'error' })).toEqual({
      counts: { errors: 2, warnings: 0 },
      errors: ['clash', 'week'],
      warnings: [],
    });
  });
});
