import { useState } from 'react';
import { useAppStore } from '../state/appStore';

// Drops down under the header when a save fails (TB-7), over whichever screen is open, so
// nothing on the page moves. It goes away once a save works: the next change, or Try
// again. Hide puts it away until the next save fails, since it covers part of the class
// bar. Changed on 2026-10-21 at the user's request from a strip above the screen, with
// wording that says what happened, what's safe, and what to do.
export function SaveNotice() {
  const { saveFailure, saveNow } = useAppStore();
  const [retrying, setRetrying] = useState(false);
  // The failure the user hid, by its count, so the next failure shows again.
  const [hiddenCount, setHiddenCount] = useState<number | null>(null);
  if (saveFailure === null || saveFailure.count === hiddenCount) return null;

  async function retry() {
    setRetrying(true);
    try {
      await saveNow();
    } finally {
      setRetrying(false);
    }
  }

  // Keyed by the count, so a failed retry is announced again even with the same reason.
  return (
    <div key={saveFailure.count} className="save-notice danger-notice" role="alert">
      <div className="save-notice-text">
        <p className="save-notice-title">
          {saveFailure.count === 1
            ? "Your latest changes aren't saved"
            : `Your latest changes still aren't saved (tried ${saveFailure.count} times)`}
        </p>
        <p>{saveFailure.message}</p>
        <p className="caption">
          They're still here in the app, so keep it open. It tries again with your next change.
        </p>
      </div>
      <div className="save-notice-actions">
        <button type="button" className="btn" disabled={retrying} onClick={() => void retry()}>
          {retrying ? 'Trying…' : 'Try again'}
        </button>
        <button type="button" className="btn" onClick={() => setHiddenCount(saveFailure.count)}>
          Hide
        </button>
      </div>
    </div>
  );
}
