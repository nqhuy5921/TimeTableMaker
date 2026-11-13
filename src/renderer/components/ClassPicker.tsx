import { useMemo, useState } from 'react';
import { classesByGrade, placedPeriodsByClass } from '../../domain/classes';
import { gradeLabel } from '../../domain/grades';
import { issueCountsText, type IssueCounts } from '../../domain/issues';
import { WEEKLY_PERIODS, type Grade, type Id, type TimetableFile } from '../../domain/model';
import { PlusIcon } from './Icons';
import { Segmented } from './Segmented';

interface ClassPickerProps {
  file: TimetableFile;
  selectedId: Id | null;
  /** Each class's errors and warnings; a class with none has no entry (TB-1). */
  issueCounts: ReadonlyMap<Id, IssueCounts>;
  onSelect: (classId: Id) => void;
  onNewClass: () => void;
  /** With no grades yet (DM-8), opens the Classes page's Grades dialog. */
  onAddGrades: () => void;
  /** The New class tile, so the screen can return focus to it. */
  newClassRef: React.RefObject<HTMLButtonElement | null>;
}

// Grade tabs, one per grade on the timetable's list (DM-8), then a row of tiles for that
// grade's classes (TB-1). Each tile has a bar
// for the periods placed out of 50 and its error and warning counts as badges on its
// corner, and the row ends with New class.
export function ClassPicker({
  file,
  selectedId,
  issueCounts,
  onSelect,
  onNewClass,
  onAddGrades,
  newClassRef,
}: ClassPickerProps) {
  const groups = useMemo(() => classesByGrade(file.classes), [file.classes]);
  const placed = useMemo(() => placedPeriodsByClass(file), [file]);
  const selected = file.classes.find((c) => c.id === selectedId);
  const options = useMemo(
    () => file.grades.map((g) => [String(g), gradeLabel(g)] as const),
    [file.grades],
  );

  // The grade tabs follow the class on screen, else the first grade. Looking at another
  // grade lasts until a different class is picked, or until that grade is deleted.
  const [browsing, setBrowsing] = useState<{ grade: Grade; selectedId: Id | null } | null>(null);
  const grade: Grade | undefined =
    browsing && browsing.selectedId === selectedId && file.grades.includes(browsing.grade)
      ? browsing.grade
      : (selected?.grade ?? file.grades[0]);
  const classes = groups.find((group) => group.grade === grade)?.classes ?? [];

  // No grades yet (DM-8, a new timetable): no tabs and no New class tile, since a class
  // needs a grade, but the way to add one. The row keeps the tiles' height.
  if (grade === undefined) {
    return (
      <div className="class-picker class-picker-empty">
        <p className="caption">No grades yet.</p>
        <button type="button" className="btn" onClick={onAddGrades}>
          Add grades
        </button>
      </div>
    );
  }

  return (
    <div className="class-picker">
      <Segmented
        label="Grade"
        className="segmented-dark"
        options={options}
        value={String(grade)}
        onChange={(value) => setBrowsing({ grade: Number(value), selectedId })}
      />
      <div className="class-tiles" role="group" aria-label={`${gradeLabel(grade)} classes`}>
        {classes.map((c) => {
          const periods = placed.get(c.id) ?? 0;
          const counts = issueCounts.get(c.id);
          const status = [
            `${periods} of ${WEEKLY_PERIODS} periods placed`,
            counts && issueCountsText(counts),
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={c.id}
              type="button"
              className="class-tile"
              aria-current={c.id === selectedId ? 'true' : undefined}
              aria-label={`${c.name}, ${status}`}
              title={`${c.name}: ${status}`}
              onClick={() => onSelect(c.id)}
            >
              {counts && (
                <span className="class-tile-badges" aria-hidden="true">
                  {counts.errors > 0 && (
                    <span className="class-tile-badge is-error" data-testid="tile-errors">
                      {counts.errors}
                    </span>
                  )}
                  {counts.warnings > 0 && (
                    <span className="class-tile-badge is-warning" data-testid="tile-warnings">
                      {counts.warnings}
                    </span>
                  )}
                </span>
              )}
              <span>{c.name}</span>
              <span className="class-tile-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(periods / WEEKLY_PERIODS, 1) * 100}%` }} />
              </span>
            </button>
          );
        })}
        <button
          ref={newClassRef}
          type="button"
          className="class-tile class-tile-new"
          onClick={onNewClass}
        >
          <PlusIcon size={14} />
          New class
        </button>
      </div>
    </div>
  );
}
