import type { ExportFormat, ExportScope } from '../../domain/exportSheets';
import { issueCountsText, issueTone, type IssueCounts } from '../../domain/issues';
import { WEEKLY_PERIODS } from '../../domain/model';
import { ExportMenu } from './ExportMenu';

interface ClassBarProps {
  /** The grade tabs and class tiles. */
  picker: React.ReactNode;
  /** The class on screen, or what to do when there isn't one. */
  title: string;
  /** Grade, track, and homeroom teacher of the class on screen. */
  details: string | null;
  /** Periods placed in the class on screen, or null when no class is on screen. */
  placed: number | null;
  /** The class on screen's errors and warnings, or every class's with none on screen. */
  issueCounts: IssueCounts;
  onShowIssues: () => void;
  /** The class on screen's name, or null with none, for the Export menu. */
  className: string | null;
  /** How many classes there are, for the Export menu. */
  classCount: number;
  /** Opens the Export dialog for a menu item. */
  onExport: (scope: ExportScope, format: ExportFormat) => void;
}

// Spans the screen above the side panel and the grid: the class picker, then the class
// on screen with its placed count, issues, and Export.
export function ClassBar({
  picker,
  title,
  details,
  placed,
  issueCounts,
  onShowIssues,
  className,
  classCount,
  onExport,
}: ClassBarProps) {
  const total = issueCounts.errors + issueCounts.warnings;
  return (
    <div className="class-bar">
      {picker}
      <div className="class-bar-head">
        <h1>{title}</h1>
        {details && (
          <span className="class-bar-details" data-testid="class-line">
            {details}
          </span>
        )}
        <div className="class-bar-actions">
          {placed !== null && (
            <span className="status-pill">
              Placed{' '}
              <span className="tnum" data-testid="placed-count">
                {placed}/{WEEKLY_PERIODS}
              </span>
            </span>
          )}
          <button
            type="button"
            className={`btn btn-issues tone-${issueTone(issueCounts)}`}
            title={issueCountsText(issueCounts) || 'No issues'}
            onClick={onShowIssues}
          >
            Issues <span className="tnum">{total}</span>
          </button>
          <ExportMenu className={className} classCount={classCount} onPick={onExport} />
        </div>
      </div>
    </div>
  );
}
