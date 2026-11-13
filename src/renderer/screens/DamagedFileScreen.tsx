import type { LoadResult, ProfileNames } from '../../shared/ipc';

type Damaged = Extract<LoadResult, { status: 'damaged' }>;

interface DamagedFileScreenProps {
  result: Damaged;
  /** The profiles, so another one can be opened instead (PF-1). */
  names: ProfileNames;
  onOpenBackup: () => void;
  onStartNew: () => void;
  onOpenProfile: (id: string) => void;
}

// Shown in place of the app when the open profile's `timetable.json` can't be read (TB-7,
// PF-1), or is missing while there's a backup. Nothing is saved until the user picks one
// of the two ways out, and both keep the damaged file. With other profiles, any of them
// can be opened instead, leaving this one as it is (R4-2 review, 2026-10-28).
export function DamagedFileScreen({
  result,
  names,
  onOpenBackup,
  onStartNew,
  onOpenProfile,
}: DamagedFileScreenProps) {
  const hasBackup = result.backup === 'ok';
  const others = names.profiles.filter((p) => p.id !== names.openId);
  const name = names.profiles.find((p) => p.id === names.openId)?.name;
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-mark" aria-hidden="true" />
          TimeTableMaker
        </div>
      </header>
      <main className="notice-screen" aria-labelledby="damaged-title">
        <h1 id="damaged-title">
          {others.length > 0 && name
            ? `The profile ${name} couldn't be opened`
            : "Your timetable couldn't be opened"}
        </h1>
        {result.missing ? (
          <p>The saved timetable file is missing from {result.folder}.</p>
        ) : (
          <>
            <p>The saved file is damaged, so TimeTableMaker has left it as it is.</p>
            <p className="caption notice-reason">{result.reason}</p>
          </>
        )}
        <p>
          {hasBackup
            ? "There's a backup from before your last save. Open it to carry on from there."
            : result.backup === 'damaged'
              ? "The backup couldn't be opened either."
              : "There's no backup to open."}
        </p>
        <div className="notice-actions">
          {hasBackup && (
            <button type="button" className="btn btn-primary" onClick={onOpenBackup}>
              Open the backup
            </button>
          )}
          <button
            type="button"
            className={hasBackup ? 'btn' : 'btn btn-primary'}
            onClick={onStartNew}
          >
            Start a new timetable
          </button>
        </div>
        {!result.missing && (
          <p className="caption">
            Either way, a copy of the damaged file is kept in {result.folder} as
            timetable.damaged-&lt;date&gt;.json.
          </p>
        )}
        {others.length > 0 && (
          <>
            <p>Or open another profile, leaving this one as it is for now:</p>
            <div className="notice-actions notice-profiles">
              {others.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className="btn"
                  onClick={() => onOpenProfile(profile.id)}
                >
                  Open {profile.name}
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
