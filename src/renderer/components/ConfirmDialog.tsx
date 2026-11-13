import { useId } from 'react';
import { useModalDialog } from './useModalDialog';

interface ConfirmDialogProps {
  /** The question, such as "Delete Thầy Phúc?". */
  title: string;
  /** What will happen, one paragraph per line. */
  lines: readonly string[];
  /** The button that changes nothing, such as "Keep the teacher". */
  keepLabel: string;
  /** The button that goes ahead, such as "Delete teacher": `--danger`, or a filled
      `--primary` one for a question that deletes nothing (the import question). */
  confirm: { label: string; onConfirm: () => void; tone?: 'danger' | 'primary' };
  onCancel: () => void;
}

// A question before something that can't be undone, such as deleting a teacher or one of
// their conditions. The button that keeps things as they are has focus to start, so Enter
// pressed out of habit deletes nothing (R2-7 review); Escape keeps things as they are too.
// Mount it to open it and unmount it to close it. (Its notice mode, with only the keep
// button, went with the subject refusal on 2026-10-27, SYSTEM_DESIGN §10.5.)
export function ConfirmDialog({ onCancel, ...question }: ConfirmDialogProps) {
  const modal = useModalDialog(onCancel);
  const id = useId();

  return (
    <dialog {...modal} className="dialog dialog-wide" aria-labelledby={`${id}-title`}>
      <ConfirmQuestion titleId={`${id}-title`} onCancel={onCancel} {...question} />
    </dialog>
  );
}

/** The question inside a dialog: ConfirmDialog's, and the Grades dialog's delete question
    (DM-8), which takes the place of its list rather than opening over it. */
export function ConfirmQuestion({
  titleId,
  title,
  lines,
  keepLabel,
  confirm,
  onCancel,
}: ConfirmDialogProps & { titleId: string }) {
  return (
    <div className="dialog-body" role="alertdialog" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className="dialog-actions">
        <button type="button" className="btn" autoFocus onClick={onCancel}>
          {keepLabel}
        </button>
        <button
          type="button"
          className={confirm.tone === 'primary' ? 'btn btn-primary' : 'btn btn-danger'}
          onClick={confirm.onConfirm}
        >
          {confirm.label}
        </button>
      </div>
    </div>
  );
}
