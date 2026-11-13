import type { Id } from '../../domain/model';
import { WEEKLY_PERIODS } from '../../domain/model';
import type { SubjectColors } from '../../domain/subjectColor';
import { subjectColorProps } from './subjectColors';

/** A subject's periods placed in the class on screen. */
export interface SubjectPeriodsTag {
  subjectId: Id;
  name: string;
  colors: SubjectColors;
  periods: number;
}

interface PeriodSummaryProps {
  /** Periods placed in the class on screen, or null when no class is on screen. */
  placed: number | null;
  /** One tag per subject with periods placed, in subject order. */
  subjects: readonly SubjectPeriodsTag[];
}

// One tag per subject with the periods placed in the current class (DM-7). Cards show
// no counts, so this is where the placed periods are read.
export function PeriodSummary({ placed, subjects }: PeriodSummaryProps) {
  return (
    <section className="period-summary" aria-label="Periods per subject">
      <div className="period-summary-head">
        <h2>Periods per subject</h2>
        {placed !== null && (
          <span className="tnum" data-testid="summary-total">
            {placed}/{WEEKLY_PERIODS}
          </span>
        )}
      </div>
      {placed !== null && subjects.length > 0 ? (
        <ul className="period-tags">
          {subjects.map((subject) => (
            <li
              key={subject.subjectId}
              {...subjectColorProps(subject.colors, 'period-tag')}
              aria-label={`${subject.name}: ${subject.periods} ${subject.periods === 1 ? 'period' : 'periods'}`}
            >
              <span>{subject.name}</span>
              <span className="tnum">{subject.periods}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="caption">
          {placed === null
            ? 'Pick a class to see its periods.'
            : 'Subjects appear here once their cards are on the grid.'}
        </p>
      )}
    </section>
  );
}
