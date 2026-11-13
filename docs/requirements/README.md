# TimeTableMaker requirements

**Status:** Release 1 (TB-1 to TB-7, DM-5, DM-7, NF-1 to NF-5) approved on 2026-10-15. TB-6 (undo) was removed on 2026-10-16. Release 2 (TC-1 to TC-4, DM-1) approved on 2026-10-22 and released as 2.0.0 on 2026-10-26. Release 3 (DM-2 to DM-4) approved on 2026-10-26; DM-6 dropped the same day. Release 3 was released as 3.0.0 on 2026-10-28. At R4-0 (2026-10-28) the user split import and export: release 4 is profiles (PF-1 to PF-3), Excel and PDF export (IE-2, IE-4), and a teacher phone number (DM-1), approved on 2026-10-28; release 5 is the import (IE-1, IE-3), approved on 2026-11-02. Release 4 was released as 4.0.0 on 2026-11-02, without the PDF export (IE-4, set aside on 2026-10-29).

## Vision

A desktop app where the timetable coordinator builds the school timetable one class at a time, by dragging subject cards onto a blank grid. As each card is placed, the app checks every teacher's conditions. Anything that breaks one shows up as an error in a list next to the grid, so the coordinator can fix it before exporting. Today the coordinator types subjects into the `HK1` sheet and relies on `COUNTIF` formulas, some of which are broken (`#REF!`).

## Scope

| ID | Feature | File |
|---|---|---|
| DM | Manage teachers, classes, rooms, subjects, and subject cards | [01-data-management.md](01-data-management.md) |
| TB | Build the timetable by drag and drop | [02-timetable-builder.md](02-timetable-builder.md) |
| TC | Teacher conditions, errors, and warnings | [03-teacher-conditions.md](03-teacher-conditions.md) |
| IE | Import and export the timetable | [04-import-export.md](04-import-export.md) |
| PF | Profiles: several timetables side by side | [05-profiles.md](05-profiles.md) |

Out of scope for now: generating a timetable automatically, multiple users or logins, and hosting online.

## Release order

Each release is usable on its own, and each one goes through design, testing, and review before the next one starts.

| Release | What you can do | Requirements |
|---|---|---|
| 1 | Pick a class, and drag subject cards from the school's card pool onto its blank grid. Move, replace, and remove cards, and pick up where you left off. Subjects, teachers, rooms, and classes are added from the dropdowns as you need them. | TB-1 to TB-5, TB-7, DM-5, DM-7 |
| 2 | See errors and warnings in the panel, and set teacher conditions. | TC-1 to TC-4 |
| 3 | Manage the class, room, and subject lists on their own screens. (The teacher list came in release 2; weekly totals, DM-6, were dropped on 2026-10-26.) | DM-2 to DM-4 |
| 4 | Keep several timetables as profiles, and export a class or all classes to Excel, in the school's workbook layout, or to PDF. (Split from import on 2026-10-28.) | PF-1 to PF-3, IE-2, IE-4, DM-1's phone |
| 5 | Import a workbook into a profile, choosing which sheet and column holds what, as in Odoo. | IE-1, IE-3 |

Development and testing use a made-up sample school, never data from the real workbook. Export and import tests compare against made-up workbooks that copy the sample's layout.

## Platform and language

**NF-1. Desktop app.** TimeTableMaker is a desktop app that runs on the coordinator's computer.
- It works without an internet connection.
- All data is saved on that computer.
- Import and export use the computer's own open and save dialogs.

**NF-2. English interface.** Every menu, label, and message in the app is in English.
- Names the user types, such as subjects, teachers, and rooms, stay as typed, in Vietnamese if that's how they're entered.
- Exported sheets keep the sample workbook's bilingual labels, so they look like the ones the school uses today.

**NF-3. Font.** The app ships with the Lexend font inside it, so it looks right offline, including Vietnamese text. Lexend's open license allows this.

**NF-4. Windows, built on Ubuntu.** The app is installed and used on Windows 10 and 11.
- Development happens on Ubuntu, so the app must also run there for day-to-day work.
- The Windows installer is built from the same code.
- Every release is tested on Windows 10 or 11 before it's handed over.

**NF-5. No terms.** The app doesn't track school terms or half-terms. A timetable is just a timetable, and which term it's for is the coordinator's decision. The goal is to build a timetable fast.

## Terms

| Term | Meaning | Workbook source |
|---|---|---|
| Class | A group of students, such as `6A1`. Grade 6–9, then a track code (`A`, `AA`, `CE`, `B`, `BA`), then a section number. | `Data `, `Phan cong` |
| Teacher | A staff member. Grids use the short name, and exports use the email. | `ID GV 1S` |
| Room | A place where lessons happen, kept in a room list the user manages. | `Phan cong` (some rooms) |
| Subject | A subject name and color, kept in a subject list the user manages. (Default periods per week dropped on 2026-10-19.) | `PPTL_XẾP TKB 26.27` |
| Subject card | One subject taught by one teacher in one room, shared by the whole school. Cards form one pool, and a card's classes are the grids it is placed on. (Periods per week dropped on 2026-10-19; cards changed from per class to a pool on 2026-10-21.) | `Phan cong`, `PPTL_XẾP TKB 26.27` |
| Timetable | The grid for one class: five days by five period blocks. | the class sheets |
| Slot | One day (Monday–Friday) and one period block: morning `1-2`, `3-4`, `5-6`, afternoon `7-8`, `9-10`. | `TIMETABLE` |
| Placement | A subject card put in a slot of one class's timetable. A full block (70 minutes) counts as 2 periods, and a half block counts as 1. | `HK1` |
| Teacher condition | A rule about when or how much a teacher teaches, such as "at most 3 periods of Toán a week". | none |
| Error | A broken teacher condition, or a teacher or room in two places at once. | none |
| Warning | Any other problem, such as a class having the same subject twice in a day. | none |

## Open questions

Each feature file lists its own open questions.
