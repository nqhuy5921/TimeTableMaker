import { useDraggable } from '@dnd-kit/core';
import { useId } from 'react';
import type { CardGrouping } from '../../domain/cardPanel';
import { cardDetails, type CardView } from '../../domain/cards';
import { issueTone, type IssueCounts } from '../../domain/issues';
import type { Id } from '../../domain/model';
import type { DragCardData } from './GridSlot';
import { PlusIcon, SearchIcon } from './Icons';
import { Segmented } from './Segmented';
import { subjectColorProps } from './subjectColors';

export type PanelTab = 'subjects' | 'issues';

/** A card as the panel shows it. */
export type CardTile = CardView;

/** A run of cards under one heading, or with none when grouped by subject. */
export interface CardTileGroup {
  key: string;
  heading: string | null;
  cards: readonly CardTile[];
}

interface SidePanelProps {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  /** The class on screen's errors and warnings, or every class's with none on screen. */
  issueCounts: IssueCounts;
  /** The Issues tab's content (IssuesTab.tsx). */
  issuesTab: React.ReactNode;
  /** How many cards the pool has, before the search. */
  cardCount: number;
  /** The cards that match the search, grouped. */
  cardGroups: readonly CardTileGroup[];
  query: string;
  onQueryChange: (query: string) => void;
  groupBy: CardGrouping;
  onGroupByChange: (groupBy: CardGrouping) => void;
  onAddCard: () => void;
  onEditCard: (cardId: Id) => void;
}

const GROUP_OPTIONS = [
  ['subject', 'Subject'],
  ['teacher', 'Teacher'],
] as const;

type SubjectsTabProps = Omit<SidePanelProps, 'tab' | 'onTabChange' | 'issueCounts' | 'issuesTab'>;

function AddSubjectButton({ onClick, primary }: { onClick: () => void; primary: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn-with-icon${primary ? ' btn-primary' : ''}`}
      onClick={onClick}
    >
      <PlusIcon size={14} />
      Add subject
    </button>
  );
}

// The pool is empty, whether or not there are classes (SYSTEM_DESIGN §3a).
function SubjectsEmptyState({ onAddCard }: Pick<SubjectsTabProps, 'onAddCard'>) {
  return (
    <div className="empty-state">
      <p>No subjects yet</p>
      <AddSubjectButton onClick={onAddCard} primary />
    </div>
  );
}

/** A card's subject over "teacher · room", as on the panel and while it's dragged. */
export function CardFace({ card }: { card: CardTile }) {
  return (
    <>
      <span className="subject-card-name">{card.subject}</span>
      <span className="subject-card-meta">{cardDetails(card)}</span>
    </>
  );
}

// A panel card: click it to edit, or drag it onto the grid with the mouse (TB-4). The
// pointer has to move a few pixels before a drag starts, so a click still opens the card
// form. From the keyboard, Enter or Space opens the form; there's no keyboard dragging
// (dropped on 2026-10-21 at the user's request).
function PanelCard({ card, onEditCard }: { card: CardTile; onEditCard: (cardId: Id) => void }) {
  const data: DragCardData = { cardId: card.id, label: card.subject };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: card.id, data });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      {...subjectColorProps(card.colors, isDragging ? 'subject-card is-dragging' : 'subject-card')}
      title="Drag onto the grid, or click to edit"
      onClick={() => onEditCard(card.id)}
    >
      <CardFace card={card} />
    </button>
  );
}

function CardGrid({
  label,
  cards,
  onEditCard,
}: {
  label: string;
  cards: readonly CardTile[];
  onEditCard: (cardId: Id) => void;
}) {
  return (
    <ul className="card-grid" aria-label={label}>
      {cards.map((card) => (
        <li key={card.id}>
          <PanelCard card={card} onEditCard={onEditCard} />
        </li>
      ))}
    </ul>
  );
}

function SubjectsTab(props: SubjectsTabProps) {
  const { cardCount, cardGroups, query, onEditCard } = props;
  const headingId = useId();

  function cardList() {
    if (cardCount === 0) return <SubjectsEmptyState {...props} />;
    if (cardGroups.length === 0) {
      return (
        <div className="empty-state">
          <p>No matches</p>
          <p className="caption">No subject or teacher matches “{query.trim()}”.</p>
        </div>
      );
    }
    // Grouped by subject: one list, the color tells the subjects apart (layout spec).
    // Grouped by teacher: a sticky heading per teacher.
    return cardGroups.map((group, index) =>
      group.heading === null ? (
        <CardGrid
          key={group.key}
          label="Subject cards"
          cards={group.cards}
          onEditCard={onEditCard}
        />
      ) : (
        <section key={group.key} className="card-group" aria-labelledby={`${headingId}-${index}`}>
          <h3 className="card-group-heading" id={`${headingId}-${index}`}>
            {group.heading}
          </h3>
          <CardGrid label={group.heading} cards={group.cards} onEditCard={onEditCard} />
        </section>
      ),
    );
  }

  return (
    <>
      <div className="side-panel-controls">
        <label className="search-field">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search subjects or teachers"
            aria-label="Search subjects or teachers"
            value={query}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
        </label>
        <div className="side-panel-row">
          <span className="caption">Group by</span>
          <Segmented
            label="Group by"
            options={GROUP_OPTIONS}
            value={props.groupBy}
            onChange={props.onGroupByChange}
          />
        </div>
      </div>
      <div className="side-panel-body">{cardList()}</div>
      {cardCount > 0 && (
        <div className="side-panel-footer">
          <AddSubjectButton onClick={props.onAddCard} primary />
        </div>
      )}
    </>
  );
}

const TABS: readonly (readonly [PanelTab, string])[] = [
  ['subjects', 'Subjects'],
  ['issues', 'Issues'],
];

export function SidePanel({
  tab,
  onTabChange,
  issueCounts,
  issuesTab,
  ...subjects
}: SidePanelProps) {
  const id = useId();

  // Arrow keys, Home, and End move between tabs; only the selected tab is in the Tab order.
  function handleKeyDown(event: React.KeyboardEvent) {
    const index = TABS.findIndex(([value]) => value === tab);
    const next = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[event.key];
    const target = next === undefined ? undefined : TABS[next];
    if (!target) return;
    event.preventDefault();
    onTabChange(target[0]);
    document.getElementById(`${id}-${target[0]}-tab`)?.focus();
  }

  return (
    <aside className="side-panel" aria-label="Subjects and issues">
      <div className="side-panel-tabs" role="tablist" onKeyDown={handleKeyDown}>
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-${value}-tab`}
            aria-selected={tab === value}
            aria-controls={`${id}-${value}-panel`}
            tabIndex={tab === value ? 0 : -1}
            className="side-panel-tab"
            onClick={() => onTabChange(value)}
          >
            {label}
            {value === 'issues' && (
              <span className={`count-badge tnum tone-${issueTone(issueCounts)}`}>
                {issueCounts.errors + issueCounts.warnings}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Both panels stay mounted, so the search box's focus and each list's scroll survive
          a tab switch. The search, grouping, and issue filters live in the screen. */}
      {TABS.map(([value]) => (
        <div
          key={value}
          className="side-panel-content"
          role="tabpanel"
          id={`${id}-${value}-panel`}
          aria-labelledby={`${id}-${value}-tab`}
          hidden={tab !== value}
        >
          {value === 'subjects' ? <SubjectsTab {...subjects} /> : issuesTab}
        </div>
      ))}
    </aside>
  );
}
