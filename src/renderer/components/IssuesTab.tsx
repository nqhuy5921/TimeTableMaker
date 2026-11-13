import { useId, useRef } from 'react';
import { ISSUE_KIND_LABELS, ISSUE_KINDS, type Issue, type IssueKind } from '../../domain/checks';
import type { IssueList } from '../../domain/issues';
import type { Id, SchoolClass, Teacher } from '../../domain/model';
import { FilterSelect } from './FilterSelect';
import { CheckIcon } from './Icons';
import type { IssuesView } from '../state/issuesView';
import { Segmented } from './Segmented';

interface IssuesTabProps {
  /** The class on screen, or null. */
  current: SchoolClass | null;
  classes: readonly SchoolClass[];
  teachers: readonly Teacher[];
  view: IssuesView;
  onViewChange: (view: IssuesView) => void;
  /** What the view lets through. */
  list: IssueList;
  /** Whether the scope has any issues before the severity, teacher, and check filters. */
  scopeHasIssues: boolean;
  selectedId: string | null;
  onSelect: (issueId: string | null) => void;
  /** Switches the class on screen, keeping the issue selected. */
  onShowClass: (classId: Id) => void;
}

const ALL = '';

/** Keeps a range such as "9–10" on one line: a word joiner either side of its dash stops
    the line breaking there (R2-7 review). Display only; the accessible name keeps the
    plain text. */
const keepRanges = (text: string) => text.replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2');

const SEVERITY_NAMES: Record<Issue['severity'], string> = { error: 'Error', warning: 'Warning' };

type RowProps = Pick<IssuesTabProps, 'current' | 'classes' | 'onSelect' | 'onShowClass'>;

function IssueRow({
  issue,
  current,
  classes,
  selected,
  onSelect,
  onShowClass,
}: RowProps & {
  issue: Issue;
  selected: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const elsewhere = issue.classIds.filter((id) => id !== current?.id);
  const lead = !current
    ? 'Pick a class'
    : issue.classIds.includes(current.id)
      ? 'Also in'
      : `Not in ${current.name}`;

  return (
    <li className={selected ? 'issue-row is-selected' : 'issue-row'}>
      <button
        ref={buttonRef}
        type="button"
        className="issue-row-button"
        aria-pressed={selected}
        // Said in full, since the dot's color is the row's only sign of its severity:
        // "Error: Thầy Phúc is in 6A1 and 6A2 at the same time. 6A1, 6A2 · Monday · …".
        aria-label={`${SEVERITY_NAMES[issue.severity]}: ${issue.message}. ${issue.where}`}
        onClick={() => onSelect(selected ? null : issue.id)}
      >
        <span className={`issue-dot issue-dot-${issue.severity}`} />
        <span className="issue-text">
          <span className="issue-message">{keepRanges(issue.message)}</span>
          <span className="issue-where tnum">{keepRanges(issue.where)}</span>
        </span>
      </button>
      {selected && elsewhere.length > 0 && (
        <div className="issue-also">
          <span>{lead}</span>
          {elsewhere.map((classId) => (
            <button
              key={classId}
              type="button"
              className="btn btn-show-class"
              onClick={() => {
                onShowClass(classId);
                // The pill goes once its class is on screen; the row keeps the focus.
                buttonRef.current?.focus();
              }}
            >
              Show {classes.find((c) => c.id === classId)?.name}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function IssueSection({
  title,
  issues,
  selectedId,
  row,
}: {
  title: string;
  issues: readonly Issue[];
  selectedId: string | null;
  row: RowProps;
}) {
  const headingId = useId();
  if (issues.length === 0) return null;
  return (
    <section className="issue-section" aria-labelledby={headingId}>
      <h3 className="issue-section-heading tnum" id={headingId}>
        {title} · {issues.length}
      </h3>
      <ul className="issue-list">
        {issues.map((issue) => (
          <IssueRow key={issue.id} issue={issue} selected={issue.id === selectedId} {...row} />
        ))}
      </ul>
    </section>
  );
}

// The Issues tab (TC-3, layout spec "Issues tab"): the scope, the severity with counts, the
// Teacher and Check filters, and the list, errors first. A click selects an issue, which
// the grid spotlights, and its "Show 7B1" pills switch class. Nothing here stops a card
// being placed (TC-4).
export function IssuesTab(props: IssuesTabProps) {
  const { current, classes, teachers, view, onViewChange, list, scopeHasIssues } = props;
  const { selectedId, onSelect, onShowClass } = props;
  const row: RowProps = { current, classes, onSelect, onShowClass };
  const { counts } = list;
  const scopeOptions = [
    ['class', current?.name ?? 'This class'],
    ['all', 'All classes'],
  ] as const;
  const severityOptions = [
    ['all', `All ${counts.errors + counts.warnings}`],
    ['error', `Errors ${counts.errors}`],
    ['warning', `Warnings ${counts.warnings}`],
  ] as const;

  function body() {
    if (!scopeHasIssues) {
      return (
        <div className="empty-state issues-empty">
          <CheckIcon size={20} />
          <p>{current && view.scope === 'class' ? `No issues in ${current.name}` : 'No issues'}</p>
        </div>
      );
    }
    if (list.errors.length + list.warnings.length === 0) {
      return (
        <div className="empty-state">
          <p>No issues match these filters.</p>
        </div>
      );
    }
    return (
      <>
        <IssueSection title="Errors" issues={list.errors} selectedId={selectedId} row={row} />
        <IssueSection title="Warnings" issues={list.warnings} selectedId={selectedId} row={row} />
      </>
    );
  }

  return (
    <>
      <div className="side-panel-controls issues-controls">
        <Segmented
          label="Show issues for"
          className="segmented-wide"
          options={scopeOptions}
          value={current ? view.scope : 'all'}
          disabled={!current}
          onChange={(scope) => onViewChange({ ...view, scope })}
        />
        <Segmented
          label="Severity"
          className="segmented-wide tnum"
          options={severityOptions}
          value={view.severity}
          onChange={(severity) => onViewChange({ ...view, severity })}
        />
        <div className="issues-filters">
          <FilterSelect
            label="Teacher"
            value={view.teacherId ?? ALL}
            onChange={(id) => onViewChange({ ...view, teacherId: id === ALL ? null : id })}
          >
            <option value={ALL}>All teachers</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.shortName}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Check"
            value={view.kind ?? ALL}
            onChange={(kind) =>
              onViewChange({ ...view, kind: kind === ALL ? null : (kind as IssueKind) })
            }
          >
            <option value={ALL}>All checks</option>
            {ISSUE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ISSUE_KIND_LABELS[kind]}
              </option>
            ))}
          </FilterSelect>
        </div>
      </div>
      <div className="side-panel-body">{body()}</div>
      <p className="side-panel-footer caption">Click an issue to highlight its slots.</p>
    </>
  );
}
