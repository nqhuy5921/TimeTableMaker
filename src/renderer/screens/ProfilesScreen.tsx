import { useEffect, useRef, useState } from 'react';
import type { WorkbookData } from '../../domain/importWorkbook';
import { lastChangedText, profileDeletionLines, uniqueProfileName } from '../../domain/profiles';
import type { ProfileList, ProfileNames, ProfileResult, ProfileSummary } from '../../shared/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { UploadIcon } from '../components/Icons';
import { ListPage } from '../components/ListPage';
import { NameDialog } from '../components/NameDialog';
import { useMounted } from '../components/useMounted';
import { useReturnFocus } from '../components/useReturnFocus';
import { ipcErrorMessage } from '../ipcError';
import { useAppStore } from '../state/appStore';
import { useExporting } from '../state/exporting';
import { useOpenProfile, useProfiles, useSaveFirst } from '../state/profiles';

/** A row: a profile's name, with its counts once they're read from its file. */
type Row = ProfileNames['profiles'][number] & Partial<ProfileSummary>;

type Form =
  { kind: 'new' } | { kind: 'duplicate'; profile: Row } | { kind: 'rename'; profile: Row };

// The profile screen (PF-2, layout spec "Profile screen"): every profile in the order made,
// with its classes, cards, and when it last changed, the open one marked "Open now". New
// profile, Duplicate, and Rename open the name form; Delete asks first. Open saves the open
// profile's waiting changes, then the app starts again on the other one's timetable.
export function ProfilesScreen({
  onImport,
  focusImport,
}: {
  /** A workbook was chosen and read, so the Import screen can open on it. */
  onImport: (workbook: WorkbookData) => void;
  /** Back from the Import screen, focus starts on Import. */
  focusImport: boolean;
}) {
  const { names, setNames } = useProfiles();
  const { chooseWorkbook, choosing } = useExporting();
  const importRef = useRef<HTMLButtonElement>(null);
  const mounted = useMounted();
  const { open, opening } = useOpenProfile();
  const saveFirst = useSaveFirst();
  const { saveNow } = useAppStore();
  // The counts and times, read from every profile's file when the screen opens and sent
  // back with each change; until then the rows show the names only.
  const [summaries, setSummaries] = useState<ProfileList | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [deleting, setDeleting] = useState<ProfileSummary | null>(null);
  // Why the last Open, Delete, or reading the list didn't work.
  const [notice, setNotice] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const { remember, restore } = useReturnFocus(addRef);

  // The counts are read from each profile's file, so the open profile's waiting save goes
  // out first. A failed save still shows the list, with the file's counts.
  useEffect(() => {
    void (async () => {
      await saveNow();
      setSummaries(await window.api.listProfiles());
    })().catch((error: unknown) => setNotice(ipcErrorMessage(error)));
  }, [saveNow]);

  useEffect(() => {
    if (focusImport) importRef.current?.focus();
  }, [focusImport]);

  async function chooseFile() {
    const workbook = await chooseWorkbook();
    // Gone to another screen while it was read: the file isn't wanted.
    if (workbook && mounted.current) onImport(workbook);
  }

  /** The list the main process sent back after a change, for this screen and the header. */
  function showList(list: ProfileList) {
    setSummaries(list);
    setNames(list);
  }

  function close() {
    setForm(null);
    setDeleting(null);
    restore();
  }

  async function openProfile(profile: Row) {
    setNotice(null);
    // On success the app starts again on the other profile, so this screen goes.
    setNotice(await open(profile));
  }

  /** The name form's answer: null once the change is made, or why it wasn't. */
  async function submitName(current: Form, name: string): Promise<string | null> {
    try {
      let result: ProfileResult;
      if (current.kind === 'new') {
        result = await window.api.newProfile(name);
      } else if (current.kind === 'rename') {
        result = await window.api.renameProfile(current.profile.id, name);
      } else {
        // The copy is made from the file, so the open profile's waiting changes go first.
        if (current.profile.id === names.openId) {
          const refusal = await saveFirst('the copy would miss them. Try again.');
          if (refusal !== null) return refusal;
        }
        result = await window.api.duplicateProfile(current.profile.id, name);
      }
      if (!result.ok) return result.error;
      showList(result.list);
      close();
      return null;
    } catch (error) {
      return ipcErrorMessage(error);
    }
  }

  async function deleteProfile(profile: ProfileSummary) {
    setDeleting(null);
    setNotice(null);
    try {
      const result = await window.api.deleteProfile(profile.id);
      if (result.ok) showList(result.list);
      else setNotice(result.error);
    } catch (error) {
      setNotice(ipcErrorMessage(error));
    }
    restore();
  }

  const rows: Row[] = summaries?.profiles ?? names.profiles;
  const now = new Date();
  const canDelete = rows.length > 1;

  return (
    <>
      <ListPage
        title="Profiles"
        noun={{ one: 'profile', many: 'profiles' }}
        total={rows.length}
        addRef={addRef}
        addLabel="New profile"
        notice={notice}
        actions={
          <button
            ref={importRef}
            type="button"
            className="btn btn-with-icon"
            // Not disabled while reading, so focus stays on it; a second click is ignored.
            onClick={() => void chooseFile()}
          >
            <UploadIcon size={14} />
            {choosing ? 'Reading…' : 'Import'}
          </button>
        }
        onAdd={() => {
          remember();
          setForm({ kind: 'new' });
        }}
      >
        <table className="list-table profiles-table" aria-label="Profiles">
          <thead>
            <tr>
              <th scope="col">Profile</th>
              <th scope="col" className="list-table-number">
                Classes
              </th>
              <th scope="col" className="list-table-number">
                Cards
              </th>
              <th scope="col">Last changed</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((profile) => {
              const isOpen = profile.id === names.openId;
              return (
                <tr key={profile.id}>
                  <th scope="row" className="list-table-name">
                    {/* The name gives way to the chip, so a long one never hides it. */}
                    <span className="profiles-table-name">
                      <span className="profiles-table-name-text">{profile.name}</span>
                      {isOpen && <span className="open-chip">Open now</span>}
                    </span>
                  </th>
                  <ProfileCount value={profile.classes} />
                  <ProfileCount value={profile.cards} />
                  <td className="tnum">
                    {profile.modified ? lastChangedText(new Date(profile.modified), now) : ''}
                  </td>
                  <td className="list-table-actions">
                    {!isOpen && (
                      <button
                        type="button"
                        className="btn"
                        aria-label={`Open ${profile.name}`}
                        disabled={opening}
                        onClick={() => void openProfile(profile)}
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Duplicate ${profile.name}`}
                      onClick={() => {
                        remember();
                        setForm({ kind: 'duplicate', profile });
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Rename ${profile.name}`}
                      onClick={() => {
                        remember();
                        setForm({ kind: 'rename', profile });
                      }}
                    >
                      Rename
                    </button>
                    {!isOpen && canDelete && (
                      <button
                        type="button"
                        className="btn btn-danger-quiet"
                        aria-label={`Delete ${profile.name}`}
                        // The question says what goes, so it waits for the counts.
                        disabled={profile.classes === undefined}
                        onClick={() => {
                          remember();
                          setDeleting(profile as ProfileSummary);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ListPage>
      {form && (
        <NameDialog
          title={
            form.kind === 'new'
              ? 'New profile'
              : `${form.kind === 'duplicate' ? 'Duplicate' : 'Rename'} ${form.profile.name}`
          }
          label="Name"
          submitLabel={
            form.kind === 'new' ? 'New profile' : form.kind === 'duplicate' ? 'Duplicate' : 'Save'
          }
          initialName={
            form.kind === 'new'
              ? ''
              : form.kind === 'duplicate'
                ? uniqueProfileName(rows, `${form.profile.name} copy`)
                : form.profile.name
          }
          onSubmit={(name) => submitName(form, name)}
          onCancel={close}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          lines={profileDeletionLines(deleting)}
          keepLabel="Keep the profile"
          confirm={{ label: 'Delete profile', onConfirm: () => void deleteProfile(deleting) }}
          onCancel={close}
        />
      )}
    </>
  );
}

/** A profile's classes or cards, a muted dash when its timetable can't be read, or
    nothing while it's being read. */
function ProfileCount({ value }: { value: number | null | undefined }) {
  if (value === undefined) return <td className="list-table-number" />;
  return value === null ? (
    <td className="list-table-number list-table-none" title="Its timetable can't be read">
      –
    </td>
  ) : (
    <td className="list-table-number">{value}</td>
  );
}
