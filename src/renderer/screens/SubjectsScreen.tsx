import { useRef, useState } from 'react';
import type { Id, Subject } from '../../domain/model';
import { subjectColors } from '../../domain/subjectColor';
import { deleteSubject, subjectDeletionLines, subjectRows } from '../../domain/subjects';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ListPage, RowActions } from '../components/ListPage';
import { SubjectDialog } from '../components/SubjectDialog';
import { subjectColorProps } from '../components/subjectColors';
import { useReturnFocus } from '../components/useReturnFocus';
import { useAppStore } from '../state/appStore';

// The Subjects page (DM-4, layout spec "List pages for classes, rooms, and subjects"):
// every subject in subject order, as a tag in its colors, with how many cards use it, a
// search, and Add subject. Edit opens the subject form; Delete asks first, naming the
// teachers' subject limits that go with the subject (SYSTEM_DESIGN §10.5).
export function SubjectsScreen() {
  const { state, commit } = useAppStore();
  // The page's own search, empty again on each visit, as on the Teachers page.
  const [query, setQuery] = useState('');
  // The subject form (adding when subjectId is null) or the delete question.
  const [form, setForm] = useState<{ subjectId: Id | null } | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // Focus goes back to the button that opened the form or question, or to Add subject when
  // its row is gone.
  const { remember, restore } = useReturnFocus(addRef);
  const rows = subjectRows(state.file, query);

  function close() {
    setForm(null);
    setDeleting(null);
    restore();
  }

  return (
    <>
      <ListPage
        title="Subjects"
        noun={{ one: 'subject', many: 'subjects' }}
        total={state.file.subjects.length}
        matches={rows.length}
        search={{ query, onQueryChange: setQuery }}
        addRef={addRef}
        onAdd={() => {
          remember();
          setForm({ subjectId: null });
        }}
      >
        <table className="list-table subjects-table" aria-label="Subjects">
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col" className="list-table-number">
                Cards
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ subject, cards }) => (
              <tr key={subject.id}>
                <th scope="row">
                  <span {...subjectColorProps(subjectColors(subject), 'subject-tag')}>
                    {subject.name}
                  </span>
                </th>
                <td className="list-table-number">{cards}</td>
                <RowActions
                  name={subject.name}
                  onEdit={() => {
                    remember();
                    setForm({ subjectId: subject.id });
                  }}
                  onDelete={() => {
                    remember();
                    setDeleting(subject);
                  }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </ListPage>
      {form && (
        <SubjectDialog
          file={state.file}
          subjectId={form.subjectId}
          onDone={(file) => {
            commit({ ...state, file });
            close();
          }}
          onCancel={close}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          lines={subjectDeletionLines(state.file, deleting.id)}
          keepLabel="Keep the subject"
          confirm={{
            label: 'Delete subject',
            onConfirm: () => {
              commit({ ...state, file: deleteSubject(state.file, deleting.id) });
              close();
            },
          }}
          onCancel={close}
        />
      )}
    </>
  );
}
