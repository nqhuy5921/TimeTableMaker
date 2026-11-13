import { useEffect, useId, useRef, useState } from 'react';
import type { AppState } from '../../domain/appState';
import {
  addGrade,
  deleteGrade,
  editGrade,
  gradeDeletionLines,
  gradeLabel,
  gradeRenameLine,
  gradeRows,
} from '../../domain/grades';
import type { Grade } from '../../domain/model';
import { plural } from '../../domain/text';
import { ConfirmQuestion } from './ConfirmDialog';
import { NameForm } from './NameDialog';
import { useModalDialog } from './useModalDialog';

interface GradesDialogProps {
  state: AppState;
  /** Commits a change; the dialog stays open on its list. */
  onCommit: (state: AppState) => void;
  onClose: () => void;
}

/** What the dialog shows: the list, the grade form (adding when `grade` is null), or the
    delete question. */
type View =
  { kind: 'list' } | { kind: 'form'; grade: Grade | null } | { kind: 'delete'; grade: Grade };

// The Grades dialog (DM-8, layout spec "Grades"), opened from the Classes page: the grades
// with their class counts, Edit, and Delete, and Add grade. The form and the delete
// question take the dialog's place rather than opening over it; Cancel and Escape there go
// back to the list, with focus on the button that opened them. Mount it to open it and
// unmount it to close it.
export function GradesDialog({ state, onCommit, onClose }: GradesDialogProps) {
  const [view, setView] = useState<View>({ kind: 'list' });
  // The list button to focus on, on opening and on coming back: "edit-6", "delete-6",
  // or Add grade (null).
  const returnTo = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modal = useModalDialog(() => (view.kind === 'list' ? onClose() : back()));
  const id = useId();

  function open(next: View, from: string | null) {
    returnTo.current = from;
    setView(next);
  }

  function back() {
    setView({ kind: 'list' });
  }

  useEffect(() => {
    if (view.kind !== 'list') return;
    const list = listRef.current;
    const target =
      (returnTo.current && list?.querySelector<HTMLElement>(`[data-key="${returnTo.current}"]`)) ||
      list?.querySelector<HTMLElement>('[data-key="add"]');
    target?.focus();
  }, [view]);

  return (
    <dialog {...modal} className="dialog dialog-wide" aria-labelledby={`${id}-title`}>
      {view.kind === 'list' ? (
        // Each view has its own key, so React mounts the next view afresh (the form's and
        // the question's autoFocus runs) rather than reusing the list's buttons.
        <div key="list" ref={listRef} className="dialog-body">
          <h2 id={`${id}-title`}>Grades</h2>
          <GradeList
            state={state}
            onEdit={(g) => open({ kind: 'form', grade: g }, `edit-${g}`)}
            onDelete={(g) => open({ kind: 'delete', grade: g }, `delete-${g}`)}
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              data-key="add"
              onClick={() => open({ kind: 'form', grade: null }, null)}
            >
              Add grade
            </button>
          </div>
        </div>
      ) : view.kind === 'form' ? (
        <NameForm
          key={`form-${view.grade ?? 'new'}`}
          titleId={`${id}-title`}
          title={view.grade === null ? 'Add grade' : `Edit ${gradeLabel(view.grade)}`}
          label="Grade"
          submitLabel={view.grade === null ? 'Add grade' : 'Save'}
          initialName={view.grade === null ? '' : String(view.grade)}
          hint={(input) =>
            view.grade === null ? null : gradeRenameLine(state.file, view.grade, input)
          }
          numeric
          inputClassName="grade-input"
          onSubmit={(input) => {
            const result =
              view.grade === null
                ? addGrade(state.file, input)
                : editGrade(state.file, view.grade, input);
            if (!result.ok) return result.error;
            onCommit({ ...state, file: result.file });
            // A renumbered grade's Edit is where focus goes back to; after adding, Add grade.
            if (view.grade !== null) returnTo.current = `edit-${result.grade}`;
            back();
            return null;
          }}
          onCancel={back}
        />
      ) : (
        <ConfirmQuestion
          key="delete"
          titleId={`${id}-title`}
          title={`Delete ${gradeLabel(view.grade)}?`}
          lines={gradeDeletionLines(state.file, view.grade)}
          keepLabel="Keep the grade"
          confirm={{
            label: 'Delete grade',
            onConfirm: () => {
              onCommit(deleteGrade(state, view.grade));
              returnTo.current = null;
              back();
            },
          }}
          onCancel={back}
        />
      )}
    </dialog>
  );
}

function GradeList({
  state,
  onEdit,
  onDelete,
}: {
  state: AppState;
  onEdit: (grade: Grade) => void;
  onDelete: (grade: Grade) => void;
}) {
  const rows = gradeRows(state.file);
  if (rows.length === 0) {
    return <p className="caption">No grades yet. Add one, then add its classes.</p>;
  }
  return (
    <ul className="grades-list" aria-label="Grades">
      {rows.map(({ grade, classes }) => (
        <li key={grade} className="grades-row">
          <span className="grades-row-name">{gradeLabel(grade)}</span>
          <span className="caption tnum">
            {classes === 0 ? 'No classes' : plural(classes, 'class', 'classes')}
          </span>
          <span className="grades-row-actions">
            <button
              type="button"
              className="btn"
              data-key={`edit-${grade}`}
              aria-label={`Edit ${gradeLabel(grade)}`}
              onClick={() => onEdit(grade)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-danger-quiet"
              data-key={`delete-${grade}`}
              aria-label={`Delete ${gradeLabel(grade)}`}
              onClick={() => onDelete(grade)}
            >
              Delete
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
