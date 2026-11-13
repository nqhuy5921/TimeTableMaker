import { DEFAULT_BELL_SCHEDULE } from './bellSchedule';
import type { TimetableFile } from './model';

export function createEmptyTimetable(): TimetableFile {
  return {
    schemaVersion: 6,
    bellSchedule: [...DEFAULT_BELL_SCHEDULE],
    // A new timetable starts with no grades (DM-8).
    grades: [],
    subjects: [],
    teachers: [],
    rooms: [],
    classes: [],
    cards: [],
    placements: [],
  };
}
