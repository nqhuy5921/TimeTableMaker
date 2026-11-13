import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { importNoticeText, type ImportResult } from '../../domain/importTimetable';
import type { ProfileNames } from '../../shared/ipc';
import { ipcErrorMessage } from '../ipcError';
import { useAppStore } from './appStore';

// The profiles (PF-1, PF-2, SYSTEM_DESIGN §11.5): their names with the open one, for the
// header's profile pill and the profile screen. Root keeps them beside the open profile's
// timetable, since opening another profile starts the app again from that one's. Only the
// names are read at start-up; the profile screen reads the counts itself.

interface Profiles {
  names: ProfileNames;
  /** The open profile's name, for the header. */
  openName: string;
  /** Shows the profiles after a change (the list the main process sends back). */
  setNames: (names: ProfileNames) => void;
}

interface ProfilesContextValue extends Profiles {
  /** Starts the app again on another profile, saving nothing: use `useOpenProfile`. With
      `imported`, the import notice says it once it's open. */
  start: (id: string, imported?: string) => void;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

export function ProfilesProvider({
  initial,
  onStart,
  children,
}: {
  initial: ProfileNames;
  onStart: (id: string, imported?: string) => void;
  children: React.ReactNode;
}) {
  const [names, setNames] = useState(initial);
  const value = useMemo(
    () => ({
      names,
      openName: names.profiles.find((p) => p.id === names.openId)?.name ?? '',
      setNames,
      start: onStart,
    }),
    [names, onStart],
  );
  return <ProfilesContext value={value}>{children}</ProfilesContext>;
}

function useProfilesContext(): ProfilesContextValue {
  const profiles = useContext(ProfilesContext);
  if (!profiles) throw new Error('useProfiles must be used inside ProfilesProvider');
  return profiles;
}

export function useProfiles(): Profiles {
  const { names, openName, setNames } = useProfilesContext();
  return { names, openName, setNames };
}

/** Saves the open profile's waiting changes before something that reads its file (opening
    another profile, copying this one): null once they're saved, or why it can't go ahead,
    so a failed save is never dropped. `consequence` finishes "…aren't saved, so ". */
export function useSaveFirst(): (consequence: string) => Promise<string | null> {
  const { saveNow } = useAppStore();
  return useCallback(
    async (consequence) =>
      (await saveNow()) ? null : `Your latest changes aren't saved, so ${consequence}`,
    [saveNow],
  );
}

/** Opens another profile once the open one is saved (PF-1, PF-2): resolves null as the app
    starts again on it, or with why it can't open yet. While one is opening, `opening` is
    true and another call does nothing, so a double-click opens it once. */
export function useOpenProfile() {
  const { start } = useProfilesContext();
  const saveFirst = useSaveFirst();
  const busy = useRef(false);
  const [opening, setOpening] = useState(false);

  const open = useCallback(
    async (profile: { id: string; name: string }): Promise<string | null> => {
      if (busy.current) return null;
      busy.current = true;
      setOpening(true);
      const refusal = await saveFirst(
        `${profile.name} can't be opened yet. Open tries saving them again.`,
      );
      if (refusal === null) {
        // The app starts again, so this screen goes; nothing to reset.
        start(profile.id);
      } else {
        busy.current = false;
        setOpening(false);
      }
      return refusal;
    },
    [saveFirst, start],
  );
  return { open, opening };
}

/** Why an import didn't go ahead when the Import screen was closed while it was saving. */
export const LEFT_BEFORE_IMPORT = 'The Import screen was closed before the import was in.';

/** How an import into a new profile went: the app starts again on it, or it was refused
    (why, in words), or it was made but not opened since the Import screen was left first. */
export type ImportIntoNewResult =
  | { status: 'opening' }
  | { status: 'refused'; reason: string }
  | { status: 'notOpened'; notice: string };

/** Imports into a new profile (IE-1, SYSTEM_DESIGN §12.6): once the open profile is saved,
    makes the profile with the imported timetable, then starts the app on it with the import
    notice. `stillWanted` is asked before each step, so leaving the Import screen meanwhile
    makes nothing, or doesn't open what was made, rather than dropping changes made since.
    While one is under way, `importing` is true and another call does nothing. */
export function useImportIntoNew() {
  const { start, setNames } = useProfilesContext();
  const saveFirst = useSaveFirst();
  const busy = useRef(false);
  const [importing, setImporting] = useState(false);

  const importIntoNew = useCallback(
    async (
      name: string,
      result: ImportResult,
      stillWanted: () => boolean,
    ): Promise<ImportIntoNewResult | null> => {
      if (busy.current) return null;
      busy.current = true;
      setImporting(true);
      const outcome = await (async (): Promise<ImportIntoNewResult> => {
        const refusal = await saveFirst('nothing is imported yet. Import tries saving them again.');
        if (refusal !== null) return { status: 'refused', reason: refusal };
        if (!stillWanted()) return { status: 'refused', reason: LEFT_BEFORE_IMPORT };
        try {
          const made = await window.api.newProfileFrom(name, result.file);
          if (!made.ok) return { status: 'refused', reason: made.error };
          const madeName = made.list.profiles.find((p) => p.id === made.id)?.name ?? name;
          const notice = importNoticeText(result.summary, madeName);
          if (!stillWanted()) {
            setNames(made.list);
            return {
              status: 'notOpened',
              notice: `${notice} The Import screen was closed first, so it isn't open: open it on the profile screen.`,
            };
          }
          // The app starts again, so this screen goes; nothing to reset.
          start(made.id, notice);
          return { status: 'opening' };
        } catch (error) {
          return { status: 'refused', reason: `Nothing was imported: ${ipcErrorMessage(error)}` };
        }
      })();
      if (outcome.status !== 'opening') {
        busy.current = false;
        setImporting(false);
      }
      return outcome;
    },
    [saveFirst, setNames, start],
  );
  return { importIntoNew, importing };
}
