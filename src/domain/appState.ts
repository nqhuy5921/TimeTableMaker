import { classesByGrade } from './classes';
import type { Id, SchoolClass, TimetableFile } from './model';

/** What the renderer holds in memory: the whole timetable, plus the class on screen.
    The selection isn't saved with the file. Every change is a command that returns a
    new value (SYSTEM_DESIGN §4). */
export interface AppState {
  file: TimetableFile;
  selectedClassId: Id | null;
}

/** The state the app opens with. The class remembered from last time goes back on
    screen. If it's gone, or none was remembered, the first class by grade is shown. */
export function createAppState(file: TimetableFile, rememberedClassId: Id | null = null): AppState {
  const remembered = file.classes.find((c) => c.id === rememberedClassId);
  const first = classesByGrade(file.classes)[0]?.classes[0];
  return { file, selectedClassId: (remembered ?? first)?.id ?? null };
}

export function selectedClass(state: AppState): SchoolClass | null {
  return state.file.classes.find((c) => c.id === state.selectedClassId) ?? null;
}

/** Puts a class on screen (TB-1). Nothing in the file changes, so nothing is lost. An
    id that isn't a class leaves the state as it is. */
export function selectClass(state: AppState, classId: Id): AppState {
  if (state.selectedClassId === classId) return state;
  if (!state.file.classes.some((c) => c.id === classId)) return state;
  return { ...state, selectedClassId: classId };
}

/** Puts a whole timetable in place of the one open (IE-1, an import into the open profile),
    keeping the class on screen when it's still there. */
export function replaceTimetable(state: AppState, file: TimetableFile): AppState {
  return createAppState(file, state.selectedClassId);
}
