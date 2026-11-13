# IE: Import and export the timetable

**Status:** Redrafted at R4-0 on 2026-10-28 from the user's answers (marked with that date). The user split the work in two: release 4 exports (IE-2, IE-4) and adds profiles ([PF](05-profiles.md)); release 5 imports (IE-1, IE-3). The user approved IE-2 and IE-4 for release 4 on 2026-10-28, including the points marked "proposed". IE-1 and IE-3 stay a draft for release 5. At R5-0, on 2026-11-02, the user answered the open questions (marked with that date) and approved IE-1 and IE-3 the same day, including Download example and the reading of where a card's teacher comes from.

## Goal

You can export the timetable to a workbook that looks like the school's own (`TKB_THCS_from 3.9.2026.xlsx`), or to PDF, for one class or for all of them. Later, you can import a workbook in that format into a profile, choosing which sheet holds which data and seeing every problem before anything changes.

## What the sample workbook holds

Found at R4-0 by reading the sample's sheets (no data copied):

- Each class sheet (`6A1` … `9BA1`) shows one subject per block, with no teacher. Its subject cells are formulas into `HK1` (`='HK1'!F5`), and its header's homeroom teacher name, phone, and email are `VLOOKUP`s into `Data `.
- `HK1` holds one subject per block per class, then a teacher row whose cell is an `HLOOKUP` of the class and subject into `Phan cong`. There are no half blocks: the one block made of two halves is written as the subject `SH lớp-GDPC/ Class meeting`.
- `Phan cong` has one teacher per class and subject, so it can't say that one class has Toán with two different teachers. The app can (two cards).
- Rooms aren't in the timetable sheets. `Phan cong` only has a column of rooms for one group of subjects.
- `PPTL_XẾP TKB 26.27` names subjects its own way (`TOÁN`, `KHTN - LÝ`), not as `HK1` does (`Toán Bộ giáo dục/ Maths`).
- `TKB 1S` is a flat sheet for another system: one row per day and block, and per class the subject and the teacher's email.

## User stories and acceptance criteria

### Release 4

**IE-2. Export to Excel.** As the coordinator, I can export the timetable of the profile I have open to an `.xlsx` file, for the class on screen or for all classes.
- The Export menu offers **This class** and **All classes**, each as Excel or PDF ([IE-4](#ie-4)). Print isn't offered: you print from Excel or the PDF (decided 2026-10-28).
- **This class** writes a workbook with that class's sheet. **All classes** writes one sheet per class, in class-bar order, as the sample does (decided 2026-10-28). Each sheet is named after its class.
- Each class sheet copies the sample's class sheet: the bilingual title rows, the school, the class, and the homeroom teacher's full name, phone, and email in the header; Monday to Friday across; the five blocks with their times, and the breakfast, assembly, break, lunch, snack, and finish rows between them; the same merged cells, borders, fonts, column widths, and print setup, so it prints on one page as the sample does.
- The sheets hold formulas as the sample does (decided 2026-10-28): the export also writes a sheet with every exported class's grid, laid out like the sample's `HK1`, and `Data `, and each class sheet's subject cells and header read from them. Changing a subject in the grid sheet in Excel changes the class sheet.
- The grid sheet is called `TKB tổng hợp` ("combined timetable"), not `HK1`, which reads like a term's or a profile's name (the user's request on 2026-10-28).
- `TKB tổng hợp` is laid out as `HK1` is in the sample, for the exported classes: a subject row and a teacher row per block, by day. Its teacher rows hold each card's teacher short name as a value, not an `HLOOKUP` into `Phan cong`, because the app can give one class a subject with two teachers, which `Phan cong` can't hold (proposed 2026-10-28). `Phan cong` and `ID GV 1S` aren't written. Changed with release 5's design (approved by the user on 2026-11-02): the export also writes a `Giáo viên` sheet after `Data `, a row per teacher the exported classes use (on their cards, or as homeroom teacher or assistant), with full name, short name, phone, email, home school, and the school they also teach at, laid out like `ID GV 1S` with one header per column, so importing an export joins teachers (IE-3).
- `Data ` has a row per exported class with its homeroom teacher and assistant homeroom teacher: full names, phones, and emails ([DM-1](01-data-management.md)'s phone).
- A block with two half cards is written as one cell, the two subjects joined with " + " (`Sinh hoạt lớp + Giáo dục phẩm chất`), and its teacher cell the same way (decided 2026-10-28). A block with only one half filled shows that subject with the half, as in `Toán (first half)` (proposed 2026-10-28). An empty block is an empty cell.
- The title's school year and "applies from" date, and the school's name, are asked for when you export, filled in with the last ones used for this profile (proposed 2026-10-28). The app has no school year of its own (NF-5).
- Subject, teacher, and class names are written as they're typed in the app. Labels keep the sample's bilingual wording (NF-2).
- If the timetable has errors or warnings, the export says how many and asks you to confirm, then still lets you export ([TC-4](03-teacher-conditions.md)). (Unplaced periods aren't counted: periods per week were dropped on 2026-10-19.)
- The file is saved where you choose with the computer's own save dialog, with a suggested name such as `TKB 6A1.xlsx` or `TKB all classes.xlsx` (proposed 2026-10-28). Nothing in the app changes.
- The exported file opens in Excel and LibreOffice without asking to repair it, showing every value before anything is recalculated.

<a id="ie-4"></a>
**IE-4. Export to PDF.** As the coordinator, I can export the class on screen or all classes to a PDF (added 2026-10-28 at the user's request). Set aside on 2026-10-29 at the user's request: the PDF export (R4-6) is skipped for now, and the Export menu shows its PDF items disabled.
- Each class is one page, laid out like its Excel class sheet (IE-2), with the same title, header, and grid.
- **All classes** makes one PDF with a page per class, in class-bar order.
- The same questions as IE-2 come first (school year and dates, then errors and warnings), and the same kind of save dialog, with a name such as `TKB 6A1.pdf`.

### Release 5

**IE-1. Import.** As the coordinator, I can import an `.xlsx` workbook into the profile I have open or into a new profile, from the profile screen ([PF](05-profiles.md)) (decided 2026-10-28). The import works like Odoo's (the user's request on 2026-10-28):
- The import screen offers **Download example**: a made-up workbook (the sample school, no real data) laid out the way the import reads, a sheet for each kind of data with its columns named, that you can save and look at, fill in, or compare with your own file (the user's request on 2026-11-02, as Odoo offers an import template).
- After you choose the file, the app reads its sheets and suggests which of them matches each of the example's sheets: teachers (`ID GV 1S`), classes and their homeroom teachers (`Data `), teaching assignments (`Phan cong`), and the timetable (`HK1`, or `TKB tổng hợp` in the app's own exports). You can change each choice, or leave a kind out.
- For each list-like sheet, the app shows its columns beside the example's fields (short name, full name, email, phone, home school; class, homeroom teacher, assistant), suggests a match by header, and you can change each one.
- Each placed card's teacher comes from where you match it: the teacher row under each subject in the timetable sheet (as in `HK1`, whose teacher cells keep their values, and in the app's own exports), or the teaching assignments sheet's teacher for that class and subject (as `HK1`'s formulas look it up). The example uses the teacher row, which allows two teachers for one subject in a class (the user's answer on 2026-11-02, this reading approved the same day).
- The choices aren't remembered: each import starts from the app's suggestions (decided 2026-11-02).
- **Test** checks everything without changing anything, and lists each problem with its sheet and cell: a teacher short name with no match in the teachers' sheet, a class name that breaks the class-name rule, a subject in the timetable sheet with no teacher in `Phan cong`, a duplicate, an empty required field.
- Before **Import**, the app shows what it found: how many teachers, classes, subjects, rooms, cards, and placements, and the problems Test listed.
- `SH lớp-GDPC` is split into two half-block cards, `Sinh hoạt lớp` in the first half and `Giáo dục phẩm chất` in the second (decided 2026-10-28).
- Only teachers named on the timetable sheet or as a homeroom teacher or assistant are imported; the summary counts the rest of the teachers' sheet as left out (decided 2026-11-02). The sample's `ID GV 1S` lists 103 teachers, some teaching only at the high school.
- Rooms aren't in the timetable sheets, so imported cards have no room; `Phan cong`'s room column is ignored (decided 2026-11-02).
- Importing into the open profile, a teacher (by short name), class, subject, or room already there is updated from the workbook: full name, email, phone, homeroom teacher, and assistant. Teacher conditions and subject colors stay as they are, since the workbook doesn't hold them (decided 2026-11-02).
- Importing into the open profile, each class in the workbook gets the workbook's grid in place of its own; classes not in the workbook keep theirs (decided 2026-11-02).
- Importing doesn't change the file.

**IE-3. Round trip.** Exporting a profile and importing the export into a new profile gives the same classes, homeroom teachers, teachers, subjects, cards, and placements. Importing the made-up copy of the sample and exporting it again gives the same class sheets.

## Not now

- `TKB 1S` (decided 2026-10-28, after seeing what it holds). It can come later if the school's other system needs it from the app.
- `TK TIẾT GV` and the other sheets.
- Clubs (`DS CLB phê duyệt`) and rotating subjects (`CT học các môn`): the app has nowhere to keep them (decided 2026-11-02).
- Periods per week from `PPTL_XẾP TKB 26.27`: cards have had none since 2026-10-19, and its subject names don't match `HK1`'s (decided 2026-11-02).
- Print from the app.

## Open questions

Answered by the user at R5-0 on 2026-11-02 (written into IE-1 and Not now above):

1. **Importing into the open profile:** a teacher, class, subject, or room already there is updated from the workbook, keeping teacher conditions and subject colors; each imported class's grid replaces its own, and other classes keep theirs.
2. **Other inputs:** clubs and rotating subjects are out of scope.
3. **Periods per week:** the import doesn't read `PPTL_XẾP TKB 26.27`.
4. **Remembered mappings:** no; each import starts from the app's suggestions.
5. **Where a card's teacher comes from:** the user asked for a downloadable example to match the file against. Proposed reading: you match the teacher to the timetable sheet's teacher row or to the teaching assignments sheet, and the example uses the teacher row. Approved 2026-11-02.
6. **Which teachers:** only those used on the grid or as homeroom teachers.
7. **Rooms:** imported cards have no room.
