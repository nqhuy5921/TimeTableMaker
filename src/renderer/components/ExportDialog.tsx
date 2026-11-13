import { useId, useState } from 'react';
import {
  checkExportDetails,
  cleanExportDetails,
  exportIssuesLine,
  exportTitle,
  type ExportDetailsErrors,
} from '../../domain/exportDetails';
import type { ExportDetails, ExportFormat, ExportScope } from '../../domain/exportSheets';
import { issueTone, type IssueCounts } from '../../domain/issues';
import { useModalDialog } from './useModalDialog';

interface ExportDialogProps {
  scope: ExportScope;
  format: ExportFormat;
  /** The class on screen, named in the title and the issues line for This class. */
  className: string;
  /** How many classes are exported, for All classes' title. */
  classCount: number;
  /** The class's issues for This class, the whole timetable's for All classes (TC-4). */
  issueCounts: IssueCounts;
  initialDetails: ExportDetails;
  /** Asks where to save and writes the file; resolves to false when the save dialog was
      cancelled, so this stays open. */
  onExport: (details: ExportDetails) => Promise<boolean>;
  onCancel: () => void;
}

type Field = keyof ExportDetails;

// The Export dialog (IE-2, IE-4, TC-4; layout spec "Export dialog"): the school, school
// year, and date for the title, filled in with this profile's last ones, and when there are
// errors or warnings, how many, so the button reads Export anyway. Export opens the
// system's save dialog. Mount it to open it and unmount it to close it.
export function ExportDialog({
  scope,
  format,
  className,
  classCount,
  issueCounts,
  initialDetails,
  onExport,
  onCancel,
}: ExportDialogProps) {
  const modal = useModalDialog(onCancel);
  const id = useId();
  const [details, setDetails] = useState(initialDetails);
  // The attempt number remounts the messages, so a repeated one is announced again.
  const [errors, setErrors] = useState<{ fields: ExportDetailsErrors; attempt: number }>({
    fields: {},
    attempt: 0,
  });
  const [busy, setBusy] = useState(false);
  const issuesLine = exportIssuesLine(scope, className, issueCounts);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const cleaned = cleanExportDetails(details);
    const fields = checkExportDetails(cleaned);
    setErrors({ fields, attempt: errors.attempt + 1 });
    if (Object.keys(fields).length > 0) return;
    setBusy(true);
    try {
      if (!(await onExport(cleaned))) setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  function change(field: Field, value: string) {
    setDetails((last) => ({ ...last, [field]: value }));
    if (errors.fields[field]) {
      setErrors(({ fields, attempt }) => ({ fields: { ...fields, [field]: undefined }, attempt }));
    }
  }

  const fieldProps = (field: Field, hint = false) => {
    const message = errors.fields[field];
    const describedBy = [hint && `${id}-${field}-hint`, message && `${id}-${field}-error`]
      .filter(Boolean)
      .join(' ');
    return {
      id: `${id}-${field}`,
      className: 'text-input',
      value: details[field],
      'aria-invalid': message !== undefined,
      'aria-describedby': describedBy || undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => change(field, event.target.value),
    };
  };
  const fieldError = (field: Field) => {
    const message = errors.fields[field];
    return message ? (
      <p key={errors.attempt} id={`${id}-${field}-error`} className="field-error" role="alert">
        {message}
      </p>
    ) : null;
  };

  return (
    <dialog {...modal} className="dialog dialog-wide" aria-labelledby={`${id}-title`}>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <h2 id={`${id}-title`}>{exportTitle(scope, className, classCount, format)}</h2>
        <div className="field">
          <label htmlFor={`${id}-schoolName`}>School</label>
          <input {...fieldProps('schoolName')} autoFocus autoComplete="off" />
          {fieldError('schoolName')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-schoolYear`}>School year</label>
          <input
            {...fieldProps('schoolYear', true)}
            className="text-input tnum"
            autoComplete="off"
          />
          <p id={`${id}-schoolYear-hint`} className="caption">
            As in 2026 - 2027.
          </p>
          {fieldError('schoolYear')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-appliesFrom`}>Applies from</label>
          <input {...fieldProps('appliesFrom')} className="text-input tnum" type="date" />
          {fieldError('appliesFrom')}
        </div>
        {issuesLine && (
          <p className={`export-issues tone-${issueTone(issueCounts)}`} data-testid="export-issues">
            {issuesLine}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {issuesLine ? 'Export anyway' : 'Export'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
