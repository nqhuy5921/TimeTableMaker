import { useId, useState } from 'react';
import type { AppState } from '../../domain/appState';
import { addClass, editClass, type ClassField, type ClassFields } from '../../domain/classes';
import { classNameHint } from '../../domain/className';
import type { Id } from '../../domain/model';
import { SelectInput } from './SelectInput';
import { useModalDialog } from './useModalDialog';

interface ClassDialogProps {
  state: AppState;
  /** The class to edit, or null to add one. */
  classId: Id | null;
  /** Commits the changed state and closes the form. */
  onDone: (state: AppState) => void;
  onCancel: () => void;
}

// The class form (DM-2, layout spec "Class form"): the name, checked by the class-name
// rule, the homeroom teacher (required), and the assistant homeroom teacher (optional).
// Mount it to open it and unmount it to close it.
export function ClassDialog({ state, classId, onDone, onCancel }: ClassDialogProps) {
  const modal = useModalDialog(onCancel);
  const id = useId();
  const { teachers } = state.file;
  const editing = classId === null ? undefined : state.file.classes.find((c) => c.id === classId);
  const [name, setName] = useState(editing?.name ?? '');
  const [formTeacherId, setFormTeacherId] = useState(editing?.formTeacherId ?? '');
  const [coTeacherId, setCoTeacherId] = useState(editing?.coTeacherId ?? '');
  // The attempt number remounts the message, so a repeated error is announced again.
  const [error, setError] = useState<{
    message: string;
    field: ClassField;
    attempt: number;
  } | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const fields: ClassFields = {
      name,
      formTeacherId: formTeacherId || null,
      coTeacherId: coTeacherId || null,
    };
    const result = editing ? editClass(state.file, editing.id, fields) : addClass(state, fields);
    if (!result.ok) {
      setError({ message: result.error, field: result.field, attempt: (error?.attempt ?? 0) + 1 });
      return;
    }
    onDone('state' in result ? result.state : { ...state, file: result.file });
  }

  const fieldError = (field: ClassField) =>
    error?.field === field ? (
      <p key={error.attempt} id={`${id}-error`} className="field-error" role="alert">
        {error.message}
      </p>
    ) : null;
  const describedBy = (field: ClassField, ...more: (string | false)[]) =>
    [...more, error?.field === field && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const clearError = (field: ClassField) => {
    if (error?.field === field) setError(null);
  };

  const teacherOptions = teachers.map((t) => (
    <option key={t.id} value={t.id}>
      {t.shortName}
    </option>
  ));

  return (
    <dialog {...modal} className="dialog dialog-wide" aria-labelledby={`${id}-title`}>
      <form onSubmit={handleSubmit} noValidate>
        <h2 id={`${id}-title`}>{editing ? `Edit ${editing.name}` : 'Add class'}</h2>
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            className="text-input"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={name}
            aria-invalid={error?.field === 'name'}
            aria-describedby={describedBy('name', `${id}-hint`)}
            onChange={(event) => {
              setName(event.target.value);
              clearError('name');
            }}
          />
          <p id={`${id}-hint`} className="caption">
            {classNameHint(state.file.grades)}
          </p>
          {fieldError('name')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-form`}>Homeroom teacher</label>
          <SelectInput
            id={`${id}-form`}
            value={formTeacherId}
            aria-invalid={error?.field === 'formTeacher'}
            aria-describedby={describedBy(
              'formTeacher',
              teachers.length === 0 && `${id}-no-teachers`,
            )}
            onChange={(event) => {
              setFormTeacherId(event.target.value);
              clearError('formTeacher');
              // The assistant's "pick another teacher" may no longer apply.
              clearError('coTeacher');
            }}
          >
            <option value="" disabled>
              Choose a teacher
            </option>
            {teacherOptions}
          </SelectInput>
          {teachers.length === 0 && (
            <p id={`${id}-no-teachers`} className="caption">
              There are no teachers yet. Add one on the Teachers page first.
            </p>
          )}
          {fieldError('formTeacher')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-co`}>
            Assistant homeroom teacher <span className="field-optional">(optional)</span>
          </label>
          <SelectInput
            id={`${id}-co`}
            value={coTeacherId}
            aria-invalid={error?.field === 'coTeacher'}
            aria-describedby={describedBy('coTeacher')}
            onChange={(event) => {
              setCoTeacherId(event.target.value);
              clearError('coTeacher');
            }}
          >
            <option value="">None</option>
            {teacherOptions}
          </SelectInput>
          {fieldError('coTeacher')}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {editing ? 'Save' : 'Add class'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
