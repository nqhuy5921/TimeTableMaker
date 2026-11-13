import { useEffect, useRef, useState } from 'react';
import { errorsByTeacher } from '../../domain/issues';
import type { Id } from '../../domain/model';
import { HOME_SCHOOL_LABELS, teacherRows } from '../../domain/teachers';
import { ErrorPill } from '../components/ErrorPill';
import { ChevronRightIcon } from '../components/Icons';
import { ListPage } from '../components/ListPage';
import { TeacherDialog } from '../components/TeacherDialog';
import { useAppStore } from '../state/appStore';
import { TeacherDetail } from './TeacherDetail';

// The Teachers page (DM-1, layout spec "Teachers page"): every teacher in one table, with a
// search and Add teacher. A row opens the teacher's detail screen. Which teacher is open is
// page state, so leaving the page and coming back opens the list.
export function TeachersScreen() {
  const { state, commit, issues } = useAppStore();
  const [openId, setOpenId] = useState<Id | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  // The teacher whose detail screen was just left, so focus goes back to their row (or to
  // Add teacher when they were deleted), as the Cards page does after its form.
  const returnTo = useRef<Id | null>(null);
  const { teachers } = state.file;

  useEffect(() => {
    const id = returnTo.current;
    if (openId !== null || id === null) return;
    returnTo.current = null;
    const row = document.querySelector<HTMLElement>(`[data-teacher-id="${CSS.escape(id)}"]`);
    (row ?? addRef.current)?.focus();
  }, [openId]);

  const open = openId === null ? undefined : teachers.find((t) => t.id === openId);
  if (open) {
    return (
      <TeacherDetail
        teacherId={open.id}
        onBack={() => {
          returnTo.current = open.id;
          setOpenId(null);
        }}
      />
    );
  }

  const rows = teacherRows(state.file, query);

  // Each teacher's current errors (TC-3); empty at 0.
  const errors = errorsByTeacher(issues);

  return (
    <>
      <ListPage
        title="Teachers"
        noun={{ one: 'teacher', many: 'teachers' }}
        total={teachers.length}
        matches={rows.length}
        search={{ query, onQueryChange: setQuery }}
        addRef={addRef}
        onAdd={() => setAdding(true)}
      >
        <table className="list-table teachers-table" aria-label="Teachers">
          <thead>
            <tr>
              <th scope="col">Short name</th>
              <th scope="col">Full name</th>
              <th scope="col">Email</th>
              <th scope="col">School</th>
              <th scope="col" className="list-table-number">
                Cards
              </th>
              <th scope="col" className="list-table-number">
                Periods
              </th>
              <th scope="col" className="list-table-number">
                Conditions
              </th>
              <th scope="col" className="list-table-number">
                Errors
              </th>
              <th scope="col">
                <span className="visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ teacher, cards, periods, conditions, conditionsOff }) => (
              // The whole row opens the teacher; the short name is its button for the keyboard.
              <tr
                key={teacher.id}
                className="teachers-table-row"
                onClick={() => setOpenId(teacher.id)}
              >
                <th scope="row">
                  <button
                    type="button"
                    className="teachers-table-open"
                    data-teacher-id={teacher.id}
                    aria-label={`Open ${teacher.shortName}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenId(teacher.id);
                    }}
                  >
                    {teacher.shortName}
                  </button>
                </th>
                <td
                  className={teacher.fullName ? undefined : 'list-table-none'}
                  title={teacher.fullName}
                >
                  {teacher.fullName ?? '—'}
                </td>
                <td className={teacher.email ? undefined : 'list-table-none'} title={teacher.email}>
                  {teacher.email ?? '—'}
                </td>
                <td className={teacher.school ? undefined : 'list-table-none'}>
                  {teacher.school ? HOME_SCHOOL_LABELS[teacher.school] : '—'}
                </td>
                <td className="list-table-number">{cards}</td>
                <td className="list-table-number">{periods}</td>
                <td className="list-table-number">
                  {conditions}
                  {conditionsOff > 0 && (
                    <span className="list-table-none"> · {conditionsOff} off</span>
                  )}
                </td>
                <td className="list-table-number">
                  <ErrorPill count={errors.get(teacher.id) ?? 0} />
                </td>
                <td className="teachers-table-chevron" aria-hidden="true">
                  <ChevronRightIcon size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListPage>
      {adding && (
        <TeacherDialog
          file={state.file}
          teacherId={null}
          onDone={(file, teacherId) => {
            commit({ ...state, file });
            setAdding(false);
            // A new teacher opens on their detail screen, ready for conditions.
            setOpenId(teacherId);
          }}
          onCancel={() => {
            setAdding(false);
            requestAnimationFrame(() => addRef.current?.focus());
          }}
        />
      )}
    </>
  );
}
