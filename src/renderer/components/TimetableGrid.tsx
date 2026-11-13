import { useDndContext } from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { blockPeriods, type Period } from '../../domain/bellSchedule';
import {
  DAYS,
  DAY_NAMES,
  DAY_NAMES_VI,
  type BlockIndex,
  type Day,
  type FixedRowType,
  type Id,
  type ScheduleRow,
} from '../../domain/model';
import { GridSlot, type DropZoneData, type PlacedTile } from './GridSlot';
import { UtensilsIcon } from './Icons';

type BreakRow = Extract<ScheduleRow, { kind: 'break' }>;

type GridLine =
  | { kind: 'fixed'; row: BreakRow }
  | { kind: 'period'; periods: [Period, Period]; block: BlockIndex; half: 0 | 1 };

const ROW_HEIGHTS: Record<FixedRowType | 'period', string> = {
  arrival: '28px',
  break: '22px',
  lunch: '34px',
  period: 'minmax(36px, 1fr)',
};

// Grid lines: the header is row 1, so schedule line i sits on row i + 2. Columns are
// session, period, then Monday to Friday.
const HEADER_ROWS = 1;
const FIRST_DAY_COLUMN = 3;

function buildLines(schedule: readonly ScheduleRow[]): GridLine[] {
  return schedule.flatMap((row): GridLine[] => {
    if (row.kind === 'break') return [{ kind: 'fixed', row }];
    const periods = blockPeriods(row);
    return [
      { kind: 'period', periods, block: row.block, half: 0 },
      { kind: 'period', periods, block: row.block, half: 1 },
    ];
  });
}

/** The lunch row splits the day: lines above it are morning, lines below are afternoon.
    A day without lunch is all morning. */
function buildSessions(lines: readonly GridLine[]) {
  const lunch = lines.findIndex((line) => line.kind === 'fixed' && line.row.type === 'lunch');
  const morningEnd = lunch === -1 ? lines.length : lunch;
  return [
    { session: 'morning', first: 0, span: morningEnd },
    { session: 'afternoon', first: morningEnd + 1, span: lines.length - morningEnd - 1 },
  ].filter((s) => s.span > 0);
}

/** Neighbouring days with the same text share one cell (Tuesday to Friday's "Getting ready"). */
function dayGroups(row: BreakRow) {
  const groups: { start: Day; span: number; label: string; note?: string }[] = [];
  for (const day of DAYS) {
    const text = row.dayLabels?.find((entry) => entry.day === day) ?? row;
    const last = groups.at(-1);
    if (last && last.label === text.label && last.note === text.note) last.span += 1;
    else groups.push({ start: day, span: 1, label: text.label, note: text.note });
  }
  return groups;
}

function gridRow(index: number, span = 1): string {
  return `${index + HEADER_ROWS + 1} / span ${span}`;
}

interface TimetableGridProps {
  schedule: readonly ScheduleRow[];
  /** The cards on the grid for the class on screen. */
  placed: readonly PlacedTile[];
  /** False with no class on screen: the slots have no drop zones, so a card dropped on
      the grid goes back. */
  acceptsDrops: boolean;
  onRemove: (placementId: Id) => void;
  /** Changes when an issue is selected in the Issues tab, or its class comes on screen:
      the grid then scrolls its first spotlit card into view. Null with none selected. */
  spotlightKey: string | null;
}

/** No cards: one shared empty list, so empty slots get the same prop every time. */
const NO_TILES: readonly PlacedTile[] = [];

export function TimetableGrid({
  schedule,
  placed,
  acceptsDrops,
  onRemove,
  spotlightKey,
}: TimetableGridProps) {
  const [hover, setHover] = useState<{ day: Day; block: BlockIndex } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // A selected issue's first card (the earliest, in reading order) is scrolled into view
  // when it's out of sight, clear of the sticky day header. Only the grid scrolls, never the
  // page (R2-7 review).
  useEffect(() => {
    const frame = frameRef.current;
    const card = frame?.querySelector<HTMLElement>('.tt-card.is-lit');
    if (spotlightKey === null || !frame || !card) return;
    const header = frame.querySelector<HTMLElement>('.tt-head')?.offsetHeight ?? 0;
    const view = frame.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const above = box.top - (view.top + header);
    const below = box.bottom - view.bottom;
    if (above < 0) frame.scrollTop += above;
    else if (below > 0) frame.scrollTop += Math.min(below, above);
  }, [spotlightKey]);
  // Each slot's cards, worked out once per change of the grid rather than per slot and
  // per pointer move.
  const bySlot = useMemo(() => {
    const slots = new Map<string, PlacedTile[]>();
    for (const tile of placed) {
      const key = `${tile.day}-${tile.block}`;
      slots.set(key, [...(slots.get(key) ?? []), tile]);
    }
    return slots;
  }, [placed]);
  // While a card is dragged over a drop zone, that zone's slot shows where it would go.
  const { active, over } = useDndContext();
  const target = active && over ? (over.data.current as DropZoneData | undefined) : undefined;
  // Hovering re-renders the grid, so the layout is only worked out when the schedule changes.
  const { lines, sessions, templateRows } = useMemo(() => {
    const lines = buildLines(schedule);
    const templateRows = [
      '56px',
      ...lines.map((line) => ROW_HEIGHTS[line.kind === 'period' ? 'period' : line.row.type]),
    ].join(' ');
    return { lines, sessions: buildSessions(lines), templateRows };
  }, [schedule]);

  return (
    <section className="grid-region" aria-label="Timetable grid">
      <div ref={frameRef} className="tt-frame">
        {/* One CSS grid for the whole table, so every row shares the same columns.
            Row wrappers use display: contents and only carry the table roles. */}
        <div className="tt-grid" role="table" style={{ gridTemplateRows: templateRows }}>
          <div className="tt-row" role="row">
            <div className="tt-head tt-corner" role="columnheader">
              Period
            </div>
            {DAYS.map((day) => (
              <div
                key={day}
                className={hover?.day === day ? 'tt-head tt-day is-hovered' : 'tt-head tt-day'}
                role="columnheader"
              >
                <span className="tt-day-name">{DAY_NAMES[day]}</span>
                <span className="tt-day-vi">{DAY_NAMES_VI[day]}</span>
              </div>
            ))}
          </div>

          {lines.map((line, index) => {
            const session = sessions.find((s) => s.first === index);
            const sessionCell = session && (
              <div
                className="tt-session"
                role="rowheader"
                style={{ gridRow: gridRow(index, session.span) }}
              >
                <span>{session.session}</span>
              </div>
            );

            if (line.kind === 'fixed') {
              const { row } = line;
              const time = <span className="tnum">{`${row.start}–${row.end}`}</span>;
              return (
                <div key={`fixed-${row.start}`} className="tt-row" role="row">
                  {sessionCell}
                  {row.type === 'lunch' && (
                    <div className="tt-lunch" role="cell" style={{ gridRow: gridRow(index) }}>
                      <UtensilsIcon size={15} />
                      <span>{row.label}</span>
                      {time}
                    </div>
                  )}
                  {row.type === 'break' && (
                    <div className="tt-break" role="cell" style={{ gridRow: gridRow(index) }}>
                      <span>{row.label}</span>
                      {time}
                    </div>
                  )}
                  {row.type === 'arrival' && (
                    <>
                      <div
                        className="tt-period tt-period-fixed"
                        role="rowheader"
                        style={{ gridRow: gridRow(index) }}
                      >
                        {time}
                      </div>
                      {dayGroups(row).map((group) => (
                        <div
                          key={group.start}
                          className="tt-arrival"
                          role="cell"
                          style={{
                            gridRow: gridRow(index),
                            gridColumn: `${group.start + FIRST_DAY_COLUMN} / span ${group.span}`,
                          }}
                        >
                          <span>{group.label}</span>
                          {group.note && <span className="tt-arrival-note">· {group.note}</span>}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            }

            const { periods, block, half } = line;
            const period = periods[half];
            const [first, second] = periods;
            return (
              <div key={`period-${period.number}`} className="tt-row" role="row">
                {sessionCell}
                <div
                  className={hover?.block === block ? 'tt-period is-hovered' : 'tt-period'}
                  role="rowheader"
                  style={{ gridRow: gridRow(index) }}
                >
                  <span className="tt-period-label tnum">Period {period.number}</span>
                  <span className="tt-period-time tnum">{`${period.start}–${period.end}`}</span>
                </div>
                {half === 0 &&
                  DAYS.map((day) => (
                    <GridSlot
                      key={day}
                      day={day}
                      block={block}
                      label={`${DAY_NAMES[day]} periods ${first.number}–${second.number}`}
                      firstPeriodName={`period ${first.number}`}
                      secondPeriodName={`period ${second.number}`}
                      placed={bySlot.get(`${day}-${block}`) ?? NO_TILES}
                      preview={target?.day === day && target.block === block ? target.part : null}
                      gridRow={gridRow(index, 2)}
                      gridColumn={day + FIRST_DAY_COLUMN}
                      acceptsDrops={acceptsDrops}
                      onHover={setHover}
                      onRemove={onRemove}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
