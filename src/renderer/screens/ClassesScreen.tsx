import { useEffect, useMemo, useRef, useState } from 'react';
import { classDeletionLines, classRows, deleteClass } from '../../domain/classes';
import { issueCountsByClass } from '../../domain/issues';
import { WEEKLY_PERIODS, type Id, type SchoolClass, type Teacher } from '../../domain/model';
import { ClassDialog } from '../components/ClassDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorPill } from '../components/ErrorPill';
import { GradesDialog } from '../components/GradesDialog';
import { ListPage, RowActions } from '../components/ListPage';
import { useReturnFocus } from '../components/useReturnFocus';
import { useAppStore } from '../state/appStore';

/** A teacher's cell: the short name, with the full name as its tooltip when there is one,
    or a muted dash when there's no teacher. */
function TeacherCell({ teacher }: { teacher: Teacher | undefined }) {
  return teacher ? (
    <td className="classes-table-teacher" title={teacher.fullName}>
      {teacher.shortName}
    </td>
  ) : (
    <td className="list-table-none">—</td>
  );
}

// The Classes page (DM-2, layout spec "List pages for classes, rooms, and subjects"): every
// class in class-bar order with its homeroom teacher, assistant, periods placed, and
// errors, a search, Grades (DM-8), and Add class. Edit opens the class form and Delete asks
// first. The class bar's Add grades opens the page with the Grades dialog open.
export function ClassesScreen({
  openGrades = false,
  onGradesOpened,
}: {
  /** Open the Grades dialog, as the class bar's Add grades asks; a one-time request. */
  openGrades?: boolean;
  /** Called once the request is taken, so it isn't taken again. */
  onGradesOpened?: () => void;
}) {
  const { state, commit, issues } = useAppStore();
  // The page's own search, empty again on each visit, as on the Teachers page.
  const [query, setQuery] = useState('');
  // The class form (adding when classId is null) or the delete question.
  const [form, setForm] = useState<{ classId: Id | null } | null>(null);
  const [deleting, setDeleting] = useState<SchoolClass | null>(null);
  const [grades, setGrades] = useState(openGrades);
  useEffect(() => {
    if (openGrades) onGradesOpened?.();
  }, [openGrades, onGradesOpened]);
  const addRef = useRef<HTMLButtonElement>(null);
  const gradesRef = useRef<HTMLButtonElement>(null);
  // Focus goes back to the button that opened the form or question, or to Add class when
  // its row is gone.
  const { remember, restore } = useReturnFocus(addRef);
  // The Grades dialog gives focus back to Grades, also when the class bar opened it.
  const gradesFocus = useReturnFocus(gradesRef);
  const rows = useMemo(() => classRows(state.file, query), [state.file, query]);
  // Each class's current errors, worked out again only when the issues change.
  const counts = useMemo(() => issueCountsByClass(issues), [issues]);

  function close() {
    setForm(null);
    setDeleting(null);
    restore();
  }

  return (
    <>
      <ListPage
        title="Classes"
        noun={{ one: 'class', many: 'classes' }}
        total={state.file.classes.length}
        matches={rows.length}
        search={{ query, onQueryChange: setQuery }}
        actions={
          <button
            ref={gradesRef}
            type="button"
            className="btn"
            onClick={() => {
              gradesFocus.remember();
              setGrades(true);
            }}
          >
            Grades
          </button>
        }
        addDisabledReason={
          state.file.grades.length === 0 ? 'Add a grade first, with Grades.' : undefined
        }
        emptyHint={
          state.file.grades.length === 0
            ? 'Add a grade with Grades above, then its classes with Add class.'
            : undefined
        }
        addRef={addRef}
        onAdd={() => {
          remember();
          setForm({ classId: null });
        }}
      >
        <table className="list-table classes-table" aria-label="Classes">
          <thead>
            <tr>
              <th scope="col">Class</th>
              <th scope="col">Grade</th>
              <th scope="col">Homeroom teacher</th>
              <th scope="col">Assistant homeroom teacher</th>
              <th scope="col" className="list-table-number">
                Placed
              </th>
              <th scope="col" className="list-table-number">
                Errors
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ schoolClass, homeroom, assistant, placed }) => (
              <tr key={schoolClass.id}>
                <th scope="row" className="list-table-name">
                  {schoolClass.name}
                </th>
                <td className="classes-table-grade">{schoolClass.grade}</td>
                <TeacherCell teacher={homeroom} />
                <TeacherCell teacher={assistant} />
                <td className="list-table-number">
                  {placed}/{WEEKLY_PERIODS}
                </td>
                <td className="list-table-number">
                  <ErrorPill count={counts.get(schoolClass.id)?.errors ?? 0} />
                </td>
                <RowActions
                  name={schoolClass.name}
                  onEdit={() => {
                    remember();
                    setForm({ classId: schoolClass.id });
                  }}
                  onDelete={() => {
                    remember();
                    setDeleting(schoolClass);
                  }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </ListPage>
      {form && (
        <ClassDialog
          state={state}
          classId={form.classId}
          onDone={(next) => {
            commit(next);
            close();
          }}
          onCancel={close}
        />
      )}
      {grades && (
        <GradesDialog
          state={state}
          onCommit={commit}
          onClose={() => {
            setGrades(false);
            gradesFocus.restore();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          lines={classDeletionLines(state.file, deleting.id)}
          keepLabel="Keep the class"
          confirm={{
            label: 'Delete class',
            onConfirm: () => {
              commit(deleteClass(state, deleting.id));
              close();
            },
          }}
          onCancel={close}
        />
      )}
    </>
  );
}
