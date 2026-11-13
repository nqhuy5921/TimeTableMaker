import type { Grade, Track } from './model';
import { joinList } from './text';

export interface ParsedClassName {
  name: string;
  grade: Grade;
  track: Track;
  section: number;
}

/** The class-name rule in one line, shown under the name in both class forms (DM-2),
    naming the timetable's grades (DM-8), with examples in them: "Grade 6, 7, 8, or 9, a
    track, and a section, as in 6A1 or 8CE2." (the first grade, and the third or the last
    there is). */
export function classNameHint(grades: readonly Grade[]): string {
  const first = grades[0];
  if (first === undefined) return 'A grade, a track, and a section, as in 6A1 or 8CE2.';
  const other = grades[Math.min(2, grades.length - 1)]!;
  const which = `Grade ${joinList(grades.map(String), 'or')}`;
  return `${which}, a track, and a section, as in ${first}A1 or ${other}CE2.`;
}

// A grade from 1 to 12 (DM-8), then the track: two-letter tracks come first so `6AA1`
// isn't read as track `A`.
const CLASS_NAME = /^(1[0-2]|[1-9])(AA|A|CE|BA|B)([1-9]\d*)$/;

/**
 * Reads grade, track, and section from a class name such as `8CE1` (DM-2).
 * Returns null when the name doesn't fit the pattern.
 */
export function parseClassName(input: string): ParsedClassName | null {
  const name = input.trim();
  const match = CLASS_NAME.exec(name);
  if (!match) return null;
  const [, grade, track, section] = match;
  return {
    name,
    grade: Number(grade) as Grade,
    track: track as Track,
    section: Number(section),
  };
}
