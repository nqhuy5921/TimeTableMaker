import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { replaceTimetable } from '../../domain/appState';
import {
  bellTimesNote,
  importFoundRows,
  importNoticeText,
  importQuestion,
  importsSomething,
  importTimetable,
  problemPlace,
  shownProblems,
  type ImportResult,
} from '../../domain/importTimetable';
import {
  chooseColumn,
  chooseHeaderRow,
  chooseListSheet,
  columnOptions,
  FIELD_LABELS,
  findSheet,
  firstValues,
  importProfileName,
  LIST_FIELDS,
  requiredColumnMessage,
  sameChoices,
  sheetOptions,
  suggestImport,
  timetableFound,
  type ImportChoices,
  type ListChoice,
  type ListKind,
  type TeacherSource,
  type WorkbookData,
} from '../../domain/importWorkbook';
import { checkProfileName } from '../../domain/profiles';
import type { TimetableFile } from '../../domain/model';
import { createEmptyTimetable } from '../../domain/timetableFile';
import { plural } from '../../domain/text';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowLeftIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { SelectInput } from '../components/SelectInput';
import { useMounted } from '../components/useMounted';
import { ipcErrorMessage } from '../ipcError';
import { useAppStore } from '../state/appStore';
import { useExporting } from '../state/exporting';
import { LEFT_BEFORE_IMPORT, useImportIntoNew, useProfiles, useSaveFirst } from '../state/profiles';

type Into = 'new' | 'open';

/** Test's answer, with the choices, destination, and timetable it was for. Import uses it
    as it is while they're the same. */
interface Tested {
  result: ImportResult;
  choices: ImportChoices;
  into: Into;
  base: TimetableFile;
}

/** Why the last Import didn't go ahead, with what it was asked for, so it's shown only
    until one of them changes. */
interface Refusal {
  message: string;
  choices: ImportChoices;
  into: Into;
  name: string;
}

const LIST_SECTIONS: readonly { kind: ListKind; title: string; about: string }[] = [
  {
    kind: 'teachers',
    title: 'Teachers',
    about:
      'Short names, full names, emails, phones, and home schools. Only teachers who are used come in.',
  },
  { kind: 'classes', title: 'Classes', about: "Each class's homeroom teacher and assistant." },
  {
    kind: 'assignments',
    title: 'Teaching assignments',
    about: "Each class's teacher for each subject, read from the columns named after subjects.",
  },
];

// The Import screen (IE-1, SYSTEM_DESIGN §12.6, layout spec "Import screen"): the app's
// suggestions for a workbook, each of which can be changed, on the left, and on the right
// what Test found with these choices. Test changes nothing, and any change to a choice asks
// for Test again before Import. Import into a new profile makes it and opens it; into the
// open profile it asks first, keeps a copy of the timetable, then puts the import in its
// place (§12.6).
export function ImportScreen({
  workbook,
  onChooseAnother,
  onBack,
  onImported,
}: {
  workbook: WorkbookData;
  onChooseAnother: (workbook: WorkbookData) => void;
  onBack: () => void;
  /** The import is in the open profile, so the timetable screen can show it. */
  onImported: () => void;
}) {
  const { state, commit } = useAppStore();
  const { names, openName } = useProfiles();
  const { chooseWorkbook, choosing, runExample, showImported, showNotImported } = useExporting();
  const { importIntoNew, importing: importingNew } = useImportIntoNew();
  const saveFirst = useSaveFirst();
  const [choices, setChoices] = useState<ImportChoices>(() => suggestImport(workbook));
  const [into, setInto] = useState<Into>('new');
  const [name, setName] = useState(() => importProfileName(workbook.fileName));
  const [tested, setTested] = useState<Tested | null>(null);
  // Into the open profile: the result the question is about, while it's asked.
  const [asking, setAsking] = useState<ImportResult | null>(null);
  const [importingOpen, setImportingOpen] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const mounted = useMounted();
  const nameId = useId();

  useEffect(() => backRef.current?.focus(), []);

  function test() {
    const base = into === 'open' ? state.file : createEmptyTimetable();
    setTested({ result: importTimetable(workbook, choices, base), choices, into, base });
  }

  /** Says why Import didn't go ahead: here, or in a notice once the screen has gone. */
  function refuse(message: string) {
    if (mounted.current) setRefusal({ message, choices, into, name });
    else showNotImported(message);
  }

  async function runImport() {
    if (!canImport || importingNew || importingOpen) return;
    setRefusal(null);
    if (into === 'open') {
      setAsking(tested.result);
      return;
    }
    const outcome = await importIntoNew(name, tested.result, () => mounted.current);
    if (outcome?.status === 'refused') refuse(outcome.reason);
    if (outcome?.status === 'notOpened') showImported(outcome.notice);
  }

  // Leaving the screen while this saves or keeps the copy stops the import before it's in,
  // so nothing changed meanwhile is lost.
  async function importIntoOpen(result: ImportResult) {
    setAsking(null);
    setImportingOpen(true);
    try {
      const saveRefusal = await saveFirst(
        'nothing is imported yet. Import tries saving them again.',
      );
      if (saveRefusal !== null) return refuse(saveRefusal);
      if (!mounted.current) return refuse(LEFT_BEFORE_IMPORT);
      try {
        await window.api.keepBeforeImport();
      } catch (error) {
        return refuse(
          `A copy of the timetable couldn't be kept, so nothing is imported. ${ipcErrorMessage(error)}`,
        );
      }
      if (!mounted.current) return refuse(LEFT_BEFORE_IMPORT);
      commit(replaceTimetable(state, result.file));
      showImported(importNoticeText(result.summary, openName));
      onImported();
    } finally {
      if (mounted.current) setImportingOpen(false);
    }
  }

  async function chooseAnother() {
    const next = await chooseWorkbook();
    // Left with ← Profiles or the header menu while it was read: the file isn't wanted.
    if (next && mounted.current) onChooseAnother(next);
  }

  const nameCheck = checkProfileName(names.profiles, name);
  const nameError = into === 'new' && !nameCheck.ok ? nameCheck.error : null;
  // A choice changed since Test, so its results are for other choices. Changing one back
  // counts as tested again.
  // Into the open profile, Test is for the timetable as it was then.
  const stale =
    tested !== null &&
    (tested.into !== into ||
      !sameChoices(tested.choices, choices) ||
      (into === 'open' && tested.base !== state.file));
  const empty = tested !== null && !importsSomething(tested.result.summary);
  const canImport = tested !== null && !stale && !empty && nameError === null;
  const shownRefusal =
    refusal !== null &&
    refusal.into === into &&
    refusal.name === name &&
    sameChoices(refusal.choices, choices)
      ? refusal.message
      : null;

  return (
    <div className="list-screen">
      <button ref={backRef} type="button" className="btn teacher-back" onClick={onBack}>
        <ArrowLeftIcon size={14} />
        Profiles
      </button>
      <div className="list-screen-head">
        <h1>Import</h1>
        <span className="caption tnum import-file" title={workbook.fileName}>
          {workbook.fileName} · {plural(workbook.sheets.length, 'sheet', 'sheets')}
        </span>
        {/* Not disabled while reading, so focus stays on it; a second click is ignored. */}
        <button type="button" className="btn" onClick={() => void chooseAnother()}>
          {choosing ? 'Reading…' : 'Choose another file'}
        </button>
        <button type="button" className="btn" onClick={() => void runExample()}>
          Download example
        </button>
      </div>
      <div className="import-body">
        <div className="import-panel import-choices">
          <section className="import-section" aria-label="Import into">
            <div className="import-row">
              <span className="field-label">Import into</span>
              <Segmented
                label="Import into"
                options={[
                  ['new', 'A new profile'],
                  ['open', `${openName} (open now)`],
                ]}
                value={into}
                onChange={setInto}
              />
              {into === 'new' && (
                <>
                  <label className="field-label" htmlFor={nameId}>
                    Name
                  </label>
                  <input
                    id={nameId}
                    className="text-input import-name"
                    value={name}
                    aria-invalid={nameError !== null}
                    aria-describedby={nameError === null ? undefined : `${nameId}-error`}
                    onChange={(event) => setName(event.target.value)}
                  />
                </>
              )}
            </div>
            {nameError !== null && (
              <p id={`${nameId}-error`} className="field-error import-name-error" role="alert">
                {nameError}
              </p>
            )}
          </section>
          <TimetableSection workbook={workbook} choices={choices} onChange={setChoices} />
          {LIST_SECTIONS.map((section) => (
            <ListSection
              key={section.kind}
              {...section}
              workbook={workbook}
              choices={choices}
              onChange={setChoices}
            />
          ))}
        </div>
        <section className="import-panel import-results" aria-label="Results">
          <div className="import-results-body">
            {tested === null ? (
              <p className="import-before">
                Test checks the file with these choices. Nothing changes until you import.
              </p>
            ) : (
              <Results tested={tested} />
            )}
          </div>
          <div className="import-foot">
            {tested !== null && stale && (
              <p className="caption import-stale">Test again after changing a choice.</p>
            )}
            {shownRefusal !== null && (
              <p className="field-error import-error" role="alert">
                {shownRefusal}
              </p>
            )}
            <div className="import-foot-buttons">
              <button type="button" className="btn" onClick={test}>
                Test
              </button>
              {/* Not disabled while importing, so focus stays on it; a second click is
                  ignored. */}
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canImport}
                title={empty && !stale ? 'Nothing comes in with these choices.' : undefined}
                onClick={() => void runImport()}
              >
                {importingNew || importingOpen ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </section>
      </div>
      {asking !== null && (
        <ConfirmDialog
          {...importQuestion(asking.summary, openName)}
          keepLabel="Cancel"
          confirm={{
            label: 'Import',
            tone: 'primary',
            onConfirm: () => void importIntoOpen(asking),
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
}

// The sections change only with the choices, so typing the new profile's name doesn't read
// the sheets again.
const TimetableSection = memo(function TimetableSection({
  workbook,
  choices,
  onChange,
}: {
  workbook: WorkbookData;
  choices: ImportChoices;
  onChange: (next: ImportChoices) => void;
}) {
  const sheet = findSheet(workbook, choices.timetable.sheet);
  const found = useMemo(() => (sheet ? timetableFound(sheet) : null), [sheet]);
  const options: readonly (readonly [TeacherSource, string, string?])[] = [
    ['row', 'The row under each subject'],
    [
      'assignments',
      'Teaching assignments',
      choices.assignments.sheet === null ? 'Choose a teaching assignments sheet first.' : undefined,
    ],
  ];
  return (
    <section className="import-section" aria-label="Timetable">
      <h2 className="import-heading">Timetable</h2>
      <p className="caption import-about">
        The grid: a subject row and a teacher row per block, a column per class.
      </p>
      <div className="import-row">
        <SheetField
          workbook={workbook}
          value={choices.timetable.sheet}
          canLeaveOut={false}
          onChange={(sheet) => onChange({ ...choices, timetable: { sheet } })}
        />
        <span className="field-label">Each card's teacher from</span>
        <Segmented
          label="Each card's teacher from"
          options={options}
          value={choices.teacherFrom}
          onChange={(teacherFrom) => onChange({ ...choices, teacherFrom })}
        />
      </div>
      {found !== null && <p className="caption import-found tnum">{found}</p>}
    </section>
  );
});

const ListSection = memo(function ListSection({
  kind,
  title,
  about,
  workbook,
  choices,
  onChange,
}: {
  kind: ListKind;
  title: string;
  about: string;
  workbook: WorkbookData;
  choices: ImportChoices;
  onChange: (next: ImportChoices) => void;
}) {
  const choice: ListChoice<string> = choices[kind];
  const sheet = findSheet(workbook, choice.sheet);
  const labels: Record<string, string> = FIELD_LABELS[kind];
  const required: string = LIST_FIELDS[kind][0];
  const options = columnOptions(sheet, choice.headerRow);
  const message = requiredColumnMessage(kind, choices);
  return (
    <section className="import-section" aria-label={title}>
      <h2 className="import-heading">{title}</h2>
      <p className="caption import-about">{about}</p>
      <div className="import-row">
        <SheetField
          workbook={workbook}
          value={choice.sheet}
          canLeaveOut
          onChange={(name) => onChange(chooseListSheet(workbook, choices, kind, name))}
        />
        {sheet && (
          <HeaderRowField
            value={choice.headerRow}
            max={Math.max(1, sheet.rows.length)}
            onChange={(row) => onChange(chooseHeaderRow(workbook, choices, kind, row))}
          />
        )}
      </div>
      {sheet && (
        <table className="import-table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Column</th>
              <th scope="col">First values</th>
            </tr>
          </thead>
          <tbody>
            {LIST_FIELDS[kind].map((field: string) => {
              const column = choice.columns[field] ?? null;
              const values = column === null ? '' : firstValues(sheet, choice.headerRow, column);
              const error = field === required ? message : null;
              return (
                <tr key={field}>
                  <th scope="row">{labels[field]}</th>
                  <td>
                    <SelectInput
                      aria-label={`${labels[field]} column`}
                      aria-invalid={error !== null}
                      value={column ?? ''}
                      onChange={(event) => {
                        const { value } = event.target;
                        const picked = value === '' ? null : Number(value);
                        onChange(chooseColumn(choices, kind, field, picked));
                      }}
                    >
                      {options.map((option) => (
                        <option key={option.column} value={option.column}>
                          {option.label}
                        </option>
                      ))}
                      <option value="">Not imported</option>
                    </SelectInput>
                    {error !== null && <p className="field-error">{error}</p>}
                  </td>
                  <td className="import-values tnum" title={values}>
                    {values}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
});

/** A kind's Sheet dropdown: "" is Leave out, or, for the timetable, no sheet chosen yet. A
    sheet's name is never empty. */
function SheetField({
  workbook,
  value,
  canLeaveOut,
  onChange,
}: {
  workbook: WorkbookData;
  value: string | null;
  canLeaveOut: boolean;
  onChange: (sheet: string | null) => void;
}) {
  const id = useId();
  return (
    <>
      <label className="field-label" htmlFor={id}>
        Sheet
      </label>
      <SelectInput
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        {value === null && !canLeaveOut && (
          <option value="" disabled>
            Choose a sheet
          </option>
        )}
        {sheetOptions(workbook.sheets).map((sheet) => (
          <option key={sheet.name} value={sheet.name}>
            {sheet.name}
          </option>
        ))}
        {canLeaveOut && <option value="">Leave out</option>}
      </SelectInput>
    </>
  );
}

/** The header row, counted from 1 on screen. A number out of range isn't taken, and goes
    back to the row in use when focus leaves. */
function HeaderRowField({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (row: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <>
      <label className="field-label" htmlFor={id}>
        Header row
      </label>
      <input
        id={id}
        type="number"
        className="text-input import-header-row tnum"
        min={1}
        max={max}
        value={draft ?? value + 1}
        onChange={(event) => {
          setDraft(event.target.value);
          const row = Number(event.target.value);
          if (Number.isInteger(row) && row >= 1 && row <= max && row - 1 !== value) {
            onChange(row - 1);
          }
        }}
        onBlur={() => setDraft(null)}
      />
    </>
  );
}

function Results({ tested }: { tested: Tested }) {
  const { summary, problems } = tested.result;
  const { shown, more } = shownProblems(problems);
  const bellNote = bellTimesNote(summary);
  return (
    <>
      <h2 className="import-heading">Found</h2>
      <dl className="import-found-rows">
        {importFoundRows(summary, tested.into === 'open').map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className="tnum">
              {row.value}
              {row.note !== undefined && <span className="caption"> · {row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {bellNote !== null && <p className="caption import-bell">{bellNote}</p>}
      <h2 className="import-heading">
        Problems {problems.length > 0 && <span className="caption tnum">{problems.length}</span>}
      </h2>
      {problems.length === 0 ? (
        <p className="caption">No problems found.</p>
      ) : (
        <ul className="import-problems">
          {shown.map((problem, index) => {
            const place = problemPlace(problem);
            return (
              <li key={index}>
                {place !== '' && <span className="import-problem-place tnum">{place}</span>}
                {problem.message}
              </li>
            );
          })}
          {more > 0 && <li className="caption tnum">And {more} more.</li>}
        </ul>
      )}
    </>
  );
}
