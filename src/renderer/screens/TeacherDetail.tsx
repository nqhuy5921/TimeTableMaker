import { useEffect, useRef, useState } from 'react';
import { conditionSentence, deleteCondition, setConditionOn } from '../../domain/conditions';
import { issuesByCondition } from '../../domain/issues';
import type { Id, TimetableFile } from '../../domain/model';
import {
  deleteTeacher,
  HOME_SCHOOL_LABELS,
  teacherCards,
  teacherClasses,
  teacherDeletionLines,
  teacherPeriods,
} from '../../domain/teachers';
import { ConditionDialog } from '../components/ConditionDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowLeftIcon, PlusIcon } from '../components/Icons';
import { TeacherDialog } from '../components/TeacherDialog';
import { subjectColorProps } from '../components/subjectColors';
import { useAppStore } from '../state/appStore';

// One teacher's detail screen (DM-1, TC-1; layout spec "Teacher detail screen"): their
// details with Edit and Delete, what they teach, and their conditions, each with its on/off
// switch, Edit, and Delete.
export function TeacherDetail({ teacherId, onBack }: { teacherId: Id; onBack: () => void }) {
  const { state, commit, issues } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The condition form: null to add one, or the id of the condition to edit.
  const [conditionForm, setConditionForm] = useState<{ conditionId: Id | null } | null>(null);
  const [deletingCondition, setDeletingCondition] = useState<Id | null>(null);
  // Where focus goes back to when a condition's form or delete question closes.
  const returnFocus = useRef<HTMLElement | null>(null);
  const addConditionRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const { file } = state;
  const teacher = file.teachers.find((t) => t.id === teacherId);

  // Back on the page, focus starts at the way back to the list.
  useEffect(() => backRef.current?.focus(), []);

  /** Closes a condition dialog and puts focus back where it was opened from. */
  function closeCondition(close: (value: null) => void) {
    close(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }

  if (!teacher) return null;
  const details = [
    teacher.fullName,
    teacher.email,
    teacher.phone,
    teacher.school && HOME_SCHOOL_LABELS[teacher.school],
  ].filter(Boolean);
  const cards = teacherCards(file, teacher.id);
  const classes = teacherClasses(file, teacher.id);
  // Where each condition is broken on the grid right now (TC-3, SYSTEM_DESIGN §9.3).
  const broken = issuesByCondition(issues);

  return (
    <div className="teacher-screen">
      <button
        ref={backRef}
        type="button"
        className="btn teacher-back"
        aria-label="Back to teachers"
        onClick={onBack}
      >
        <ArrowLeftIcon size={14} />
        Teachers
      </button>
      <div className="teacher-head">
        <div>
          <h1>{teacher.shortName}</h1>
          <p className="caption teacher-details">
            {details.length > 0 ? details.join(' · ') : 'No details yet'}
          </p>
        </div>
        <button ref={editRef} type="button" className="btn" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          ref={deleteRef}
          type="button"
          className="btn btn-danger-quiet"
          onClick={() => setDeleting(true)}
        >
          Delete
        </button>
      </div>
      <div className="teacher-columns">
        <section className="teacher-panel teacher-teaching" aria-label="Teaching">
          <dl className="teacher-facts">
            <div>
              <dt>Periods this week</dt>
              <dd className="tnum">{teacherPeriods(file, teacher.id)}</dd>
            </div>
            <div>
              <dt>Classes</dt>
              <dd className={classes.length > 0 ? 'tnum' : 'teacher-none'}>
                {classes.length > 0 ? classes.join(', ') : 'None yet'}
              </dd>
            </div>
          </dl>
          <h2 className="teacher-subhead">Cards</h2>
          {cards.length === 0 ? (
            <p className="caption teacher-none">No cards with this teacher yet.</p>
          ) : (
            <ul className="teacher-cards">
              {cards.map((card) => (
                <li key={card.id}>
                  <span {...subjectColorProps(card.colors, 'subject-tag')}>{card.subject}</span>
                  <span>{card.room ?? 'No room'}</span>
                  <span className="teacher-none tnum">
                    {card.classes.length > 0 ? card.classes.join(', ') : 'Not placed'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="teacher-panel teacher-conditions" aria-labelledby="conditions-heading">
          <div className="teacher-panel-head">
            <h2 id="conditions-heading">Conditions</h2>
            <span className="caption tnum teacher-none">{teacher.conditions.length}</span>
            <button
              ref={addConditionRef}
              type="button"
              className="btn btn-primary btn-with-icon"
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                setConditionForm({ conditionId: null });
              }}
            >
              <PlusIcon size={14} />
              Add condition
            </button>
          </div>
          {teacher.conditions.length === 0 ? (
            <div className="empty-state teacher-conditions-empty">
              <p>No conditions yet</p>
              <p className="caption">
                Add one, and the timetable is checked against it after every change.
              </p>
            </div>
          ) : (
            <ul className="condition-list">
              {teacher.conditions.map((condition) => {
                const sentence = conditionSentence(file, condition);
                const notMet = broken.get(condition.id) ?? 0;
                return (
                  <li
                    key={condition.id}
                    className={condition.on ? 'condition-row' : 'condition-row is-off'}
                  >
                    <button
                      type="button"
                      role="switch"
                      className="switch"
                      aria-checked={condition.on}
                      aria-label={sentence}
                      title={condition.on ? 'On: click to turn off' : 'Off: click to turn on'}
                      onClick={() =>
                        commit({
                          ...state,
                          file: setConditionOn(file, teacher.id, condition.id, !condition.on),
                        })
                      }
                    />
                    <span className="condition-sentence">
                      {sentence}
                      {!condition.on && <span className="condition-off"> · Off</span>}
                    </span>
                    {notMet > 0 && (
                      <span className="condition-not-met tnum">
                        Not met in {notMet === 1 ? '1 place' : `${notMet} places`}
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Edit “${sentence}”`}
                      onClick={(event) => {
                        returnFocus.current = event.currentTarget;
                        setConditionForm({ conditionId: condition.id });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Delete “${sentence}”`}
                      onClick={(event) => {
                        returnFocus.current = event.currentTarget;
                        setDeletingCondition(condition.id);
                      }}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {editing && (
        <TeacherDialog
          file={file}
          teacherId={teacher.id}
          onDone={(next) => {
            commit({ ...state, file: next });
            setEditing(false);
            requestAnimationFrame(() => editRef.current?.focus());
          }}
          onCancel={() => {
            setEditing(false);
            requestAnimationFrame(() => editRef.current?.focus());
          }}
        />
      )}
      {conditionForm && (
        <ConditionDialog
          file={file}
          teacherId={teacher.id}
          conditionId={conditionForm.conditionId}
          onDone={(next) => {
            commit({ ...state, file: next });
            closeCondition(setConditionForm);
          }}
          onCancel={() => closeCondition(setConditionForm)}
        />
      )}
      {deletingCondition !== null && (
        <ConfirmDialog
          title={`Delete “${conditionSentenceById(file, teacher.id, deletingCondition)}”?`}
          lines={["This can't be undone. To stop checking it for a while, switch it off instead."]}
          keepLabel="Keep it"
          confirm={{
            label: 'Delete condition',
            onConfirm: () => {
              commit({ ...state, file: deleteCondition(file, teacher.id, deletingCondition) });
              // The row and its Delete button are gone, so focus goes to Add condition.
              returnFocus.current = addConditionRef.current;
              closeCondition(setDeletingCondition);
            },
          }}
          onCancel={() => closeCondition(setDeletingCondition)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${teacher.shortName}?`}
          lines={teacherDeletionLines(file, teacher.id)}
          keepLabel="Keep the teacher"
          confirm={{
            label: 'Delete teacher',
            onConfirm: () => {
              commit({ ...state, file: deleteTeacher(file, teacher.id) });
              onBack();
            },
          }}
          onCancel={() => {
            setDeleting(false);
            requestAnimationFrame(() => deleteRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}

function conditionSentenceById(file: TimetableFile, teacherId: Id, conditionId: Id): string {
  const condition = file.teachers
    .find((t) => t.id === teacherId)
    ?.conditions.find((c) => c.id === conditionId);
  return condition ? conditionSentence(file, condition) : '';
}
