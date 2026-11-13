# DM: Manage teachers, classes, rooms, subjects, and subject cards

**Status:** DM-5 and DM-7 approved for release 1 on 2026-10-15, then changed on 2026-10-21 to make cards one pool (approved 2026-10-21). DM-1 moved to release 2 on 2026-10-22, with the teacher conditions, and was approved the same day (including the proposal that a deleted teacher's cards are left with no teacher and merged when identical). DM-2 to DM-4 redrafted for release 3 and approved by the user on 2026-10-26 (R3-0), with the proposals for both open questions; DM-6 dropped the same day at the user's request. Changed the same day at the user's request, reviewing the design: the Classes page has no Track column, form teacher and co-teacher are called homeroom teacher and assistant homeroom teacher, the Subjects page has no Classes column, and each of the three pages has a search. On 2026-10-27, at R3-5, the user asked for two DM-4 changes: subject colors can be picked (a palette or custom colors), and deleting a subject deletes the subject limits that name it instead of being refused. The user approved both the same day (R3-5b's gate). On 2026-11-02 the user asked for grades to be added, edited, and deleted (DM-8, drafted and approved the same day).

## Goal

You can keep the teacher list, the class list, the room list, the subject list, and the pool of subject cards up to date, each on its own, without touching the timetable grid.

## User stories and acceptance criteria

**DM-1. Teacher list.** As the coordinator, I can add, edit, and delete teachers. The Teachers page lists them, and clicking a teacher opens a detail screen with their details and their conditions ([TC-1](03-teacher-conditions.md)). Brought forward to release 2 on 2026-10-22, since teacher conditions are edited there.
- A teacher has a full name, a short name, an email, and a home school (THCS, THPT, or both), as in `ID GV 1S`.
- Release 4 adds an optional phone number, shown on the teacher's detail screen and in an exported class sheet's header for the homeroom teacher ([IE-2](04-import-export.md); approved on 2026-10-28 with release 4's criteria).
- Two teachers can't have the same short name.
- A teacher's conditions are set on their detail screen (see [TC](03-teacher-conditions.md)).
- If a teacher still has subject cards, deleting them shows how many cards are affected and asks before going ahead. Those cards are then left with no teacher, as rooms are in DM-3; a card that ends up the same as another (same subject, no teacher, same room) is merged into it, keeping both cards' placements (proposed 2026-10-22).

**DM-2. Class list.** As the coordinator, I can add, edit, and delete classes on a Classes page, as well as add them from the class bar's "New class" as now. (Redrafted for release 3 on 2026-10-26.)
- The Classes page lists every class in class-bar order (by grade, then track, then section), with its grade, homeroom teacher, assistant homeroom teacher, and periods placed out of 50. (The Track column was dropped on 2026-10-26 at the user's request; the track still comes from the name.)
- The Classes page can be searched by class name or by either teacher's short or full name, ignoring case and accents, as the Teachers page is (added 2026-10-26 at the user's request).
- A class has a name, a homeroom teacher, and an assistant homeroom teacher, as in the `Data ` sheet's `Lớp`, `GVCN/Form Teacher`, and `PCN/Co-teacher` columns (GVCN is giáo viên chủ nhiệm, PCN phó chủ nhiệm). Both are picked from the teacher list. The homeroom teacher is required on the class form, and the assistant homeroom teacher is optional (decided 2026-10-26 at the user's request). A class added from the class bar's "New class", which asks only for a name, or whose homeroom teacher is deleted, has none until it's edited. One teacher can't be both for the same class.
- The app calls them the homeroom teacher and the assistant homeroom teacher everywhere, including the timetable screen's class line and the question when a teacher is deleted (renamed on 2026-10-26 at the user's request; the workbook's English labels are Form Teacher and Co-teacher).
- The grade and track are read from the name (`8CE1` is grade 8, track `CE`), by the class-name rule "New class" uses today. A name that doesn't fit the pattern, or that another class already has, is refused with the rule's message.
- Renaming a class keeps its grid as it is. If the new name has another grade, the class moves to that grade in the class bar.
- Deleting a class that has anything on its grid says how many periods are placed and asks first. Its placements go with it; the cards stay in the pool, and the class is taken off each card's classes. With nothing placed, it only asks to confirm.
- If the deleted class was on screen, the timetable screen shows the first class by grade, as it does when the app opens.
- The teachers' phone numbers and emails beside the homeroom teacher and assistant homeroom teacher in `Data ` come with export in release 4 (decided 2026-10-26), from DM-1's phone number.

**DM-3. Room list.** As the coordinator, I can add, edit, and delete rooms on a Rooms page, as well as add them from the card form's "New room…" as now. (Redrafted for release 3 on 2026-10-26.)
- The Rooms page lists every room with how many cards use it and the classes it's used in. It can be searched by room name, ignoring case and accents (added 2026-10-26 at the user's request).
- A room has a name, such as `Phòng học dự phòng 1C` (as rooms are written in `Phan cong`). Two rooms can't have the same name; case doesn't count, accents do, as for teachers' short names.
- Renaming a room shows on every card that uses it, on every grid, at once.
- Deleting a room that cards use says how many cards and how many placements, and asks first. Those cards are then left with no room. A card that ends up the same as another card (same subject, same teacher, no room) is merged into it, keeping both cards' places on the grid, as when a teacher is deleted (DM-1).
- A room with no cards is deleted after a plain confirmation.

**DM-4. Subject list.** As the coordinator, I can add, edit, and delete subjects on a Subjects page, as well as add them from the card form's "New subject…" as now. (Redrafted for release 3 on 2026-10-26.)
- The Subjects page lists every subject in subject order (the order the Subjects panel and "Periods per subject" use), each in its colors, with how many cards use it. It can be searched by subject name, ignoring case and accents (added 2026-10-26 at the user's request).
- A subject has a name, such as `Toán`, as in `PPTL_XẾP TKB 26.27`'s `MÔN HỌC` column. Two subjects can't have the same name; case doesn't count, accents do, as for teachers' short names.
- **Changed 2026-10-27 at the user's request, approved the same day** (replaces "Its colors come from its name … and can't be picked by hand"): a subject's colors come from its name, from the 15 palettes in `TIMETABLE_SCREEN_LAYOUT.md`, unless the subject form picks them. The form offers From the name, any of the 15 palettes, or Custom, which sets the background and the text color by hand. Adding a subject from the card form's "New subject…" still takes the name's colors. The subject form previews the chosen colors as they change, on the subject's tag and on a card as it looks on the grid. The chosen colors show everywhere the subject's colors show: cards in the panel and on the grid, tags, and the Subjects and Cards pages.
- Renaming a subject shows the new name on every card, every grid, every tag, and every condition sentence at once. A subject whose colors come from its name takes the new name's colors; a picked palette or custom colors stay as they are (2026-10-27, at the user's request; approved the same day).
- **Changed 2026-10-27 at the user's request, approved the same day** (replaces "A subject that a teacher's subject limit names can't be deleted", decided 2026-10-26): deleting a subject that teachers' subject limits name, switched on or off, deletes those conditions with it, and the question before the delete names the teachers whose conditions go.
- Deleting a subject that cards use says how many cards, how many placements, and which classes, and asks first. The cards and their placements are deleted with it. A subject with no cards is deleted after a plain confirmation.
- Default periods per week were dropped on 2026-10-19 at the user's request.

**DM-5. Subject cards.** As the coordinator, I keep one pool of subject cards for the whole school, and any card can go on any class's grid. (Changed on 2026-10-21 at the user's request: cards are one pool for the whole school instead of belonging to a class. Approved the same day.)
- A card is one subject taught by one teacher in one room, such as "Toán · Thầy Phúc · P101". It doesn't belong to a class.
- A card has a subject, a teacher, and a room, picked from dropdowns of their lists. The teacher and room can be left empty.
- Two cards can't have the same subject, teacher, and room. Changing any of the three makes a different card, so Thầy Phúc's Toán in P101 and his Toán in P102 are two cards.
- A card's classes are the classes whose grid it's on. Dropping it on a class's grid adds that class, and taking its last placement off that class's grid removes the class (see [TB-4](02-timetable-builder.md) and [TB-5](02-timetable-builder.md)). The classes are never typed in by hand.
- A class can have several cards of the same subject on its grid, such as Toán with Thầy Phúc and Toán with Thầy Quân. (Settled with the user on 2026-10-21. Until then a class had at most one card per subject.)
- A block where the class splits into groups, such as `Toán phân hoá/ Ngoại ngữ 2`, is one ordinary card. Its subject name is just a name the coordinator chooses, and the app doesn't read anything into it. The card has one teacher and one room like any other, and the checks only see those. The coordinator sorts out the second group's teacher and room.
- Periods per week on a card were dropped on 2026-10-19 at the user's request, until it's clear the end product needs them. A card can be placed any number of times, in any number of classes. Placed periods are still counted per class: 2 for a full block and 1 for a half (see [TB-4](02-timetable-builder.md)).
- Each card shows its room, subject name, and teacher name, in its subject's color, the same way in the card list and on the grid.
- Editing a card's subject, teacher, or room changes it on every grid it's on, in every class, and the checks run again.
- If a card is on any grid, deleting it removes it from every grid, after asking. The question names the classes it's on.
- Timetables saved before this change still load. Cards that had the same subject, teacher, and room in different classes become one card, and every placement stays where it was.

**DM-6. Weekly totals.** Dropped on 2026-10-26 at the user's request, at R3-0. It needed periods per week per subject (in `PPTL_XẾP TKB 26.27` they depend on the grade, the program, and the half-term), which were dropped from cards and subjects on 2026-10-19. The "Periods per subject" panel keeps showing each subject's placed periods and the class's total out of 50 (DM-7).

**DM-7. Card list view.** As the coordinator, I can see the card pool beside the grid, search it by subject or teacher (ignoring accents, so "toan" finds "Toán"), and group it by subject or by teacher. Cards don't show counts. Instead, the "Periods per subject" panel under the grid shows how many periods of each subject are placed in the class on screen, plus the class's total out of 50. (Changed on 2026-10-16 to follow [TIMETABLE_SCREEN_LAYOUT.md](../design/TIMETABLE_SCREEN_LAYOUT.md), and on 2026-10-21 to show the whole pool instead of one class's cards.)
- The Cards page lists the whole pool in one table: Subject, Teacher, Room, Classes, then Edit and Delete. The Classes column lists the classes the card is on, in class-bar order, or says "Not placed". Rows come in subject order, then by teacher. The table can be searched by subject, teacher, or class, ignoring accents. Cards can be added (subject, teacher, and room only), edited, and deleted there, and the timetable screen shows the change. (Added on 2026-10-20 at the user's request. Changed on 2026-10-21 at the user's request: cards are one pool for the whole school instead of belonging to a class, approved the same day. The Class column moved from the start to just before Edit and Delete.)
- The Cards page can be filtered by grade (cards placed in any class of that grade, or "Not placed" for cards on no grid) and by teacher (or "No teacher"). The filters and the search work together. (Added on 2026-10-21 at the user's request.)

**DM-8. Grade list.** As the coordinator, I can add, edit, and delete grades, instead of the class bar always showing Grade 6 to Grade 9. (Asked 2026-11-02; the four choices below are the user's answers that day, and the rest were proposals. Approved by the user on 2026-11-02.)
- A grade is a number from 1 to 12, shown as "Grade 10". Two grades can't have the same number. Grades are always in number order: on the class bar's tabs, on the Classes page, and in the Cards page's Grade filter. (User's choice: a number.)
- A class still gets its grade from its name, by DM-2's class-name rule: the grade's number, a track (`A`, `AA`, `CE`, `B`, `BA`, unchanged), and a section, as in `10A1`. A name whose grade isn't in the grade list is refused: "There's no Grade 10 yet. Add it with Grades on the Classes page." (proposal).
- Grades are managed on the Classes page: its Grades button opens a list of the grades, each with how many classes it has, Edit, and Delete, and Add grade. (User's choice: on the Classes page.)
- Editing a grade changes its number and renames its classes to match (`6A1` becomes `10A1`), keeping their grids, homeroom teachers, and everything else. The new number can't be one another grade has (proposal).
- Deleting a grade that has classes asks first, saying how many classes and how many placed periods go. Its classes and their placements are deleted with it; the cards stay in the pool, as when one class is deleted (DM-2). A grade with no classes is deleted after a plain confirmation. If the class on screen was in it, the timetable screen shows the first class by grade. (User's choice: delete its classes too.)
- A new, empty timetable starts with no grades. The class bar then says there are no grades yet, with a button to the Classes page, and has no New class tile until a grade exists. (User's choice: no grades.)
- A timetable saved before this change opens with the grades its classes use, so one with no classes opens with none (proposal).
- Importing a workbook (IE-1, release 5) adds the grades its classes need (proposal).
- Exporting is unchanged, since class names carry their grade.

## Open questions

None for now.

Settled on 2026-10-26: weekly totals (DM-6) dropped; a subject named by a subject limit can't be deleted; teachers' phone numbers wait for release 4's export; subjects keep the order they were added, with no reordering in release 3; and, at first, no search on the Classes, Rooms, and Subjects pages. Reviewing the design the same day, the user asked for a search on each page, no Track column on the Classes page, no Classes column on the Subjects page, and the names homeroom teacher and assistant homeroom teacher in place of form teacher and co-teacher, with the homeroom teacher required on the class form and the assistant optional. Changed on 2026-10-27 at the user's request (approved the same day): a subject named by a subject limit is deleted with those limits, and subject colors can be picked.
