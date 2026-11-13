import { Suspense, use, useState } from 'react';
import { createAppState } from '../domain/appState';
import type { LoadResult, ProfileNames } from '../shared/ipc';
import { App } from './App';
import { DamagedFileScreen } from './screens/DamagedFileScreen';
import { LoadErrorBoundary } from './screens/LoadErrorScreen';
import { AppStoreProvider } from './state/appStore';
import { ExportingProvider } from './state/exporting';
import { ProfilesProvider } from './state/profiles';

/** The open profile's timetable and the profiles' names, read before anything is shown. */
interface Boot {
  load: Promise<LoadResult>;
  names: Promise<ProfileNames>;
  /** What the import notice says once the profile is open, when an import into a new
      profile opened it (IE-1). */
  imported?: string;
}

/** Reads the names once `load` has opened its profile, so they name the right open one. */
function boot(load: Promise<LoadResult>, imported?: string): Boot {
  const names = load.then(() => window.api.listProfileNames());
  // A failed load is shown by the error screen; the names' own failure then goes unread.
  names.catch(() => undefined);
  return { load, names, ...(imported !== undefined && { imported }) };
}

// Loads the saved timetable before anything else is shown (TB-7). Started once, outside
// React, so StrictMode's second render doesn't read the file twice.
const firstBoot = boot(window.api.loadTimetable());

export function Root() {
  const [current, setCurrent] = useState(firstBoot);
  // A new attempt remounts the error boundary and everything in it, so it starts clear,
  // and so does the app when another profile opens.
  const [attempt, setAttempt] = useState(0);

  function start(next: Boot) {
    setCurrent(next);
    setAttempt((n) => n + 1);
  }

  return (
    <LoadErrorBoundary key={attempt} onRetry={() => start(boot(window.api.loadTimetable()))}>
      <Suspense fallback={null}>
        <Loaded
          current={current}
          onLoad={(load) => setCurrent({ ...current, load })}
          onOpenProfile={(id, imported) => start(boot(window.api.openProfile(id), imported))}
        />
      </Suspense>
    </LoadErrorBoundary>
  );
}

function Loaded({
  current,
  onLoad,
  onOpenProfile,
}: {
  current: Boot;
  onLoad: (next: Promise<LoadResult>) => void;
  onOpenProfile: (id: string, imported?: string) => void;
}) {
  const result = use(current.load);
  const names = use(current.names);
  if (result.status === 'damaged') {
    // Nothing of this profile is in the app yet, so another one opens straight away.
    return (
      <DamagedFileScreen
        result={result}
        names={names}
        onOpenBackup={() => onLoad(window.api.openBackup())}
        onStartNew={() => onLoad(window.api.startNewTimetable())}
        onOpenProfile={onOpenProfile}
      />
    );
  }
  return (
    <ProfilesProvider initial={names} onStart={onOpenProfile}>
      <AppStoreProvider initial={createAppState(result.file, result.settings.selectedClassId)}>
        <ExportingProvider initial={result.settings.exportDetails} imported={current.imported}>
          <App />
        </ExportingProvider>
      </AppStoreProvider>
    </ProfilesProvider>
  );
}
