# TimeTableMaker

A desktop app for building a secondary school (THCS) timetable by hand. Keep the school's subject cards (subject, teacher, room) in one pool, then drag them onto each class's Monday–Friday grid. It runs on Windows 10 and 11, works offline, and saves everything on your computer.

Version 4.0.0 is release 4: on top of the class bar, card pool, timetable grid, teacher conditions, errors and warnings, and the Teachers, Classes, Rooms, and Subjects pages of releases 1 to 3, it adds profiles (several timetables side by side), exporting to Excel in the school's workbook layout, and teachers' phone numbers. Exporting to PDF isn't ready yet, and importing a workbook comes in release 5 (see `docs/ROADMAP.md`).

## Install on Windows

1. Run `TimeTableMaker-Setup-4.0.0.exe`. (The installer is built and tested on Windows once the whole app is complete; until then the app runs from source, as under For developers.)
2. The installer isn't code-signed yet, so Windows SmartScreen may say it protected your PC. Click **More info**, then **Run anyway**.
3. Choose where to install it, then open **TimeTableMaker** from the Start menu.

Your work is saved as you go, in `%APPDATA%\TimeTableMaker`: `profiles.json` lists your profiles, and each one has a folder under `profiles\` with its `timetable.json` and, kept from before the latest save, `timetable.json.bak`. To move your work to another computer, copy the whole `TimeTableMaker` folder into the same place there while the app is closed. The first start of version 4 moves a version 3 timetable into a profile named "Timetable" and keeps the old file as `timetable.before-profiles.json`.

## Use it

- **Add a class:** pick a grade in the class bar, then **+ New class**. Names follow the school's pattern: a grade on the timetable's list (1 to 12), a track (`A`, `AA`, `CE`, `B`, `BA`), and a section, such as `6A1` or `8CE1`.
- **Add a card:** **Add subject** in the Subjects panel, or **Add card** on the Cards page. Pick a subject, a teacher, and a room. Each list can add a new one on the spot.
- **Place a card:** drag it from the Subjects panel onto the grid. Dropping on the top third of a block fills the first period, the middle fills the whole block, and the bottom third the second period. Dropping on a filled slot replaces what's there.
- **Move or remove:** drag a placed card to another slot, or right-click it to take it off the grid.
- **Find cards:** search by subject or teacher (accents don't matter, so "toan" finds "Toán"), or group the panel by teacher. The Cards page lists every card with the classes it's on, and filters by grade and teacher.
- **Classes:** the Classes page lists every class with its homeroom teacher and assistant, how many periods are placed, and its errors. Edit a class to rename it or change its teachers; deleting one takes its grid with it, but its cards stay in the pool.
- **Rooms:** the Rooms page lists every room and where it's used. Rename a room and every card follows; delete one and its cards stay on the grid with no room.
- **Subjects:** the Subjects page lists every subject in its colors. Edit a subject to rename it or pick its colors: from the name, one of the 15 palettes, or your own background and text. Deleting a subject deletes its cards and their places on the grid, and any teacher's subject limit on it.
- **Teachers:** the Teachers page lists every teacher. Open one to see what they teach, edit their details (name, email, phone), or delete them (their cards stay on the grid with no teacher).
- **Conditions:** on a teacher's screen, **Add condition**, pick one of the eight kinds (such as "Most periods per day" or "Days off"), and fill in its values. Switch a condition off to stop checking it without deleting it.
- **Errors and warnings:** a card in an error gets a pink dot and ring, one in a warning an amber one, and each class tile shows its counts. Nothing is ever blocked. The **Issues** tab lists them for the class on screen or all classes; click one to highlight its cards, and **Show 6A2** to jump to another class it's in.
- **Profiles:** each profile is a whole timetable of its own, such as one per term or a draft to try things in. Click the profile's name in the header to open the profile screen: make a new one, open, duplicate, rename, or delete one. Opening a profile saves the one you're on first.
- **Export to Excel:** **Export** in the class bar, then **This class** or **All classes** as Excel. Fill in the school, the school year, and the date the timetable applies from (remembered for next time), then choose where to save. The workbook has a sheet per class laid out like the school's, the `TKB tổng hợp` grid sheet, and `Data `; editing a subject in the grid sheet or a phone in `Data ` shows on the class sheets. If the timetable has errors or warnings, the dialog says how many and you can still export.

## For developers

Developed on Ubuntu with Node 22 or later. `CLAUDE.md` has the full list of commands and how the code is laid out.

```bash
npm install
node node_modules/electron/install.js   # once: downloads the Electron binary
npm run dev                             # the app with live reload, on your real data
npm run dev:review                      # the app on a made-up school, in a data folder of its own
npm run check                           # typecheck, lint, format check, unit tests
npm run test:e2e                        # build, then the end-to-end tests
npm run dist:win                        # the Windows installer, into dist/ (needs Wine on Ubuntu)
```
