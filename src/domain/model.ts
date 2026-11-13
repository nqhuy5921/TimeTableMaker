// The data model from docs/design/SYSTEM_DESIGN.md, section 3.

export type Id = string;

/** Subject palettes from docs/design/TIMETABLE_SCREEN_LAYOUT.md. A subject's palette
    comes from its name (see subjectColor.ts) unless the subject form picks one, or custom
    colors (SYSTEM_DESIGN §10.5). */
export const COLOR_KEYS = [
  'math',
  'literature',
  'english',
  'biology',
  'chemistry',
  'physics',
  'history',
  'geography',
  'civics',
  'technology',
  'informatics',
  'pe',
  'music',
  'art',
  'homeroom',
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const TRACKS = ['A', 'AA', 'CE', 'B', 'BA'] as const;
export type Track = (typeof TRACKS)[number];

/** A whole number from 1 to 12, such as 6 in 6A1. The timetable lists its grades
    (`TimetableFile.grades`, DM-8), and a class's grade is one of them. */
export type Grade = number;
export const MIN_GRADE = 1;
export const MAX_GRADE = 12;

/** Monday (Th2) to Friday (Th6). */
export type Day = 0 | 1 | 2 | 3 | 4;
export const DAYS: readonly Day[] = [0, 1, 2, 3, 4];
export const DAY_NAMES: Record<Day, string> = {
  0: 'Monday',
  1: 'Tuesday',
  2: 'Wednesday',
  3: 'Thursday',
  4: 'Friday',
};
/** The Vietnamese day names under the English ones in the grid header. */
export const DAY_NAMES_VI: Record<Day, string> = {
  0: 'Thứ 2',
  1: 'Thứ 3',
  2: 'Thứ 4',
  3: 'Thứ 5',
  4: 'Thứ 6',
};

/** The grid holds 25 blocks of 2 periods a week (DM-6). */
export const WEEKLY_PERIODS = 50;

/** Period blocks 1-2, 3-4, 5-6, 7-8, 9-10. */
export type BlockIndex = 0 | 1 | 2 | 3 | 4;

/** A placement fills a whole block (2 periods) or one half of it (1 period). */
export type PlacementPart = 'full' | 'first' | 'second';

export interface Subject {
  id: Id;
  name: string;
  /** The palette shown, unless the colors are custom. With custom colors, the palette the
      subject had before, so switching back from Custom starts there. */
  colorKey: ColorKey;
  /** Missing: the palette comes from the name, and follows it through a rename. */
  colorSource?: 'palette' | 'custom';
  /** The background and text colors as '#rrggbb', only when colorSource is 'custom'. */
  customColors?: { bg: string; ink: string };
}

export const HOME_SCHOOLS = ['THCS', 'THPT', 'both'] as const;
export type HomeSchool = (typeof HOME_SCHOOLS)[number];

/** The ready-made condition types (TC-1), in the requirement's order. */
export const CONDITION_TYPES = [
  'subjectLimit',
  'unavailable',
  'daysOff',
  'maxPeriodsPerDay',
  'maxPeriodsPerWeek',
  'maxBlocksInRow',
  'maxGapsPerDay',
  'maxTeachingDays',
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

/** One of a teacher's conditions (TC-1, SYSTEM_DESIGN §9.1): an id, an on/off switch, and
    only the values its type needs. Unavailable times store blocks and days; morning is
    blocks 0–2 and afternoon 3–4. */
export type TeacherCondition = { id: Id; on: boolean } & (
  | { type: 'subjectLimit'; subjectId: Id; max: number; per: 'day' | 'week' }
  | { type: 'unavailable'; blocks: BlockIndex[]; days: Day[] }
  | { type: 'daysOff'; days: Day[] }
  | {
      type:
        | 'maxPeriodsPerDay'
        | 'maxPeriodsPerWeek'
        | 'maxBlocksInRow'
        | 'maxGapsPerDay'
        | 'maxTeachingDays';
      max: number;
    }
);

export interface Teacher {
  id: Id;
  shortName: string;
  fullName?: string;
  email?: string;
  school?: HomeSchool;
  /** Release 4 (file format 5): as typed, trimmed, such as "0912 345 678". */
  phone?: string;
  /** Release 2 (file format 3). */
  conditions: TeacherCondition[];
}

export interface Room {
  id: Id;
  name: string;
}

export interface SchoolClass {
  id: Id;
  name: string;
  grade: Grade;
  track: Track;
  section: number;
  formTeacherId?: Id;
  coTeacherId?: Id;
}

/** A card belongs to the whole school, not to a class: its classes are the classes of its
    placements. No two cards share a subject, teacher, and room (DM-5). */
export interface Card {
  id: Id;
  subjectId: Id;
  teacherId: Id | null;
  roomId: Id | null;
}

/** One card in one slot of one class's grid. */
export interface Placement {
  id: Id;
  cardId: Id;
  classId: Id;
  day: Day;
  block: BlockIndex;
  part: PlacementPart;
}

/** A break row's text on one day, in place of its usual label (Monday's flag salute). */
export interface DayLabel {
  day: Day;
  label: string;
  note?: string;
}

/** How a fixed row is drawn: arrival rows come before period 1 (breakfast, flag
    salute), lunch splits the day into morning and afternoon, and breaks sit between
    blocks. */
export const FIXED_ROW_TYPES = ['arrival', 'break', 'lunch'] as const;
export type FixedRowType = (typeof FIXED_ROW_TYPES)[number];

/** One row of the daily bell schedule: a teaching block, or a fixed row such as
    breakfast or a break. `note` is the Vietnamese label shown after the English one. */
export type ScheduleRow =
  | { kind: 'block'; block: BlockIndex; label: string; start: string; end: string }
  | {
      kind: 'break';
      type: FixedRowType;
      label: string;
      note?: string;
      dayLabels?: DayLabel[];
      start: string;
      end: string;
    };

export interface TimetableFile {
  schemaVersion: 6;
  bellSchedule: ScheduleRow[];
  /** Release 5's grade list (file format 6, DM-8): in number order, with no repeats. */
  grades: Grade[];
  subjects: Subject[];
  teachers: Teacher[];
  rooms: Room[];
  classes: SchoolClass[];
  cards: Card[];
  placements: Placement[];
}
