import { useId, useState } from 'react';
import {
  addCard,
  cardClasses,
  cardName,
  cardView,
  deleteCard,
  editCard,
  placementCount,
  type CardField,
  type CardFields,
} from '../../domain/cards';
import { addRoom, addSubject, addTeacherByShortName, type AddResult } from '../../domain/lists';
import type { Id, TimetableFile } from '../../domain/model';
import { joinList } from '../../domain/text';
import { SelectInput } from './SelectInput';
import { useModalDialog } from './useModalDialog';

type ListKind = 'subject' | 'teacher' | 'room';

interface CardDialogProps {
  file: TimetableFile;
  /** The card to edit, or null to add one. */
  cardId: Id | null;
  /** Opens straight on the delete question, for a Delete button outside the form (the
      Cards page). Keeping the card then closes the form. */
  deleting?: boolean;
  /** Commits the changed timetable and closes the form. */
  onDone: (file: TimetableFile) => void;
  onCancel: () => void;
}

const NEW = '__new__';

// The card form (DM-5, TB-3): subject, teacher, and room, for a card in the pool. Each
// dropdown ends with an item that adds a new one on the spot. The form works on its own
// copy of the timetable, so Cancel drops a new subject, teacher, or room along with the
// card. Mount it to open it and unmount it to close it. The Cards page also opens it on
// the delete question.
export function CardDialog({ file, cardId, deleting = false, onDone, onCancel }: CardDialogProps) {
  const modal = useModalDialog(onCancel);
  const id = useId();
  const editing = cardId === null ? undefined : file.cards.find((c) => c.id === cardId);

  const [draft, setDraft] = useState(file);
  const [subjectId, setSubjectId] = useState<Id | null>(editing?.subjectId ?? null);
  const [teacherId, setTeacherId] = useState<Id | null>(editing?.teacherId ?? null);
  const [roomId, setRoomId] = useState<Id | null>(editing?.roomId ?? null);
  const [adding, setAdding] = useState<ListKind | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(deleting && editing !== undefined);
  // The attempt number remounts the message, so a repeated error is announced again.
  const [error, setError] = useState<{
    message: string;
    field: ErrorField;
    attempt: number;
  } | null>(null);

  function fail(message: string, field: ErrorField) {
    setError({ message, field, attempt: (error?.attempt ?? 0) + 1 });
  }

  function cancelAdding() {
    setAdding(null);
    setError(null);
  }

  function handleSelect(kind: ListKind, value: string) {
    setError(null);
    if (value === NEW) {
      setAdding(kind);
      return;
    }
    setAdding(null);
    const chosen = value === '' ? null : value;
    if (kind === 'subject') {
      setSubjectId(chosen);
    } else if (kind === 'teacher') setTeacherId(chosen);
    else setRoomId(chosen);
  }

  function handleAdded(kind: ListKind, result: AddResult) {
    if (!result.ok) {
      fail(result.error, 'new');
      return;
    }
    setError(null);
    setDraft(result.file);
    setAdding(null);
    if (kind === 'subject') setSubjectId(result.id);
    else if (kind === 'teacher') setTeacherId(result.id);
    else setRoomId(result.id);
    // Back to the dropdown that now shows the new entry.
    requestAnimationFrame(() => document.getElementById(`${id}-${kind}`)?.focus());
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (adding !== null) {
      fail(`Add the new ${adding} or cancel it first.`, 'new');
      return;
    }
    const fields: CardFields = { subjectId, teacherId, roomId };
    const result = editing ? editCard(draft, editing.id, fields) : addCard(draft, fields);
    if (!result.ok) {
      fail(result.error, result.field);
      return;
    }
    onDone(result.file);
  }

  function handleDelete() {
    if (!editing) return;
    if (placementCount(file, editing.id) > 0 && !confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    // From the timetable as it was, so like Cancel it drops anything added in the form.
    onDone(deleteCard(file, editing.id));
  }

  const fieldError = (field: ErrorField) =>
    error?.field === field ? (
      <p key={error.attempt} id={`${id}-error`} className="field-error" role="alert">
        {error.message}
      </p>
    ) : null;
  const describedBy = (field: ErrorField, hint?: string) =>
    [hint, error?.field === field ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;

  // "Edit Toán · Thầy Phúc · P101", as the card was when the form opened.
  const title = editing ? `Edit ${cardName(cardView(file, editing))}` : 'Add card';

  return (
    <dialog {...modal} className="dialog dialog-wide" aria-labelledby={`${id}-title`}>
      {confirmingDelete && editing ? (
        <div className="dialog-body" role="alertdialog" aria-labelledby={`${id}-confirm`}>
          <h2 id={`${id}-confirm`}>Delete {cardName(cardView(file, editing))}?</h2>
          <p>{deleteQuestion(file, editing.id)}</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              onClick={() => (deleting ? onCancel() : setConfirmingDelete(false))}
            >
              Keep the card
            </button>
            <button type="button" className="btn btn-danger" autoFocus onClick={handleDelete}>
              Delete card
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <h2 id={`${id}-title`}>{title}</h2>

          <div className="field">
            <label htmlFor={`${id}-subject`}>Subject</label>
            <SelectInput
              id={`${id}-subject`}
              autoFocus
              value={adding === 'subject' ? NEW : (subjectId ?? '')}
              aria-invalid={error?.field === 'subject'}
              aria-describedby={describedBy('subject')}
              onChange={(event) => handleSelect('subject', event.target.value)}
            >
              <option value="" disabled>
                Choose a subject
              </option>
              {draft.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW}>New subject…</option>
            </SelectInput>
            {fieldError('subject')}
            {adding === 'subject' && (
              <NewEntryForm
                kind="subject"
                error={fieldError('new')}
                errorId={error?.field === 'new' ? `${id}-error` : null}
                onAdd={(name) => handleAdded('subject', addSubject(draft, name))}
                onCancel={cancelAdding}
              />
            )}
          </div>

          <ListSelect
            id={`${id}-teacher`}
            label="Teacher"
            noneLabel="No teacher"
            newLabel="New teacher…"
            options={draft.teachers.map((t) => [t.id, t.shortName])}
            value={adding === 'teacher' ? NEW : (teacherId ?? '')}
            onChange={(value) => handleSelect('teacher', value)}
          >
            {fieldError('teacher')}
            {adding === 'teacher' && (
              <NewEntryForm
                kind="teacher"
                error={fieldError('new')}
                errorId={error?.field === 'new' ? `${id}-error` : null}
                onAdd={(name) => handleAdded('teacher', addTeacherByShortName(draft, name))}
                onCancel={cancelAdding}
              />
            )}
          </ListSelect>

          <ListSelect
            id={`${id}-room`}
            label="Room"
            noneLabel="No room"
            newLabel="New room…"
            options={draft.rooms.map((r) => [r.id, r.name])}
            value={adding === 'room' ? NEW : (roomId ?? '')}
            onChange={(value) => handleSelect('room', value)}
          >
            {fieldError('room')}
            {adding === 'room' && (
              <NewEntryForm
                kind="room"
                error={fieldError('new')}
                errorId={error?.field === 'new' ? `${id}-error` : null}
                onAdd={(name) => handleAdded('room', addRoom(draft, name))}
                onCancel={cancelAdding}
              />
            )}
          </ListSelect>

          {fieldError('card')}
          <div className="dialog-actions">
            {editing && (
              <button
                type="button"
                className="btn btn-danger-quiet dialog-actions-start"
                onClick={handleDelete}
              >
                Delete card
              </button>
            )}
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save' : 'Add card'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** The field an error message sits under. */
type ErrorField = CardField | 'new';

function timesText(count: number): string {
  return count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`;
}

/** "6A1's", "6A1's and 8CE1's", or "6A1's, 6A2's, and 8CE1's". */
function possessiveList(names: readonly string[]): string {
  return joinList(
    names.map((name) => `${name}'s`),
    'and',
  );
}

/** The delete question's text, naming the classes the card is on (DM-5). */
function deleteQuestion(file: TimetableFile, cardId: Id): string {
  const classes = cardClasses(file, cardId).map((c) => c.name);
  if (classes.length === 0) return "It isn't on any grid. Deleting the card can't be undone.";
  if (classes.length === 1) {
    return (
      `It's on ${possessiveList(classes)} grid ${timesText(placementCount(file, cardId))}. ` +
      "Deleting the card removes it from the grid too, and this can't be undone."
    );
  }
  return (
    `It's on ${possessiveList(classes)} grids. Deleting the card removes it from all of ` +
    "them, and this can't be undone."
  );
}

interface ListSelectProps {
  id: string;
  label: string;
  noneLabel: string;
  newLabel: string;
  options: readonly (readonly [Id, string])[];
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}

/** A teacher or room dropdown: none, the list, then "New …". */
function ListSelect({
  id,
  label,
  noneLabel,
  newLabel,
  options,
  value,
  onChange,
  children,
}: ListSelectProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <SelectInput id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{noneLabel}</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
        <option value={NEW}>{newLabel}</option>
      </SelectInput>
      {children}
    </div>
  );
}

interface NewEntryFormProps {
  kind: ListKind;
  error: React.ReactNode;
  /** The id of the error message, while there is one. */
  errorId: string | null;
  onAdd: (name: string) => void;
  onCancel: () => void;
}

const NEW_ENTRY_LABELS: Record<ListKind, { name: string; group: string }> = {
  subject: { name: 'Subject name', group: 'New subject' },
  teacher: { name: 'Short name', group: 'New teacher' },
  room: { name: 'Room name', group: 'New room' },
};

/** The small form under a dropdown for adding a subject, teacher, or room. It isn't a
    real <form>, since forms can't nest, so Enter is handled here. */
function NewEntryForm({ kind, error, errorId, onAdd, onCancel }: NewEntryFormProps) {
  const id = useId();
  const [name, setName] = useState('');
  const labels = NEW_ENTRY_LABELS[kind];

  function add() {
    onAdd(name);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    // Enter in a text box adds. On a button, Enter is left to the button itself, so it
    // does what the button says.
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      add();
    } else if (event.key === 'Escape') {
      // Closes this small form only, not the whole dialog.
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="new-entry" role="group" aria-label={labels.group} onKeyDown={handleKeyDown}>
      <div className="field">
        <label htmlFor={`${id}-name`}>{labels.name}</label>
        <input
          id={`${id}-name`}
          className="text-input"
          autoFocus
          autoComplete="off"
          aria-invalid={errorId !== null}
          aria-describedby={errorId ?? undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {error}
      <div className="new-entry-actions">
        <button type="button" className="btn" aria-label={`Cancel new ${kind}`} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={add}>
          Add {kind}
        </button>
      </div>
    </div>
  );
}
