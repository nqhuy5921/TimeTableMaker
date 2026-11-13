import type { TimetableFile } from '../src/domain/model';
import { createEmptyTimetable } from '../src/domain/timetableFile';

/** An empty timetable with grades 6 to 9 on its list (DM-8), for tests that add classes by
    name. A new timetable has no grades, so a class can't be added to one until a grade is. */
export function emptySchool(): TimetableFile {
  return { ...createEmptyTimetable(), grades: [6, 7, 8, 9] };
}
