# TC: Teacher conditions, errors, and warnings

**Status:** Approved for release 2 on 2026-10-22, after the user's answers at R2-0 (marked with that date). Open question 2 (accepting a warning) stays open and doesn't block release 2.

## Goal

Each teacher can have conditions. When the timetable breaks a teacher condition, an **error** appears in a list in a panel on the timetable-building screen. Other problems, which aren't about a teacher's conditions, show in the same list as **warnings**.

## User stories and acceptance criteria

**TC-1. Set conditions.** As the coordinator, I can add, edit, and remove conditions for each teacher on that teacher's detail screen. The Teachers page lists the teachers, and clicking one opens its detail screen (decided 2026-10-22; see [DM-1](01-data-management.md)), so the teacher list comes in release 2 with the conditions.
- A teacher can have any number of conditions, including several of the same type. For example, one subject limit for Toán and another for Tin học.
- I can turn a condition off without deleting it.
- Adding a condition works like Excel's conditional formatting rules (the user's description, 2026-10-22): I pick the kind of condition from a dropdown of the ready-made types in the table below, then fill in only the values that type needs. For example, "Most periods per day" asks for a number, "Subject limit" for a subject, a number, and per day or per week, "Days off" for the days, and "Unavailable times" for morning, afternoon, or chosen blocks and the days they apply to. The subject to pick for a subject limit is one the teacher teaches, that is, has a card of (the user's choice, 2026-10-23).
- The teacher's conditions are listed as plain sentences, such as "At most 6 periods on any day" or "Not on Wednesday", each with its on/off switch, Edit, and Delete. Editing reopens the same form with its values filled in.

**TC-2. Check on every change.** Each time a card is placed, moved, replaced, or removed, or a card's teacher or room changes, every check runs again across all classes.
- A new problem appears in the list straight away, and a fixed one is removed straight away.
- The two halves of a block are different times. A teacher in the first half of a block in 6A1 and the second half in 7B1 isn't in two places.
- Period counts include half blocks as 1 period.

**TC-3. The panel.** The timetable-building screen has a panel that lists every current error and warning.
- Errors come first, then warnings.
- Errors use the `--danger` colors and warnings use the `--warning` colors from `DESIGN_SYSTEM.md`.
- Each item says what's wrong and which slots are involved. For example: "Teacher X: 4 periods of Toán on Monday, limit is 3".
- By default the panel shows the class being built. I can switch it to show all classes. (Confirmed 2026-10-22.)
- Clicking an item highlights the slots involved. If they're in another class, it offers to switch to that class.
- Slots involved in an error or warning are marked on the grid, in the matching color.
- The panel shows how many errors and how many warnings there are, and can be filtered by teacher and by type.
- Each class tile in the class bar shows small counts of that class's errors (red) and warnings (amber), as TB-1 asks (confirmed 2026-10-22).
- Nothing changes on the grid while a card is being dragged; a clash shows once it's dropped (decided 2026-10-22: no greying of busy slots).

**TC-4. Nothing blocks.** Errors and warnings don't stop you from placing a card, so you can work through a timetable that's half done. Exporting with errors asks you to confirm first.

## Errors: teacher conditions

Every teacher condition is an error when it's broken.

### Set for each teacher

| Condition | Settings | Example |
|---|---|---|
| Subject limit | A subject, a number, and per day or per week | Teacher A teaches at most 3 periods of Toán a week, across all classes |
| Unavailable times | Morning, afternoon, or specific blocks, on every day or on chosen days | Teacher B can't teach in the afternoon. Teacher C can't teach block `1-2` on Monday. |
| Days off | One or more days | Teacher D doesn't teach on Wednesday |
| Most periods per day | A number | At most 6 periods on any day |
| Most periods per week | A number | At most 18 periods a week. The teacher's periods are counted from every place they appear on the grid across all classes that week: 2 for a full block, 1 for a half (decided 2026-10-22). |
| Most blocks in a row | A number | At most 2 blocks in a row without a free block |
| Most gaps per day | A number of free blocks | At most 1 free block between their first and last lesson of the day |
| Most teaching days | A number of days | Teaches on at most 4 days a week |

Morning is blocks `1-2`, `3-4`, and `5-6`. Afternoon is `7-8` and `9-10`, as in `TIMETABLE`.

### Always on

| Check | Example |
|---|---|
| Teacher in two places | Teacher X is placed in 6A1 and 7B1 on Monday `3-4`. Every class is checked at each time: the same teacher (by their entry in the teacher list, whose short names are unique) in two classes in the same block or the same half is an error. This is also how teachers shared with THPT are handled (decided 2026-10-22). |
| Room in use twice | Room `1C` has 6A2 and 8A1 on Tuesday `7-8` |

A room can't hold two classes at once, so this check is an error like the teacher checks.

## Warnings: everything else

| Check | Example |
|---|---|
| Subject twice in a day | 6A1 has Toán in `1-2` and `7-8` on Monday |

## Open questions

1. ~~**Shared teachers**~~: settled on 2026-10-22: there's no separate THPT busy list. A shared teacher is checked like any other: at each time, the teacher is looked for across every class, and being in two places is an error. Lessons at THPT itself aren't in the app, so they're only checked if the user enters them as "Unavailable times".
2. **Accepting a warning:** can you mark a warning as accepted, so it stops showing?
3. ~~**Unplaced periods**~~: dropped on 2026-10-22, with "Fewest periods per week" and the "Card placed too often" warning. All three needed cards' periods per week, which were dropped on 2026-10-19.

Question 2 stays open for now (the user, 2026-10-22).
