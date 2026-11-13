import { Component, type ReactNode } from 'react';
import { ipcErrorMessage } from '../ipcError';

interface LoadErrorScreenProps {
  message: string;
  onRetry: () => void;
}

// Shown in place of the app when opening the timetable failed in a way the damaged-file
// screen doesn't cover, such as the backup that couldn't be put in place because another
// program held the file. Try again reads the saved file afresh (TB-7).
export function LoadErrorScreen({ message, onRetry }: LoadErrorScreenProps) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-mark" aria-hidden="true" />
          TimeTableMaker
        </div>
      </header>
      <main className="notice-screen" aria-labelledby="load-error-title">
        <h1 id="load-error-title">Something went wrong</h1>
        <p>TimeTableMaker couldn't finish opening your timetable.</p>
        <p className="caption notice-reason">{message}</p>
        <p>Close any program that may have the file open, then try again.</p>
        <div className="notice-actions">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      </main>
    </div>
  );
}

interface LoadErrorBoundaryProps {
  onRetry: () => void;
  children: ReactNode;
}

/** Catches a failed load (a rejected promise read with `use`) or a crash while drawing,
    so the window never goes blank. */
export class LoadErrorBoundary extends Component<
  LoadErrorBoundaryProps,
  { error: { value: unknown } | null }
> {
  state = { error: null as { value: unknown } | null };

  static getDerivedStateFromError(value: unknown) {
    return { error: { value } };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return <LoadErrorScreen message={ipcErrorMessage(error.value)} onRetry={this.props.onRetry} />;
  }
}
