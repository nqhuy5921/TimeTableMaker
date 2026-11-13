import { useId, useState } from 'react';
import {
  addCondition,
  AFTERNOON,
  blocksWhen,
  changeConditionType,
  CONDITION_HINTS,
  CONDITION_LABELS,
  type ConditionField,
  conditionFieldProblems,
  conditionSentence,
  type ConditionValues,
  defaultConditionValues,
  editCondition,
  MORNING,
} from '../../domain/conditions';
import {
  CONDITION_TYPES,
  DAYS,
  type BlockIndex,
  type ConditionType,
  type Day,
  type Id,
  type TimetableFile,
} from '../../domain/model';
import { teacherSubjects } from '../../domain/teachers';
import { Segmented } from './Segmented';
import { SelectInput } from './SelectInput';
import { useModalDialog } from './useModalDialog';

interface ConditionDialogProps {
  file: TimetableFile;
  teacherId: Id;
  /** The condition to edit, or null to add one. */
  conditionId: Id | null;
  /** Commits the changed timetable and closes the form. */
  onDone: (file: TimetableFile) => void;
  onCancel: () => void;
}

type When = ReturnType<typeof blocksWhen>;
const WHEN_OPTIONS = [
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['chosen', 'Chosen blocks'],
] as const;
const PER_OPTIONS = [
  ['day', 'a day'],
  ['week', 'a week'],
] as const;
const BLOCKS: readonly BlockIndex[] = [0, 1, 2, 3, 4];
const BLOCK_LABELS = ['1-2', '3-4', '5-6', '7-8', '9-10'];
const DAY_CHIPS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** The words either side of a counted type's number: "At most [6] periods on any day". */
const NUMBER_WORDS: Partial<Record<ConditionType, string>> = {
  maxPeriodsPerDay: 'periods on any day',
  maxPeriodsPerWeek: 'periods a week',
  maxBlocksInRow: 'blocks in a row',
  maxGapsPerDay: 'free blocks between lessons',
  maxTeachingDays: 'teaching days a week',
};
const NUMBER_HELP: Partial<Record<ConditionType, string>> = {
  maxBlocksInRow: 'Lunch ends a run.',
  maxGapsPerDay: "Lunch doesn't count as a free block.",
};
const PREVIEW_HINTS: Record<ConditionField, string> = {
  subject: 'Pick a subject to see the sentence.',
  max: 'Enter an allowed number to see the sentence.',
  blocks: 'Pick the blocks to see the sentence.',
  days: 'Pick the days to see the sentence.',
};

/** Turns one value in or out of a sorted list. */
function toggle<T extends number>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value].sort((a, b) => a - b);
}

// The condition form (TC-1, layout spec "Condition form"): pick a type from the dropdown,
// then fill in only its values, with the sentence the list will show as a preview. Mount it
// to open it and unmount it to close it.
export function ConditionDialog({
  file,
  teacherId,
  conditionId,
  onDone,
  onCancel,
}: ConditionDialogProps) {
  const modal = useModalDialog(onCancel);
  const id = useId();
  const teacher = file.teachers.find((t) => t.id === teacherId);
  const editing =
    conditionId === null ? undefined : teacher?.conditions.find((c) => c.id === conditionId);
  const [values, setValues] = useState<ConditionValues>(
    () => editing ?? defaultConditionValues('subjectLimit'),
  );
  // The number as typed, so an empty or half-typed field isn't replaced while typing.
  const [number, setNumber] = useState(() => ('max' in values ? String(values.max) : ''));
  // A number the user typed, or the edited condition's, is kept when the type changes;
  // otherwise the new type starts at its own default.
  const [numberChosen, setNumberChosen] = useState(() => editing !== undefined);
  // Unavailable times: which of When's options is chosen, and the blocks picked under Chosen
  // blocks, kept while Morning or Afternoon is tried so going back brings them back.
  const [when, setWhen] = useState<When>(() =>
    values.type === 'unavailable' ? blocksWhen(values.blocks) : 'morning',
  );
  const [chosenBlocks, setChosenBlocks] = useState<BlockIndex[] | null>(() =>
    values.type === 'unavailable' && blocksWhen(values.blocks) === 'chosen' ? values.blocks : null,
  );
  // A refusal that isn't about one field, such as the condition having gone meanwhile.
  const [formError, setFormError] = useState<string | null>(null);
  // A field's message shows once it's been changed, or after Add or Save was pressed.
  const [touched, setTouched] = useState<ReadonlySet<ConditionField>>(new Set());
  const [tried, setTried] = useState(false);

  const current: ConditionValues =
    'max' in values ? { ...values, max: parseNumber(number) } : values;
  const problems = conditionFieldProblems(file, current);
  const shown = (field: ConditionField) =>
    tried || touched.has(field) ? problems.find((p) => p.field === field) : undefined;
  const touch = (field: ConditionField) => setTouched((set) => new Set(set).add(field));

  function changeType(type: ConditionType) {
    const keep = numberChosen && 'max' in current;
    const next = keep ? changeConditionType(current, type) : defaultConditionValues(type);
    setValues(next);
    if ('max' in next) setNumber(keep ? number : String(next.max));
    if (next.type === 'unavailable') setWhen(blocksWhen(next.blocks));
    setTouched(new Set());
    setTried(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (problems.length > 0) {
      // Focus goes to the first field with a message, so it's read out.
      requestAnimationFrame(() => {
        const wrong = modal.ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        (wrong?.matches('input, select') ? wrong : wrong?.querySelector('button'))?.focus();
      });
      return;
    }
    const result = editing
      ? editCondition(file, teacherId, editing.id, current)
      : addCondition(file, teacherId, current);
    if (result.ok) onDone(result.file);
    else setFormError(result.error);
  }

  const errorId = (field: ConditionField) => `${id}-${field}-error`;
  const fieldError = (field: ConditionField) => {
    const problem = shown(field);
    return problem ? (
      <p id={errorId(field)} className="field-error" role="alert">
        {problem.error}
      </p>
    ) : null;
  };
  const invalid = (field: ConditionField) => ({
    'aria-invalid': shown(field) !== undefined,
    'aria-describedby': shown(field) ? errorId(field) : undefined,
  });

  function chips<T extends number>(
    field: 'blocks' | 'days',
    label: string,
    all: readonly T[],
    names: readonly string[],
    picked: readonly T[],
    onChange: (next: T[]) => void,
  ) {
    return (
      <div className="toggle-chips" role="group" aria-label={label} {...invalid(field)}>
        {all.map((value, i) => (
          <button
            key={value}
            type="button"
            className="toggle-chip"
            aria-pressed={picked.includes(value)}
            onClick={() => {
              onChange(toggle(picked, value));
              touch(field);
            }}
          >
            {names[i]}
          </button>
        ))}
      </div>
    );
  }

  function numberInput(label: string) {
    return (
      <input
        className="text-input number-input tnum"
        type="number"
        inputMode="numeric"
        step={1}
        aria-label={label}
        value={number}
        {...invalid('max')}
        onChange={(event) => {
          setNumber(event.target.value);
          setNumberChosen(true);
          touch('max');
        }}
      />
    );
  }

  function typeFields() {
    switch (values.type) {
      case 'subjectLimit': {
        const limit = values;
        // Only the subjects the teacher has cards for (asked for on 2026-10-23), plus the
        // edited condition's own subject, so editing never loses it.
        const subjects = teacherSubjects(
          file,
          teacherId,
          editing?.type === 'subjectLimit' ? editing.subjectId : null,
        );
        return (
          <>
            <div className="field">
              <label htmlFor={`${id}-subject`}>Subject</label>
              <SelectInput
                id={`${id}-subject`}
                value={limit.subjectId}
                {...invalid('subject')}
                // The note saying why the list is empty is read with the field too.
                aria-describedby={
                  [
                    subjects.length === 0 && `${id}-no-subjects`,
                    invalid('subject')['aria-describedby'],
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onChange={(event) => {
                  setValues({ ...limit, subjectId: event.target.value });
                  touch('subject');
                }}
              >
                <option value="" disabled>
                  Choose a subject
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
              {subjects.length === 0 && (
                <p id={`${id}-no-subjects`} className="caption condition-hint">
                  {teacher?.shortName} has no cards yet, so there's no subject to pick. Add a card
                  with them first.
                </p>
              )}
              {fieldError('subject')}
            </div>
            <div className="field">
              <div className="condition-number">
                <span>At most</span>
                {numberInput('Most periods')}
                <span>periods</span>
                <Segmented
                  label="Per"
                  options={PER_OPTIONS}
                  value={limit.per}
                  onChange={(per) => setValues({ ...limit, per })}
                />
              </div>
              {fieldError('max')}
            </div>
          </>
        );
      }
      case 'unavailable': {
        const times = values;
        return (
          <>
            <div className="field">
              <span className="field-label">When</span>
              <Segmented
                label="When"
                options={WHEN_OPTIONS}
                value={when}
                onChange={(next) => {
                  setWhen(next);
                  if (next === 'morning') setValues({ ...times, blocks: [...MORNING] });
                  if (next === 'afternoon') setValues({ ...times, blocks: [...AFTERNOON] });
                  // Chosen blocks brings back the earlier picks, or starts from the
                  // morning or afternoon blocks.
                  if (next === 'chosen' && chosenBlocks)
                    setValues({ ...times, blocks: chosenBlocks });
                }}
              />
              {when === 'chosen' &&
                chips('blocks', 'Blocks', BLOCKS, BLOCK_LABELS, times.blocks, (blocks) => {
                  setValues({ ...times, blocks });
                  setChosenBlocks(blocks);
                })}
              {when === 'chosen' && fieldError('blocks')}
            </div>
            <div className="field">
              <span className="field-label">Days</span>
              {chips('days', 'Days', DAYS, DAY_CHIPS, times.days, (days: Day[]) =>
                setValues({ ...times, days }),
              )}
              {fieldError('days') ?? <p className="caption">All five means every day.</p>}
            </div>
          </>
        );
      }
      case 'daysOff': {
        const off = values;
        return (
          <div className="field">
            <span className="field-label">Days</span>
            {chips('days', 'Days', DAYS, DAY_CHIPS, off.days, (days: Day[]) =>
              setValues({ ...off, days }),
            )}
            {fieldError('days')}
          </div>
        );
      }
      default: {
        const help = NUMBER_HELP[values.type];
        return (
          <div className="field">
            <div className="condition-number">
              <span>At most</span>
              {numberInput(CONDITION_LABELS[values.type])}
              <span>{NUMBER_WORDS[values.type]}</span>
            </div>
            {fieldError('max') ?? (help && <p className="caption">{help}</p>)}
          </div>
        );
      }
    }
  }

  const firstProblem = problems[0];
  const name = teacher?.shortName ?? '';

  return (
    <dialog {...modal} className="dialog condition-dialog" aria-labelledby={`${id}-title`}>
      <form onSubmit={handleSubmit} noValidate>
        <h2 id={`${id}-title`}>
          {editing ? `Edit condition · ${name}` : `Add condition · ${name}`}
        </h2>
        <div className="field">
          <label htmlFor={`${id}-type`}>Condition</label>
          <SelectInput
            id={`${id}-type`}
            autoFocus
            value={values.type}
            aria-describedby={`${id}-hint`}
            onChange={(event) => changeType(event.target.value as ConditionType)}
          >
            {CONDITION_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONDITION_LABELS[type]}
              </option>
            ))}
          </SelectInput>
          <p id={`${id}-hint`} className="caption condition-hint">
            {CONDITION_HINTS[values.type]}
          </p>
        </div>
        <div className="condition-fields">{typeFields()}</div>
        <div className="condition-preview" aria-live="polite">
          <span className="caption">Preview</span>
          {firstProblem ? (
            <span className="condition-preview-hint">{PREVIEW_HINTS[firstProblem.field]}</span>
          ) : (
            <span>{conditionSentence(file, current)}</span>
          )}
        </div>
        {formError && (
          <p className="field-error" role="alert">
            {formError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {editing ? 'Save' : 'Add condition'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** The number field as a number: NaN unless it's plain digits (with a minus sign), so the
    check names the range for "", "2.5", or "1e1" alike. */
function parseNumber(text: string): number {
  return /^\s*-?\d+\s*$/.test(text) ? Number(text) : NaN;
}
