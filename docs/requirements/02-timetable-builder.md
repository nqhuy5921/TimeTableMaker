# TB: Build the timetable by drag and drop

**Status:** Approved for release 1 on 2026-10-15. TB-1, TB-3, TB-4, and TB-5 changed on 2026-10-21 for the card pool (approved 2026-10-21).

## Goal

You build the timetable one class at a time. You start from a blank grid for the class and fill it in by dragging subject cards from the school's card pool into slots. The app keeps count as you go and checks each placement against all classes.

## User stories and acceptance criteria

**TB-1. Pick a class.** As the coordinator, I choose which class I'm working on, and the screen shows that class's grid beside the whole card pool. (Changed on 2026-10-21: it used to show only that class's cards.)
- I can switch to another class at any time without losing anything.
- The class picker shows, for each class, how many periods are placed out of the total and how many errors and warnings it has.

**TB-2. Blank grid.** A class with no placements shows a blank grid.
- The grid has Monday to Friday (`Th2`–`Th6`) as columns and the five period blocks from `TIMETABLE` as rows: morning `1-2`, `3-4`, `5-6`, and afternoon `7-8`, `9-10`. That's 25 slots a week.
- Breaks and lunch are shown between the rows but can't hold cards.
- Empty slots are white, with a faint midline across the block, as in [TIMETABLE_SCREEN_LAYOUT.md](../design/TIMETABLE_SCREEN_LAYOUT.md). (Reworded at R1-8 on 2026-10-21 to match the layout spec, which replaced the dashed placeholders of `DESIGN_SYSTEM.md` on 2026-10-16.)

**TB-3. Card panel.** Beside the grid, the screen lists every card in the pool, whichever class is on screen (changed on 2026-10-21; it used to list the class's own cards). Cards don't show counts; the "Periods per subject" panel under the grid shows how many periods of each subject are placed (see [DM-7](01-data-management.md), changed on 2026-10-16).
- I can add a new card to the pool, or edit one, from this panel without leaving the screen. The card form is the same as in [DM-5](01-data-management.md).
- In the card form's dropdowns, I can add a new subject, teacher, or room on the spot if it isn't in its list yet.
- The panel's search and grouping stay as I left them when I switch tabs, switch class, or go to another screen and come back. (The screen switch was added on 2026-10-21 at the user's request.)

**TB-4. Drag a card onto the grid.** As the coordinator, I can drag a card from the card panel into a slot.
- The first time a card goes on a class's grid, that class is added to the card's classes (DM-5). (Added on 2026-10-21.)
- A slot holds either one card in the full 70-minute block (2 periods), or two cards in its two halves (1 period each). For example, `Sinh hoạt lớp` in the first half and `Giáo dục phẩm chất` in the second.
- Where I drop decides the size: dropping on the middle of a block places a full block, and dropping on its top or bottom half places a half block in that half. (Changed on 2026-10-19: cards no longer have periods per week, so the size used to come from the periods left.)
- The card in the slot shows room, subject name, and teacher name, in the subject's color. A half-block card shows the same details in half the height.
- The placed periods go up by 2 for a full block or 1 for a half, in the "Periods per subject" panel and the class's placed count. Cards don't show as done, since they have no target (changed on 2026-10-19).
- Dropping on a slot that already has cards replaces them, and the cards that were there go back to the panel with their placed counts lowered:
  - A full block replaces whatever is in the slot.
  - A half block replaces the card in that half, if there is one. A full-block card there is replaced and the other half left empty. The card in the other half stays.
- A placement that breaks a condition is still allowed. It adds an error or a warning (see [TC](03-teacher-conditions.md)).
- Checks run across all classes. For example, a teacher placed in this class on Monday `3-4` gets an error if they're already placed in another class at that time.

**TB-5. Move and remove.** As the coordinator, I can drag a placed card to another slot, or remove it from the grid.
- Moving onto a filled slot replaces that card, the same as dropping a new one.
- Moving and removing update the placed counts and the error and warning list right away.
- When a card's last placement comes off a class's grid, that class is removed from the card's classes, but the card stays in the pool (DM-5). (Added on 2026-10-21.)

**TB-6. Undo.** Removed on 2026-10-16 at the user's request. The app has no undo or redo. The number is kept so the other TB numbers don't change.

**TB-7. Save.** My work is saved on this computer as I go, so closing the app and opening it again shows the same timetable.
- If a save fails, a notice drops down under the header saying my latest changes aren't saved, which file in which folder couldn't be written and the likely cause, and that my work is still in the app. It has Try again, says how many tries have failed when a retry fails too, can be hidden until the next failure, and goes away once a save works. (Added on 2026-10-21 at the user's request.)

## Decisions

1. **One timetable.** Release 1 keeps a single timetable, made up of every class's grid. Several named timetables, such as drafts, may come in a later release.
2. **Busy slots while dragging.** ~~Greying out the slots where a card's teacher is already busy comes in release 2, with errors and warnings.~~ Dropped on 2026-10-22 at the user's request: nothing changes while dragging, and a clash shows as an error once the card is dropped.
