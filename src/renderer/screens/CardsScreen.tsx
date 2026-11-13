import { useRef, useState } from 'react';
import {
  ALL_CARDS,
  cardFilterGrades,
  cardTableRows,
  currentCardFilter,
  type CardTableFilter,
} from '../../domain/cardPanel';
import { cardName } from '../../domain/cards';
import { gradeLabel } from '../../domain/grades';
import type { Id } from '../../domain/model';
import { CardDialog } from '../components/CardDialog';
import { FilterSelect } from '../components/FilterSelect';
import { PlusIcon, SearchIcon } from '../components/Icons';
import { subjectColorProps } from '../components/subjectColors';
import { useReturnFocus } from '../components/useReturnFocus';
import { useAppStore } from '../state/appStore';

// The Cards page (DM-7, layout spec screen 2d): the whole card pool in one table of
// Subject · Teacher · Room · Classes, with grade and teacher filters, a search, Add card,
// and Edit and Delete through the card form. Changed on 2026-10-20 at the user's request
// from one class's cards to all of them, and on 2026-10-21 to the pool, with the classes
// each card is on; the filters were added the same day, also at the user's request.
export function CardsScreen() {
  const { state, commit } = useAppStore();
  // Kept while the page is open, like the Subjects panel's search.
  const [query, setQuery] = useState('');
  const [chosenFilter, setFilter] = useState<CardTableFilter>(ALL_CARDS);
  // The card form: adding (cardId null), editing, or asking to delete one card.
  const [cardForm, setCardForm] = useState<{ cardId: Id | null; deleting: boolean } | null>(null);
  const addCardRef = useRef<HTMLButtonElement>(null);
  // Focus goes back to the button that opened the card form, or to Add card when that
  // button's row is gone.
  const returnFocus = useReturnFocus(addCardRef);
  const { cards, teachers } = state.file;
  const filter = currentCardFilter(state.file, chosenFilter);
  const rows = cardTableRows(state.file, query, filter);
  const filtered = filter.grade !== null || filter.teacher !== null;

  function openForm(cardId: Id | null, deleting: boolean) {
    returnFocus.remember();
    setCardForm({ cardId, deleting });
  }

  function closeForm() {
    setCardForm(null);
    returnFocus.restore();
  }

  function body() {
    if (cards.length === 0) {
      return (
        <div className="empty-state">
          <p>No cards yet</p>
          <p className="caption">Add the school's subject cards with Add card above.</p>
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="empty-state">
          <p>No matches</p>
          <p className="caption">
            {!filtered
              ? `No subject, teacher, or class matches “${query.trim()}”.`
              : query.trim() === ''
                ? 'No card matches these filters.'
                : `No card matches “${query.trim()}” with these filters.`}
          </p>
        </div>
      );
    }
    return (
      <div className="list-table-panel">
        <table className="list-table" aria-label="Cards">
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Teacher</th>
              <th scope="col">Room</th>
              <th scope="col">Classes</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span {...subjectColorProps(row.colors, 'subject-tag')}>{row.subject}</span>
                </th>
                <td className={row.teacher ? undefined : 'list-table-none'}>
                  {row.teacher ?? 'No teacher'}
                </td>
                <td className={row.room ? undefined : 'list-table-none'}>
                  {row.room ?? 'No room'}
                </td>
                {row.classes.length > 0 ? (
                  <td className="list-table-classes">{row.classes.join(', ')}</td>
                ) : (
                  <td className="list-table-none">Not placed</td>
                )}
                <td className="list-table-actions">
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Edit ${cardName(row)}`}
                    onClick={() => openForm(row.id, false)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-quiet"
                    aria-label={`Delete ${cardName(row)}`}
                    onClick={() => openForm(row.id, true)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="list-screen">
      <div className="list-screen-head">
        <h1>Cards</h1>
        <span className="caption tnum">
          {cards.length === 1 ? '1 card' : `${cards.length} cards`}
        </span>
        {cards.length > 0 && (
          <>
            <FilterSelect
              label="Grade"
              value={filter.grade === null ? '' : String(filter.grade)}
              onChange={(value) => {
                const grade = value === '' ? null : value === 'unplaced' ? value : Number(value);
                setFilter({ ...filter, grade: grade as CardTableFilter['grade'] });
              }}
            >
              <option value="">All grades</option>
              {cardFilterGrades(state.file).map((grade) => (
                <option key={grade} value={grade}>
                  {gradeLabel(grade)}
                </option>
              ))}
              <option value="unplaced">Not placed</option>
            </FilterSelect>
            <FilterSelect
              label="Teacher"
              value={filter.teacher ?? ''}
              onChange={(value) => setFilter({ ...filter, teacher: value || null })}
            >
              <option value="">All teachers</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.shortName}
                </option>
              ))}
              <option value="none">No teacher</option>
            </FilterSelect>
          </>
        )}
        {cards.length > 0 && (
          <label className="search-field cards-search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search classes, subjects, or teachers"
              aria-label="Search classes, subjects, or teachers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}
        <button
          ref={addCardRef}
          type="button"
          className="btn btn-primary btn-with-icon"
          onClick={() => openForm(null, false)}
        >
          <PlusIcon size={14} />
          Add card
        </button>
      </div>
      {body()}
      {cardForm && (
        <CardDialog
          file={state.file}
          cardId={cardForm.cardId}
          deleting={cardForm.deleting}
          onDone={(file) => {
            commit({ ...state, file });
            closeForm();
          }}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}
