import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { selectClass, selectedClass } from '../../domain/appState';
import { cardPanelGroups } from '../../domain/cardPanel';
import { cardView } from '../../domain/cards';
import { addClass, placedPeriods } from '../../domain/classes';
import { exportClassIds } from '../../domain/exportDetails';
import { gradeLabel } from '../../domain/grades';
import type { ExportFormat, ExportScope } from '../../domain/exportSheets';
import {
  issueCounts,
  issueCountsByClass,
  issueList,
  slotMarks,
  type IssueFilters,
} from '../../domain/issues';
import type { Card, Id } from '../../domain/model';
import { subjectColors } from '../../domain/subjectColor';
import {
  drop,
  movePlacement,
  periodsBySubject,
  removePlacement,
  type DropTarget,
} from '../../domain/placements';
import { CardDialog } from '../components/CardDialog';
import { ExportDialog } from '../components/ExportDialog';
import { ClassBar } from '../components/ClassBar';
import { ClassPicker } from '../components/ClassPicker';
import type { DragCardData, DropZoneData, PlacedTile } from '../components/GridSlot';
import { IssuesTab } from '../components/IssuesTab';
import { NewClassDialog } from '../components/NewClassDialog';
import { PeriodSummary } from '../components/PeriodSummary';
import {
  CardFace,
  SidePanel,
  type CardTile,
  type CardTileGroup,
  type PanelTab,
} from '../components/SidePanel';
import { subjectColorProps } from '../components/subjectColors';
import { TimetableGrid } from '../components/TimetableGrid';
import { useAppStore } from '../state/appStore';
import { useExporting } from '../state/exporting';
import type { IssuesView } from '../state/issuesView';
import type { PanelSearch } from '../state/panelSearch';

// Cards are dragged with the mouse only. Keyboard dragging (Space, the arrow keys, and
// Delete to remove) was built at R1-6 and dropped on 2026-10-21 at the user's request.
const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    'Drag a card with the mouse to place it on the grid or move it. Right-click a placed ' +
    'card to remove it.',
};

const cardLabel = (active: Active) => (active.data.current as DragCardData | undefined)?.label;
const zoneLabel = (over: Over) => (over.data.current as DropZoneData | undefined)?.label;

interface TimetableScreenProps {
  /** Kept by the app, so it survives a tab switch, a class switch, and a visit to another
      screen (asked for on 2026-10-21). */
  search: PanelSearch;
  onSearchChange: (search: PanelSearch) => void;
  /** The Issues tab's scope and filters, kept by the app the same way. */
  issuesView: IssuesView;
  onIssuesViewChange: (view: IssuesView) => void;
  /** The class bar's Add grades, with no grades yet (DM-8): the Classes page's Grades. */
  onAddGrades: () => void;
}

const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Picked up ${cardLabel(active)}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${cardLabel(active)} is over ${zoneLabel(over)}.`
      : `${cardLabel(active)} is not over the grid.`,
  onDragEnd: ({ active, over }) =>
    over ? `${cardLabel(active)} dropped on ${zoneLabel(over)}.` : `${cardLabel(active)} put back.`,
  onDragCancel: ({ active }) => `Cancelled. ${cardLabel(active)} put back.`,
};

// The timetable for the class on screen (TB-1): the whole card pool in the side panel,
// dragged onto the grid (TB-4), moved and removed there (TB-5). With no class on screen
// the panel still lists the pool, and the grid takes no drops (SYSTEM_DESIGN §3a).
// Layout: docs/design/TIMETABLE_SCREEN_LAYOUT.md.
export function TimetableScreen({
  search,
  onSearchChange,
  issuesView,
  onIssuesViewChange,
  onAddGrades,
}: TimetableScreenProps) {
  const { state, commit, issues } = useAppStore();
  const [tab, setTab] = useState<PanelTab>('subjects');
  // The issue selected in the Issues tab, by id so it stays selected through a change
  // until it's fixed (SYSTEM_DESIGN §9.3).
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const { query, groupBy } = search;
  const [addingClass, setAddingClass] = useState(false);
  // The card form: open for a new card (null) or for one card, or closed (undefined).
  const [cardForm, setCardForm] = useState<{ cardId: Id | null } | null>(null);
  // The Export dialog, open for one of the Export menu's items (IE-2, IE-4).
  const [exportForm, setExportForm] = useState<{
    scope: ExportScope;
    format: ExportFormat;
  } | null>(null);
  const exporting = useExporting();
  // The card being dragged, shown under the pointer.
  const [dragging, setDragging] = useState<CardTile | null>(null);
  // A drag starts once the pointer moves 4px, so a click on a card still opens it.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const newClassRef = useRef<HTMLButtonElement>(null);
  const wasAddingClass = useRef(false);
  const current = selectedClass(state);
  const placed = current ? placedPeriods(state.file, current.id) : null;
  const countsByClass = useMemo(() => issueCountsByClass(issues), [issues]);
  // The class on screen's issues, or every class's with none on screen (TC-3).
  const onScreenCounts = useMemo(
    () =>
      current ? (countsByClass.get(current.id) ?? { errors: 0, warnings: 0 }) : issueCounts(issues),
    [countsByClass, current, issues],
  );
  const marks = useMemo(() => slotMarks(issues), [issues]);
  const { teachers } = state.file;
  const issueFilters = useMemo((): IssueFilters => {
    const { scope, severity, teacherId, kind } = issuesView;
    return {
      scope: current && scope === 'class' ? current.id : null,
      severity,
      // A teacher deleted while chosen leaves the filter on all teachers.
      teacherId: teachers.some((t) => t.id === teacherId) ? teacherId : null,
      kind,
    };
  }, [issuesView, current, teachers]);
  const shownIssues = useMemo(() => issueList(issues, issueFilters), [issues, issueFilters]);
  const scopeHasIssues =
    issueFilters.scope === null
      ? issues.length > 0
      : onScreenCounts.errors + onScreenCounts.warnings > 0;
  // The selected issue while the list shows it. Once it's fixed or filtered out, the
  // selection goes with it.
  const selectedIssue =
    [...shownIssues.errors, ...shownIssues.warnings].find((i) => i.id === selectedIssueId) ?? null;
  // Dropped here rather than kept, so it doesn't come back if the problem does.
  if (selectedIssueId !== null && selectedIssue === null) setSelectedIssueId(null);
  const spotlit = useMemo(
    () => (selectedIssue ? new Set(selectedIssue.placementIds) : null),
    [selectedIssue],
  );
  const { subjects } = state.file;
  const toTile = (card: Card): CardTile => cardView(state.file, card);
  const cardCount = state.file.cards.length;
  // The class's placements, worked out only when the timetable or the class changes, so
  // the grid's slots keep their props while a card is dragged.
  const placedTiles = useMemo((): PlacedTile[] => {
    if (!current) return [];
    const cards = new Map(state.file.cards.map((c) => [c.id, cardView(state.file, c)]));
    return state.file.placements.flatMap((p) => {
      const card = p.classId === current.id ? cards.get(p.cardId) : undefined;
      if (!card) return [];
      const mark = marks.get(p.id);
      const spotlight = spotlit ? (spotlit.has(p.id) ? 'lit' : 'dim') : undefined;
      return [
        { placementId: p.id, day: p.day, block: p.block, part: p.part, card, mark, spotlight },
      ];
    });
  }, [state.file, current, marks, spotlit]);
  const subjectPeriods = current
    ? periodsBySubject(state.file, current.id).map(({ subjectId, periods }) => {
        const subject = subjects.find((s) => s.id === subjectId);
        return {
          subjectId,
          name: subject?.name ?? '',
          colors: subjectColors(subject),
          periods,
        };
      })
    : [];
  const cardGroups: CardTileGroup[] = cardPanelGroups(state.file, query, groupBy).map((group) => ({
    key: group.key,
    heading: group.heading,
    cards: group.cards.map(toTile),
  }));
  const formTeacher = state.file.teachers.find((t) => t.id === current?.formTeacherId);
  const details = current
    ? [
        gradeLabel(current.grade),
        `Track ${current.track}`,
        formTeacher && `Homeroom teacher ${formTeacher.shortName}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  // When the new-class form closes, focus goes back to the New class tile. The tile may
  // have moved to another grade's row, so the dialog can't be relied on to do it.
  useEffect(() => {
    if (wasAddingClass.current && !addingClass) newClassRef.current?.focus();
    wasAddingClass.current = addingClass;
  }, [addingClass]);

  // Escape clears the selected issue, unless a form is open or a card is being dragged,
  // where Escape closes the form or cancels the drag.
  const formOpen = cardForm !== null || addingClass;
  const isDragging = dragging !== null;
  useEffect(() => {
    if (selectedIssueId === null || formOpen || isDragging) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) setSelectedIssueId(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIssueId, formOpen, isDragging]);

  // The Subjects tab clears the selected issue (TC-3).
  function changeTab(next: PanelTab) {
    setTab(next);
    if (next === 'subjects') setSelectedIssueId(null);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragCardData | undefined;
    const card = state.file.cards.find((c) => c.id === data?.cardId);
    setDragging(card ? toTile(card) : null);
  }

  function endDrag() {
    setDragging(null);
  }

  // A panel card is dropped as a new placement in the class on screen; a placed card is
  // moved and keeps its class (TB-5). With no class on screen there's nowhere to drop.
  function handleDragEnd(event: DragEndEvent) {
    endDrag();
    const data = event.active.data.current as DragCardData | undefined;
    const zone = event.over?.data.current as DropZoneData | undefined;
    if (!data || !zone || !current) return;
    const target: DropTarget = { day: zone.day, block: zone.block, part: zone.part };
    const result = data.placementId
      ? movePlacement(state.file, data.placementId, target)
      : drop(state.file, data.cardId, current.id, target);
    if (result.ok && result.file !== state.file) commit({ ...state, file: result.file });
  }

  const handleRemove = useCallback(
    (placementId: Id) => commit({ ...state, file: removePlacement(state.file, placementId) }),
    [state, commit],
  );

  function handleAddClass(name: string): string | null {
    const result = addClass(state, name);
    if (!result.ok) return result.error;
    commit(result.state);
    setAddingClass(false);
    return null;
  }

  return (
    <div className="timetable-screen">
      <ClassBar
        picker={
          <ClassPicker
            file={state.file}
            selectedId={current?.id ?? null}
            issueCounts={countsByClass}
            onSelect={(classId) => commit(selectClass(state, classId))}
            onNewClass={() => setAddingClass(true)}
            onAddGrades={onAddGrades}
            newClassRef={newClassRef}
          />
        }
        title={
          current?.name ?? (state.file.classes.length === 0 ? 'No classes yet' : 'Pick a class')
        }
        details={details}
        placed={placed}
        issueCounts={onScreenCounts}
        onShowIssues={() => changeTab('issues')}
        className={current?.name ?? null}
        classCount={state.file.classes.length}
        onExport={(scope, format) => setExportForm({ scope, format })}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{
          announcements: ANNOUNCEMENTS,
          screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={endDrag}
      >
        <SidePanel
          tab={tab}
          onTabChange={changeTab}
          issueCounts={onScreenCounts}
          issuesTab={
            <IssuesTab
              current={current}
              classes={state.file.classes}
              teachers={teachers}
              // The chosen teacher as the list uses it: one deleted since shows "All teachers".
              view={{ ...issuesView, teacherId: issueFilters.teacherId }}
              onViewChange={onIssuesViewChange}
              list={shownIssues}
              scopeHasIssues={scopeHasIssues}
              selectedId={selectedIssue?.id ?? null}
              onSelect={setSelectedIssueId}
              onShowClass={(classId) => commit(selectClass(state, classId))}
            />
          }
          cardCount={cardCount}
          cardGroups={cardGroups}
          query={query}
          onQueryChange={(next) => onSearchChange({ ...search, query: next })}
          groupBy={groupBy}
          onGroupByChange={(next) => onSearchChange({ ...search, groupBy: next })}
          onAddCard={() => setCardForm({ cardId: null })}
          onEditCard={(cardId) => setCardForm({ cardId })}
        />
        <TimetableGrid
          schedule={state.file.bellSchedule}
          placed={placedTiles}
          acceptsDrops={current !== null}
          onRemove={handleRemove}
          spotlightKey={selectedIssue ? `${selectedIssue.id} ${current?.id ?? ''}` : null}
        />
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div {...subjectColorProps(dragging.colors, 'subject-card is-overlay')}>
              <CardFace card={dragging} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <PeriodSummary placed={placed} subjects={subjectPeriods} />
      {cardForm && (
        <CardDialog
          file={state.file}
          cardId={cardForm.cardId}
          onDone={(file) => {
            commit({ ...state, file });
            setCardForm(null);
          }}
          onCancel={() => setCardForm(null)}
        />
      )}
      {addingClass && (
        <NewClassDialog
          grades={state.file.grades}
          onSubmit={handleAddClass}
          onCancel={() => setAddingClass(false)}
        />
      )}
      {exportForm && (
        <ExportDialog
          {...exportForm}
          className={current?.name ?? ''}
          classCount={state.file.classes.length}
          // TC-4: the class's issues for This class, the whole timetable's for All classes.
          issueCounts={exportForm.scope === 'class' ? onScreenCounts : issueCounts(issues)}
          initialDetails={exporting.details}
          onExport={async (details) => {
            const done = await exporting.run({
              file: state.file,
              classIds: exportClassIds(state.file, exportForm.scope, current?.id ?? null),
              ...exportForm,
              details,
            });
            if (done) setExportForm(null);
            return done;
          }}
          onCancel={() => setExportForm(null)}
        />
      )}
    </div>
  );
}
