import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AppState } from '../../domain/appState';
import { checkTimetable, type Issue } from '../../domain/checks';
import type { TimetableFile } from '../../domain/model';
import { ipcErrorMessage } from '../ipcError';
import { createSaveScheduler } from './saveScheduler';

// The whole timetable lives here as one immutable value. Components never edit it in
// place: they run a domain command on the current state and commit what it returns.
// Each new value is saved, at most once every half second (TB-7), and the class on
// screen is remembered for next time. The errors and warnings are worked out from each new
// value (TC-2), so every command that changes the timetable refreshes them by itself.

/** Saves that failed in a row, and why the last one did. */
export interface SaveFailure {
  message: string;
  /** 1 for the first failure, then one more for each save that fails after it. */
  count: number;
}

interface AppStore {
  state: AppState;
  commit: (next: AppState) => void;
  /** Every error and warning in the timetable, across all classes (SYSTEM_DESIGN §9.3). */
  issues: readonly Issue[];
  /** Set when the last save failed, cleared by the next one that works. */
  saveFailure: SaveFailure | null;
  /** Saves the unsaved timetable now (Try again, or before another profile opens).
      Resolves once that try is over: true when everything is saved. */
  saveNow: () => Promise<boolean>;
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({
  initial,
  children,
}: {
  initial: AppState;
  children: React.ReactNode;
}) {
  const [state, commit] = useState(initial);
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  const [saver] = useState(() =>
    createSaveScheduler((file: TimetableFile) => window.api.saveTimetable(file), {
      onResult: (error) =>
        setSaveFailure((last) =>
          error === null
            ? null
            : { message: ipcErrorMessage(error), count: (last?.count ?? 0) + 1 },
        ),
    }),
  );

  // The value on disk, so the file that was just loaded isn't written back.
  const savedFile = useRef(initial.file);
  useEffect(() => {
    if (state.file === savedFile.current) return;
    savedFile.current = state.file;
    saver.schedule(state.file);
  }, [saver, state.file]);

  const savedClassId = useRef(initial.selectedClassId);
  useEffect(() => {
    if (state.selectedClassId === savedClassId.current) return;
    savedClassId.current = state.selectedClassId;
    window.api.saveSettings({ selectedClassId: state.selectedClassId }).catch(() => {
      // Only the class on screen is lost, so there's nothing to tell the user.
    });
  }, [state.selectedClassId]);

  // Before the window closes, and if the app is taken down by an error, the waiting save
  // goes out first.
  useEffect(() => {
    const stopListening = window.api.onCloseRequest(async () => {
      await saver.flush();
    });
    return () => {
      stopListening();
      void saver.flush();
    };
  }, [saver]);

  const saveNow = useCallback(() => saver.flush(), [saver]);
  const issues = useMemo(() => checkTimetable(state.file), [state.file]);
  // The same value until one of its parts changes, so a save result doesn't redraw every
  // screen that reads the store (R2-7 review).
  const value = useMemo(
    () => ({ state, commit, issues, saveFailure, saveNow }),
    [state, issues, saveFailure, saveNow],
  );

  return <AppStoreContext value={value}>{children}</AppStoreContext>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside AppStoreProvider');
  return store;
}
