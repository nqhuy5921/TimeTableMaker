import { useEffect, useState } from 'react';
import { exportClassIds } from '../../domain/exportDetails';
import { useAppStore } from '../state/appStore';
import { useExporting } from '../state/exporting';

/** How long the saved and imported notices stay up (layout spec, Export and Import
    notices). */
const SAVED_NOTICE_MS = 8000;

// Drops under the header after an export, in the save notice's place and frame (layout
// spec, Export notice): white with a `--primary` edge once the file is saved, going after 8
// seconds (counted afresh once the pointer and focus leave it, so it doesn't go while in
// use), or the save notice's danger look when it wasn't, with Try again.
export function ExportNotice() {
  const { notice, run, runExample, hideNotice } = useExporting();
  const { state } = useAppStore();
  const [retrying, setRetrying] = useState(false);
  // The notice the pointer is over, and the one holding the focus, by count, so a notice
  // put away under the pointer doesn't keep the next one up.
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const paused = notice !== null && (hovered === notice.count || focused === notice.count);

  useEffect(() => {
    if ((notice?.kind !== 'saved' && notice?.kind !== 'imported') || paused) return;
    const timer = setTimeout(hideNotice, SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, paused, hideNotice]);

  if (notice === null) return null;

  if (notice.kind === 'saved' || notice.kind === 'imported') {
    return (
      <div
        key={notice.count}
        className="save-notice export-notice"
        role="status"
        onPointerEnter={() => setHovered(notice.count)}
        onPointerLeave={() => setHovered(null)}
        onFocus={() => setFocused(notice.count)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null);
        }}
      >
        {notice.kind === 'saved' ? (
          <div className="save-notice-text">
            <p className="export-notice-title">Saved {notice.fileName}</p>
            <p className="caption">{notice.folder}</p>
          </div>
        ) : (
          <div className="save-notice-text">
            <p className="export-notice-title">{notice.text}</p>
          </div>
        )}
        <div className="save-notice-actions">
          {notice.kind === 'saved' && (
            <button
              type="button"
              className="btn"
              onClick={() => void window.api.showInFolder(notice.path)}
            >
              Show in folder
            </button>
          )}
          <button type="button" className="btn" onClick={hideNotice}>
            Hide
          </button>
        </div>
      </div>
    );
  }

  // A workbook chosen to import that couldn't be read, or an import that didn't go ahead
  // after its screen was left (layout spec, Import notice).
  if (notice.kind === 'unread' || notice.kind === 'notImported') {
    return (
      <div key={notice.count} className="save-notice danger-notice" role="alert">
        <div className="save-notice-text">
          <p className="save-notice-title">
            {notice.kind === 'unread'
              ? `${notice.fileName} couldn't be read`
              : 'Nothing was imported'}
          </p>
          <p>{notice.reason}</p>
        </div>
        <div className="save-notice-actions">
          <button type="button" className="btn" onClick={hideNotice}>
            Hide
          </button>
        </div>
      </div>
    );
  }

  // This class's export, by the class as it is now: gone, it can't be tried again; renamed,
  // Try again asks where to save, suggesting the new name, rather than writing it under the
  // old one (R4-8 review). The example workbook has no class to check.
  const { request } = notice;
  const classId = request?.scope === 'class' ? request.classIds[0] : undefined;
  const nameThen = request?.file.classes.find((c) => c.id === classId)?.name;
  const nameNow = state.file.classes.find((c) => c.id === classId)?.name;
  const classGone = classId !== undefined && nameNow === undefined;
  const noClasses = request?.scope === 'all' && state.file.classes.length === 0;
  const cantRetry = classGone
    ? `${nameThen ?? 'The class'} has been deleted, so it can't be exported.`
    : noClasses
      ? "The timetable has no classes now, so there's nothing to export."
      : null;

  async function retry() {
    setRetrying(true);
    try {
      if (request === null) {
        await runExample(true);
        return;
      }
      // The timetable as it is now, which may have changed since the export failed.
      await run({
        ...request,
        file: state.file,
        classIds:
          request.scope === 'all' ? exportClassIds(state.file, 'all', null) : request.classIds,
        retry: nameNow === nameThen,
      });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div key={notice.count} className="save-notice danger-notice" role="alert">
      <div className="save-notice-text">
        <p className="save-notice-title">{notice.fileName} wasn't saved</p>
        <p>{notice.reason}</p>
        {cantRetry && <p>{cantRetry}</p>}
      </div>
      <div className="save-notice-actions">
        {cantRetry === null && (
          <button type="button" className="btn" disabled={retrying} onClick={() => void retry()}>
            {retrying ? 'Trying…' : 'Try again'}
          </button>
        )}
        <button type="button" className="btn" onClick={hideNotice}>
          Hide
        </button>
      </div>
    </div>
  );
}
