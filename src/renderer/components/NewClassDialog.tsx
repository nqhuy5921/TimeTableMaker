import { classNameHint } from '../../domain/className';
import type { Grade } from '../../domain/model';
import { NameDialog } from './NameDialog';

interface NewClassDialogProps {
  /** The timetable's grades, which the hint names. */
  grades: readonly Grade[];
  /** Adds the class and returns null, or returns why the name can't be used. */
  onSubmit: (name: string) => string | null;
  onCancel: () => void;
}

// The class bar's New class: a small modal form for a class name, checked against the
// class-name rule (DM-2). Mount it to open it and unmount it to close it, so each opening
// starts empty.
export function NewClassDialog({ grades, onSubmit, onCancel }: NewClassDialogProps) {
  return (
    <NameDialog
      title="New class"
      label="Class name"
      submitLabel="Add class"
      hint={classNameHint(grades)}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}
