import { useId, useState } from 'react';
import { HOME_SCHOOLS, type HomeSchool, type Id, type TimetableFile } from '../../domain/model';
import {
  addTeacher,
  editTeacher,
  HOME_SCHOOL_LABELS,
  type TeacherField,
  type TeacherResult,
} from '../../domain/teachers';
import { SelectInput } from './SelectInput';
import { useModalDialog } from './useModalDialog';

interface TeacherDialogProps {
  file: TimetableFile;
  /** The teacher to edit, or null to add one. */
  teacherId: Id | null;
  /** Commits the changed timetable and closes the form. */
  onDone: (file: TimetableFile, teacherId: Id) => void;
  onCancel: () => void;
}

const SCHOOLS: readonly (readonly [HomeSchool | '', string])[] = [
  ['', 'Not set'],
  ...HOME_SCHOOLS.map((school) => [school, HOME_SCHOOL_LABELS[school]] as const),
];

// The teacher form (DM-1, layout spec "Teacher form"): short name, full name, email, phone,
// and home school. Mount it to open it and unmount it to close it.
export function TeacherDialog({ file, teacherId, onDone, onCancel }: TeacherDialogProps) {
  const modal = useModalDialog(onCancel);
  const id = useId();
  const editing = teacherId === null ? undefined : file.teachers.find((t) => t.id === teacherId);
  const [shortName, setShortName] = useState(editing?.shortName ?? '');
  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [school, setSchool] = useState<HomeSchool | ''>(editing?.school ?? '');
  // The attempt number remounts the message, so a repeated error is announced again.
  const [error, setError] = useState<{
    message: string;
    field: TeacherField;
    attempt: number;
  } | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const fields = { shortName, fullName, email, phone, school: school || null };
    const result: TeacherResult = editing
      ? editTeacher(file, editing.id, fields)
      : addTeacher(file, fields);
    if (!result.ok) {
      setError({ message: result.error, field: result.field, attempt: (error?.attempt ?? 0) + 1 });
      return;
    }
    onDone(result.file, result.teacherId);
  }

  const fieldError = (field: TeacherField) =>
    error?.field === field ? (
      <p key={error.attempt} id={`${id}-error`} className="field-error" role="alert">
        {error.message}
      </p>
    ) : null;
  const errorProps = (field: TeacherField) => ({
    'aria-invalid': error?.field === field,
    'aria-describedby': error?.field === field ? `${id}-error` : undefined,
  });

  return (
    <dialog {...modal} className="dialog dialog-wide" aria-labelledby={`${id}-title`}>
      <form onSubmit={handleSubmit} noValidate>
        <h2 id={`${id}-title`}>{editing ? `Edit ${editing.shortName}` : 'Add teacher'}</h2>
        <div className="field">
          <label htmlFor={`${id}-short`}>Short name</label>
          <input
            id={`${id}-short`}
            className="text-input"
            autoFocus
            autoComplete="off"
            value={shortName}
            {...errorProps('shortName')}
            onChange={(event) => {
              setShortName(event.target.value);
              if (error?.field === 'shortName') setError(null);
            }}
          />
          {fieldError('shortName')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-full`}>Full name</label>
          <input
            id={`${id}-full`}
            className="text-input"
            autoComplete="off"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input
            id={`${id}-email`}
            className="text-input"
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            {...errorProps('email')}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error?.field === 'email') setError(null);
            }}
          />
          {fieldError('email')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-phone`}>Phone</label>
          <input
            id={`${id}-phone`}
            className="text-input"
            type="tel"
            autoComplete="off"
            spellCheck={false}
            value={phone}
            {...errorProps('phone')}
            onChange={(event) => {
              setPhone(event.target.value);
              if (error?.field === 'phone') setError(null);
            }}
          />
          {fieldError('phone')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-school`}>Home school</label>
          <SelectInput
            id={`${id}-school`}
            value={school}
            onChange={(event) => setSchool(event.target.value as HomeSchool | '')}
          >
            {SCHOOLS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {editing ? 'Save' : 'Add teacher'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
