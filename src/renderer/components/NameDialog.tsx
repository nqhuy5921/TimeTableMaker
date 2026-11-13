import { useId, useState, type ReactNode } from 'react';
import { useModalDialog } from './useModalDialog';

interface NameFormProps {
  /** The heading's id, which the dialog holding the form is labelled by. */
  titleId: string;
  /** Such as "Add room" or "Edit P101". */
  title: string;
  /** The field's label, such as "Name". */
  label: string;
  /** The submit button, such as "Add room" or "Save". */
  submitLabel: string;
  /** The name the field starts with, when editing. */
  initialName?: string;
  /** A muted line under the field, such as the class-name rule, or one worked out from
      what's typed (the grade form's rename line); null shows none. */
  hint?: string | ((name: string) => string | null);
  /** A number field, such as the grade form's: a numeric keyboard and tabular figures. */
  numeric?: boolean;
  /** More classes for the field, such as its width. */
  inputClassName?: string;
  /** Saves the name and returns null, or returns why it can't be used. A promise keeps
      the submit button disabled until it settles (the profile forms ask the main process). */
  onSubmit: (name: string) => string | null | Promise<string | null>;
  onCancel: () => void;
  /** Shown under the field, and redrawn as the name is typed, such as the subject form's
      Colors row and preview. */
  preview?: (name: string) => ReactNode;
}

interface NameDialogProps extends Omit<NameFormProps, 'titleId'> {
  /** The card form's width, as the list pages' forms have. */
  wide?: boolean;
}

// A modal form with one name field, for the room and subject forms (DM-3, DM-4, layout spec
// "Room form and Subject form"), the class bar's New class (DM-2), and the profile forms
// (PF-2, layout spec "Profile forms"). The message from
// `onSubmit` shows under the field. Mount it to open it and unmount it to close it, so each
// opening starts afresh.
export function NameDialog({ wide = false, ...form }: NameDialogProps) {
  const modal = useModalDialog(form.onCancel);
  const id = useId();

  return (
    <dialog
      {...modal}
      className={wide ? 'dialog dialog-wide' : 'dialog'}
      aria-labelledby={`${id}-title`}
    >
      <NameForm titleId={`${id}-title`} {...form} />
    </dialog>
  );
}

/** The one-field form inside a dialog: NameDialog's, and the Grades dialog's grade form
    (DM-8), which takes the place of its list rather than opening over it. */
export function NameForm({
  titleId,
  title,
  label,
  submitLabel,
  initialName = '',
  hint,
  numeric = false,
  inputClassName,
  onSubmit,
  onCancel,
  preview,
}: NameFormProps) {
  const id = useId();
  const [name, setName] = useState(initialName);
  // The attempt number remounts the message, so a repeated error is announced again.
  const [error, setError] = useState<{ message: string; attempt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const hintText = typeof hint === 'function' ? hint(name) : (hint ?? null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const message = await onSubmit(name);
      setError(message === null ? null : { message, attempt: (error?.attempt ?? 0) + 1 });
    } finally {
      setBusy(false);
    }
  }

  const describedBy =
    [hintText !== null && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h2 id={titleId}>{title}</h2>
      <div className="field">
        <label htmlFor={`${id}-name`}>{label}</label>
        <input
          id={`${id}-name`}
          className={['text-input', numeric && 'tnum', inputClassName].filter(Boolean).join(' ')}
          inputMode={numeric ? 'numeric' : undefined}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={name}
          aria-invalid={error !== null}
          aria-describedby={describedBy}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {hintText !== null && (
          <p id={`${id}-hint`} className="caption">
            {hintText}
          </p>
        )}
        {error && (
          <p key={error.attempt} id={`${id}-error`} className="field-error" role="alert">
            {error.message}
          </p>
        )}
      </div>
      {preview?.(name)}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
