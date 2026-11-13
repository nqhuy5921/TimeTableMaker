import {
  DAY_NAMES,
  DAYS,
  type BlockIndex,
  type ConditionType,
  type Day,
  type Id,
  type TeacherCondition,
  type TimetableFile,
} from './model';
import { teacherSubjects } from './teachers';
import { joinList, plural } from './text';

// Teacher conditions (TC-1, SYSTEM_DESIGN §9.1). The allowed values live here, so the
// condition form and the file check (`fileProblem`) can't disagree.

/** The smallest and largest number each counted type allows. A subject limit's range
    depends on whether it's per day or per week. */
export const CONDITION_LIMITS = {
  subjectLimitDay: { min: 1, max: 10 },
  subjectLimitWeek: { min: 1, max: 50 },
  maxPeriodsPerDay: { min: 1, max: 10 },
  maxPeriodsPerWeek: { min: 1, max: 50 },
  maxBlocksInRow: { min: 1, max: 3 },
  maxGapsPerDay: { min: 0, max: 3 },
  maxTeachingDays: { min: 1, max: 4 },
} as const;

/** The range a condition's number must be in, or null for a type with no number. */
export function conditionRange(condition: TeacherCondition): { min: number; max: number } | null {
  switch (condition.type) {
    case 'subjectLimit':
      return condition.per === 'day'
        ? CONDITION_LIMITS.subjectLimitDay
        : CONDITION_LIMITS.subjectLimitWeek;
    case 'unavailable':
    case 'daysOff':
      return null;
    default:
      return CONDITION_LIMITS[condition.type];
  }
}

/** Days or blocks stored once each, in order, and at least one. */
function inOrder(values: readonly number[]): boolean {
  return values.length > 0 && values.every((v, i) => i === 0 || v > values[i - 1]!);
}

/** What's wrong with a condition's values, or null when they're allowed. The subject's
    existence is checked by `fileProblem`, which has the subject list. */
export function conditionValueProblem(condition: TeacherCondition): string | null {
  const range = conditionRange(condition);
  if (range && 'max' in condition && (condition.max < range.min || condition.max > range.max)) {
    return `its number ${condition.max} isn't from ${range.min} to ${range.max}`;
  }
  if (
    (condition.type === 'unavailable' || condition.type === 'daysOff') &&
    !inOrder(condition.days)
  ) {
    return 'its days are empty, repeated, or out of order';
  }
  if (condition.type === 'unavailable' && !inOrder(condition.blocks)) {
    return 'its blocks are empty, repeated, or out of order';
  }
  return null;
}

/** A condition's type and values, without its id and on/off switch: what the condition
    form fills in. */
export type ConditionValues = WithoutSwitch<TeacherCondition>;
type WithoutSwitch<C> = C extends unknown ? Omit<C, 'id' | 'on'> : never;

/** The condition form's name for each type, in the requirement's words. */
export const CONDITION_LABELS: Record<ConditionType, string> = {
  subjectLimit: 'Subject limit',
  unavailable: 'Unavailable times',
  daysOff: 'Days off',
  maxPeriodsPerDay: 'Most periods per day',
  maxPeriodsPerWeek: 'Most periods per week',
  maxBlocksInRow: 'Most blocks in a row',
  maxGapsPerDay: 'Most gaps per day',
  maxTeachingDays: 'Most teaching days',
};

/** The line under the form's Condition dropdown saying what the chosen type does. */
export const CONDITION_HINTS: Record<ConditionType, string> = {
  subjectLimit: 'At most so many periods of one subject, a day or a week.',
  unavailable: "Can't teach in the morning, afternoon, or chosen blocks.",
  daysOff: "Doesn't teach on chosen days.",
  maxPeriodsPerDay: 'At most so many periods on any one day, across all classes.',
  maxPeriodsPerWeek: 'At most so many periods a week, counted across all classes.',
  maxBlocksInRow: 'At most so many blocks in a row without a free block.',
  maxGapsPerDay: 'At most so many free blocks between the first and last lesson of a day.',
  maxTeachingDays: 'Teaches on at most so many days of the week.',
};

/** Blocks 1-2, 3-4, 5-6 are the morning and 7-8, 9-10 the afternoon, as in `TIMETABLE`. */
export const MORNING: readonly BlockIndex[] = [0, 1, 2];
export const AFTERNOON: readonly BlockIndex[] = [3, 4];

/** A new condition of a type, before the form changes it. Unavailable times start as the
    morning on every day, and days off with no day. */
export function defaultConditionValues(type: ConditionType): ConditionValues {
  switch (type) {
    case 'subjectLimit':
      return { type, subjectId: '', max: 3, per: 'day' };
    case 'unavailable':
      return { type, blocks: [...MORNING], days: [...DAYS] };
    case 'daysOff':
      return { type, days: [] };
    case 'maxPeriodsPerDay':
      return { type, max: 6 };
    case 'maxPeriodsPerWeek':
      return { type, max: 18 };
    case 'maxBlocksInRow':
      return { type, max: 2 };
    case 'maxGapsPerDay':
      return { type, max: 1 };
    case 'maxTeachingDays':
      return { type, max: 4 };
  }
}

/** The form's values after the type changes: the new type's defaults, keeping the number
    when both types have one. */
export function changeConditionType(values: ConditionValues, type: ConditionType): ConditionValues {
  const next = defaultConditionValues(type);
  return 'max' in values && 'max' in next ? { ...next, max: values.max } : next;
}

/** "Monday", "Monday or Friday", "Monday, Tuesday, or Friday". */
const orList = (items: readonly string[]) => joinList(items, 'or');

const sameBlocks = (a: readonly BlockIndex[], b: readonly BlockIndex[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Whether unavailable blocks are exactly the morning, exactly the afternoon, or other
    chosen blocks: the form's When choice and the sentence both go by this. */
export function blocksWhen(blocks: readonly BlockIndex[]): 'morning' | 'afternoon' | 'chosen' {
  if (sameBlocks(blocks, MORNING)) return 'morning';
  if (sameBlocks(blocks, AFTERNOON)) return 'afternoon';
  return 'chosen';
}

/** "in the morning", "in the afternoon", "at any time", or "in periods 1–2 or 7–8". */
function blocksPhrase(blocks: readonly BlockIndex[]): string {
  const when = blocksWhen(blocks);
  if (when !== 'chosen') return `in the ${when}`;
  if (blocks.length === 5) return 'at any time';
  return `in periods ${orList(blocks.map((b) => `${2 * b + 1}–${2 * b + 2}`))}`;
}

/** "on any day" for all five, else "on Monday or Friday". */
function daysPhrase(days: readonly Day[]): string {
  return days.length === 5 ? 'on any day' : `on ${orList(days.map((d) => DAY_NAMES[d]))}`;
}

/** The plain sentence the teacher's Conditions panel lists (TC-1, SYSTEM_DESIGN §9.4), such
    as "At most 3 periods of Toán a week" or "Not on Wednesday or Friday". */
export function conditionSentence(file: TimetableFile, condition: ConditionValues): string {
  switch (condition.type) {
    case 'subjectLimit': {
      const subject = file.subjects.find((s) => s.id === condition.subjectId)?.name ?? 'a subject';
      const per = condition.per === 'day' ? 'a day' : 'a week';
      return `At most ${plural(condition.max, 'period', 'periods')} of ${subject} ${per}`;
    }
    case 'unavailable':
      return `Can't teach ${blocksPhrase(condition.blocks)} ${daysPhrase(condition.days)}`;
    case 'daysOff':
      return condition.days.length === 5
        ? 'Not on any day'
        : `Not on ${orList(condition.days.map((d) => DAY_NAMES[d]))}`;
    case 'maxPeriodsPerDay':
      return `At most ${plural(condition.max, 'period', 'periods')} on any day`;
    case 'maxPeriodsPerWeek':
      return `At most ${plural(condition.max, 'period', 'periods')} a week`;
    case 'maxBlocksInRow':
      return `At most ${plural(condition.max, 'block', 'blocks')} in a row`;
    case 'maxGapsPerDay':
      return condition.max === 0
        ? 'No free block between lessons in a day'
        : `At most ${plural(condition.max, 'free block', 'free blocks')} between lessons in a day`;
    case 'maxTeachingDays':
      return `Teaches on at most ${plural(condition.max, 'day', 'days')} a week`;
  }
}

/** The condition form's fields that can be wrong. */
export type ConditionField = 'subject' | 'max' | 'blocks' | 'days';

export interface ConditionFieldProblem {
  field: ConditionField;
  error: string;
}

/** Each wrong field of the form's values with its message, in the form's order: a subject
    that isn't in the file, a number that isn't a whole number in the type's range, and no
    day or no block picked. Repeats and order don't count; the commands tidy them. */
export function conditionFieldProblems(
  file: TimetableFile,
  values: ConditionValues,
): ConditionFieldProblem[] {
  const problems: ConditionFieldProblem[] = [];
  if (values.type === 'subjectLimit' && !file.subjects.some((s) => s.id === values.subjectId)) {
    problems.push({ field: 'subject', error: 'Pick a subject.' });
  }
  if ('max' in values) {
    const range = conditionRange({ id: '', on: true, ...values });
    if (
      range &&
      !(Number.isInteger(values.max) && values.max >= range.min && values.max <= range.max)
    ) {
      problems.push({
        field: 'max',
        error: `Enter a whole number from ${range.min} to ${range.max}.`,
      });
    }
  }
  if (values.type === 'unavailable' && values.blocks.length === 0) {
    problems.push({ field: 'blocks', error: 'Pick at least one block.' });
  }
  if ((values.type === 'unavailable' || values.type === 'daysOff') && values.days.length === 0) {
    problems.push({ field: 'days', error: 'Pick at least one day.' });
  }
  return problems;
}

/** Each value once, in order. */
const tidy = <T extends number>(values: readonly T[]): T[] =>
  [...new Set(values)].sort((a, b) => a - b);

/** The values as they're stored: only the type's own fields, days and blocks once each
    and in order. */
function tidyValues(values: ConditionValues): ConditionValues {
  switch (values.type) {
    case 'subjectLimit':
      return { type: values.type, subjectId: values.subjectId, max: values.max, per: values.per };
    case 'unavailable':
      return { type: values.type, blocks: tidy(values.blocks), days: tidy(values.days) };
    case 'daysOff':
      return { type: values.type, days: tidy(values.days) };
    default:
      return { type: values.type, max: values.max };
  }
}

/** A refused command names the form field that's wrong, or null when the refusal is about
    the whole form (the teacher or condition is gone, or the file check failed). */
export type ConditionResult =
  | { ok: true; file: TimetableFile; conditionId: Id }
  | { ok: false; error: string; field: ConditionField | null };

type NewId = () => Id;
const randomId: NewId = () => crypto.randomUUID();

/** The condition with an id and switch, once its values are allowed (the form's checks,
    then the file check's, so the two can't disagree). */
function checked(
  file: TimetableFile,
  base: { id: Id; on: boolean },
  values: ConditionValues,
):
  | { ok: true; condition: TeacherCondition }
  | { ok: false; error: string; field: ConditionField | null } {
  const tidied = tidyValues(values);
  const problem = conditionFieldProblems(file, tidied)[0];
  if (problem) return { ok: false, ...problem };
  const condition = { ...base, ...tidied } as TeacherCondition;
  const fileCheck = conditionValueProblem(condition);
  if (fileCheck) return { ok: false, field: null, error: `This condition is wrong: ${fileCheck}.` };
  return { ok: true, condition };
}

const missingTeacher = {
  ok: false,
  field: null,
  error: "That teacher isn't in the list any more.",
} as const;

/** The file with one teacher's conditions changed, or the same file when the teacher isn't
    there or the change leaves every condition as it was, so a no-op isn't saved. */
function withConditions(
  file: TimetableFile,
  teacherId: Id,
  change: (conditions: TeacherCondition[]) => TeacherCondition[],
): TimetableFile {
  const teacher = file.teachers.find((t) => t.id === teacherId);
  if (!teacher) return file;
  const conditions = change(teacher.conditions);
  const same =
    conditions.length === teacher.conditions.length &&
    conditions.every((c, i) => c === teacher.conditions[i]);
  if (same) return file;
  return {
    ...file,
    teachers: file.teachers.map((t) => (t === teacher ? { ...t, conditions } : t)),
  };
}

/** A subject limit's subject must be one the teacher has a card of (TC-1, the user's choice
    on 2026-10-23). Editing may keep the subject it already had, so a teacher losing a card
    doesn't make their condition uneditable. */
function untaughtSubject(
  file: TimetableFile,
  teacherId: Id,
  condition: TeacherCondition,
  keep: Id | null,
): ConditionResult | null {
  if (condition.type !== 'subjectLimit') return null;
  if (teacherSubjects(file, teacherId, keep).some((s) => s.id === condition.subjectId)) return null;
  const teacher = file.teachers.find((t) => t.id === teacherId);
  return {
    ok: false,
    field: 'subject',
    error: `Pick a subject ${teacher?.shortName ?? 'the teacher'} teaches.`,
  };
}

/** Adds a condition, switched on, after the teacher's others (TC-1). */
export function addCondition(
  file: TimetableFile,
  teacherId: Id,
  values: ConditionValues,
  newId: NewId = randomId,
): ConditionResult {
  if (!file.teachers.some((t) => t.id === teacherId)) return missingTeacher;
  const result = checked(file, { id: newId(), on: true }, values);
  if (!result.ok) return result;
  const { condition } = result;
  const untaught = untaughtSubject(file, teacherId, condition, null);
  if (untaught) return untaught;
  return {
    ok: true,
    conditionId: condition.id,
    file: withConditions(file, teacherId, (list) => [...list, condition]),
  };
}

/** Changes a condition's values, its type too, keeping its id, place, and switch. */
export function editCondition(
  file: TimetableFile,
  teacherId: Id,
  conditionId: Id,
  values: ConditionValues,
): ConditionResult {
  const old = file.teachers
    .find((t) => t.id === teacherId)
    ?.conditions.find((c) => c.id === conditionId);
  if (!old) return { ...missingTeacher, error: "That condition isn't there any more." };
  const result = checked(file, { id: old.id, on: old.on }, values);
  if (!result.ok) return result;
  const { condition } = result;
  const keep = old.type === 'subjectLimit' ? old.subjectId : null;
  const untaught = untaughtSubject(file, teacherId, condition, keep);
  if (untaught) return untaught;
  return {
    ok: true,
    conditionId,
    file: withConditions(file, teacherId, (list) =>
      list.map((c) => (c.id === conditionId ? condition : c)),
    ),
  };
}

/** Switches a condition on or off without deleting it (TC-1). */
export function setConditionOn(
  file: TimetableFile,
  teacherId: Id,
  conditionId: Id,
  on: boolean,
): TimetableFile {
  return withConditions(file, teacherId, (list) =>
    list.map((c) => (c.id === conditionId && c.on !== on ? { ...c, on } : c)),
  );
}

/** Deletes a condition. */
export function deleteCondition(
  file: TimetableFile,
  teacherId: Id,
  conditionId: Id,
): TimetableFile {
  return withConditions(file, teacherId, (list) => list.filter((c) => c.id !== conditionId));
}
