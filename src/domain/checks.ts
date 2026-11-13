import { daySessions } from './bellSchedule';
import { classesByGrade } from './classes';
import { CONDITION_LABELS } from './conditions';
import {
  CONDITION_TYPES,
  DAY_NAMES,
  DAYS,
  type BlockIndex,
  type Card,
  type Day,
  type Id,
  type Placement,
  type SchoolClass,
  type Teacher,
  type TeacherCondition,
  type TimetableFile,
} from './model';
import { placementPeriods } from './placements';
import { joinList, plural } from './text';

// The checks engine (TC-2, SYSTEM_DESIGN §9.2): every error and warning in the timetable,
// worked out from the whole file each time, so issues can't fall out of step with the grid.

export type Severity = 'error' | 'warning';
export type IssueKind =
  'teacherTwice' | 'roomTwice' | TeacherCondition['type'] | 'subjectTwiceInDay';

/** The Check filter's order (TIMETABLE_SCREEN_LAYOUT.md, Issues tab), also used to order
    issues that are otherwise alike. */
export const ISSUE_KINDS: readonly IssueKind[] = [
  'teacherTwice',
  'roomTwice',
  ...CONDITION_TYPES,
  'subjectTwiceInDay',
];

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  teacherTwice: 'Teacher in two places',
  roomTwice: 'Room in use twice',
  ...CONDITION_LABELS,
  subjectTwiceInDay: 'Subject twice in a day',
};

export interface Issue {
  /** Stable while the problem lasts, e.g. "teacherTwice|<teacherId>|0|1|full". */
  id: string;
  severity: Severity;
  kind: IssueKind;
  /** The teacher it's about, null for a room or subject issue. */
  teacherId: Id | null;
  /** The condition it breaks, for condition issues. */
  conditionId: Id | null;
  /** "Thầy Phúc: 4 periods of Toán on Monday, limit is 3". */
  message: string;
  /** "6A1, 7B1 · Monday · Periods 3–4". */
  where: string;
  /** The slots involved, in class-bar order and then by time. */
  placementIds: Id[];
  /** Their classes, in class-bar order. */
  classIds: Id[];
}

/** A placement with its card and class, the unit every check counts. */
interface Lesson {
  placement: Placement;
  card: Card;
  schoolClass: SchoolClass;
  classIndex: number;
}

type Half = 0 | 1;

/** The halves of its block a placement is in: the two halves are different times (TC-2). */
const halvesOf = (p: Placement): Half[] =>
  p.part === 'full' ? [0, 1] : p.part === 'first' ? [0] : [1];

/** 2 periods for a full block and 1 for a half (TC-2). */
const periodsOf = (lessons: readonly Lesson[]) =>
  lessons.reduce((sum, l) => sum + placementPeriods(l.placement), 0);

/** The time a half starts, for ordering: day, then block, then half. */
const startOf = (day: Day, block: BlockIndex, half: Half) => day * 10 + block * 2 + half;

/** Issues about the whole week sort after every issue about a day. */
const WEEK_START = 1000;

/** "6A1", "6A1 and 7B1", "6A1, 6A2, and 7B1". */
const andList = (items: readonly string[]) => joinList(items, 'and');

/** An issue's id from what it's about. JSON keeps ids that contain any character apart,
    where joining them with a separator could make two issues one (R2-7 review). */
const issueId = (...parts: (string | number)[]) => JSON.stringify(parts);

/** Adds a value to its key's group. */
function addTo<K, V>(groups: Map<K, V[]>, key: K, value: V) {
  const group = groups.get(key);
  if (group) group.push(value);
  else groups.set(key, [value]);
}

const blockPeriods = (block: BlockIndex) => `${2 * block + 1}–${2 * block + 2}`;

/** "Period 3", "Periods 3–4", or "Periods 1–2 and 7–8": the periods the lessons cover. */
function periodsText(lessons: readonly Lesson[]): string {
  const covered = new Map<BlockIndex, Set<Half>>();
  for (const { placement } of lessons) {
    const halves = covered.get(placement.block) ?? new Set();
    for (const h of halvesOf(placement)) halves.add(h);
    covered.set(placement.block, halves);
  }
  const parts = [...covered.entries()]
    .sort(([a], [b]) => a - b)
    .map(([block, halves]) =>
      halves.size === 2 ? blockPeriods(block) : String(2 * block + 1 + [...halves][0]!),
    );
  const single = parts.length === 1 && !parts[0]!.includes('–');
  return `${single ? 'Period' : 'Periods'} ${andList(parts)}`;
}

/** An issue while it's built: its lessons and where it sorts. */
interface Draft {
  id: string;
  severity: Severity;
  kind: IssueKind;
  teacherId: Id | null;
  conditionId: Id | null;
  message: string;
  lessons: readonly Lesson[];
  /** A day, or 'week' for an issue about the whole week. */
  day: Day | 'week';
  /** The periods for `where`, when they aren't the ones the lessons cover. */
  periods?: string;
  /** The first slot's time, when it isn't the first lesson's. */
  start?: number;
}

const byTime = (a: Lesson, b: Lesson) =>
  a.classIndex - b.classIndex ||
  a.placement.day - b.placement.day ||
  a.placement.block - b.placement.block ||
  halvesOf(a.placement)[0]! - halvesOf(b.placement)[0]!;

/** Every error and warning in the timetable, across all classes, in the order of
    SYSTEM_DESIGN §9.2: errors first, then by first slot, whole-week issues after the day
    ones, then teacher-list order. */
export function checkTimetable(file: TimetableFile): Issue[] {
  const classOrder = classesByGrade(file.classes).flatMap((g) => g.classes);
  const classIndex = new Map(classOrder.map((c, i) => [c.id, i]));
  const classById = new Map(file.classes.map((c) => [c.id, c]));
  const cardById = new Map(file.cards.map((c) => [c.id, c]));

  const lessons: Lesson[] = [];
  for (const placement of file.placements) {
    const card = cardById.get(placement.cardId);
    const schoolClass = classById.get(placement.classId);
    if (!card || !schoolClass) continue;
    lessons.push({ placement, card, schoolClass, classIndex: classIndex.get(schoolClass.id)! });
  }

  const drafts: Draft[] = [
    ...clashes(file, lessons, 'teacherTwice'),
    ...clashes(file, lessons, 'roomTwice'),
    ...conditionsBroken(file, lessons),
    ...subjectsTwice(file, lessons),
  ];

  const teacherIndex = new Map(file.teachers.map((t, i) => [t.id, i]));
  const keyed = drafts.map((d) => {
    const sorted = [...d.lessons].sort(byTime);
    const start =
      d.day === 'week'
        ? WEEK_START
        : (d.start ??
          Math.min(
            ...sorted.map((l) =>
              startOf(l.placement.day, l.placement.block, halvesOf(l.placement)[0]!),
            ),
          ));
    return { draft: d, lessons: sorted, start };
  });
  keyed.sort(
    (a, b) =>
      (a.draft.severity === b.draft.severity ? 0 : a.draft.severity === 'error' ? -1 : 1) ||
      a.start - b.start ||
      rank(teacherIndex, a.draft.teacherId, file.teachers.length) -
        rank(teacherIndex, b.draft.teacherId, file.teachers.length) ||
      ISSUE_KINDS.indexOf(a.draft.kind) - ISSUE_KINDS.indexOf(b.draft.kind) ||
      a.lessons[0]!.classIndex - b.lessons[0]!.classIndex ||
      (a.draft.id < b.draft.id ? -1 : a.draft.id > b.draft.id ? 1 : 0),
  );

  return keyed.map(({ draft, lessons: sorted }) => {
    const classes = [...new Set(sorted.map((l) => l.schoolClass))];
    const when =
      draft.day === 'week'
        ? 'Whole week'
        : `${DAY_NAMES[draft.day]} · ${draft.periods ?? periodsText(sorted)}`;
    return {
      id: draft.id,
      severity: draft.severity,
      kind: draft.kind,
      teacherId: draft.teacherId,
      conditionId: draft.conditionId,
      message: draft.message,
      where: `${classes.map((c) => c.name).join(', ')} · ${when}`,
      placementIds: sorted.map((l) => l.placement.id),
      classIds: classes.map((c) => c.id),
    };
  });
}

/** A teacher's place in the list, with no teacher after them all. */
const rank = (index: Map<Id, number>, id: Id | null, none: number) =>
  id === null ? none : (index.get(id) ?? none);

/** Teacher in two places, or room in use twice: the same teacher (or room) in the same half
    of the same block in two or more classes. One issue per block when both halves clash
    with the same placements ("Periods 3–4"), else one per half ("Period 3"). Two half
    cards sharing a block never clash: the halves are different times. */
function clashes(
  file: TimetableFile,
  lessons: readonly Lesson[],
  kind: 'teacherTwice' | 'roomTwice',
): Draft[] {
  const names = new Map(
    kind === 'teacherTwice'
      ? file.teachers.map((t) => [t.id, t.shortName])
      : file.rooms.map((r) => [r.id, r.name]),
  );
  // Grouped by who, day, and block. The group keeps them, so the key is never parsed.
  const atBlock = new Map<string, { who: Id; day: Day; block: BlockIndex; inBlock: Lesson[] }>();
  for (const lesson of lessons) {
    const who = kind === 'teacherTwice' ? lesson.card.teacherId : lesson.card.roomId;
    if (who === null || !names.has(who)) continue;
    const { day, block } = lesson.placement;
    const key = JSON.stringify([who, day, block]);
    const group = atBlock.get(key);
    if (group) group.inBlock.push(lesson);
    else atBlock.set(key, { who, day, block, inBlock: [lesson] });
  }

  const drafts: Draft[] = [];
  for (const { who, day, block, inBlock } of atBlock.values()) {
    const inHalf = ([0, 1] as const).map((h) =>
      inBlock.filter((l) => halvesOf(l.placement).includes(h)),
    );
    const clash = inHalf.map((ls) => new Set(ls.map((l) => l.schoolClass.id)).size >= 2);
    const sameBoth =
      clash[0] &&
      clash[1] &&
      inHalf[0]!.length === inHalf[1]!.length &&
      inHalf[0]!.every((l) => inHalf[1]!.includes(l));
    const parts: { part: 'full' | 'first' | 'second'; ls: Lesson[]; half: Half }[] = sameBoth
      ? [{ part: 'full', ls: inHalf[0]!, half: 0 }]
      : ([0, 1] as const)
          .filter((h) => clash[h])
          .map((h) => ({ part: h === 0 ? 'first' : 'second', ls: inHalf[h]!, half: h }));
    for (const { part, ls, half } of parts) {
      const classNames = andList([...new Set([...ls].sort(byTime).map((l) => l.schoolClass.name))]);
      const name = names.get(who)!;
      drafts.push({
        id: issueId(kind, who, day, block, part),
        severity: 'error',
        kind,
        teacherId: kind === 'teacherTwice' ? who : null,
        conditionId: null,
        message:
          kind === 'teacherTwice'
            ? `${name} is in ${classNames} at the same time`
            : `Room ${name} has ${classNames} at the same time`,
        lessons: ls,
        day,
        periods:
          part === 'full' ? `Periods ${blockPeriods(block)}` : `Period ${2 * block + 1 + half}`,
        start: startOf(day, block, half),
      });
    }
  }
  return drafts;
}

/** The blocks in a row a set of busy blocks makes within each part of the day. Lunch ends a
    run, so in the school's schedule a run is at most 3 blocks in the morning or 2 in the
    afternoon. */
function runs(busy: ReadonlySet<BlockIndex>, sessions: readonly BlockIndex[][]): BlockIndex[][] {
  const found: BlockIndex[][] = [];
  for (const session of sessions) {
    let run: BlockIndex[] = [];
    for (const block of session) {
      if (busy.has(block)) {
        run.push(block);
      } else if (run.length > 0) {
        found.push(run);
        run = [];
      }
    }
    if (run.length > 0) found.push(run);
  }
  return found;
}

/** The issues from every teacher's switched-on conditions, grouping the lessons by teacher
    once. */
function conditionsBroken(file: TimetableFile, lessons: readonly Lesson[]): Draft[] {
  const byTeacher = new Map<Id, Lesson[]>();
  for (const lesson of lessons) {
    if (lesson.card.teacherId !== null) addTo(byTeacher, lesson.card.teacherId, lesson);
  }
  const sessions = daySessions(file.bellSchedule);
  return file.teachers.flatMap((teacher) => {
    const own = byTeacher.get(teacher.id);
    if (!own || !teacher.conditions.some((c) => c.on)) return [];
    return conditionIssues(file, teacher, own, sessions);
  });
}

/** The issues from one teacher's switched-on conditions. Each counts only the teacher's
    placements, across all classes. */
function conditionIssues(
  file: TimetableFile,
  teacher: Teacher,
  lessons: readonly Lesson[],
  sessions: readonly BlockIndex[][],
): Draft[] {
  const name = teacher.shortName;
  const onDay = (ls: readonly Lesson[], day: Day) => ls.filter((l) => l.placement.day === day);
  const drafts: Draft[] = [];

  for (const condition of teacher.conditions) {
    if (!condition.on) continue;
    const base = {
      severity: 'error' as const,
      kind: condition.type,
      teacherId: teacher.id,
      conditionId: condition.id,
    };
    const id = (...rest: (string | number)[]) =>
      issueId(condition.type, teacher.id, condition.id, ...rest);

    switch (condition.type) {
      case 'subjectLimit': {
        const subject =
          file.subjects.find((s) => s.id === condition.subjectId)?.name ?? 'a subject';
        const ofSubject = lessons.filter((l) => l.card.subjectId === condition.subjectId);
        const limit = `limit is ${condition.max}`;
        if (condition.per === 'week') {
          const n = periodsOf(ofSubject);
          if (n > condition.max) {
            drafts.push({
              ...base,
              id: id('week'),
              message: `${name}: ${plural(n, 'period', 'periods')} of ${subject} this week, ${limit}`,
              lessons: ofSubject,
              day: 'week',
            });
          }
          break;
        }
        for (const day of DAYS) {
          const ls = onDay(ofSubject, day);
          const n = periodsOf(ls);
          if (n > condition.max) {
            drafts.push({
              ...base,
              id: id(day),
              message: `${name}: ${plural(n, 'period', 'periods')} of ${subject} on ${DAY_NAMES[day]}, ${limit}`,
              lessons: ls,
              day,
            });
          }
        }
        break;
      }
      case 'unavailable':
        for (const day of condition.days) {
          for (const block of condition.blocks) {
            const ls = onDay(lessons, day).filter((l) => l.placement.block === block);
            if (ls.length === 0) continue;
            drafts.push({
              ...base,
              id: id(day, block),
              message: `${name} can't teach in periods ${blockPeriods(block)} on ${DAY_NAMES[day]}`,
              lessons: ls,
              day,
            });
          }
        }
        break;
      case 'daysOff':
        for (const day of condition.days) {
          const ls = onDay(lessons, day);
          if (ls.length === 0) continue;
          drafts.push({
            ...base,
            id: id(day),
            message: `${name} has ${DAY_NAMES[day]} off but teaches ${plural(ls.length, 'lesson', 'lessons')}`,
            lessons: ls,
            day,
          });
        }
        break;
      case 'maxPeriodsPerDay':
        for (const day of DAYS) {
          const ls = onDay(lessons, day);
          const n = periodsOf(ls);
          if (n > condition.max) {
            drafts.push({
              ...base,
              id: id(day),
              message: `${name}: ${n} periods on ${DAY_NAMES[day]}, limit is ${condition.max}`,
              lessons: ls,
              day,
            });
          }
        }
        break;
      case 'maxPeriodsPerWeek': {
        const n = periodsOf(lessons);
        if (n > condition.max) {
          drafts.push({
            ...base,
            id: id('week'),
            message: `${name}: ${n} periods this week, limit is ${condition.max}`,
            lessons,
            day: 'week',
          });
        }
        break;
      }
      case 'maxBlocksInRow':
        for (const day of DAYS) {
          const ls = onDay(lessons, day);
          const over = runs(new Set(ls.map((l) => l.placement.block)), sessions).filter(
            (run) => run.length > condition.max,
          );
          if (over.length === 0) continue;
          const longest = Math.max(...over.map((run) => run.length));
          const blocks = new Set(over.flat());
          drafts.push({
            ...base,
            id: id(day),
            message: `${name}: ${longest} blocks in a row on ${DAY_NAMES[day]}, limit is ${condition.max}`,
            lessons: ls.filter((l) => blocks.has(l.placement.block)),
            day,
          });
        }
        break;
      case 'maxGapsPerDay':
        for (const day of DAYS) {
          const ls = onDay(lessons, day);
          const busy = new Set(ls.map((l) => l.placement.block));
          if (busy.size === 0) continue;
          // Lunch isn't a block, so the free blocks are the ones between the first and last.
          const gaps = Math.max(...busy) - Math.min(...busy) + 1 - busy.size;
          if (gaps > condition.max) {
            drafts.push({
              ...base,
              id: id(day),
              message: `${name}: ${plural(gaps, 'free block', 'free blocks')} between lessons on ${DAY_NAMES[day]}, limit is ${condition.max}`,
              lessons: ls,
              day,
            });
          }
        }
        break;
      case 'maxTeachingDays': {
        const days = new Set(lessons.map((l) => l.placement.day)).size;
        if (days > condition.max) {
          drafts.push({
            ...base,
            id: id('week'),
            message: `${name} teaches on ${days} days, limit is ${condition.max}`,
            lessons,
            day: 'week',
          });
        }
        break;
      }
    }
  }
  return drafts;
}

/** Subject twice in a day (a warning): a class has the same subject, whichever card, in two
    or more different blocks on one day. Both halves of one block count as one time. */
function subjectsTwice(file: TimetableFile, lessons: readonly Lesson[]): Draft[] {
  const subjectName = new Map(file.subjects.map((s) => [s.id, s.name]));
  const groups = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const { schoolClass, card, placement } = lesson;
    addTo(
      groups,
      issueId('subjectTwiceInDay', schoolClass.id, card.subjectId, placement.day),
      lesson,
    );
  }
  const drafts: Draft[] = [];
  for (const [id, ls] of groups) {
    const times = new Set(ls.map((l) => l.placement.block)).size;
    if (times < 2) continue;
    const { schoolClass, card, placement } = ls[0]!;
    const subject = subjectName.get(card.subjectId) ?? 'a subject';
    drafts.push({
      id,
      severity: 'warning',
      kind: 'subjectTwiceInDay',
      teacherId: null,
      conditionId: null,
      message: `${schoolClass.name} has ${subject} ${times === 2 ? 'twice' : `${times} times`} on ${DAY_NAMES[placement.day]}`,
      lessons: ls,
      day: placement.day,
    });
  }
  return drafts;
}
