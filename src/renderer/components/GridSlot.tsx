import { useDraggable, useDroppable } from '@dnd-kit/core';
import { memo } from 'react';
import { cardDetails } from '../../domain/cards';
import { issueCountsText, type SlotMark } from '../../domain/issues';
import type { DropTarget } from '../../domain/placements';
import type { BlockIndex, Day, Id, PlacementPart } from '../../domain/model';
import { PlusIcon } from './Icons';
import type { CardTile } from './SidePanel';
import { subjectColorProps } from './subjectColors';

/** A card on the grid. */
export interface PlacedTile {
  placementId: Id;
  day: Day;
  block: BlockIndex;
  part: PlacementPart;
  card: CardTile;
  /** Its errors and warnings, if it's in any (TC-3). */
  mark?: SlotMark;
  /** While an issue is selected in the Issues tab: lit when it's one of the issue's
      slots, dimmed when it isn't (TC-3). */
  spotlight?: 'lit' | 'dim';
}

/** What a drop zone tells dnd-kit: where it is, and how to say so to a screen reader. */
export interface DropZoneData extends DropTarget {
  label: string;
}

/** What a dragged card tells dnd-kit. A placed card also says which placement it is, so
    dropping it moves that placement instead of adding another (TB-5). */
export interface DragCardData {
  cardId: Id;
  placementId?: Id;
  /** "Toán", or "Toán from Monday periods 1–2", for screen readers. */
  label: string;
}

// Where the pointer has to be to drop each part (settled at R1-5): the top third of a
// block takes its first half, the middle third the whole block, the bottom third its
// second half.
const ZONES: readonly PlacementPart[] = ['first', 'full', 'second'];

/** The id of a block's drop zone for one part. */
function zoneId({ day, block, part }: DropTarget): string {
  return `${day}-${block}-${part}`;
}

function DropZone({ data }: { data: DropZoneData }) {
  const { setNodeRef } = useDroppable({ id: zoneId(data), data });
  return <div ref={setNodeRef} className={`tt-drop-zone tt-drop-zone-${data.part}`} />;
}

function describe(tile: PlacedTile | undefined): string {
  if (!tile) return 'empty';
  const issues = tile.mark ? `, ${issueCountsText(tile.mark)}` : '';
  return `${tile.card.subject}, ${cardDetails(tile.card)}${issues}`;
}

// A placed card (TB-5): drag it with the mouse to move it, and right-click it to take it
// off the grid straight away (settled 2026-10-19). It isn't in the Tab order, since it
// can't be moved or removed from the keyboard (keyboard dragging and Delete were dropped
// on 2026-10-21 at the user's request).
function PlacedCard({
  tile,
  where,
  onRemove,
}: {
  tile: PlacedTile;
  /** "Monday periods 1–2", or "Monday periods 1–2, period 1" for a half. */
  where: string;
  onRemove: (placementId: Id) => void;
}) {
  const { card, part, placementId, mark, spotlight } = tile;
  const data: DragCardData = {
    cardId: card.id,
    placementId,
    label: `${card.subject} from ${where}`,
  };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `placement:${placementId}`,
    data,
  });

  return (
    <div
      {...subjectColorProps(
        card.colors,
        [
          `tt-card tt-card-${part}`,
          mark && `has-${mark.severity}`,
          spotlight && `is-${spotlight}`,
          isDragging && 'is-dragging',
        ]
          .filter(Boolean)
          .join(' '),
      )}
      data-testid="placed-card"
      onContextMenu={(event) => {
        event.preventDefault();
        onRemove(placementId);
      }}
    >
      <div
        ref={setNodeRef}
        className="tt-card-face"
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label={[card.subject, cardDetails(card), mark && issueCountsText(mark)]
          .filter(Boolean)
          .join(', ')}
        title={[
          `${card.subject} · ${cardDetails(card)}`,
          ...(mark?.messages ?? []),
          'Drag to move, right-click to remove',
        ].join('\n')}
      >
        <span className="tt-card-name">{card.subject}</span>
        <span className="tt-card-meta">{cardDetails(card)}</span>
      </div>
    </div>
  );
}

interface GridSlotProps {
  day: Day;
  block: BlockIndex;
  /** "Monday periods 1–2", for the accessible name. */
  label: string;
  /** "period 1", for the first half's accessible name. */
  firstPeriodName: string;
  /** "period 2", for the second half's accessible name. */
  secondPeriodName: string;
  /** The cards in this slot: one full block, or up to one per half. The same array
      until they change, so the slot isn't redrawn while a card is dragged elsewhere. */
  placed: readonly PlacedTile[];
  /** The part a card being dragged would take here, or null. */
  preview: PlacementPart | null;
  /** The CSS grid rows the slot spans, such as "4 / span 2". */
  gridRow: string;
  gridColumn: number;
  /** False with no class on screen: no drop zones. */
  acceptsDrops: boolean;
  /** The slot the pointer is over, or null when it leaves. */
  onHover: (slot: { day: Day; block: BlockIndex } | null) => void;
  onRemove: (placementId: Id) => void;
}

// Memoized: every prop is a string, a number, a boolean, or an array or function that
// stays the same, so during a drag only the slots whose preview changes are drawn again.
export const GridSlot = memo(function GridSlot({
  day,
  block,
  label,
  firstPeriodName,
  secondPeriodName,
  placed,
  preview,
  gridRow,
  gridColumn,
  acceptsDrops,
  onHover,
  onRemove,
}: GridSlotProps) {
  const periodNames = [firstPeriodName, secondPeriodName] as const;
  const full = placed.find((p) => p.part === 'full');
  const first = placed.find((p) => p.part === 'first');
  const second = placed.find((p) => p.part === 'second');
  const empty = placed.length === 0;
  const partLabels: Record<PlacementPart, string> = {
    full: `${label}, both periods`,
    first: `${label}, ${periodNames[0]}`,
    second: `${label}, ${periodNames[1]}`,
  };

  const name = full
    ? `${label}, ${describe(full)}`
    : empty
      ? `${label}, empty`
      : `${label}: ${periodNames[0]} ${describe(first)}; ${periodNames[1]} ${describe(second)}`;

  return (
    <div
      className={empty ? 'tt-slot tt-slot-empty' : 'tt-slot'}
      role="cell"
      data-testid="slot"
      aria-label={name}
      style={{ gridRow, gridColumn }}
      onMouseEnter={() => onHover({ day, block })}
      onMouseLeave={() => onHover(null)}
    >
      {empty && (
        <span className="tt-slot-add">
          <PlusIcon />
        </span>
      )}
      {full && <PlacedCard tile={full} where={label} onRemove={onRemove} />}
      {first && <PlacedCard tile={first} where={partLabels.first} onRemove={onRemove} />}
      {second && <PlacedCard tile={second} where={partLabels.second} onRemove={onRemove} />}
      {preview && <div className={`tt-drop-preview tt-drop-preview-${preview}`} />}
      {acceptsDrops &&
        ZONES.map((part) => (
          <DropZone key={part} data={{ day, block, part, label: partLabels[part] }} />
        ))}
    </div>
  );
});
