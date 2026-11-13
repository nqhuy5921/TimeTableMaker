import type { ReactNode, RefObject } from 'react';
import { plural } from '../../domain/text';
import { PlusIcon, SearchIcon } from './Icons';

interface ListPageProps {
  /** The page name, such as "Rooms". */
  title: string;
  /** The item, one and many, such as "room" and "rooms": the count, the search's name,
      Add room, and the empty states are made from it. */
  noun: { one: string; many: string };
  /** How many items there are, and how many match the search. */
  total: number;
  matches?: number;
  /** The search, left out on a page without one (the profile screen). */
  search?: { query: string; onQueryChange: (query: string) => void };
  /** The Add button, so focus can go back to it. */
  addRef: RefObject<HTMLButtonElement | null>;
  /** The Add button's words, "Add room" unless given ("New profile"). */
  addLabel?: string;
  onAdd: () => void;
  /** Why the Add button can't be used yet, as its tooltip; it's disabled while set. */
  addDisabledReason?: string;
  /** More buttons before Add, such as the Classes page's Grades. */
  actions?: ReactNode;
  /** The empty state's line, "Add the school's rooms with Add room above." unless given. */
  emptyHint?: string;
  /** Why the last change didn't work, between the title row and the table. */
  notice?: string | null;
  /** The table, shown when something matches. */
  children: ReactNode;
}

// A list page for teachers, classes, rooms, subjects, or profiles (DM-1 to DM-4, PF-2,
// layout spec "List pages for classes, rooms, and subjects"): the title row with the
// count, the search, and the Add button, then the table in its panel, or an empty state
// when there's nothing or no match. The page keeps its own search, form, and delete
// question.
export function ListPage({
  title,
  noun,
  total,
  matches = total,
  search,
  addRef,
  addLabel = `Add ${noun.one}`,
  onAdd,
  addDisabledReason,
  actions,
  emptyHint = `Add the school's ${noun.many} with ${addLabel} above.`,
  notice = null,
  children,
}: ListPageProps) {
  return (
    <div className="list-screen">
      <div className="list-screen-head">
        <h1>{title}</h1>
        <span className="caption tnum">{plural(total, noun.one, noun.many)}</span>
        {search && total > 0 && (
          <label className="search-field list-search">
            <SearchIcon />
            <input
              type="search"
              placeholder={`Search ${noun.many}`}
              aria-label={`Search ${noun.many}`}
              value={search.query}
              onChange={(event) => search.onQueryChange(event.target.value)}
            />
          </label>
        )}
        {actions}
        <button
          ref={addRef}
          type="button"
          className="btn btn-primary btn-with-icon"
          disabled={addDisabledReason !== undefined}
          title={addDisabledReason}
          onClick={onAdd}
        >
          <PlusIcon size={14} />
          {addLabel}
        </button>
      </div>
      {notice !== null && (
        <p className="danger-notice" role="alert">
          {notice}
        </p>
      )}
      {total === 0 ? (
        <div className="empty-state">
          <p>No {noun.many} yet</p>
          <p className="caption">{emptyHint}</p>
        </div>
      ) : matches === 0 ? (
        <div className="empty-state">
          <p>No matches</p>
          <p className="caption">
            No {noun.one} matches “{search?.query.trim()}”.
          </p>
        </div>
      ) : (
        <div className="list-table-panel">{children}</div>
      )}
    </div>
  );
}

/** A row's Edit and Delete pills, named after the item ("Edit P101", "Delete P101"). */
export function RowActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <td className="list-table-actions">
      <button type="button" className="btn" aria-label={`Edit ${name}`} onClick={onEdit}>
        Edit
      </button>
      <button
        type="button"
        className="btn btn-danger-quiet"
        aria-label={`Delete ${name}`}
        onClick={onDelete}
      >
        Delete
      </button>
    </td>
  );
}
