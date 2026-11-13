# Tests

Every acceptance criterion in `docs/requirements/` maps to at least one test listed here. Release 1's criteria (TB-1 to TB-5, TB-7, DM-5, DM-7, and DM-2's class-name rule) were checked against this table at R1-8 on 2026-10-21, release 2's (TC-1 to TC-4, DM-1) at R2-6 on 2026-10-23, release 3's (DM-2 to DM-4) at R3-4 on 2026-10-27, and release 4's (PF-1 to PF-3, IE-2, DM-1's phone, TC-4's question before exporting) at R4-7 on 2026-10-29, and release 5's (DM-8, IE-1, IE-3, and IE-2's `Giáo viên` sheet) at R5-6 on 2026-11-12.

The sample school in `src/domain/exampleSchool.ts` (moved from `fixtures/` at R5-3, where what the tests expect of it stays in `fixtures/sampleExpectations.ts`) is the made-up school the acceptance pass runs on: six classes across the five tracks, ten subjects, eight teachers, six rooms, and cards placed as full blocks and as halves. Since R2-6 it also has every kind of issue: a condition of each type broken once, three just at their limit, one switched off, a teacher and a room each in two places, one teacher's half cards sharing a block in two classes (not a clash), and a subject twice in a day. `SAMPLE_ISSUES` lists them in the checks' order. Since R3-4 every class but 9BA1 has a homeroom teacher, four have an assistant homeroom teacher too, and the list pages' cases are there: deleting room P101 merges a card into one with no room, a subject limit names Tin học, and Lịch sử's one card is on two grids. Since R4-7 four teachers have a phone (moved from the expected workbook, which now exports the sample school itself), so the export's headers and `Data ` have every mix: 6A1's homeroom teacher has a full name, phone, and email, and 9BA1 has no homeroom teacher. `tests/domain/sampleSchool.test.ts` and `tests/e2e/acceptance.spec.ts` use it. The other tests each build a small school of their own. `fixtures/reviewSchool.ts` is a bigger made-up school for looking at the screens by eye (`npm run dev:review`); `tests/domain/reviewSchool.test.ts` keeps it a valid file that still shows what it's for; since R4-7 its teachers have full names and most an email and a phone, and every class but 9BA1 has a homeroom teacher, so an export from it is filled.

## Release 1

| Requirement | Test |
| --- | --- |
| DM-2 class-name rule | `tests/domain/className.test.ts`, `tests/domain/classes.test.ts` |
| DM-2 "New class…" rejects bad and duplicate names with a message | `tests/domain/classes.test.ts`, `tests/e2e/classes.spec.ts` |
| TB-1 pick a class; the screen shows that class's grid, and the Subjects panel lists the whole pool of cards (2026-10-21) | `tests/domain/sampleSchool.test.ts`, `tests/domain/cardPanel.test.ts`, `tests/e2e/cardPanel.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-1 switching to another class at any time loses nothing | `tests/domain/classes.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/classes.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-1 picker shows placed periods out of 50 per class, grouped by grade | `tests/domain/classes.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/classes.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-2 five blocks from the bell schedule, Monday to Friday, 25 slots | `tests/domain/timetableFile.test.ts`, `tests/e2e/smoke.spec.ts` |
| TB-2 a class with no placements shows a blank grid | `tests/e2e/smoke.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-2 period rows, breakfast, flag salute, breaks, and lunch (layout spec) | `tests/domain/bellSchedule.test.ts`, `tests/e2e/smoke.spec.ts` |
| TB-2 breaks and lunch can't hold cards | `tests/e2e/acceptance.spec.ts` |
| TB-2 empty slots are white with a faint midline (layout spec, in place of dashed placeholders) | `tests/e2e/layout.spec.ts` |
| Layout: the header menu links keep their place and size whichever screen is open (2026-10-21) | `tests/e2e/layout.spec.ts` |
| TB-3 the panel lists every card in the pool for any class; search, grouping, and tab survive a tab or class switch; search and grouping survive a visit to another screen (2026-10-21) | `tests/domain/cardPanel.test.ts`, `tests/e2e/cardPanel.spec.ts` |
| TB-3 add or edit a card from the panel with Subject, Teacher, and Room only; add a subject, teacher, or room from the form's dropdowns; with no class on screen the pool still shows and the grid takes no drops | `tests/domain/cards.test.ts`, `tests/e2e/cards.spec.ts`, `tests/e2e/cardsPage.spec.ts` |
| TB-4 drop on a block's middle fills the block; on a half takes that half; a second half card shares the block | `tests/domain/placements.test.ts`, `tests/e2e/dragDrop.spec.ts` |
| TB-4 dropping on a filled slot replaces it, by every row of the drop table, and the counts go down | `tests/domain/placements.test.ts`, `tests/e2e/dragDrop.spec.ts` |
| TB-4 placed periods go up by 2 for a full block and 1 for a half, in the summary and the placed count | `tests/domain/placements.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/dragDrop.spec.ts` |
| TB-4 a placed card shows room, subject, and teacher; a half card the same on one line | `tests/e2e/dragDrop.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-4 a drop is allowed even with the same teacher in another class in that block | `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-4 a drop puts the card on the class on screen and adds that class to the card's classes; it changes only that class's grid | `tests/domain/placements.test.ts`, `tests/domain/cards.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-5 move a placed card; onto a filled slot it replaces that card, the same as a drop; it stays on its class | `tests/domain/placements.test.ts`, `tests/e2e/moveRemove.spec.ts` |
| TB-5 remove a placed card; moving and removing update the placed counts right away; removing a card's last placement in a class takes the class off it | `tests/domain/placements.test.ts`, `tests/domain/cards.test.ts`, `tests/e2e/moveRemove.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-5 cards are moved and removed with the mouse only (2026-10-21) | `tests/e2e/moveRemove.spec.ts` |
| TB-7 changes survive a restart, including a save still pending when the window closes | `tests/e2e/saving.spec.ts`, `tests/e2e/acceptance.spec.ts`, `tests/renderer/saveScheduler.test.ts` |
| TB-7 saves at most once every half second, never two at once | `tests/renderer/saveScheduler.test.ts` |
| TB-7 atomic write, the backup, saves in order | `tests/main/store.test.ts` |
| TB-7 a damaged file is refused, left untouched, and the backup offered | `tests/main/store.test.ts`, `tests/e2e/saving.spec.ts` |
| TB-7 an older format version is upgraded; a newer one is refused | `tests/main/fileFormat.test.ts`, `tests/main/store.test.ts` |
| TB-7 the class on screen comes back after a restart | `tests/domain/appState.test.ts`, `tests/main/store.test.ts`, `tests/e2e/saving.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-7 a failed save drops down a notice naming the file, folder, and likely cause, with Try again (2026-10-21) | `tests/main/store.test.ts`, `tests/e2e/saving.spec.ts` |
| DM-5 add, edit, and delete a card with subject, teacher, and room; teacher and room can be empty | `tests/domain/cards.test.ts`, `tests/e2e/cards.spec.ts` |
| DM-5 no two cards have the same subject, teacher, and room; the form refuses a duplicate under Subject, naming it | `tests/domain/cards.test.ts`, `tests/domain/integrity.test.ts`, `tests/e2e/cards.spec.ts` |
| DM-5 a class may hold several cards of one subject (other teacher or room); "Periods per subject" adds them up | `tests/domain/integrity.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-5 a card's classes follow its placements: a drop adds the class, removing the last placement takes it off | `tests/domain/cards.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-5 saved version 1 files upgrade to the pool: identical cards merge into the first, every placement keeps its class and slot, and a placement with a missing card is refused | `tests/main/fileFormat.test.ts`, `tests/domain/integrity.test.ts` |
| DM-5 a block where the class splits into groups is one ordinary card | `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-5 files saved with periods per week still load, without them (dropped 2026-10-19) | `tests/domain/timetableFile.test.ts`, `tests/e2e/cards.spec.ts` |
| DM-5 a card shows room, subject, and teacher in its subject's colors, the same in the panel and on the grid | `tests/domain/cards.test.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-5 editing a card's teacher or room updates every placement of it, on every class | `tests/domain/cards.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts`, `tests/e2e/cardsPage.spec.ts` |
| DM-5 deleting a card asks first, naming its classes, and removes its placements from every grid | `tests/domain/cards.test.ts`, `tests/e2e/cards.spec.ts`, `tests/e2e/cardsPage.spec.ts` |
| DM-7 the "Periods per subject" panel shows each subject's placed periods and the total out of 50 | `tests/domain/placements.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/dragDrop.spec.ts` |
| DM-7 search by subject or teacher, ignoring accents ("toan" finds "Toán") | `tests/domain/text.test.ts`, `tests/domain/cardPanel.test.ts`, `tests/e2e/cardPanel.spec.ts` |
| DM-7 group by subject (one list in subject order) or by teacher (a sticky heading per teacher) | `tests/domain/cardPanel.test.ts`, `tests/e2e/cardPanel.spec.ts` |
| DM-7 the Cards page lists the whole pool (Subject · Teacher · Room · Classes), with class names in class-bar order or "Not placed", in subject, teacher, then room order | `tests/domain/cards.test.ts`, `tests/domain/cardPanel.test.ts`, `tests/e2e/cardsPage.spec.ts` |
| DM-7 the Cards page searches by subject, teacher, or class name, ignoring accents; Add card has no Class field and works with no classes; adding, editing, or deleting there updates the timetable screen | `tests/domain/cardPanel.test.ts`, `tests/e2e/cardsPage.spec.ts` |
| DM-7 the Cards page filters by grade (or Not placed) and by teacher (or No teacher), together with the search (2026-10-21) | `tests/domain/cardPanel.test.ts`, `tests/e2e/cardsPage.spec.ts` |
| Subject palette set from the subject name | `tests/domain/subjectColor.test.ts`, `tests/domain/sampleSchool.test.ts` |
| Header menu: one link per screen (the placeholders for unbuilt screens went at R3-3, once every screen was built) | `tests/e2e/smoke.spec.ts` |
| The layout holds still at 1280 × 720 and 1440 × 900; the page never scrolls, and the Cards table scrolls in its panel under a pinned header with its columns still | `tests/e2e/layout.spec.ts` |
| TB-7 a missing timetable next to a backup asks first, and the backup is never overwritten (R1-9) | `tests/main/store.test.ts`, `tests/e2e/reviewFixes.spec.ts` |
| TB-7 a file that doesn't hold together (ids, references, class names, slots) is refused on load and save (R1-9) | `tests/domain/integrity.test.ts`, `tests/main/store.test.ts` |
| TB-7 a rename is tried again while Windows reports the file busy (R1-9) | `tests/main/store.test.ts` |
| TB-7 a failed open shows a screen with Try again, never a blank window (R1-9) | `tests/e2e/reviewFixes.spec.ts` |
| TB-7 a file dropped on the window never replaces the app (R1-9) | `tests/e2e/reviewFixes.spec.ts` |
| The Grade and Group by controls work with the arrow keys (R1-9) | `tests/e2e/reviewFixes.spec.ts` |

## Release 2

Checked against the requirements at R2-6 (2026-10-23).

| Requirement | Test |
| --- | --- |
| DM-1 a teacher has a full name, short name, email, and home school; add, edit, and delete them on the Teachers page | `tests/domain/teachers.test.ts`, `tests/e2e/teachers.spec.ts` |
| DM-1 two teachers can't have the same short name (case doesn't count, accents do) | `tests/domain/teachers.test.ts`, `tests/e2e/teachers.spec.ts` |
| DM-1 clicking a teacher opens their detail screen with their details, periods, classes, and cards | `tests/domain/teachers.test.ts`, `tests/e2e/teachers.spec.ts` |
| DM-1 a teacher can have a phone number (release 4, R4-3): added, changed, and cleared on the teacher form, a bad one gets its message, shown on the detail screen, found by the Teachers page's search; a format 4 file opens unchanged | `tests/domain/teachers.test.ts`, `tests/main/fileFormat.test.ts`, `tests/e2e/teachers.spec.ts` |
| DM-1 a teacher's conditions are set on their detail screen | `tests/e2e/conditions.spec.ts` |
| DM-1 deleting a teacher with cards says how many and asks (naming the classes they stop being homeroom teacher or assistant homeroom teacher of, with focus on the keep button); the cards are left with no teacher and identical ones merge, keeping their placements | `tests/domain/teachers.test.ts`, `tests/e2e/teachers.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-1 the Teachers page shows each teacher's current errors (R2-4) | `tests/domain/issues.test.ts`, `tests/e2e/issues.spec.ts` |
| File format 3: older files open with every teacher and no conditions, and every grid the same | `tests/main/fileFormat.test.ts`, `tests/main/store.test.ts`, `tests/e2e/teachers.spec.ts` |
| File format 3: a condition with a repeated id, a missing subject, or a value out of range is refused on load | `tests/domain/integrity.test.ts` |
| TC-1 add, edit, and remove a teacher's conditions on their detail screen | `tests/domain/conditions.test.ts`, `tests/e2e/conditions.spec.ts` |
| TC-1 any number of conditions, several of one type (a subject limit for Toán and another for Tin học) | `tests/domain/conditions.test.ts`, `tests/domain/checks.test.ts`, `tests/e2e/conditions.spec.ts` |
| TC-1 a condition can be turned off without deleting it, and then gives no error until it's turned on | `tests/domain/conditions.test.ts`, `tests/domain/checks.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/conditions.spec.ts`, `tests/e2e/issues.spec.ts` |
| TC-1 pick a type from a dropdown, then fill in only its values (each of the eight types), with the allowed values and the field's message for one out of range | `tests/domain/conditions.test.ts`, `tests/e2e/conditions.spec.ts` |
| TC-1 a subject limit's subject is one the teacher has cards for: the Subject dropdown lists only those, an edited condition keeps its own subject, and adding or editing refuses any other (2026-10-23) | `tests/domain/teachers.test.ts`, `tests/domain/conditions.test.ts`, `tests/e2e/conditions.spec.ts` |
| TC-1 conditions are listed as plain sentences with an on/off switch, Edit, and Delete; Edit reopens the form filled in; Delete asks first | `tests/domain/conditions.test.ts`, `tests/e2e/conditions.spec.ts` |
| TC-1 a broken condition says where it isn't met ("Not met in 2 places") | `tests/domain/issues.test.ts`, `tests/e2e/issues.spec.ts` |
| TC-2 placing, moving, replacing, or removing a card, or changing a card's teacher or room (each on its own), runs every check again across all classes: a new problem shows at once and a fixed one goes | `tests/domain/sampleSchool.test.ts`, `tests/e2e/issues.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TC-2 the two halves of a block are different times: half cards sharing a block, in one class or across classes, aren't a clash | `tests/domain/checks.test.ts`, `tests/domain/sampleSchool.test.ts` |
| TC-2 period counts take a half block as 1 period | `tests/domain/checks.test.ts` |
| TC-2 errors, always on: a teacher in two places (by their entry in the teacher list; a teacher shared with THPT, or with both schools, is checked like any other); a room in use twice; a card with no teacher or room is left out | `tests/domain/checks.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |
| TC-2 errors, each teacher condition just at its limit (none) and one over (an error): subject limit a day and a week, unavailable times, days off, most periods per day and per week, most blocks in a row (lunch ends a run), most gaps per day (lunch isn't one), most teaching days | `tests/domain/checks.test.ts`, `tests/domain/sampleSchool.test.ts` |
| TC-2 warning: a subject twice in a day, both halves of one block counting once | `tests/domain/checks.test.ts`, `tests/domain/sampleSchool.test.ts` |
| TC-3 the Issues tab lists every current error and warning, errors first, each saying what's wrong and where | `tests/domain/checks.test.ts`, `tests/domain/issues.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/issues.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TC-3 errors in the `--danger` colors and warnings in the `--warning` colors | `tests/domain/issues.test.ts`, `tests/e2e/issues.spec.ts` |
| TC-3 the list opens on the class on screen and switches to all classes; with no class on screen it's all classes | `tests/e2e/issues.spec.ts` |
| TC-3 clicking an issue highlights its slots, scrolling the grid to bring them into view; in another class it offers "Show 7B1", which switches class keeping it selected; clicking again, Escape, or the Subjects tab clears it | `tests/e2e/issues.spec.ts` |
| TC-3 slots in an error or a warning are marked on the grid in the matching color, with the issues in the tooltip | `tests/domain/issues.test.ts`, `tests/e2e/issues.spec.ts` |
| TC-3 the panel counts errors and warnings, and filters by teacher and by check, together with the scope and severity; the choices stay through a tab, class, or screen switch | `tests/domain/issues.test.ts`, `tests/e2e/issues.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TC-3 each class tile shows its errors (red) and warnings (amber); the Issues pill and tab badge show the class's total | `tests/domain/issues.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/issues.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TC-3 nothing changes on the grid while a card is being dragged; a clash shows once it's dropped | `tests/e2e/issues.spec.ts` |
| TC-4 errors and warnings never stop a card being placed, moved, or edited | `tests/domain/sampleSchool.test.ts`, `tests/e2e/issues.spec.ts`, `tests/e2e/acceptance.spec.ts` |

## Release 3

Checked against the requirements at R3-4 (2026-10-27).

| Requirement | Test |
| --- | --- |
| DM-2 the Classes page lists every class in class-bar order with its grade, homeroom teacher, assistant homeroom teacher, periods placed out of 50, and errors | `tests/domain/classes.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/classes.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-2 the Classes page searches by class name or either teacher's short or full name, ignoring case and accents | `tests/domain/classes.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/classes.spec.ts` |
| DM-2 a class has a name, a homeroom teacher (required on the class form), and an optional assistant, both from the teacher list and never the same teacher; "New class" in the class bar asks only for the name, so the class has none | `tests/domain/classes.test.ts`, `tests/e2e/classes.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-2 a class whose homeroom teacher is deleted has none | `tests/domain/teachers.test.ts`, `tests/e2e/classes.spec.ts` |
| DM-2 "homeroom teacher" and "assistant homeroom teacher" everywhere, including the timetable screen's class line and the delete-teacher question | `tests/e2e/acceptance.spec.ts`, `tests/e2e/classes.spec.ts` |
| DM-2 grade and track are read from the name; a bad name or one another class has is refused with the rule's message | `tests/domain/className.test.ts`, `tests/domain/classes.test.ts`, `tests/e2e/classes.spec.ts` |
| DM-2 renaming a class keeps its grid, and a new grade moves it in the class bar | `tests/domain/classes.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/classes.spec.ts` |
| DM-2 deleting a class with placements says how many periods and asks first; its placements go, the cards stay, and the class leaves their classes; with nothing placed it only asks | `tests/domain/classes.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/classes.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-2 deleting the class on screen shows the first class by grade | `tests/domain/classes.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-3 the Rooms page lists every room with its cards and classes, and searches by room name ignoring case and accents | `tests/domain/rooms.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/rooms.spec.ts` |
| DM-3 two rooms can't have the same name (case doesn't count, accents do) | `tests/domain/rooms.test.ts`, `tests/e2e/rooms.spec.ts` |
| DM-3 renaming a room shows on every card and grid at once | `tests/domain/rooms.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/rooms.spec.ts` |
| DM-3 deleting a room with cards says how many cards and placements and asks; the cards are left with no room, identical ones merge keeping every placement | `tests/domain/rooms.test.ts`, `tests/domain/cards.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/rooms.spec.ts` |
| DM-3 a room with no cards is deleted after a plain confirmation | `tests/domain/rooms.test.ts`, `tests/e2e/rooms.spec.ts` |
| DM-4 the Subjects page lists every subject in subject order, in its colors, with its cards, and searches by name ignoring case and accents | `tests/domain/subjects.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/subjects.spec.ts` |
| DM-4 a subject's colors come from its name unless the form picks a palette or Custom background and text (the card form's "New subject…" takes the name's); the form previews them on a tag and a grid card; they show on panel and grid cards, tags, and the Subjects and Cards pages, and survive a restart (changed 2026-10-27, R3-5b) | `tests/domain/subjects.test.ts`, `tests/domain/subjectColor.test.ts`, `tests/main/fileFormat.test.ts`, `tests/e2e/subjects.spec.ts` |
| DM-4 two subjects can't have the same name (case doesn't count, accents do) | `tests/domain/subjects.test.ts`, `tests/e2e/subjects.spec.ts` |
| DM-4 renaming a subject shows the new name and colors on every card, grid, tag, condition sentence, and issue at once; colors from the name follow it, a picked palette or custom colors stay (R3-5b) | `tests/domain/subjects.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/subjects.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-4 deleting a subject that teachers' subject limits name (switched off or not) deletes those limits with it, and the question names the teachers (changed 2026-10-27, R3-5b) | `tests/domain/subjects.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/subjects.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| DM-4 deleting a subject with cards says how many cards and placements and which classes, and asks; the cards and placements go with it; with no cards it only asks | `tests/domain/subjects.test.ts`, `tests/domain/sampleSchool.test.ts`, `tests/e2e/subjects.spec.ts` |

## Release 1 criteria that waited for the checks

Tested at R2-6, now that the checks exist:

| Requirement | Test |
| --- | --- |
| TB-1 the class picker shows each class's errors and warnings | `tests/domain/sampleSchool.test.ts`, `tests/e2e/issues.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-4 a placement that breaks a condition is still allowed and adds an error or a warning; checks run across all classes | `tests/domain/sampleSchool.test.ts`, `tests/e2e/issues.spec.ts`, `tests/e2e/acceptance.spec.ts` |
| TB-5 moving and removing update the error and warning list right away | `tests/domain/sampleSchool.test.ts`, `tests/e2e/issues.spec.ts` |
| DM-5 editing a card's subject, teacher, or room runs the checks again | `tests/domain/sampleSchool.test.ts`, `tests/e2e/acceptance.spec.ts` |

## Release 4

Checked against the requirements at R4-7 (2026-10-29). IE-4 (the PDF export) was set aside on 2026-10-29, so it waits, below.

| Requirement | Test |
| --- | --- |
| PF-1 each profile is a whole timetable, saved in its own folder with its own backup: a change in one never shows in another, on screen or on disk, and a copy is a copy, not shared | `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-1 a profile whose file can't be read gets the damaged-file screen, which opens that profile's own backup or another profile, leaving the rest as they were | `tests/main/store.test.ts`, `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-1 the app reopens the profile last open, on the class last on screen in it; the first start makes an empty profile named "Timetable" | `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-1 another profile opens only once the open one's changes are saved | `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-1 the export's school, school year, and date are remembered per profile; a copy made before exporting starts from the defaults | `tests/main/store.test.ts`, `tests/e2e/export.spec.ts` |
| PF-2 the header names the open profile (a long name cut, the menu not moving), and clicking it opens the profile screen | `tests/e2e/profiles.spec.ts` |
| PF-2 the profile screen lists every profile with its name, classes, cards, and last change, the open one marked "Open now"; a profile that can't be read shows dashes | `tests/domain/profiles.test.ts`, `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-2 Open shows the profile's timetable, on the class last on screen in it, or the first class by grade when it remembers none or one that's gone | `tests/domain/appState.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-2 New profile asks for a name and starts an empty timetable; Duplicate copies everything but the backup under a new name | `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-2 Rename changes the name; two profiles can't share a name (case doesn't count, accents do) | `tests/domain/profiles.test.ts`, `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-2 Delete asks first, naming the profile and how many classes and cards go; the open profile and the last one can't be deleted | `tests/domain/profiles.test.ts`, `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| PF-3 a release 3 timetable becomes the profile "Timetable" unchanged, on the class that was on screen, and the file before is kept as `timetable.before-profiles.json`, even after a crash part way | `tests/main/profiles.test.ts`, `tests/e2e/profiles.spec.ts` |
| IE-2 the Export menu offers This class and All classes as Excel (the PDF items disabled until IE-4), with what there is nothing to export for disabled | `tests/e2e/export.spec.ts` |
| IE-2 This class writes that class's sheet; All classes a sheet per class in class-bar order, each named after its class, then `TKB tổng hợp` and `Data ` | `tests/domain/exportDetails.test.ts`, `tests/main/exportExcel.test.ts`, `tests/e2e/export.spec.ts` |
| IE-2 each class sheet copies the sample's: bilingual title rows, school, class, the homeroom teacher's full name, phone, and email, Monday to Friday, the blocks with their times and the fixed rows between them, merges, borders, fonts, widths, and a one-page print setup (matched cell by cell with `fixtures/expectedWorkbook.ts`) | `tests/domain/exportSheets.test.ts`, `tests/main/exportExcel.test.ts` |
| IE-2 the class sheets' subject cells and header are formulas into `TKB tổng hợp` and `Data `, so changing a subject or a phone there changes the class sheet once recalculated, and recalculating gives the cached results (in LibreOffice, skipped where it isn't installed) | `tests/main/exportExcel.test.ts` |
| IE-2 `TKB tổng hợp` is laid out as the sample's `HK1` for the exported classes, a subject row and a teacher row per block, the teachers' short names as values | `tests/domain/exportSheets.test.ts`, `tests/main/exportExcel.test.ts` |
| IE-2 `Data ` has a row per exported class with its homeroom teacher and assistant: full names, phones, and emails | `tests/domain/exportSheets.test.ts`, `tests/main/exportExcel.test.ts`, `tests/domain/reviewSchool.test.ts` |
| IE-2 two halves are one cell joined with " + ", subject and teacher alike; one half alone shows its half; an empty block is an empty cell | `tests/domain/exportSheets.test.ts`, `tests/main/exportExcel.test.ts` |
| IE-2 names are written as typed and labels keep the sample's bilingual wording | `tests/domain/exportSheets.test.ts`, `tests/main/exportExcel.test.ts` |
| IE-2 the school, school year, and applies-from date are asked for and checked, starting from the profile's last export (or the defaults) | `tests/domain/exportDetails.test.ts`, `tests/main/store.test.ts`, `tests/e2e/export.spec.ts` |
| IE-2 the save dialog suggests "TKB 6A1.xlsx" or "TKB all classes.xlsx" in the folder used last; a cancelled save writes nothing, a failed one says why and Try again writes to the same place, and the saved notice has Show in folder; exporting changes nothing in the timetable | `tests/domain/exportSheets.test.ts`, `tests/main/exportTimetable.test.ts`, `tests/e2e/export.spec.ts` |
| IE-2 the file opens without repair and shows every value before anything recalculates, empty slots empty (in LibreOffice, skipped where it isn't installed; Excel waits for the Windows test, F-1) | `tests/main/exportExcel.test.ts` |
| DM-1 a teacher has an optional phone (8 to 15 digits, tidied as typed), on the teacher form after Email, on the detail line, and found by the Teachers page's search with or without its spaces | `tests/domain/teachers.test.ts`, `tests/main/fileFormat.test.ts`, `tests/e2e/teachers.spec.ts`, `tests/e2e/profiles.spec.ts` |
| DM-1 the homeroom teacher's phone is in the exported class sheet's header, and both teachers' phones are in `Data ` (DM-2's contact details, waiting since release 3) | `tests/domain/exportSheets.test.ts`, `tests/main/exportExcel.test.ts`, `tests/e2e/export.spec.ts` |
| TC-4 exporting with errors or warnings says how many (the class's, or the whole timetable's) and the button reads Export anyway; with none it just says Export | `tests/domain/exportDetails.test.ts`, `tests/e2e/export.spec.ts` |

## Release 5

DM-8 (the grade list, approved 2026-11-02), checked at R5-1b's review fixes on 2026-11-09.

| Criterion | Tests |
|---|---|
| DM-8 a grade is a number from 1 to 12, shown as "Grade 10", with no repeats, in number order on the class bar's tabs, the Grades list, and the Cards page's Grade filter (Grade 9 before Grade 10) | `tests/domain/grades.test.ts`, `tests/domain/integrity.test.ts`, `tests/domain/cardPanel.test.ts`, `tests/e2e/grades.spec.ts`, `tests/e2e/cardsPage.spec.ts` |
| DM-8 a class name's grade comes from DM-2's rule for 1 to 12, and a grade not on the list is refused ("There's no Grade 6 yet. …"); the forms' hint names the listed grades | `tests/domain/className.test.ts`, `tests/domain/classes.test.ts`, `tests/e2e/grades.spec.ts` |
| DM-8 the Classes page's Grades button lists the grades with their class counts, Edit, Delete, and Add grade; Add class waits for a grade | `tests/domain/grades.test.ts`, `tests/e2e/grades.spec.ts` |
| DM-8 editing a grade renames its classes to match (6A1 becomes 11A1), keeping their ids and grids; a number another grade has is refused | `tests/domain/grades.test.ts`, `tests/e2e/grades.spec.ts` |
| DM-8 deleting a grade asks first, naming its classes and placed periods, and takes them, keeping the cards; one with no classes gets a plain question; the class on screen moves to the first class by grade | `tests/domain/grades.test.ts`, `tests/e2e/grades.spec.ts` |
| DM-8 a new timetable has no grades: the class bar says so, with Add grades to the Classes page and no New class tile, at the same height | `tests/e2e/grades.spec.ts`, `tests/e2e/profiles.spec.ts` |
| DM-8 many grades keep the class bar still: twelve tabs never shrink, the tiles scroll sideways, and the bar keeps its height | `tests/e2e/layout.spec.ts` |
| DM-8 a version 5 file opens with the grades its classes use (none with no classes) and saves as version 6 | `tests/main/fileFormat.test.ts`, `tests/e2e/grades.spec.ts` |
| DM-8 exporting is unchanged | `tests/main/exportExcel.test.ts` |
| DM-8 an imported workbook adds the grades its classes need, in order | `tests/domain/importTimetable.test.ts` |

IE-1, IE-3, and IE-2's change, checked against the requirements at R5-6 (2026-11-12).

| Criterion | Tests |
|---|---|
| IE-1 the profile screen's Import asks for an `.xlsx` with the system's open dialog and opens the Import screen; a cancel stays put, and an `.xls` or a file that can't be read says why | `tests/main/importExcel.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 each cell is read as Excel shows it (a formula's saved value, numbers, dates, merged ranges, hidden sheets), so `HK1`'s `HLOOKUP` teacher rows read as their values | `tests/main/importExcel.test.ts`, `tests/domain/importTimetable.test.ts` |
| IE-1 the app suggests a sheet for each kind (`ID GV 1S` or `Giáo viên`, `Data `, `Phan cong`, `HK1` or `TKB tổng hợp`, then by layout), and each can be changed or left out (the timetable can't) | `tests/domain/importWorkbook.test.ts`, `tests/main/importExcel.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 a list sheet's header row and its columns are suggested by header beside the example's fields, with their first values, and each can be changed or set to Not imported; a required one left out is asked for | `tests/domain/importWorkbook.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 a card's teacher comes from the row under each subject or from the teaching assignments sheet's class and subject, the second only with that sheet chosen | `tests/domain/importTimetable.test.ts`, `tests/domain/importWorkbook.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 the choices aren't remembered: another file, or the same one chosen again, starts from the suggestions | `tests/e2e/import.spec.ts` |
| IE-1 Test changes nothing and lists every problem by sheet and cell, in order: a teacher not in the teachers sheet, a class name that breaks the rule, a subject with no teacher in `Phan cong`, a repeated short name or class, an empty required field or column, a missing or repeated block; more than 200 are counted | `tests/domain/importTimetable.test.ts`, `tests/domain/importWorkbook.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 before Import the app shows how many classes, teachers, subjects, cards, and placements it found (and what's replaced and updated, into the open profile); Import waits for Test on the current choices and stays disabled when nothing comes in. Rooms wait, below | `tests/domain/importTimetable.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 `SH lớp-GDPC` is two half-block cards, `Sinh hoạt lớp` then `Giáo dục phẩm chất`; " + " joins two halves, and a half alone reads as its half | `tests/domain/exportSheets.test.ts`, `tests/domain/importTimetable.test.ts` |
| IE-1 only teachers used on the timetable or as homeroom teacher or assistant come in, and the rest are counted as not used; a 9-digit phone gets its 0 back, and a bad email or phone is left out | `tests/domain/importTimetable.test.ts` |
| IE-1 imported cards have no room, and `Phan cong`'s room column is ignored | `tests/domain/importTimetable.test.ts` |
| IE-1 into a new profile, the profile is made with the import and opened, the profile it came from unchanged, and a notice says what came in; a name taken meanwhile is refused | `tests/main/profiles.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 into the open profile, the app asks first, keeps `timetable.before-import-<time>.json` in the profile's folder, then each class in the workbook gets its grid and the others keep theirs; teachers, classes, and subjects already there are updated from the cells with a value, keeping conditions, subject colors, and a card's room; nothing is deleted | `tests/domain/importTimetable.test.ts`, `tests/domain/appState.test.ts`, `tests/main/profiles.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 when the save or the copy fails, or the Import screen is left part way, nothing is imported and the app says why | `tests/main/profiles.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 importing doesn't change the workbook | `tests/e2e/import.spec.ts` |
| IE-2 the export writes a `Giáo viên` sheet after `Data `, a numbered row per teacher the exported classes use (placed on their cards, or as homeroom teacher or assistant) in teacher-list order, with one header per column | `tests/domain/exportSheets.test.ts`, `tests/main/exportExcel.test.ts`, `tests/e2e/export.spec.ts` |
| IE-1 Download example, on the Import screen, suggests `TKB example.xlsx`, writes the made-up sample school as All classes, keeps the profile's timetable and export details as they were, and a failed save can be tried again | `tests/main/exportTimetable.test.ts`, `tests/e2e/import.spec.ts` |
| IE-1 the example opens in LibreOffice and shows every value (skipped where it isn't installed; Excel waits for the Windows test, F-1) | `tests/main/exportExcel.test.ts` |
| IE-3 exporting, then importing, gives the same classes, homeroom teachers, used teachers with their details, subjects, cards (with no room), and placements, and exporting that gives the same workbook | `tests/main/roundTrip.test.ts` |
| IE-3 teachers who share a name are told apart by the classes sheet's email, then phone; with neither fitting, the first is used and a problem says so; two homeroom teachers with one full name survive a round trip | `tests/domain/importTimetable.test.ts`, `tests/domain/importWorkbook.test.ts`, `tests/main/roundTrip.test.ts` |
| IE-3 a workbook in the school's layout, imported, then exported, gives the sample school's class sheets | `tests/main/roundTrip.test.ts` |

## Waiting for a later release

- IE-1's count of rooms before Import: IE-1 asks for it, but imported cards have no room (decided 2026-11-02) and the approved design's summary (§12.4) has no rooms, so the Found panel doesn't list them. Waiting for the user to choose between dropping rooms from IE-1 and showing "Rooms 0" (the roadmap's Open items, found at R5-6).
- IE-4 (the PDF export): set aside on 2026-10-29 at the user's request, with R4-6. Its tests (`tests/main/exportPdf.test.ts`, and the PDF items in `tests/e2e/export.spec.ts`) come with it; until then the e2e test checks the two PDF items are disabled.

Tests use only made-up data from `fixtures/`. Never use names, emails, or phone numbers from the real workbook.
