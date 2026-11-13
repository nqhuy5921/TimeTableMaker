import { describe, expect, it } from 'vitest';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import { readTimetableFile } from '../../src/shared/fileFormat';
import { timetableFileSchema } from '../../src/shared/schema';

describe('createEmptyTimetable', () => {
  it('passes the saved-file schema', () => {
    expect(timetableFileSchema.safeParse(createEmptyTimetable()).success).toBe(true);
  });

  it('has the five period blocks from the TIMETABLE sheet (TB-2)', () => {
    const blocks = createEmptyTimetable().bellSchedule.filter((row) => row.kind === 'block');
    expect(blocks.map((row) => row.label)).toEqual(['1-2', '3-4', '5-6', '7-8', '9-10']);
  });
});

describe('timetableFileSchema', () => {
  it('rejects a version 1 file, which needs its migration first', () => {
    const file = { ...createEmptyTimetable(), schemaVersion: 1 };
    expect(timetableFileSchema.safeParse(file).success).toBe(false);
  });

  it('upgrades a version 1 file saved with periods, leaving the periods out (2026-10-19)', () => {
    const old = {
      ...createEmptyTimetable(),
      schemaVersion: 1,
      classes: [{ id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 }],
      subjects: [{ id: 's1', name: 'Toán', colorKey: 'math', defaultPeriods: 4 }],
      cards: [
        {
          id: 'k1',
          classId: 'c1',
          subjectId: 's1',
          teacherId: null,
          roomId: null,
          periodsPerWeek: 4,
        },
      ],
      placements: [],
    };
    const result = readTimetableFile(JSON.stringify(old));
    expect(result.ok && result.file.subjects).toEqual([
      { id: 's1', name: 'Toán', colorKey: 'math' },
    ]);
    expect(result.ok && result.file.cards).toEqual([
      { id: 'k1', subjectId: 's1', teacherId: null, roomId: null },
    ]);
  });

  it('rejects a subject color outside the subject palettes', () => {
    const file = createEmptyTimetable();
    const bad = {
      ...file,
      subjects: [{ id: 's1', name: 'Toán', colorKey: 'green' }],
    };
    expect(timetableFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects two labels for the same day on a fixed row', () => {
    const file = createEmptyTimetable();
    const bad = {
      ...file,
      bellSchedule: [
        {
          kind: 'break',
          type: 'arrival',
          label: 'Getting ready',
          dayLabels: [
            { day: 0, label: 'Flag salute' },
            { day: 0, label: 'Assembly' },
          ],
          start: '07:50',
          end: '08:00',
        },
      ],
    };
    expect(timetableFileSchema.safeParse(bad).success).toBe(false);
  });
});
