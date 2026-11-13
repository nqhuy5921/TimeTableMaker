import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import { createAppState, replaceTimetable, type AppState } from '../../src/domain/appState';
import { addClass } from '../../src/domain/classes';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

function withClasses(...names: string[]): AppState {
  return names.reduce<AppState>((state, name) => {
    const result = addClass(state, name, () => `id-${name}`);
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }, createAppState(emptySchool()));
}

describe('createAppState (TB-7)', () => {
  const { file } = withClasses('8CE2', '6AA1', '6A3');

  it('opens on the class remembered from last time', () => {
    expect(createAppState(file, 'id-8CE2').selectedClassId).toBe('id-8CE2');
  });

  it('opens on the first class by grade when none is remembered', () => {
    expect(createAppState(file).selectedClassId).toBe('id-6A3');
  });

  it('opens on the first class when the remembered one is gone', () => {
    expect(createAppState(file, 'deleted').selectedClassId).toBe('id-6A3');
  });

  it('opens on nothing when there are no classes', () => {
    expect(createAppState(createEmptyTimetable(), 'id-8CE2').selectedClassId).toBeNull();
  });
});

describe('replaceTimetable (IE-1)', () => {
  it('puts the new timetable in place, keeping the class on screen when it is still there', () => {
    const before = createAppState(withClasses('6A1', '7B2').file, 'id-7B2');
    const imported = withClasses('6A1', '7B2', '9BA1').file;
    expect(replaceTimetable(before, imported)).toEqual({
      file: imported,
      selectedClassId: 'id-7B2',
    });
  });

  it('shows the first class by grade when the one on screen is gone', () => {
    const before = createAppState(withClasses('9BA1').file, 'id-9BA1');
    const imported = withClasses('7B2', '6A1').file;
    expect(replaceTimetable(before, imported).selectedClassId).toBe('id-6A1');
  });
});
