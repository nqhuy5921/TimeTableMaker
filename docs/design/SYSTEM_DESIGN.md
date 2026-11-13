# TimeTableMaker system design

**Status:** Approved for release 1 on 2026-10-15. Section 5, the theme, and subject colors were replaced on 2026-10-16 by [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md). Section 3a (the card pool, 2026-10-21) was approved on 2026-10-21 and replaces what it contradicts in sections 3 and 5. Section 9 (release 2: teacher conditions, errors, and warnings, and the Teachers page) was approved on 2026-10-22, section 10 (release 3) on 2026-10-26, and section 11 (release 4: profiles and export) on 2026-10-28.

**Covers:** the release 1 requirements (TB-1 to TB-5, TB-7, DM-5, DM-7, NF-1 to NF-5; TB-6 undo was removed on 2026-10-16) in [docs/requirements/](../requirements/README.md). The model and file layout are also chosen so that releases 2–4 fit without a rewrite. Visual style follows [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), except where [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md) overrides it (header color, font, subject colors, timetable screen).

## 1. Technology

| Need | Choice | Why |
|---|---|---|
| Desktop app for Windows 10/11, developed on Ubuntu (NF-1, NF-4) | **Electron** | Builds a Windows installer from the same code, runs on Ubuntu for development, and works offline. |
| Language | **TypeScript** everywhere | One language for the app, the rules, and the tests. Types catch mistakes in the data model early. |
| User interface | **React**, built with **Vite** (through `electron-vite`) | The grid, card panel, and dialogs are many small pieces that change together, which React handles well. Vite gives fast reloads during development. |
| Drag and drop | **dnd-kit** | Lets each slot have two drop targets (first and second half) and can add keyboard dragging later, which plain HTML drag and drop does poorly. (Keyboard dragging was built with R1-6 and dropped on 2026-10-21.) |
| Styling | Plain CSS with the custom properties from `DESIGN_SYSTEM.md` | The design system is written as CSS variables already. No CSS framework is needed. |
| Font | Lexend (weights 300 and 400) from the `@fontsource/lexend` package, bundled into the app at build time (NF-3) | Works offline, and includes the Vietnamese character set. Lexend's open license (OFL) allows it. |
| Saving | One **JSON file** in the user's app-data folder | The data is small: about 34 classes, 500 cards, and 850 placements. A JSON file needs no database and no native modules, which keeps the Windows build simple. |
| Data checking | **zod** schemas | Checks the saved file when it's loaded, so a damaged file gives a clear message instead of a crash. |
| Tests | **Vitest** for rules, **Playwright** for the running app | Playwright can start and drive an Electron app. |
| Lint and format | ESLint, Prettier, `tsc --noEmit` | |
| Windows installer | **electron-builder**, NSIS target | It can build the Windows installer on Ubuntu with Wine installed, or on a Windows build machine. |

Exact versions are pinned in `package.json` when the project is set up.

## 2. How the app is put together

```
┌──────────────────── Electron app ────────────────────┐
│  Main process (Node)            Renderer (React UI)  │
│  ─────────────────────          ───────────────────  │
│  window, menus                  screens, grid, cards │
│  store: read/write JSON  ◄─IPC─►  app state          │
│  (later: import/export)           │                  │
│                                   ▼                  │
│                     Domain rules (plain TypeScript)  │
│                     placement, counts, validation    │
└──────────────────────────────────────────────────────┘
```

- **Domain rules** (`src/domain/`) are plain TypeScript with no React or Electron. That's where every rule from the requirements lives: what a drop does, how periods are counted, which names are valid. Most tests run against this layer.
- **Renderer** (`src/renderer/`) draws the screens and turns user actions into domain commands.
- **Main process** (`src/main/`) owns the window and the file on disk. Import and export (release 4) also go here.
- **Preload** (`src/preload/`) passes a small typed API between the two, using `contextBridge`. The renderer has no direct access to Node: `contextIsolation` is on and `nodeIntegration` is off.

### File layout

```
TimeTableMaker/
├── CLAUDE.md                      guidance for Claude Code
├── README.md                      how to install and run (added with the first release)
├── CHANGELOG.md                   one entry per release
├── TKB_THCS_from 3.9.2026.xlsx    real sample workbook, never copied into fixtures
├── package.json                   scripts and pinned dependency versions
├── tsconfig.json
├── electron.vite.config.ts        build setup for main, preload, and renderer
├── electron-builder.yml           Windows installer settings
├── eslint.config.mjs
├── vitest.config.mts              unit test settings
├── playwright.config.ts           end-to-end test settings
├── docs/
│   ├── design/
│   │   ├── DESIGN_SYSTEM.md       colors and visual style
│   │   └── SYSTEM_DESIGN.md       this document
│   └── requirements/              requirements, one file per feature
├── src/
│   ├── domain/                    rules and types, no UI
│   ├── main/                      Electron main process: window, file store, IPC handlers
│   ├── preload/                   the typed API the renderer can call
│   ├── renderer/                  React app
│   │   ├── components/            shared pieces such as the menu bar
│   │   ├── screens/               one file per screen
│   │   └── styles/                tokens.css (DESIGN_SYSTEM.md variables), base and app styles
│   └── shared/                    types used by main and renderer (saved-file schema, IPC contract)
├── tests/
│   ├── README.md                  which test covers which acceptance criterion
│   ├── domain/                    Vitest unit tests for the rules
│   ├── main/                      Vitest tests for saving and loading
│   ├── renderer/                  Vitest tests for plain-TypeScript renderer helpers
│   └── e2e/                       Playwright tests against the built app
├── fixtures/                      made-up sample schools, never real workbook data
└── scripts/                       dev helpers, such as reviewData.ts for `npm run dev:review`
```

The design tokens go in `src/renderer/styles/tokens.css`, not in the `web/static/css/style.css` path that `DESIGN_SYSTEM.md` mentions.

## 3. Data model

```ts
type Id = string;                           // random UUID

interface Subject   { id: Id; name: string; colorKey: ColorKey }   // colorKey is set from the name by defaultColorKey()
interface Teacher   { id: Id; shortName: string; fullName?: string; email?: string; school?: 'THCS' | 'THPT' | 'both' }
interface Room      { id: Id; name: string }
interface SchoolClass { id: Id; name: string; grade: 6 | 7 | 8 | 9; track: Track; section: number;
                        formTeacherId?: Id; coTeacherId?: Id }
interface Card      { id: Id; classId: Id; subjectId: Id; teacherId: Id | null; roomId: Id | null }
interface Placement { id: Id; cardId: Id; day: Day; block: BlockIndex; part: 'full' | 'first' | 'second' }

type ColorKey   = 'indigo' | 'violet' | 'cream' | 'ruby' | 'navy';
type Track      = 'A' | 'AA' | 'CE' | 'B' | 'BA';
type Day        = 0 | 1 | 2 | 3 | 4;        // Monday (Th2) to Friday (Th6)
type BlockIndex = 0 | 1 | 2 | 3 | 4;        // 1-2, 3-4, 5-6, 7-8, 9-10

interface TimetableFile {
  schemaVersion: 1;
  bellSchedule: ScheduleRow[];              // blocks and fixed rows (breakfast, breaks, lunch), defaults from the TIMETABLE sheet
  subjects: Subject[]; teachers: Teacher[]; rooms: Room[];
  classes: SchoolClass[]; cards: Card[]; placements: Placement[];
}
```

- Subjects have no default periods and cards no periods per week (dropped on 2026-10-19 at the user's request). Files saved before then still load: the schema ignores the old fields, and the next save leaves them out.
- Release 1 only asks for a teacher's short name. The other teacher and class fields are optional and get filled in by the full list screens in release 3, or by import in release 4.
- Teacher conditions (release 2) are added as `conditions` on the teacher, with a schema version bump and a migration (section 9.1).
- Placements don't store a class. They belong to a card, and the card belongs to a class, so a card can't land in another class's grid.

> Changed 2026-10-21: section 3a replaces the `Card` and `Placement` shapes below (cards have no `classId`, placements name their class) and the one-card-per-subject rule. The history is kept here.

### Rules the domain layer enforces

| Rule | Requirement |
|---|---|
| A class name matches `^(1[0-2]\|[1-9])(AA\|A\|CE\|BA\|B)([1-9]\d*)$` with a grade on the list (since DM-8, §13.2; it was grades 6 to 9), and grade, track, and section come from it | DM-2, DM-8 |
| A class has at most one card per subject (replaced by section 3a on 2026-10-21) | DM-5 |
| A slot (class, day, block) holds one `full` placement, or at most one `first` and one `second` | TB-4 |
| Placed periods = 2 per `full` placement + 1 per half | TB-4 |
| A new placement's size comes from where it's dropped: the block's middle gives `full`, its top or bottom half gives `first` or `second` (changed 2026-10-19) | TB-4 |
| A moved placement takes its size from where it's dropped, the same as a new one (settled 2026-10-19 with R1-6; it used to keep its size) | TB-5 |

### What a drop does

The domain function `drop(state, cardId, target)` returns the new state and the placements it removed. `target` is the slot plus the part under the pointer: `full` for the block's middle, or `first` or `second` for its top or bottom half. (Changed on 2026-10-19: the size used to come from the card's periods left.) The drop zones, settled at R1-5 on 2026-10-19: the top third of a block is its first half, the middle third the whole block, and the bottom third its second half. Dropping a card where it already is changes nothing.

| Dropped on | Slot has | Result |
|---|---|---|
| The middle (`full`) | anything | Everything in the slot is removed and the card fills the block |
| A half | nothing, or only the other half | The card goes into that half |
| A half | a card in that half | That card is removed and the card goes into that half; the other half stays |
| A half | a full block | The full block is removed and the card goes into that half |

Removed placements go back to the card panel, and their cards' placed counts update. Moving a placed card (`movePlacement`) is a removal from its old slot followed by the same drop, so the part it lands on sets its size. The moved placement keeps its id. Putting a card back where it was changes nothing. `removePlacement` takes a placement off the grid; the card stays in the panel.

> Changed 2026-10-21: the rule table above is replaced where section 3a says so (no one-card-per-subject rule; slots take their class from the placement).

## 3a. The card pool (changed 2026-10-21 at the user's request, approved the same day)

Cards stop belonging to a class. They form one pool for the whole school, and any card can go on any class's grid (DM-5, DM-7, TB-1, TB-3 to TB-5 as changed on 2026-10-21). This section replaces the parts of sections 3 and 5 it contradicts once approved.

**Model (file format version 2):**

```ts
interface Card      { id: Id; subjectId: Id; teacherId: Id | null; roomId: Id | null }       // no classId
interface Placement { id: Id; cardId: Id; classId: Id; day: Day; block: BlockIndex; part: 'full' | 'first' | 'second' }
interface TimetableFile { schemaVersion: 2; /* the rest as in section 3 */ }
```

- A placement now names its class, since its card no longer does. Slots, placed counts, and "Periods per subject" are worked out from `placement.classId`.
- A card's classes aren't stored: `cardClasses(file, cardId)` reads them from its placements, in class-bar order. So they can't fall out of step with the grids, and "dropping adds the class, removing the last placement takes it off" holds by construction.

**Rules, replacing the card rows of the table in section 3:**

| Rule | Requirement |
|---|---|
| No two cards have the same subject, teacher, and room (an empty teacher or room counts as a value) | DM-5 |
| A class can hold several cards of the same subject (the one-card-per-subject rule is gone) | DM-5 |
| A slot (class, day, block) holds one `full` placement, or at most one `first` and one `second`, with the class taken from the placement | TB-4 |
| A card's classes are the classes of its placements | DM-5, TB-4, TB-5 |

**Domain changes:** `drop(file, cardId, classId, target)` takes the class on screen. `movePlacement` keeps the placement's class. `addCard(file, fields)` and `editCard` refuse a subject, teacher, and room another card already has. `deleteCard` removes the card's placements in every class. `cardPanelGroups(file, query, groupBy)` and `cardTableRows(file, query)` work on the whole pool, and the integrity check (`fileProblem`) checks the new rules and that every placement's class exists.

**Upgrading saved files (migration 1 → 2):** cards with the same subject, teacher, and room become one card, which keeps the id of the first of them in the file. Each placement gets the class of the card it pointed at, and points at the merged card. No placement moves, so every grid looks the same after the upgrade. The original file is kept as the backup by the first save, as usual.

**Screens:**

- **Subjects panel:** lists the whole pool for any class on screen, with the same search (subject, teacher) and grouping (subject or teacher). With no class on screen the panel still lists the pool, and the grid takes no drops. "Add subject" keeps its name (the user's choice on 2026-10-19) and adds a card to the pool. Panel order: subject order, then teacher-list order, then room name.
- **Periods per subject:** still one tag per subject for the class on screen. When a class has several cards of one subject, the tag adds up all of them (two Toán cards, one full block each, show as Toán 4).
- **Empty states:** the Subjects panel says "No subjects yet" with Add subject when the pool is empty, whether or not there are classes. The Cards page drops its "No classes yet" state, and says "No cards yet" when the pool is empty.
- **Card form:** Subject, Teacher, and Room only, everywhere. The Class dropdown on the Cards page's Add card goes. Its title is "Add card" or "Edit Toán · Thầy Phúc · P101". A duplicate card is refused under Subject: "There's already a card for Toán with Thầy Phúc in P101."
- **Delete:** asks first when the card is on any grid, naming its classes ("It's on 6A1's and 8CE1's grids…"), and removes it from all of them.
- **Cards page:** columns Subject · Teacher · Room · Classes · Edit and Delete. Classes lists the class names joined by ", " in class-bar order, or "Not placed" in `--ink-mute`. Rows in subject order, then teacher-list order, then room name. Search by subject, teacher (short or full name), or class name. Add card is there even with no classes yet.

**Left open:** with every card in the panel, a whole school's pool runs to a few hundred cards. The search and Group by Teacher are the only ways to narrow it in release 1; a filter such as "cards on this class" can come later if the panel gets hard to use.

## 4. State and saving

- The renderer keeps the whole `TimetableFile` in memory as one immutable value. Every change goes through a domain command, such as `addCard`, `editCard`, `deleteCard`, `drop`, `movePlacement`, or `removePlacement`, which returns a new value.
- **No undo:** TB-6 was removed on 2026-10-16, so the app keeps no history of earlier values. Changes that lose work, such as deleting a card with placements, ask first.
- **Saving (TB-7):** after each change, the renderer sends the new value to the main process, at most once every half second. The main process writes it to `timetable.json` in Electron's `userData` folder (`%APPDATA%\TimeTableMaker` on Windows). It writes a temporary file and then renames it, so a crash mid-save can't leave a half-written file. It also keeps the previous version as `timetable.json.bak`. Any pending save is finished before the window closes.
- **Loading:** the file is checked with zod and upgraded if its `schemaVersion` is older. If it can't be read, the app says so and offers to open the backup, and it never overwrites the damaged file. Saves are refused until the user opens the backup or starts a new timetable, and both rename the damaged file to `timetable.damaged-<date>.json` first, so it's kept (settled 2026-10-19 with R1-2).
- **Fixes from the release 1 review (R1-9, 2026-10-21, at the user's request to fix all findings):**
  - The damaged file is now copied to `timetable.damaged-<date>.json` and then replaced in one rename, so `timetable.json` is never missing partway through. "Start a new timetable" writes the empty timetable straight away, so the next run doesn't ask again.
  - A missing `timetable.json` next to a `timetable.json.bak` is handled like a damaged file: the screen says the file is missing, offers the backup, and saves are refused until the user chooses. Before, the app started empty and its second save overwrote the backup. With no backup it's a first run, as before.
  - The file schema also checks that the file holds together (`fileProblem()` in `src/domain/integrity.ts`): unique ids, references that exist, class names that match their grade and track, no two cards with the same subject, teacher, and room (section 3a), each block once in the bell schedule, and slots the drop table could make. It runs on load and before each save.
  - Renames are tried again for about 1.5 seconds when Windows reports the file busy (`EPERM`, `EBUSY`, `EACCES`), as antivirus or indexing often does for a moment.
  - If opening the timetable fails some other way, or the app hits an error while drawing, a "Something went wrong" screen with Try again replaces the app, instead of a blank window. Try again reads the saved file afresh. Any save still waiting goes out first.
  - The window never navigates away from the app: a file dropped on it is refused, and `will-navigate` is cancelled.
- **A failed save (2026-10-21, at the user's request):** the main process turns the error into words the user can act on (`saveFailureReason()` in `src/main/store.ts`): which file in which folder, and the likely cause (disk full, read-only drive, another program holding the file or a read-only folder, a missing folder). The renderer shows it in a notice that drops down under the header (layout spec, App header) with Try again, which sends the unsaved timetable at once (`retrySave`, the save scheduler's `flush`). The store counts failures in a row (`saveFailure`), so a retry that fails again says so, and Hide puts the notice away until the next failure. The notice goes away when a save works.
- **The class on screen** is remembered in `settings.json`, next to `timetable.json` but apart from it, so picking a class doesn't rewrite the timetable or its backup. On start the remembered class goes back on screen, or the first class by grade if it's gone (settled 2026-10-19).

## 5. The timetable screen

The layout, theme, and subject colors are in [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md), which replaced this section on 2026-10-16. In short: a `#6a3cbf` app header with one menu link per screen; a class bar across the top with the class picker; then a 288px side panel on the left with Subjects and Issues tabs, and the timetable grid and a "Periods per subject" panel on the right. The grid has days as columns and one row per period, with breakfast, breaks, and lunch as fixed rows.

What the layout spec leaves to this design:

- **Window size:** at least 1280 × 720, laid out for 1440 × 900 with no page scroll. Below about 900px tall the period rows reach their 36px minimum, and the grid scrolls inside its frame with the day header pinned. The layout spec's bottom tray for narrow widths isn't used, because the window is never narrower than 1280px.
- **Fixed rows:** each non-teaching row in the bell schedule stores its `type` (`arrival`, `break`, or `lunch`), which sets how it's drawn. The lunch row splits the session column into Morning and Afternoon. Monday's flag salute is a `dayLabels` entry on the getting-ready row.
- **Class picker** (settled 2026-10-19 with TB-1): the class bar spans the top of the screen. Grade tabs pick a grade, a row of tiles picks a class, each tile with a bar for its placed periods, and a "+ New class" tile opens a form that checks the name against the class-name rule. The details are in [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md#class-bar). The selected class lives in app state next to the file, not in the saved file.
- **Subject colors:** a subject's palette is picked from its name by `defaultColorKey()` in `src/domain/subjectColor.ts`. Matching ignores case, spacing, and accents. Unknown subjects get the neutral grey of SH lớp. There's no color picker for now.
- **Card form** (a dialog): subject, teacher, and room. Each dropdown ends with "New subject…", "New teacher…", or "New room…", which opens a small inline form. A new subject asks only for its name, and its color comes from its name. (Periods per week and default periods were dropped on 2026-10-19.) Each card also has Edit and Delete: clicking a card in the panel opens it in the form, which has Delete card (settled 2026-10-19 with R1-3). Deleting a card that has placements asks first. Cancel drops any subject, teacher, or room added in the form, since the form works on its own copy of the timetable. (Changed 2026-10-21: the Class dropdown on the Cards page's Add card is gone, and a duplicate card is refused under Subject; see section 3a.)
- **Grid cell actions:** drag a placed card to move it. A right-click removes it straight away, with no menu (settled 2026-10-19 with R1-6; the × button and the right-click menu were dropped the same day at the user's request). The card's tooltip says "Drag to move, right-click to remove".
- **Menu:** Timetable, Cards, Teachers, Classes, Rooms, and Subjects, with the version on the right. The active link is a white pill. Switching screens is app state, not URLs. Screens that weren't built yet opened a placeholder page that said which requirement and release adds them, until the last one, Subjects, was built at R3-3 (2026-10-27), when the placeholder page was removed. The Cards page (DM-7, built at R1-7) is one table of the whole card pool (Subject · Teacher · Room · Classes · Edit and Delete), with Grade and Teacher filters, a search, and an Add card button. Changed 2026-10-21 at the user's request from one table of every class's cards: the details are in section 3a. The filters (added the same day at the user's request) are `CardTableFilter` in `cardTableRows(file, query, filter)`: a grade keeps cards placed in any class of that grade, "Not placed" keeps cards on no grid, a teacher keeps that teacher's cards, and "No teacher" keeps cards with none (or a teacher no longer listed). They're page state, reset when the page is left, like its search. A grade or teacher that's no longer offered counts as all (`currentCardFilter`), so the dropdowns and the table always agree.
- **Subjects panel search:** the search and grouping live in the app shell, not the timetable screen, so they stay through a visit to another screen (2026-10-21, at the user's request).
- **Review school:** `npm run dev:review` (`scripts/reviewData.ts --start`, in Node so it works in any shell) writes a made-up school (`fixtures/reviewSchool.ts`: 21 classes, 11 in grade 6, 45 cards, 6A1 nearly full with 17 subjects) to `~/.config/TimeTableMaker-review` and opens the app on it, for looking at the screens with a full school. It starts afresh each run and never touches the real data folder (2026-10-21, at the user's request).
- **Keyboard:** no keyboard dragging. It was built with R1-6 (Space to pick up, arrows to move the drop preview, Space to drop, Delete to remove), then dropped on 2026-10-21 at the user's request, so cards are placed, moved, and removed with the mouse only. Placed cards aren't in the Tab order. On a panel card, Enter or Space opens the card form. The segmented controls (Grade, Group by, the Issues filter) are radio groups: Tab reaches the chosen option, and the arrow keys, Home, and End choose another (R1-9, 2026-10-21).
- **Release placeholders:** in release 1 the Issues tab shows an empty state with a count of 0, and the Export button is disabled.

## 6. Testing

| Kind | What it covers | Where |
|---|---|---|
| Unit tests | Every row of the drop table above, period counting for full and half blocks, the class-name rule, no duplicate subject, teacher, and room, delete card removes its placements | `tests/domain/` |
| Store tests | Save then load gives the same data, a damaged file is refused and left untouched, the backup is kept, and an older schema version is upgraded | `tests/main/` |
| Renderer tests | Plain-TypeScript renderer helpers, such as the save scheduler (at most one save every half second) | `tests/renderer/` |
| End-to-end tests | Start the app with the sample school, add a class and a card from the dropdowns, drag the card onto the grid, replace it, close and reopen, and see the same grid | `tests/e2e/` |

Every acceptance criterion in TB-1 to TB-5, TB-7, DM-5, and DM-7 maps to at least one of these tests, and the mapping is listed in `tests/README.md`. The sample school in `fixtures/` is made up. It has a few classes across the five tracks, about ten subjects (including two with 1 period a week), and teachers with invented names.

## 7. Building and shipping

- **Development** on Ubuntu: `npm run dev` starts the app with live reload. The actual commands go in `CLAUDE.md` once the project is set up.
- **Windows installer:** `electron-builder` makes an NSIS installer (`.exe`) for 64-bit Windows 10 and 11. On Ubuntu this needs Wine. If Wine causes trouble, a Windows build machine or a hosted Windows runner can build it instead.
- **Before each release:** the installer is tested on Windows 10 or 11 (NF-4), using the end-to-end checklist above.
- The installer isn't code-signed for release 1, so Windows SmartScreen shows a warning on first install. Code signing can be added later if the school needs it.

## 8. Decisions approved

1. Electron with React and TypeScript, as in section 1.
2. A single JSON file for saving, instead of a database.
3. The screen layout in section 5, with the card panel on the left and errors and warnings later sharing that column as a second tab.
6. 2026-10-16: [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md) replaces section 5 and the theme: a `#6a3cbf` header, Lexend, and 15 fixed subject palettes. Each subject's palette comes from its name, and there's no color picker for now. The "Periods per subject" panel takes the place of the counts on cards (DM-7). The Issues tab (release 2) and the Export menu (release 4) are shown as placeholders in release 1.
4. ~~Undo covers every change on the timetable screen, up to 200 steps.~~ Removed on 2026-10-16 with TB-6.
5. No code signing for release 1.
7. 2026-10-21 (approved 2026-10-21): the card pool in section 3a. Cards belong to the school, not a class; placements name their class; a card's classes come from its placements; file format version 2 merges identical cards.
8. 2026-10-22 (approved 2026-10-22): release 2 in section 9. Conditions on the teacher (file format version 3); one pure checks engine over every class, run after every change, with issues worked out rather than saved; the Issues tab, slot marks, and class tile counts; the Teachers page and teacher detail screen with Excel-style condition form (DM-1); deleting a teacher leaves their cards with no teacher and merges identical ones. Lunch ends a run of blocks and isn't a free block.
9. 2026-10-26 (approved 2026-10-26): release 3 in section 10. No file format change; Classes, Rooms, and Subjects pages laid out like the Teachers page, each with a search and Edit and Delete per row; the workbook's form teacher and co-teacher are called homeroom teacher and assistant homeroom teacher on screen, the homeroom teacher required on the class form; deleting a room leaves its cards with no room and merges them through the same helper as a teacher delete; a subject a subject limit names can't be deleted (changed by decision 10).
10. 2026-10-27 (approved 2026-10-27): the change in section 10.5. File format version 4 gives a subject an optional `colorSource` and `customColors`; the subject form picks From the name, one of the 15 palettes, or Custom background and text, kept through a rename, with a preview of a tag and a grid card; custom colors reach the screen as inline `--card-bg`, `--card-bar`, and `--card-ink`; deleting a subject deletes the subject limits naming it, switched on or off, after the question names them, and the refusal notice goes. This lifts the no-picker rule in decision 6.
11. 2026-10-28 (approved 2026-10-28): release 4 in section 11. Each profile is a folder holding today's files, listed in `profiles.json`, with the release 3 timetable moved into a profile named "Timetable"; teachers get an optional phone (file format version 5); one pure export model in the domain drives an ExcelJS workbook (class sheets with cached formulas into `TKB tổng hợp` and `Data `, measured from the sample) and a PDF from a hidden window; one Export dialog holds the details and TC-4's question.
12. 2026-11-02 (approved 2026-11-02): release 5 in section 12. ExcelJS reads the workbook in the main process into plain `WorkbookData`, and every import rule is pure domain code: suggestions, your choices of sheet and column for four kinds of sheet, `parseSlotText` as the inverse of the export's `slotText`, and `importTimetable` giving the file, a summary, and problems that never block; the export gains a `Giáo viên` teachers sheet (a change to IE-2) so a round trip joins teachers; Download example writes the sample school through the export; importing into the open profile keeps a `timetable.before-import-<time>.json` copy first.
13. 2026-11-02 (approved 2026-11-02): the grade list in section 13. File format version 6 adds `grades` (numbers 1 to 12, in order), filled on upgrade from the classes' grades; class names still carry their grade, now 1 to 12 and only from the list; editing a grade renames its classes keeping their ids; deleting one deletes its classes and placements through the same `deleteClasses` as a class delete; a Grades dialog on the Classes page with list, form, and question views; a new timetable starts with no grades.

## 9. Release 2: errors, warnings, and teacher conditions

**Status:** approved by the user on 2026-10-22, with the choices below as proposed: lunch ends a run of blocks and is never a free block; an issue about a whole week shows in every class the teacher teaches; the allowed values in 9.1; the Teachers page in teacher-list order; confirming an export with errors waits for release 4.

**Covers:** TC-1 to TC-4 ([03-teacher-conditions.md](../requirements/03-teacher-conditions.md)), DM-1 ([01-data-management.md](../requirements/01-data-management.md), brought forward from release 3), and the parts of TB-1, TB-4, TB-5, and DM-5 that waited for the checks (error and warning counts on the class tiles, the issue list updating after every change). The screens' layouts are in [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md) (Issues tab, Slots, Class bar, and Other screens), with mockups in [release2-mockups.html](release2-mockups.html).

Settled before this design (2026-10-22), not reopened here: no greying of busy slots while dragging; no checks that need periods per week ("Fewest periods per week", "Card placed too often", unplaced periods); "Most periods per week" counts every placement of the teacher's cards across all classes; teachers shared with THPT are checked like everyone, with THPT lessons entered as "Unavailable times"; accepting a warning stays open and isn't in release 2.

### 9.1 Data model (file format version 3)

A teacher gets a list of conditions. Each condition has its own id, an on/off switch, and the values of its type, and nothing else:

```ts
interface Teacher { id: Id; shortName: string; fullName?: string; email?: string;
                    school?: 'THCS' | 'THPT' | 'both'; conditions: TeacherCondition[] }

type TeacherCondition = { id: Id; on: boolean } & (
  | { type: 'subjectLimit';      subjectId: Id; max: number; per: 'day' | 'week' }
  | { type: 'unavailable';       blocks: BlockIndex[]; days: Day[] }   // morning = blocks 0–2, afternoon = 3–4
  | { type: 'daysOff';           days: Day[] }
  | { type: 'maxPeriodsPerDay';  max: number }
  | { type: 'maxPeriodsPerWeek'; max: number }
  | { type: 'maxBlocksInRow';    max: number }
  | { type: 'maxGapsPerDay';     max: number }
  | { type: 'maxTeachingDays';   max: number }
);

interface TimetableFile { schemaVersion: 3; /* the rest as in section 3a */ }
```

- **Unavailable times** stores only blocks and days. "Morning" is blocks `1-2`, `3-4`, `5-6`, and "Afternoon" is `7-8`, `9-10`, as in `TIMETABLE`; the form and the sentence show "morning" or "afternoon" when the blocks are exactly those. All five days means every day. Being in either half of an unavailable block breaks it.
- **Allowed values**, checked by the form and by the integrity check: Subject limit 1–10 a day or 1–50 a week; Most periods per day 1–10; Most periods per week 1–50; Most blocks in a row 1–3; Most gaps per day 0–3; Most teaching days 1–4; Days off and Unavailable times need at least one day, and Unavailable times at least one block. Days and blocks are stored once each, in order.
- **Migration 2 → 3** (`MIGRATIONS[2]` in `src/shared/fileFormat.ts`) gives every teacher `conditions: []`. Nothing else changes, so every grid looks the same. The original file becomes the backup on the first save, as before.
- **Integrity check** (`fileProblem`) adds: condition ids unique across the file, a subject limit's subject exists, and the values above. A file that breaks them gets the damaged-file screen, like any other.
- Issues aren't saved. They're worked out from the file each time (9.2), so they can't fall out of step with the grid.

### 9.2 The checks engine

`checkTimetable(file): Issue[]` in `src/domain/checks.ts` is a pure function over the whole file, every class at once. The renderer runs it once per change of the timetable (a `useMemo` on the file in the app store), so every command that changes the file (`drop`, `movePlacement`, `removePlacement`, `editCard`, `deleteCard`, the teacher and condition commands) refreshes the issues by itself (TC-2). A whole school is about 850 placements and 100 teachers, so a run takes a few milliseconds.

```ts
type Severity  = 'error' | 'warning';
type IssueKind = 'teacherTwice' | 'roomTwice' | TeacherCondition['type'] | 'subjectTwiceInDay';

interface Issue {
  id: string;              // stable while the problem lasts, e.g. '["teacherTwice","<teacherId>",0,1,"full"]' 
  severity: Severity;
  kind: IssueKind;
  teacherId: Id | null;    // the teacher it's about, null for a room or subject issue
  conditionId: Id | null;  // the condition it breaks, for condition issues
  message: string;         // "Thầy Phúc: 4 periods of Toán on Monday, limit is 3"
  where: string;           // "6A1, 7B1 · Monday · Periods 3–4"
  placementIds: Id[];      // the slots involved
  classIds: Id[];          // their classes, in class-bar order
}
```

**Time and counting.** Each block has two halves, periods `2b+1` and `2b+2`. A full placement is in both halves; a `first` or `second` placement in one (TC-2: the halves of a block are different times). Periods are counted 2 for a full placement and 1 for a half, per placement, so a shared card on two grids counts on both. A card with no teacher is left out of the teacher checks, and one with no room out of the room check. Conditions that are switched off are skipped.

**Errors that are always on:**

| Check | Rule | One issue per |
|---|---|---|
| Teacher in two places | Two or more placements of the same teacher (by id) in the same half of the same block, in different classes | teacher, day, block: "Periods 3–4" when both halves clash with the same placements, else one per half ("Period 3") |
| Room in use twice | The same, by room | room, day, block, as above |

Two half cards that share a block, in one class or across classes, never clash with each other: the first half and the second half are different times.

**Errors from teacher conditions** (each counts only the teacher's placements, across all classes):

| Condition | Broken when | One issue per | Message |
|---|---|---|---|
| Subject limit | the teacher's periods of that subject in a day (or the week) go over the number | day (or week) over the limit | "Thầy Phúc: 4 periods of Toán on Monday, limit is 3" / "… 20 periods of Toán this week, limit is 18" |
| Unavailable times | any placement in one of the blocks on one of the days | day and block | "Thầy Phúc can't teach in periods 7–8 on Monday" |
| Days off | any placement on that day | day | "Thầy Phúc has Wednesday off but teaches 2 lessons" |
| Most periods per day | periods in a day go over | day | "Thầy Phúc: 8 periods on Monday, limit is 6" |
| Most periods per week | periods in the week go over | week | "Thầy Phúc: 20 periods this week, limit is 18" |
| Most blocks in a row | a run of blocks with a lesson (a half is enough) goes over; lunch ends a run, so a run is at most 3 blocks in the morning or 2 in the afternoon | day | "Thầy Phúc: 3 blocks in a row on Monday, limit is 2" |
| Most gaps per day | free blocks between the first and last block with a lesson go over; lunch isn't a block, so it's never a gap | day | "Thầy Phúc: 2 free blocks between lessons on Tuesday, limit is 1" |
| Most teaching days | days with any lesson go over | week | "Thầy Phúc teaches on 5 days, limit is 4" |

An issue's slots are the placements that make it up: for a day limit, the teacher's placements that day; for a week limit, all of them.

**Warning:**

| Check | Rule | One issue per | Message |
|---|---|---|---|
| Subject twice in a day | A class has the same subject (by subject id, whichever card) in two or more different blocks on one day. Both halves of one block count as one time. | class, subject, day | "6A1 has Toán twice on Monday" (or "3 times") |

**Order.** Errors come before warnings. Within each, issues are in order of their first slot (day, then block), with issues about the whole week after the ones about a day, then by teacher-list order. The order doesn't depend on the order of the file's lists, so the list doesn't jump about after an unrelated change.

**As built at R2-3 (2026-10-23).** Choices the tables above left open, settled in the code:

- `where` is the classes in class-bar order, the day, and the periods the issue's slots cover: "6A1, 7B1 · Monday · Periods 3–4", "6A1 · Monday · Periods 1–2 and 7", or "Period 3" for one half. A whole-week issue says "6A1, 6A2, 7B1 · Whole week". A clash names only the clashing half's period, even when one of its slots is a full block.
- Teacher in two places says "Thầy Phúc is in 6A1 and 6A2 at the same time" (the mockup's words), and Room in use twice "Room P101 has 6A2 and 8A1 at the same time". The same card on two grids at once is both.
- Days off counts lessons, one per placement ("teaches 1 lesson"). Unavailable times names the block in its message ("periods 7–8") even when only a half is placed; its `where` shows the half.
- Most blocks in a row reports the longest run over the limit, and its slots are the placements in the runs over the limit, not the whole day's. The day's parts come from the lunch row in the file's bell schedule (`daySessions()` in `bellSchedule.ts`), so the check follows the grid if lunch ever moves (R2-3 review).
- Most gaps per day counts the free blocks between the day's first and last busy block, blocks 1-2 to 9-10 in a row, since lunch isn't a block.
- Ties in the order go by check (the Check filter's order, `ISSUE_KINDS`), then the first slot's class in class-bar order, then the id. Issues about a room or a class sort after the teachers at the same time.
- `filterIssues` takes `{ scope, severity, teacherId, kind }` with `scope` the class id or null for all classes; `NO_ISSUE_FILTERS` is everything. `ISSUE_KIND_LABELS` holds the Check filter's names.
- Issue ids are the issue's parts as a JSON array (R2-7 review, 2026-10-23): joining ids with "|" let two issues share an id, and two classes' subject-twice groups merge, when an id contained "|".
- `slotMarks` gives each slot its error and warning counts and one tooltip line per issue, even when two issues have the same words (a teacher can have the same condition twice), so the lines match the accessible name's count (R2-3 review).

**Helpers for the screens** (`src/domain/issues.ts`, all pure):

- `issuesForClass(issues, classId)`: the issues with a slot in that class. An issue across classes (a teacher in 6A1 and 7B1) belongs to both, and a week limit to every class the teacher teaches in.
- `issueCounts(issues)`: errors and warnings, for the badges and the class tiles (`issueCountsByClass`).
- `slotMarks(issues)`: placement id → `'error' | 'warning'`, with error winning when a slot has both, plus the messages for the slot's tooltip.
- `filterIssues(issues, { scope, severity, teacherId, kind })`: the Issues tab's filters, which work together.

### 9.3 How issues reach the screen

- **App store:** `issues = useMemo(() => checkTimetable(file), [file])`. The Issues tab's scope, filters, and the selected issue are timetable-screen state (like the panel search, they stay through a tab or class switch). The selected issue is kept by its `id`, so it stays selected while it still exists after a change and clears once it's fixed.
- **Issues tab** (TC-3): scope switch "6A1 | All classes" (the class on screen by default; All classes when no class is on screen), a severity switch with counts, Teacher and Check filters, then the list with errors first. Clicking an issue selects it: its slots in the class on screen are highlighted and every other placed card dims to 45%. If some of its slots are in other classes, the row offers a pill per class ("Show 7B1"), which switches class and keeps the issue selected. Clicking the issue again, pressing Escape, or switching to the Subjects tab clears it.
- **Slot marks:** a placed card in an error gets the 8px `--danger` dot in its top-right corner and a 2px `--danger` inset ring; a warning the same in `--warning-ink`. The card's tooltip lists its issues above "Drag to move, right-click to remove", and its accessible name adds "1 error" or "2 warnings". Nothing changes while a card is being dragged; the marks follow the drop (TC-3).
- **Counts:** each class tile carries small error (red) and warning (amber) counts in its top-right corner, hidden at 0 (TB-1). The Issues tab's badge and the class bar's Issues pill show the class on screen's total: pink when it has errors, amber with only warnings, grey at 0.
- **Teacher detail screen:** each condition row says when it's broken right now ("Not met in 2 places", in `--danger`), using the issues with that `conditionId`. The Teachers page shows each teacher's error count.
- **Nothing blocks** (TC-4): no command looks at the issues. Confirming an export with errors waits for Export, in release 4.

### 9.4 Teachers (DM-1)

Domain commands in `src/domain/teachers.ts`. The card form's "New teacher…" keeps asking for a short name only, through `addTeacherByShortName` in `lists.ts`, which calls `addTeacher` (as built at R2-1):

| Command | Rules |
|---|---|
| `addTeacher(file, fields)` | Short name required and unique (case doesn't count, accents do, as now). Full name and email optional; an email must look like `name@domain`. Home school THCS, THPT, both, or not set. Starts with no conditions. |
| `editTeacher(file, id, fields)` | The same checks. Cards point at the teacher by id, so a new short name shows on every card and grid at once. |
| `deleteTeacher(file, id)` | Removes the teacher and their conditions, clears them as a class's form teacher or co-teacher, and leaves their cards with no teacher. A card that's then the same as another card (same subject, no teacher, same room) is merged into it: the card that already had no teacher keeps its id, and the merged card's placements point at it, so nothing moves on any grid. (Two of the teacher's own cards never merge, since they already differ by subject or room; corrected at R2-1, 2026-10-22.) |
| `teacherDeletion(file, id)` | What a delete would do, for the question before it: how many cards, how many placements, and which cards merge. |
| `addCondition`, `editCondition`, `setConditionOn`, `deleteCondition` | Check the allowed values (9.1) and return the field's message, such as "Enter a whole number from 1 to 10." or "Pick at least one day." |
| `conditionSentence(file, condition)` | The plain sentence for the list: "At most 3 periods of Toán a week", "Can't teach in the afternoon on any day", "Not on Wednesday or Friday", "At most 6 periods on any day", "At most 2 blocks in a row", "At most 1 free block between lessons in a day", "Teaches on at most 4 days a week". |

The delete question names what happens (and, since the R2-7 review, the classes the teacher stops being form teacher or co-teacher of, from `teacherDeletion`'s `roles`): "4 cards use Thầy Phúc. They'll be left with no teacher and stay on the grid where they are. Toán · P101 becomes the same as a card that has no teacher, so the two are merged, keeping both cards' places on the grid." With no cards it only says the teacher and their conditions go. There's no undo, so it always asks.

### 9.5 Screens and files

- **Header menu:** Teachers stops being a placeholder. Its page has two views: the list, and one teacher's detail screen, chosen in app state (`teacherId` or none), not URLs. Leaving the Teachers screen and coming back opens the list.
- New files: `src/domain/conditions.ts` (types, allowed values, sentences), `src/domain/checks.ts`, `src/domain/issues.ts`, `src/domain/teachers.ts`; `src/renderer/screens/TeachersScreen.tsx` and `TeacherDetail.tsx`; `src/renderer/components/TeacherDialog.tsx`, `ConditionDialog.tsx`, `IssuesTab.tsx`. `SidePanel.tsx` hands the Issues tab to `IssuesTab`, and `GridSlot.tsx` and `ClassPicker.tsx` take the marks and counts as props.
- The Teacher and Check filters are dropdowns shaped like the search pill, as on the Cards page. The Teacher filter lists every teacher in list order, so a choice stays put when that teacher's issues are fixed.

### 9.6 Testing

| Kind | What it covers | Where |
|---|---|---|
| Unit: checks | Teacher in two places across classes, full against full and full against a half; **two half cards sharing a block, in one class and across classes, aren't a clash**; the same card on two grids at once; room in use twice; a card with no teacher or room is skipped; every condition type, each just at its limit (no issue) and one over (issue), with half blocks counted as 1 period; several conditions of one type on one teacher; a condition switched off gives nothing; lunch ends a run of blocks and isn't a gap; subject twice in a day, with both halves of one block counted once; issue order and stable ids | `tests/domain/checks.test.ts` |
| Unit: issues | Per-class issues and counts (an issue across classes counts in both), slot marks with error over warning, the filters together | `tests/domain/issues.test.ts` |
| Unit: teachers and conditions | Short names unique, email shape, edit shows on cards, delete leaves cards with no teacher, merges identical cards keeping every placement, clears form teacher and co-teacher; each condition type's allowed values and sentence | `tests/domain/teachers.test.ts`, `tests/domain/conditions.test.ts` |
| File | Migration 2 → 3 gives every teacher no conditions and every grid stays the same; the integrity check refuses a condition with a missing subject or a value out of range; a version 1 file upgrades through both migrations | `tests/main/fileFormat.test.ts`, `tests/domain/integrity.test.ts` |
| End-to-end | Teachers page add, edit, delete (with the merge question); a condition of each type added through the form shows its sentence, switches off and on, edits, and deletes; dropping a card that puts a teacher in two classes marks both slots, counts on both tiles, and lists the issue; moving it away clears all three; clicking an issue highlights its slots and "Show 7B1" switches class; a condition broken on the grid shows "Not met" on the teacher screen | `tests/e2e/teachers.spec.ts`, `conditions.spec.ts`, `issues.spec.ts` |

The sample school (`src/domain/exampleSchool.ts` since R5-3) already has the same teacher in 6A1 and 6A2 on Monday `3-4`. It gets a few conditions (one of each type across its teachers, one switched off), a room shared at one time, a subject twice in a day, and two half cards of one teacher sharing a block in two classes, so the acceptance tests see every kind of issue. `tests/README.md` lists every TC-1 to TC-4 and DM-1 criterion against its tests.

## 10. Release 3: the class, room, and subject lists

**Status:** approved by the user on 2026-10-26 (decision 9 in section 8). Proposed the same day, then changed at the user's request (no Track column on the Classes page, homeroom teacher and assistant homeroom teacher in place of form teacher and co-teacher, the homeroom teacher required on the class form, no Classes column on the Subjects page, and a search on each page) before approval.

**Covers:** DM-2 to DM-4 ([01-data-management.md](../requirements/01-data-management.md), approved 2026-10-26). The pages' layouts are in [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md) (Other screens), with mockups in [release3-mockups.html](release3-mockups.html).

Settled with the requirements (2026-10-26), not reopened here: weekly totals (DM-6) are dropped; a subject that a subject limit names can't be deleted (changed in 10.5: it's deleted with those limits); teachers' phone numbers wait for release 4; subjects keep the order they were added. The three pages were first settled with no search, and each now has one (changed 2026-10-26 at the user's request).

### 10.1 Data model (file format stays version 3)

Nothing new is saved. A class already has optional `formTeacherId` and `coTeacherId` (section 3), so no migration is needed, and every saved file opens as it is.

- On screen, `formTeacherId` and `coTeacherId` are the class's **homeroom teacher** and **assistant homeroom teacher** (the workbook's GVCN and PCN; renamed on 2026-10-26 at the user's request). The field names in the file and the code stay as they are, so nothing migrates.
- The homeroom teacher is required on the class form, the assistant optional (2026-10-26, at the user's request). It stays optional in the file: a class made by the class bar's "New class", or whose homeroom teacher was deleted, has none, and `formTeacherId` stays optional in the schema.
- One teacher can't be both a class's homeroom teacher and its assistant homeroom teacher. The commands refuse it (10.2), but the integrity check doesn't, so a file that somehow has it still opens.
- A subject's palette keeps coming from its name: renaming a subject sets its `colorKey` again with `defaultColorKey()`.

### 10.2 Domain commands

All pure, returning a new file (or app state) or a message for the form's field, like the teacher commands (9.4).

**Classes** (`src/domain/classes.ts`):

| Command | Rules |
|---|---|
| `addClass(state, nameOrFields)` | As now (the class-name rule, names unique, the new class goes on screen), now also taking a homeroom teacher and an optional assistant. The class bar's "New class" keeps asking for the name only, so `addClass` takes either a name (the class bar: no teachers) or the class form's fields (built with R3-1), and with the fields a homeroom teacher is required ("Choose a homeroom teacher.", as the card form's "Choose a subject."). |
| `editClass(file, id, fields)` | Name, homeroom teacher, and assistant homeroom teacher. The same name rule (its own name doesn't count as taken), so grade, track, and section are read again from a new name. The class keeps its id, so its placements and grid don't change. The homeroom teacher is required ("Choose a homeroom teacher."), the assistant can be empty, and both must exist and be different teachers. |
| `classRows(file, query)` | The Classes page's rows in class-bar order: the class, both teachers, and periods placed (each class's errors come from the store's issues, as on the Teachers page). The search matches the class name or either teacher's short or full name with `matchesSearch` (case and accents ignored), as `teacherRows` does. |
| `classDeletion(file, id)` | What a delete would do: the periods placed in the class and how many placements. |
| `deleteClass(state, id)` | Removes the class and its placements. Cards stay in the pool; a card's classes come from its placements, so the class is gone from them by itself. If the class was on screen, the first class by grade is put on screen (`createAppState`'s rule), or none when no class is left. |

**Rooms** (new `src/domain/rooms.ts`; `addRoom` stays in `lists.ts`, used by the card form and the Rooms page):

| Command | Rules |
|---|---|
| `roomRows(file, query)` | The Rooms page's rows in list order: cards and the classes they're placed in. The search matches the room name. |
| `editRoom(file, id, name)` | Name required and unique (case doesn't count, accents do, as `addRoom`). Cards point at the room by id, so a new name shows everywhere at once. |
| `roomDeletion(file, id)` | The room's cards, how many placements, and which cards merge. |
| `deleteRoom(file, id)` | Removes the room and leaves its cards with no room, merging a card that's then the same as another (same subject, same teacher, no room) into it, keeping every placement. |

**Subjects** (new `src/domain/subjects.ts`; `addSubject` stays in `lists.ts`):

| Command | Rules |
|---|---|
| `subjectRows(file, query)` | The Subjects page's rows in subject order, with how many cards. The search matches the subject name. |
| `editSubject(file, id, name)` | Name required and unique (as `addSubject`); the palette follows the new name. |
| `subjectDeletion(file, id)` | The teachers whose subject limits name it (if any, the delete is refused), the subject's cards, how many placements, and the classes they're in. |
| `deleteSubject(file, id)` | Refused while a subject limit names it, with a message naming the teachers (replaced by 10.5: the limits are deleted with it). Otherwise removes the subject, its cards, and their placements. |

**One merge for teachers and rooms.** Deleting a teacher (9.4) and deleting a room both leave cards with one field empty and merge the ones that become identical. That merge moves out of `deleteTeacher` into one helper in `src/domain/cards.ts`, `clearCardField(file, 'teacherId' | 'roomId', id)`, with its preview `clearCardFieldPreview` behind `teacherDeletion` and `roomDeletion`, so the two deletes can't drift apart.

### 10.3 Screens and files

- **Header menu:** Classes, Rooms, and Subjects stop being placeholders (`screens.ts`). Each is a list page laid out like the Teachers page (title row with a search pill and the Add button, a table that scrolls in its panel under a pinned header), with no detail screen. The search is the page's own state, as on the Teachers page, so it starts empty each visit: a row's Edit opens a form, and Delete asks first.
- **Classes page** (`ClassesScreen.tsx`, form `ClassDialog.tsx`): one row per class in class-bar order. The form has Name (with the class-name rule's message), Homeroom teacher (a dropdown of the teacher list starting at "Choose a teacher", as the card form's subject), and Assistant homeroom teacher (optional; the teacher list after "None").
- **Rooms page** (`RoomsScreen.tsx`, form `RoomDialog.tsx`): one row per room in list order. The form has Name.
- **Subjects page** (`SubjectsScreen.tsx`, form `SubjectDialog.tsx`): one row per subject in subject order. The form has Name, with a live preview tag in the colors the name gives.
- **Questions:** the deletes use `ConfirmDialog` (focus on the keep button, 9.4's R2-7 rule). A subject that subject limits name gets a notice instead, with one OK button: `ConfirmDialog` learns to show no destructive button.
- **The new names on existing screens:** the timetable screen's class line says "Homeroom teacher T. Hoa", and the question when a teacher is deleted says "Cô Ngân stops being homeroom teacher of 6A1 and assistant homeroom teacher of 6A2." (`TimetableScreen.tsx`, `TeacherDetail.tsx`, and the e2e test that reads it), built with R3-1.
- **Shared pieces (R3-5 review, 2026-10-27, at the user's request to fix all findings):** the Teachers, Classes, Rooms, and Subjects pages share `ListPage.tsx` (title row, search, Add button, empty states) and the `list-screen` and `list-table` class names (the Cards page too); the room form, the subject form, and the class bar's New class are one name form, `NameDialog.tsx`, which `RoomDialog`, `SubjectDialog` (with its preview), and `NewClassDialog` fill in. Every delete question's wording is built in the domain: `teacherDeletionLines`, `classDeletionLines`, `roomDeletionLines`, and `subjectDeletionLines`, with the merge sentence from `mergeLines` in `cards.ts`. Saving an unchanged class, room, or subject returns the same file, so nothing is saved or checked again.
- **Timetable screen:** a class deleted from the Classes page leaves the timetable on the first class by grade. Nothing else on it changes; the Subjects panel, Cards page, and Teachers page follow renames and deletes because they read the one file.

### 10.4 Testing

| Kind | What it covers | Where |
|---|---|---|
| Unit: classes | Edit keeps the grid and re-reads grade and track from a new name; the name rule and uniqueness (own name allowed); the homeroom teacher is required when editing, the assistant isn't; the two differ and exist; the search matches the name or either teacher, ignoring accents; delete removes the placements, keeps the cards, and puts the first class on screen when the deleted one was | `tests/domain/classes.test.ts` |
| Unit: rooms | Rows and their search; rename unique; delete leaves cards with no room and merges identical ones keeping every placement; the preview matches what the delete does | `tests/domain/rooms.test.ts` |
| Unit: subjects | Rows and their search; rename unique and changes the palette; delete refused while a subject limit names it, naming the teachers; otherwise removes the cards and placements | `tests/domain/subjects.test.ts` |
| Unit: the shared merge | Teacher delete behaves exactly as before (the release 2 tests stay as they are) | `tests/domain/teachers.test.ts`, `tests/domain/cards.test.ts` |
| End-to-end | Each page: search, add, edit (a class renamed into another grade moves in the class bar), and delete with its question; the subject refusal notice; renames show on the timetable screen | `tests/e2e/classes.spec.ts`, `rooms.spec.ts`, `subjects.spec.ts` |

### 10.5 Change after the review: subject colors and subject limits (approved 2026-10-27)

**Status:** proposed and approved by the user on 2026-10-27 (decision 10 in section 8). Where it disagrees with sections 10.1 to 10.4 (the subject refusal, palettes only from the name), it wins.

**Why:** at R3-5 (2026-10-27) the user asked for two DM-4 changes: deleting a subject deletes the subject limits that name it, in place of the refusal; and the subject form picks the subject's colors, a palette or custom colors, with a preview that shows them. The user chose "pick a palette, then adjust" over free color pickers alone, and custom colors stay through a rename. This lifts the rule, in place since 2026-10-16, that subject colors come only from the name with no picker; `CLAUDE.md`'s design rules changed with the approval, and `DESIGN_SYSTEM.md` and the layout spec change in R3-5b.

**Data model (file format version 4).** A subject gains two optional fields:

```ts
interface Subject {
  id: Id;
  name: string;
  colorKey: ColorKey;            // the palette shown, unless the colors are custom
  colorSource?: 'palette' | 'custom'; // missing: the palette comes from the name
  customColors?: { bg: string; ink: string }; // '#rrggbb', only when colorSource is 'custom'
}
```

- Missing `colorSource` means **From the name**, as every subject is today, so a version 3 file upgrades by only raising the version number. Version 4 stops an older copy of the app from opening the file and quietly dropping the custom colors (it says the file comes from a newer version).
- **Custom** colors replace the palette's tint (`bg`) and ink (`ink`). The card's side bar uses the ink color, so custom colors need only the two pickers the user chose. `colorKey` keeps the palette the subject had before, so switching back from Custom starts there.
- The schema checks `customColors` is present exactly when `colorSource` is `'custom'`, with both colors as `#rrggbb`.

**Domain commands** (`src/domain/subjects.ts`, `subjectColor.ts`):

| Command | Change |
|---|---|
| `editSubject(file, id, name, colors?)` | Takes the form's colors too (as built; without them it keeps the choice the subject has): `{ source: 'name' }`, `{ source: 'palette', key }`, or `{ source: 'custom', bg, ink }` (colors checked as `#rrggbb`). From the name sets `colorKey` from the name, as now; a picked palette or custom colors stay through a rename. Nothing changed returns the same file. |
| `addSubject(file, name, colors?, newId?)` | The Subjects page's Add subject takes the form's colors; the card form's "New subject…" passes none, so the name's colors. |
| `subjectColors(subject)` | The colors a subject shows: its palette key, or its custom background, bar, and ink. Every screen reads colors through it. |
| `subjectDeletion(file, id)` | Unchanged: it already lists the teachers whose subject limits name the subject, with how many. |
| `deleteSubject(file, id)` | No longer refused: also removes, from each teacher, the subject limits naming the subject, switched on or off. Returns the file, as `deleteRoom` and `deleteTeacher` do. `subjectRefusal` goes. |
| `subjectDeletionLines(file, id)` | Adds a line before "This can't be undone." when limits go: "Thầy Hiếu's subject limit on Tin học goes too." or "Thầy Hiếu's and Cô Vy's subject limits on Tin học go too." A subject with no cards but a limit starts "No cards use Tin học." in place of "Nothing uses Tin học." |

**Screens.**

- **How custom colors reach the screen:** a palette is a class, `subject-<key>`, as now. Custom colors are user data, not design tokens, so they go on the element as inline CSS custom properties, `--card-bg`, `--card-bar`, and `--card-ink`, the same three that the `subject-<key>` classes set. One renderer helper turns `subjectColors` into that class or style, used by every place that colors a subject (panel cards, grid cards, "Periods per subject" tags, the Subjects page, the Cards page, the subject form's preview). The "no literal hex values" rule stays for the app's own styles.
- **Subject form** (layout spec "Room form and Subject form"): under Name, a **Colors** row of pills: From the name, then 15 round swatches (each palette's tint with its bar as a ring, named by the subject the palette is for, such as "Toán's colors"), then Custom. The chosen one has a `--primary` ring. Choosing Custom shows Background and Text, each a color input with its `#rrggbb` value, starting from the colors on show. The preview box shows the subject's tag and a card as it sits on the grid (tint, bar, and ink, with "Teacher · Room" as its second line) in the chosen colors. With an empty name the tag says "Subject" instead of the hint "Type a name to see its colors." (2026-10-27, at the user's request). When the custom text is hard to read on the background (contrast under 4.5 : 1), a muted note under the preview says so; it doesn't stop the save.
- **Subject refusal notice** goes, and `ConfirmDialog`'s notice mode (no `confirm`) with it, since nothing else uses it.
- **Delete question** for a subject: the new line about the limits; focus stays on Keep the subject.

**Testing.** Unit: the version 3 → 4 upgrade; the schema refusing custom colors without `#rrggbb` or without `colorSource: 'custom'`; `editSubject` keeping a picked palette and custom colors through a rename and following the name otherwise; `deleteSubject` removing limits on and off and leaving other conditions; the new delete lines; `subjectColors`. End-to-end: pick a palette and custom colors in the form, see them in the preview, on the Subjects page, the panel, and the grid, and after a restart; delete Tin học in the sample school, which says Thầy Hiếu's limit goes and removes it from his screen.

**Left as it is (2026-10-27, the user's call):** the delete question's wording for cards not on any grid ("There are 2 cards of Lịch sử, and none is on the grid. The cards are deleted.") stays, to look at again later.

## 11. Release 4: profiles and export

**Status:** proposed and approved by the user on 2026-10-28 (decision 11 in section 8), with ExcelJS as a new dependency.

**Covers:** PF-1 to PF-3 ([05-profiles.md](../requirements/05-profiles.md)), IE-2 and IE-4 ([04-import-export.md](../requirements/04-import-export.md)), DM-1's phone number ([01-data-management.md](../requirements/01-data-management.md)), and TC-4's question before exporting with errors, all approved on 2026-10-28. The screens' layouts are in [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md) (App header, Class bar's Export menu, Other screens), with mockups in [release4-mockups.html](release4-mockups.html).

Settled with the requirements (2026-10-28), not reopened here: a profile is a whole timetable; Export is This class or All classes, as Excel or PDF, with no Print; the Excel export copies the sample's class sheets with formulas into a grid sheet called `TKB tổng hợp` (laid out like the sample's `HK1`) and `Data `; two half blocks share one cell; `TKB 1S`, `Phan cong`, and `ID GV 1S` aren't written; the import is release 5.

### 11.1 Profiles on disk

Each profile is a folder of its own in the data folder, holding exactly the files the app keeps today, so the store (section 4) works on a profile unchanged:

```
<userData>/
├── profiles.json                    the list: [{ id, name }] in the order made, and openId
├── timetable.before-profiles.json   the timetable before release 4, kept once (PF-3)
└── profiles/
    └── <id>/                        one folder per profile (id: a random UUID)
        ├── timetable.json           the timetable, its .bak, and any damaged copies, as now
        ├── timetable.json.bak
        └── settings.json            the class on screen, and the export details (11.4)
```

- **`profiles.json`** is written like `timetable.json` (temp file and rename). It holds only names and ids; how many classes and cards a profile has and when it last changed are read from its `timetable.json` (counts) and the file's modified time when the profile screen opens. The files are small (section 1), so reading every profile then is quick.
- **A `ProfileManager`** in `src/main/profiles.ts` owns the list and makes one `createTimetableStore(folder)` (section 4) for the open profile. Opening another profile waits for the open store's saves to finish (`idle()`), then makes a store for the new folder and loads it, so the damaged-file screen, the backup, and save failures work per profile exactly as now.
- **How a profile is made safely** (added at R4-1's review, 2026-10-28): a new, duplicated, or upgraded profile is built in `profiles/.new-<id>`, then listed in `profiles.json`, and only then renamed to `profiles/<id>`. A crash before the list is written leaves a `.new-` folder, removed on the next start; a crash after it leaves a listed `.new-` folder, moved into place on the next start. If the folder can't be moved (antivirus holding a new file on Windows), the list is put back. Delete writes the list first and then removes the folder, trying again for a moment; a folder the list doesn't name is removed on the next start. *Changed at R4-8's review (2026-11-02, the user asked for all findings to be fixed):* Delete first renames the folder to `profiles/.deleted-<id>` (refused, saying another program has the folder open, if it can't be moved), then writes the list, then removes it; a crash before the list is written moves it back on the next start. Only `.new-` and `.deleted-` folders are ever removed at a start: a profile folder the list doesn't name, such as one that was missing at an earlier start and taken off the list, is listed again as "Recovered profile" ("Recovered profile 2"…), so it's never lost. Only one copy of the app runs per data folder (Electron's single-instance lock, taken on the data folder): starting it again brings the open window forward, so two copies never write over each other's `profiles.json` and saves. After a change, the profile screen's counts are read again only for the profiles the change touched and the open one; opening the screen reads them all. The manager's list in memory changes only once `profiles.json` has been written, so the two never disagree about the profiles or the open one.
- **Upgrade (PF-3):** on a start with `timetable.json` or `timetable.json.bak` in the data folder itself, the manager copies `timetable.json`, `timetable.json.bak`, and `settings.json` into a new profile that way, named "Timetable" ("Timetable 2" if that's taken) and opened, and only then renames the old `timetable.json` to `timetable.before-profiles.json` (or `timetable.before-profiles-<time>.json` if that's kept already) and deletes the old `.bak` and `settings.json`. A crash part way leaves the old files in place, and the next start does it again or finishes it: files a profile already holds byte for byte aren't copied again. A damaged old file is copied as it is, so the profile opens on the damaged-file screen, as it would have; a backup with no `timetable.json` opens on the "missing, but there's a backup" screen. The same happens to a `timetable.json` an older copy of the app writes after the upgrade, so its work becomes a profile rather than being lost. With no old files and no profiles, the first start makes an empty profile named "Timetable".
- **A data folder that can't be written to** with a release 3 timetable in it can't be upgraded, so that timetable opens where it is, as release 3 did: saves fail with the save notice, the list shows it as the one profile, and new, duplicate, rename, and delete are refused ("The data folder can't be written to, so profiles can't be changed."). The next start after the folder can be written upgrades it.
- **New, duplicate, rename, delete:** new makes a folder with an empty timetable (`createEmptyTimetable`, the default bell schedule); duplicate copies the source's `timetable.json` and `settings.json` (after its saves finish, if it's open), not its backup or damaged copies; rename changes `profiles.json` only; delete removes the folder and the entry. The manager refuses deleting the last profile or the open one, and a name that's empty or already taken (`checkProfileName` in `src/domain/profiles.ts`: required, at most 60 characters, unique with case not counting and accents counting, through `checkUniqueName`, as rooms are).
- **A damaged `profiles.json`** is set aside as `profiles.damaged-<time>.json` and rebuilt from the profile folders, each named after its folder until renamed ("Profile 1", "Profile 2"…, in folder order). Nothing is lost, since the timetables are in the folders. A `profiles.json` the disk won't hand over (held open, or no permission) isn't damaged: the start fails and the load-error screen's Try again reads it again (R4-8 review, 2026-11-02). A list that reads but has hand-edited names has them tidied (`tidyProfileNames`: cleaned, at most 60 characters, an empty one named by its place, a repeat numbered) rather than being treated as damaged.
- `TTM_USER_DATA` and `npm run dev:review` keep working: the review school is written as the one profile of its own data folder. The script refuses the app's real data folder and any folder with other profiles, since it starts afresh.

### 11.2 Teacher phone (file format version 5)

```ts
interface Teacher { …; phone?: string }   // as typed, such as "0912 345 678"
```

- Optional. The teacher form checks it has 8 to 15 digits, allowing spaces, dots, dashes, and a leading `+` ("Enter a phone number like 0912 345 678."), and the schema checks the same on load. It's stored as typed, trimmed.
- The version goes to 5 for the same reason as version 4 (section 10.5): an older copy of the app refuses the file rather than dropping phone numbers when it saves. A version 4 file upgrades by raising the number only.
- Shown on the teacher's detail screen with the other details, searched by the Teachers page's search, and written to `Data ` (11.3). The Teachers table gets no new column.
- As built at R4-3 (2026-10-28): the rule is `isPhoneNumber` in `src/domain/teachers.ts`, which the teacher form and the schema share (the schema's own message, "Phone numbers have 8 to 15 digits", names the teacher in a damaged-file reason). The search also matches a phone by its digits alone when the query is only digits and separators, so "0912345678" finds "0912 345 678". After R4-3's review (2026-10-28, at the user's request to fix all findings): a phone is cleaned before it's checked or kept (`cleanPhone`: non-breaking and other spaces become one plain space, typographic dashes become "-", trimmed), separators must sit between digits (a single space, or a dot or dash with a space either side or none), and the schema cleans a phone the same way on load and leaves an empty one out.

### 11.3 The Excel export

**One pure model, two writers.** `src/domain/exportSheets.ts` works out what every exported cell says, from the file, the classes asked for, and the export details, with no Excel or Electron in it, so the rules are unit-tested in the domain:

| Function | Gives |
|---|---|
| `slotText(file, classId, day, block)` | The subject cell and the teacher cell for one block: a full card's subject and teacher short name; two halves joined with " + " (`Sinh hoạt lớp + Giáo dục phẩm chất`, `T. Hoa + T. Lan`); one half alone with its half (`Toán (first half)`, `Toán (second half)`); empty when nothing's there. A card with no teacher gives an empty teacher part. As built at R4-4 (2026-10-28, after the user asked for its review findings to be fixed): two halves are joined part by part, so the teacher cell lines up with the subject cell (`T. Hoa +` when the second half has no teacher), and a part both halves share is written once (`Toán` with `T. Hoa + T. Lan` for one subject split between two teachers, `Cô Ngân` for one teacher of both halves). |
| `classSheet(file, classId, details)` | The class sheet's title lines, header (class name, homeroom teacher's full name, phone, and email), and its rows: each bell schedule row with its bilingual label and times, and for blocks the five days' subject text. |
| `gridSheet(file, classIds)` | `TKB tổng hợp`: the classes as columns, and for each day the bell schedule's rows, each block as a subject row then a teacher row, with the day codes (`Th2`–`Th6`) and period codes (`THCS12` … `THCS910`) as the sample's `HK1` has them. As built at R4-4 (2026-10-28, after its review): the fixed rows use `HK1`'s own wording (`Ăn sáng/ Breakfast`, `Chào cờ/ Hoạt động đầu ngày` on every day, `Ăn nhẹ/ Snack time`, `Kết thúc/ Finish`), not the class sheets'; lunch stays one row (`Ăn trưa & Nghỉ trưa/ Lunch time & Nap time`), since the bell schedule has no time where `HK1`'s lunch turns into nap time. `gridRowIndex` finds a block's subject row for the class sheets' formulas. |
| `dataSheet(file, classIds)` | `Data `: a row per class with its homeroom teacher and assistant homeroom teacher, their full names, phones, and emails. |
| `exportFileName(scope, className, format)` | `TKB 6A1.xlsx`, `TKB all classes.xlsx`, `TKB 6A1.pdf`, `TKB all classes.pdf`. |

**The workbook** is written in the main process by `src/main/exportExcel.ts` with **ExcelJS** (MIT, pure JavaScript, no native modules, so the Windows build stays simple), a new dependency to approve with this design. It turns the model into sheets:

- **Sheets, in order:** the class sheets (one per class, in class-bar order, each named after its class), then `TKB tổng hợp`, then `Data `. The class sheets come first so the file opens on a class, as the sample does. `Data ` keeps the sample's name, with its trailing space, so the formulas read as the school's do.
- **Class sheet layout,** measured from the sample's `6A1` (only sizes and styles, no data): columns A 7.71, B 15.29, C–G 25.71; Cambria throughout, the title rows 16pt bold, 16pt italic, and 12pt italic, everything else 11pt; rows 1–3 merged across A–G; the header table from row 8 with thin borders, the day header, the Tiết and Thời gian columns, and the break rows on the sample's light orange fill (`FBD4B4`), the break rows merged across C–G and italic, the getting-ready row merged D–G after Monday's flag salute; block rows about 45pt tall with wrapped, centred text; A4 landscape, fit to one page, zoom 85%. These are the exported file's own styles, written as constants in `exportExcel.ts`; the app's no-hex rule is for its own screens.
- **Labels:** the sample's bilingual wording, `Vietnamese/ English`, from a fixed table by row kind (as built at R4-4: two tables, the class sheets' and `TKB tổng hợp`'s, keyed by the bell schedule row's English label, with a test that every row of the app's schedule is in both; a row they don't have, as in a hand-edited file, is written as `note/ label`) (`Đón học sinh, ăn sáng / Breakfast`, `Chào cờ`, `Hoạt động đầu ngày/Getting ready`, `Giờ chơi/ Break`, `Ăn trưa & Nghỉ trưa/ Lunch time & Nap time`, `Ăn nhẹ/Snack time`, `Kết thúc / Finish`), with the times from the profile's bell schedule. A finish row is added at the last block's end, as the sample has. Block labels (`1-2`) are written as text, so Excel doesn't read them as dates.
- **Formulas, as the sample:** a class sheet's subject cell is `='TKB tổng hợp'!F5` (its class's column, its day and block's subject row), and its header's homeroom name, phone, and email are `VLOOKUP`s of the class name into `Data `. `TKB tổng hợp`'s teacher rows are values (approved with the requirements: the app can give one class a subject with two teachers, which a `Phan cong` lookup can't). Every formula is written with its result cached (ExcelJS's `{ formula, result }`), so Excel and LibreOffice show the values at once, without recalculating or asking to repair (IE-2).
- **The title:** row 1 `THỜI KHÓA BIỂU NĂM HỌC 2026 - 2027`, row 2 `SCHOOL SCHEDULE 2026 - 2027`, row 3 `(Áp dụng từ ngày 03/09/2026)`, and the school line `Trường/School: Trung học/Secondary School`, from the export details (11.4).

**As built at R4-5 (2026-10-29):**

- `src/main/exportExcel.ts` (`buildWorkbook`, `workbookBytes`) writes the sheets; `src/main/exportTimetable.ts` (`createExporter`) is the flow of 11.4, with the save dialog, the file write, and the settings passed in, so it's unit-tested without Electron; `src/domain/exportDetails.ts` has the dialog's defaults, checks, and wording (`defaultExportDetails`, `cleanExportDetails`, `checkExportDetails`, `exportClassIds`, `exportTitle`, `exportIssuesLine`).
- Every text formula ends `&""` (`='TKB tổng hợp'!F5&""`, `=VLOOKUP(C6,'Data '!$H$6:$N$12,2,0)&""`), so an empty slot or a teacher with no phone shows empty after recalculating rather than 0, as a plain reference to an empty cell would. The header's "GVCN/Form Teacher:" is `='Data '!I6`, as in the sample. An empty result is cached as an empty string.
- `TKB tổng hợp` keeps `HK1`'s two header rows, each header cell merged over both (the sample's second row held `Phan cong` column numbers, which the app doesn't need), so Monday's first block is row 5, as in `HK1`. The day name is merged down its day's rows; the fixed rows' text sits in the first class column with the fill across, unmerged, as in `HK1`; *changed at R4-8's review (2026-11-02, the user asked for all findings to be fixed): each fixed row's text is merged across the class columns, left-aligned from the first with an indent, so it runs across with no borders between classes as `HK1`'s does and is never cut off at the first column's edge, and a fixed row whose text needs more than two lines there (the lunch row in a This class export's one column) is a 23pt line taller each (`gridFixedHeight`); the day name and its `Th2` code are turned on their side (90°) as in `HK1`;* the subject cells aren't colored by subject (the sample's fills are by hand; the app's palettes are the screen's). Columns A–E and the class columns are `HK1`'s widths; the sheet freezes at F3.
- `Data ` keeps the sample's place, the header at H6 and a row per class under it, so the class sheets' lookups read as the school's. Phones are written as text, so a leading 0 stays.
- Measured from the sample and not otherwise listed above: the class sheet's row heights (title rows 21.6, 22.35, 18.6; spacer rows 9.75 and 9; day header 28.5; fixed rows 16.5; blocks 45), its margins (0.7 / 0.75 / 0.3), and `TKB tổng hợp`'s fonts and fills (header Cambria 24 and 18 bold on `92CDDC`, classes `E36C09`, days `D99594`, short day codes Times New Roman 10 bold on `4F81BD`, period and time `FBD4B4`, fixed rows bold italic on `B2A1C7`, subjects 18 bold, teachers 18 in red).
- The expected workbook is `fixtures/expectedWorkbook.ts`: the sample school with four made-up phones, and every sheet written out by hand as data (values, formulas and results, style names, merges, sizes), which `tests/main/exportExcel.test.ts` compares cell by cell with the file read back.

**The PDF** (IE-4) is drawn from the same `classSheet` model. `src/main/exportPdf.ts` builds one HTML page per class (a table with the class sheet's widths, merges, borders, and fill; Cambria with a serif fallback, so it matches the Excel sheet on Windows), loads it into a hidden window that has no preload and no Node access, and saves it with Electron's `printToPDF` (A4 landscape, each class on its own page through a page break). Nothing goes online (NF-1).

### 11.4 Export flow

- **IPC:** `exportTimetable({ file, classIds, scope, format, details })` asks the main process to show the system save dialog with the suggested name (`exportFileName`) in the folder used last, then write the file. It answers `{ status: 'saved', path }`, `{ status: 'cancelled' }`, or `{ status: 'failed', reason }`, the reason in words as for a failed save (`saveFailureReason`, which also covers a file open in Excel: "TKB 6A1.xlsx is open in another program. Close it and try again."). `showInFolder(path)` opens the folder with the file selected. The renderer sends the timetable it has, so the export is what's on screen even with a save still waiting.
- **Export details** `{ schoolName, schoolYear, appliesFrom }` live in the profile's `settings.json`, starting at `Trung học/Secondary School`, the school year the date falls in (August onwards is the next year: on 2026-10-28, `2026 - 2027`), and today. They're saved when an export is confirmed.
- **The Export dialog** (layout spec) opens from each of the four menu items. It names what will be exported ("6A1 as Excel" / "All 34 classes as PDF"), has the three details, and, when there are issues, a line in their colors: for This class the class's errors and warnings, for All classes the whole timetable's ("The timetable has 4 errors and 2 warnings. You can still export it."). That line is TC-4's question: the button reads Export anyway when there are errors or warnings, and Export when there are none. The details are checked before the save dialog (a school year like `2026 - 2027`, a date) with the field's message.
- **After saving,** a notice drops under the header, as the save notice does, white with a 4px `--primary` left edge (the app has no success color, and none is added): "Saved TKB 6A1.xlsx" with Show in folder and Hide; it goes after 8 seconds. A failure uses the same notice in the danger colors with the reason and Try again.
- With no classes, the Export menu's items are disabled; with no class on screen, the This class items are.
- **As built at R4-5 (2026-10-29):** the request is `{ file, classIds, scope, format, details, retry? }`, and a saved answer also names the file and folder for the notice. The main process checks the request again (the file against the schema, the classes, the details) before the save dialog opens, adds the extension to a name typed without one, and remembers the folder used last for this run (starting in Documents). Try again sends `retry`, which writes where the failed export was going without asking again. *R4-8 review (2026-11-02):* for This class, a class renamed since the failure is asked about again (the save dialog suggests the new name), and a deleted one leaves the notice saying so with no Try again; All classes with no classes left says there's nothing to export. `writeAtomic` removes its temp file when the write itself fails too, so a full disk leaves no half-written `.xlsx.tmp` beside the user's file. `showInFolder` opens only a file this run exported, so the renderer can't open any folder it names. The details are saved in the profile's `settings.json` once the file is written; settings saves now replace only the fields given (`settingsChangeSchema`), so the class on screen and the export details don't overwrite each other, and a duplicated profile takes its source's details with its settings. A failure's reason is `exportFailureReason` (busy: "TKB 6A1.xlsx is open in another program. Close it and try again."; no permission, a full disk, a read-only drive, a missing folder), written for exports rather than reusing `saveFailureReason`, which names `timetable.json`. The renderer keeps the details and the notice in `ExportingProvider` (`src/renderer/state/exporting.tsx`), so the notice stays up whichever screen opens. The two PDF items are in the menu, disabled, until R4-6 (set aside by the user on 2026-10-29; the tooltip reads "PDF export isn't ready yet"). R4-5 review (2026-10-29, the user asked for all 10 findings to be fixed): the workbook is written with the timetable's own `writeAtomic` (a temp file and a rename), so a failed write leaves an earlier export as it was; save and export failures share one wording in `writeFailureReason` (`src/main/store.ts`), naming the file and saying, for an export, to choose another folder; Try again sends the timetable as it is now (All classes taking the classes as they are now); a failed export keeps the typed details in the renderer; starting a new timetable keeps the profile's export details; and the LibreOffice recalculation test runs only with LibreOffice 7.2 or later.

### 11.5 Screens and files

- **Header:** the open profile's name sits after the brand, as a pill (white at 15% over the header color, white text, a chevron), and opens the profile screen. The menu links don't move (they're placed after a fixed-width brand area; the pill truncates long names with the whole name as its tooltip).
- **Profile screen** (`ProfilesScreen.tsx`, on `ListPage.tsx`): the list page frame, "Profiles" with the count, no search, and New profile. One row per profile in the order made: Name (weight 400, with an "Open now" chip on the open one) · Classes · Cards · Last changed ("Today 14:05", "27 Oct 2026") · actions: Open (hidden on the open one), Duplicate, Rename, Delete (hidden on the open one, and when there's only one profile). New, Duplicate, and Rename use `NameDialog.tsx` ("New profile", "Duplicate Timetable" with the name "Timetable copy", "Rename Timetable"). Delete asks with `ConfirmDialog` ("Delete Draft term 2?" / "It has 34 classes and 512 cards. This can't be undone." / Keep the profile, Delete profile). Opening a profile goes to the timetable screen. Release 5 adds Import here.
- **Switching profiles in the renderer:** the app store finishes any waiting save (`flush`), asks the main process to open the other profile, and starts again from its `LoadResult`, as at start-up: the issues are worked out, the Subjects panel's search and the Issues view are reset, and the class on screen is that profile's remembered class. As built at R4-2 (2026-10-28): `Root.tsx` reads the open profile's `LoadResult` and the profile list (`ProfilesProvider` in `src/renderer/state/profiles.tsx`, for the header and the profile screen), and opening a profile starts both again, remounting the app store and screens. The store's `saveNow` (the save scheduler's `flush`) answers whether everything is saved; while it isn't, Open is refused with a line on the profile screen rather than dropping the failed save, and Duplicate of the open profile is refused the same way in its form. After R4-2's review (2026-10-28, at the user's request to fix all findings): start-up reads only the names (`listProfileNames`, the manager's `names()`), and the profile screen reads the counts (`listProfiles`) when it opens, so starting the app doesn't parse every profile's timetable; saving first lives in one place, `useSaveFirst` and `useOpenProfile` in `src/renderer/state/profiles.tsx`, which every opener uses and which ignores a second Open while one is under way; and the damaged-file screen can open another profile, since nothing of the damaged one is in the app yet.
- **Export menu** (class bar): This class as Excel, This class as PDF, All classes as Excel, All classes as PDF, in place of the release 1 placeholder's four items (Print went on 2026-10-28). `ExportDialog.tsx`, the notice `ExportNotice.tsx` (sharing `SaveNotice`'s frame).
- **Teacher form and detail:** Phone after Email in `TeacherDialog.tsx`; the detail line adds it after the email.
- **Files:** `src/domain/profiles.ts`, `src/domain/exportSheets.ts`, `src/main/profiles.ts`, `src/main/exportExcel.ts`, `src/main/exportPdf.ts`, new IPC entries in `src/shared/ipc.ts` and the preload (`listProfiles`, `openProfile`, `newProfile`, `duplicateProfile`, `renameProfile`, `deleteProfile`, `exportTimetable`, `showInFolder`), `ProfilesScreen.tsx`, `ExportDialog.tsx`, `ExportNotice.tsx`.

### 11.6 Testing

| Kind | What it covers | Where |
|---|---|---|
| Unit: profiles | The name rule (required, unique ignoring case not accents, 60 characters) | `tests/domain/profiles.test.ts` |
| Main: profiles | The upgrade from a release 3 data folder (files moved, the copy kept, nothing changed in the timetable), a crash part way through it, a damaged old file, a first run; new, duplicate (copies the timetable and settings, not the backup), rename, delete and its refusals; a damaged `profiles.json` rebuilt from the folders; opening another profile waits for saves | `tests/main/profiles.test.ts` |
| Unit: format 5 | The version 4 → 5 upgrade; the phone rule in the form and the schema | `tests/domain/teachers.test.ts`, `tests/main/` |
| Unit: export model | `slotText` for full, two halves, one half (each), empty, no teacher; `classSheet`'s header with and without a homeroom teacher, its rows from the bell schedule and its labels; `gridSheet`'s day and period codes and subject and teacher rows; `dataSheet`; `exportFileName`; the sample school's 6A1 against a hand-written expected sheet | `tests/domain/exportSheets.test.ts` |
| Main: workbook | Export the sample school, read the file back with ExcelJS, and compare it with a made-up expected workbook in `fixtures/` (sheet names and order, every value, every formula and its cached result, merges, column widths, fonts, fills, print setup); This class has its one class sheet | `tests/main/exportExcel.test.ts` |
| End-to-end | Profiles: the upgrade keeps a release 3 timetable, new, duplicate, rename, open (the grid changes and comes back), delete with its question; the header shows the open profile. Export: each menu item through the dialog with the save dialog stubbed, the errors line and Export anyway, the details remembered per profile, the saved notice; the PDF has one page per class; the phone on the teacher form and detail screen | `tests/e2e/profiles.spec.ts`, `tests/e2e/export.spec.ts`, `tests/e2e/teachers.spec.ts` |

The expected workbook in `fixtures/` is made by hand from the made-up sample school, never from the real workbook. A test also opens the exported file in LibreOffice headless where it's installed (skipped otherwise) to check it opens without repair.

## 12. Release 5: import

**Status:** proposed and approved by the user on 2026-11-02 (decision 12 in section 8), with the change to IE-2 in 12.5. No new dependency: ExcelJS (section 11.3) also reads.

**Covers:** IE-1 and IE-3 ([04-import-export.md](../requirements/04-import-export.md)), approved on 2026-11-02. The screens' layouts are in [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md) (Other screens: Import screen, Import question, Import notice), with mockups in [release5-mockups.html](release5-mockups.html).

Settled with the requirements (2026-11-02), not reopened here: the import starts from the profile screen and goes into the open profile or a new one; you match the file's sheets and columns to a downloadable example, with the app's suggestions; Test changes nothing; the choices aren't remembered; same-named items are updated from the workbook, keeping teacher conditions and subject colors; an imported class's grid replaces its own, other classes keep theirs; only teachers who are used come in; cards come with no room; `SH lớp-GDPC` is split into two halves; clubs, rotating subjects, and periods per week stay out.

What the sample's sheets look like, measured at R5-0 (shapes only, no data copied): `HK1` has the class names in row 1 from column F, then a "Tiết" column and the same class names again over its counting columns; column B holds the day code (`Th2`–`Th6`) on every row and column D the period code (`THCS12` … `THCS910`) on each block's subject row, with the teacher row under it; all 850 teacher cells are `HLOOKUP`s with their values saved; 483 blocks are empty and 44 subjects have no teacher. (R5-2, 2026-11-09: read again through the import's reader, all 850 blocks have both a subject and a teacher, so don't rely on those two counts.) `ID GV 1S` has its header in row 2 with two columns both headed `HỌ TÊN` (full name, then short name), and phones saved as numbers, which drops the leading 0. `Data ` has its header at H6 (`Lớp`, `GVCN/Form Teacher:`, `PCN/Co-teacher`, phones, emails), naming homeroom teachers by full name. `Phan cong` has its header in row 2, a row per class, a column per subject named as in `HK1`, and the homeroom teacher and co-teacher by short name.

### 12.1 Reading a workbook

- **IPC `chooseImportFile()`:** the main process shows the system open dialog (`.xlsx` only; the old `.xls` format isn't read, and a file that isn't a workbook gets "TKB.xls isn't an .xlsx workbook. Save it as .xlsx in Excel and choose it again."), reads it with ExcelJS, and answers `{ status: 'read', workbook }`, `{ status: 'cancelled' }`, or `{ status: 'failed', reason }` (the reason in words, as for exports: open in another program, no permission, damaged).
- **`WorkbookData`** is plain data, so every rule after reading is in the domain and unit-tested there: `{ fileName, sheets: [{ name, rows: string[][] }] }`. Each cell is its text as Excel shows it: a formula's saved result, a number written without grouping (`912345678`), a date as `dd/mm/yyyy`, rich text joined, and errors (`#REF!`) as empty. Every cell of a merged range gets the range's value, so a day name merged down its rows reads on each row. Non-breaking spaces become spaces and each cell is trimmed. Hidden sheets are kept, marked hidden, and offered last. *R5-1 review (2026-11-02, the user asked for all findings to be fixed):* only rows and cells holding a value are read, so a sheet formatted far past its data reads as fast as its data, and gaps keep their places as empty cells and rows.
- Nothing is written: the file is opened read-only, and the workbook stays in the renderer only while the Import screen is open.

### 12.2 What you match

The import knows four kinds of sheet, each shown in the example workbook (12.5):

| Kind | Needed | Example sheet | The school's sheet | Fields |
|---|---|---|---|---|
| Teachers | optional | `Giáo viên` | `ID GV 1S` | Short name (required), Full name, Email, Phone, Home school, Also teaches at |
| Classes | optional | `Data ` | `Data ` | Class (required), Homeroom teacher, Assistant homeroom teacher, and each one's Phone and Email (R5-3 review) |
| Timetable | required | `TKB tổng hợp` | `HK1` | none: read by its layout (12.3) |
| Teaching assignments | only when a card's teacher comes from it | — | `Phan cong` | Class (required); the subject columns are matched by their header |

- **Suggestions** (`suggestImport(workbook)` in `src/domain/importWorkbook.ts`): each kind gets the sheet whose name matches first (`ID GV 1S` or `Giáo viên`; `Data `, or since R5-1's review `Classes` or `Lớp`; `TKB tổng hợp` or `HK1`; `Phan cong`, ignoring case, accents, and spaces; the first such sheet in workbook order, visible before hidden), then the sheet whose layout fits (a header row with the kind's headers; a timetable layout). A list sheet's header row is the row, among the first 10, that matches the most known headers; each field gets the column whose header matches a known header (`Tên ngắn/ Short name`, or `ID GV 1S`'s second `HỌ TÊN` for the short name when there are two; `GVCN/Form Teacher:`; `Email`…), and anything unmatched starts at "Not imported".
- **The choices** (`ImportChoices`): a sheet (or "Leave out") per kind, the header row and a column per field for the list kinds, and where a card's teacher comes from: **The row under each subject** (the default, and the only choice when no teaching assignments sheet is chosen) or **Teaching assignments**. Changing a sheet starts its columns again from the suggestions. Nothing is remembered for the next import.
- A homeroom teacher or assistant in the classes sheet is matched to a teacher by short name, then by full name, ignoring case; `Data ` names them by full name, `Phan cong` by short name. *R5-2 review (2026-11-09):* a full name that fits more than one teacher uses the first and is a problem. *R5-3 review (2026-11-09, the user chose this fix):* a name can fit a teacher's short name and others' full names, so the same row's email, then its phone (digits only, a lost leading 0 not counting), picks among them, from `Email CN`, `Email PCN`, `Mob CN`, and `Mob PCN`. Only when they can't tell does the import use the first, the short name before full names, and list the problem. So an export's homeroom teachers come back right even when two share a full name.

### 12.3 Reading the timetable sheet

- **Classes:** the header row is the first of the first 5 rows holding a class name (the class-name rule, `parseClassName`). The class columns run from there until the first cell that isn't a class name or repeats one, so `HK1`'s "Tiết" and counting columns are never read. *R5-2 (2026-11-09), so a bad class name in this sheet is a problem as 12.4 asks:* a cell that's a mistyped class name (a grade and then letters, as `6Z1`) is passed over with a problem, and the classes after it are still read. *R5-2 review (2026-11-09, the user asked for all findings to be fixed):* that holds for the first class column too, and when the classes stop at a blank or repeated cell with class names not yet read after it, a problem names them. A row under a block is its teacher row unless it's another block's row or gives a different time, so a break row isn't read as teachers.
- **Blocks:** the period column is the column holding `THCS12`-style codes (or `1-2`-style labels); each row with one is a block's subject row, and the row under it is its teacher row. The day comes from the day column's code (`Th2`–`Th6`) or name (`Thứ Hai / Monday`) on that row. *R5-1 review (2026-11-02):* or, when the row names none, from the last day named above it, so a day written once and not merged covers its rows; and a `1-2` label that Excel turned into a date (2 January or 1 February, by the computer's date order) is read as its block, since its day and month are the block's two periods either way round. A day with a missing or repeated block, or a sixth day, is a problem, and those rows are left out. *R5-2 (2026-11-09):* the first row of a repeated block is the one used; `Th7`, `CN`, and Saturday or Sunday by name mark a sixth day, and a block with no row stays empty.
- **A subject cell** (`parseSlotText(subject, teacher)` in `src/domain/exportSheets.ts`, the inverse of `slotText`): empty is an empty block; `Toán (first half)` or `(second half)` is that half; `A + B` is two halves (the first and second), and its teacher cell splits the same way, `T. Hoa + T. Lan`, a lone side meaning that half has no teacher (`T. Hoa +`); one subject with two teachers (`Toán`, `T. Hoa + T. Lan`) is the same subject in both halves; anything else is a full block. `SH lớp-GDPC/ Class meeting` (any text starting `SH lớp-GDPC`) is two halves, `Sinh hoạt lớp` then `Giáo dục phẩm chất`, both with the cell's teacher (`JOINED_SUBJECTS`, one entry for now). Only " + " with spaces splits, so `Phát triển cá nhân/ Life+` stays whole.
- **The teacher:** with The row under each subject, the teacher row's text; with Teaching assignments, the cell in the class's row under the column headed with the subject's name (the halves' subjects looked up one by one). *R5-2 (2026-11-09):* a joined subject's halves, which the sheet has no columns for, are looked up under the cell's own name, as `HK1`'s formulas do; a subject with no teacher there is one problem per class and subject. An empty teacher is a card with no teacher, counted in the summary.
- **Subjects** are named as the cell says (`Toán Bộ giáo dục/ Maths`), so a round trip keeps them. *R5-3 review (2026-11-09):* a name containing " + " or ending in "(first half)" can't be told from two halves, and two identical halves come back as a full block; see the roadmap's Open items. **Bell times** aren't read: the profile keeps its own bell schedule (a new profile has the default), and the summary says so when the sheet's times differ from it.

### 12.4 Building the result

`importTimetable(workbook, choices, into)` in `src/domain/importTimetable.ts` is pure and gives `{ file, summary, problems }`, where `into` is a new empty timetable or the open profile's. Test calls it and shows the summary and problems; Import calls it again and keeps the file. Nothing in it can fail: each problem says what the import does about it.

- **Teachers** come in only when used: on a card the timetable places, or as a homeroom teacher or assistant of an imported class. One named on the timetable but missing from the teachers sheet comes in with only its short name (a problem). A teacher's email that isn't an email, or a phone that isn't one, is left out (a problem). A phone saved as a 9-digit number gets its leading 0 back (`912345678` → `0912345678`). Home school: `THCS` or `THPT`, and both when the other column names the other school. A short name used twice in the teachers sheet: the first row wins (a problem naming both rows).
- **Classes** come from the timetable's header, with their homeroom teacher and assistant from the classes sheet. A class name that breaks the rule, in any sheet, is left out (a problem); a class in the classes sheet but not on the timetable comes in with an empty grid; a class with no homeroom teacher is a problem but comes in (the class form will ask for one on its next edit).
- **Cards:** one per subject and teacher, with no room, identical ones shared as the pool does (section 3a). Into the open profile, a subject and teacher that already have exactly one card use that card, so its room is kept; among several, the one with no room, or a new one with no room (R5-2, 2026-11-09).
- **Into the open profile** (`into` is its file): a teacher (by short name), class, or subject (by name) already there is updated from the cells that have a value (an empty cell, or a field left at "Not imported", keeps what's there); conditions and subject colors aren't touched. Each imported class's placements are replaced with the workbook's; other classes keep theirs; no card, teacher, subject, or room is deleted. Names match as the app's lists do (`checkUniqueName`: case not counting, accents counting).
- *R5-2 (2026-11-09):* an item's name stays as the timetable has it (the name is what matched it); "updated" counts every item already there that the workbook names, whether or not a value differs. A class only the classes sheet names keeps its grid. Problems about a teacher's details, or a repeated short name, are only for teachers who are used.
- **The summary:** how many teachers, classes, subjects, and cards are new and how many updated, how many placements, how many cards have no teacher, how many teachers in the teachers sheet weren't used, and, into the open profile, how many classes' grids are replaced.
- **Problems** (`ImportProblem { sheet, cell, message }`, cell as `F12`), listed by sheet then row, each in plain words with what happens: "HK1 F12: Cô Tưởng Tượng isn't in ID GV 1S, so they come in with only their short name.", "Data H14: 6Z1 isn't a class name, so the row is left out." The list shows the first 200 and how many more.

### 12.5 The example workbook and the export's teachers sheet

- **Download example** writes the made-up sample school (`src/domain/exampleSchool.ts`, moved from `fixtures/sampleSchool.ts`, which the tests then import from there) through the Excel export as All classes, with the details "Trung học/Secondary School", the current school year, and today, so the example is exactly what the import reads best. It asks where to save (`TKB example.xlsx`) and uses the export notice.
- **A change to IE-2, approved with this design on 2026-11-02:** the export gains a `Giáo viên` sheet after `Data `, a row per teacher used by the exported classes (on their cards, or as homeroom teacher or assistant), in teacher-list order: `TT`, `Họ tên/ Full name`, `Tên ngắn/ Short name`, `Điện thoại/ Phone`, `Email`, `Trường dạy chính/ Home school`, `Trường kiêm nhiệm/ Also teaches at`, laid out like `ID GV 1S` but with one header per column. Without it an export carries teachers only as short names, and `Data ` names homeroom teachers only by full name, so a round trip (IE-3) couldn't join them. The expected workbook in `fixtures/` gains the sheet.
- *R5-3 (2026-11-09):* the sheet's table starts at A1, in `Data `'s styles, with `ID GV 1S`'s widths where it sets them (6, 32.71, 31.14, 31.14, 56.43, then 22 for each school column) and a 33pt header row. A teacher at both schools is `THCS` with `THPT` in the next column. A full name stays empty when there's none (`Data ` has the short name stand in). The sample school's data is in `src/domain/exampleSchool.ts`, and what the tests expect of it stays in `fixtures/sampleExpectations.ts`. `saveExample` shares the export's save dialog, last folder, Try again, and Show in folder, and doesn't change the profile's remembered export details.

### 12.6 Flow and screens

- **Profile screen:** Import (a secondary pill, before New profile) opens the Import screen (layout spec), which first asks for the file.
- **Import screen:** the file's name and sheet count with Choose another file and Download example; Into, a segmented switch "A new profile | Timetable (open now)", with the new profile's name (starting at the file's name without `.xlsx`, checked by `checkProfileName`); a row per kind with its sheet dropdown, and for list kinds its columns as a table of field · column dropdown (`H · Lớp`) · the first three values; for Timetable the teacher source. On the right, the results panel: before Test, a line saying Test checks everything without changing anything; after Test, the summary and the problems. Test and Import at the foot of the results; Import is the region's `--primary` pill, enabled once Test has run on the current choices, so a change after Test asks for Test again.
- **Import into a new profile:** IPC `newProfileFrom(name, file)` makes the profile as New profile does (section 11.1) with that timetable, then the app opens it as Open does.
- **Import into the open profile** asks first (`ConfirmDialog`, focus on Cancel): "Import into Timetable?" / "The grids of 34 classes are replaced, and 12 teachers and 3 classes are updated. A copy of the timetable as it is now is kept in the profile's folder." / Cancel, Import. The main process copies `timetable.json` to `timetable.before-import-<time>.json` in the profile's folder (IPC `keepBeforeImport()`, after waiting saves), then the app store replaces the file (a store command, so it's saved and checked as any change) and goes to the timetable screen.
- **After importing,** the export notice's frame says "Imported 34 classes, 61 teachers, and 412 cards into Timetable." and goes after 8 seconds.

### 12.7 Files

`src/domain/importWorkbook.ts` (types, `suggestImport`, header matching), `src/domain/importTimetable.ts` (`importTimetable`, the problems' wording), `parseSlotText` and `JOINED_SUBJECTS` in `src/domain/exportSheets.ts`, `src/domain/exampleSchool.ts`, `src/main/importExcel.ts` (`readWorkbook`: ExcelJS to `WorkbookData`), the IPC entries `chooseImportFile`, `saveExample`, `newProfileFrom`, and `keepBeforeImport`, `ImportScreen.tsx`, and the `Giáo viên` sheet in `src/main/exportExcel.ts` with a `teacherSheet` in the export model.

### 12.8 Testing

| Kind | What it covers | Where |
|---|---|---|
| Unit: reading | `parseSlotText` against `slotText` for every slot shape (full, each half, two halves, one subject with two teachers, a half with no teacher, `SH lớp-GDPC`, `Life+`); header and sheet suggestions on the reference layouts | `tests/domain/exportSheets.test.ts`, `tests/domain/importWorkbook.test.ts` |
| Unit: import | Every problem's case (unknown teacher, bad class name, bad email or phone, a repeated short name, a missing block); teachers only when used; the 9-digit phone; home school from two columns; teacher from the row under or from teaching assignments; into a new profile; into the open profile (updates, kept conditions and colors, replaced grids, other classes kept, a card's room kept) | `tests/domain/importTimetable.test.ts` |
| Main: reading | A workbook written with ExcelJS read back: formulas' saved results, merged cells, numbers, dates, errors, a hidden sheet, an `.xls` refused | `tests/main/importExcel.test.ts` |
| Round trip (IE-3) | Export the sample school, read it, import it into a new timetable: the same classes, homeroom teachers, used teachers with their details, subjects, cards (with no room), and placements. A made-up workbook in the school's layout (`fixtures/referenceWorkbook.ts`: `ID GV 1S`, `Data `, `Phan cong`, and `HK1` with `HLOOKUP`s and saved values, from the sample school) imported, then exported, gives the class sheets of the expected workbook | `tests/main/roundTrip.test.ts` |
| End-to-end | Import from the profile screen with the open dialog stubbed: the suggestions shown, Test's summary and problems, Import into a new profile and into the open profile (the question, the copy kept, the notice), Download example, the export's `Giáo viên` sheet | `tests/e2e/import.spec.ts`, `tests/e2e/export.spec.ts` |

The reference workbook is made from the made-up sample school by code, never from the real workbook.

## 13. The grade list (DM-8)

**Status:** proposed and approved by the user on 2026-11-02 (decision 13 in section 8).

**Covers:** DM-8 ([01-data-management.md](../requirements/01-data-management.md)), approved on 2026-11-02. The screens are in [TIMETABLE_SCREEN_LAYOUT.md](TIMETABLE_SCREEN_LAYOUT.md) (Class bar; Other screens: Grades dialog).

Settled with the requirement, not reopened here: a grade is a number from 1 to 12 and a class's grade still comes from its name; editing a grade renames its classes; deleting a grade deletes its classes and their placements after asking; grades are managed from the Classes page; a new timetable starts with none.

### 13.1 Data model (file format version 6)

- `Grade` becomes `number` (an integer from 1 to 12; `MIN_GRADE` and `MAX_GRADE` in `src/domain/model.ts`), and `TimetableFile` gains `grades: Grade[]`, kept in number order with no repeats. A class keeps its `grade` field, which must be in `grades`.
- **Upgrade 5 → 6:** `grades` is the grades the file's classes use, in order, so a file with no classes gets none (DM-8). Nothing else changes, so every grid looks the same, and an older copy of the app won't open a format 6 file.
- **The schema** checks `grades` as integers from 1 to 12 and a class's `grade` the same way, instead of the literals 6 to 9. **The integrity check** (`src/domain/integrity.ts`) adds: grades in order with no repeats, and every class's grade in the list.
- `createEmptyTimetable()` has `grades: []`. The made-up sample and review schools list `[6, 7, 8, 9]`, and every test fixture that builds a file with classes gains its grades. *As built (R5-1b review, 2026-11-09, at the user's request to fix all findings):* fixtures start from `fixtures/emptySchool.ts` (an empty timetable with grades 6 to 9), so there's no `withGrades` helper, and the 5 → 6 upgrade uses the domain's `gradesOf`.

### 13.2 The class-name rule

- `parseClassName` reads a grade from 1 to 12 before the track (`/^(1[0-2]|[1-9])(AA|A|CE|BA|B)([1-9]\d*)$/`), so `10A1` is grade 10 and `13A1` or `0A1` don't fit. The tracks stay the five there are.
- `checkClassName` in `src/domain/classes.ts` then refuses a grade that isn't in the list: "There's no Grade 10 yet. Add it with Grades on the Classes page." The pattern's message becomes "Use a grade, a track (A, AA, CE, B, or BA), and a section number, as in 6A1 or 8CE2."
- The forms' hint is worked out from the list (`classNameHint(grades)`): "Grade 6, 7, 8, or 9, a track, and a section, as in 6A1 or 8CE2." ("Grade 10, a track, …" for one grade). The two examples are always grades on the list (R5-1b review, 2026-11-09, at the user's request to fix all findings): the first grade with track A, and the third (or the last, with fewer) with track CE, so grades 10 and 11 give "as in 10A1 or 11CE2." With no grades the hint is "A grade, a track, and a section, as in 6A1 or 8CE2.", though no form can be opened then.

### 13.3 Domain commands (`src/domain/grades.ts`)

- `gradeLabel(grade)`: "Grade 10", used everywhere a grade is named (the tabs, the class line, the Cards page's filter, the dialog).
- `checkGrade(file, input, self)`: the number typed, trimmed; "Enter a grade from 1 to 12." for anything else, and "There's already a Grade 7." for one in the list other than `self`.
- `addGrade(file, input)`: adds it in number order.
- `editGrade(file, grade, input)`: changes the number and renames each of its classes to match (`6A1` → `10A1`: the new number, the same track and section), keeping their ids, so placements, homeroom teachers, the class on screen, and anything else naming a class by id stay as they are. Unchanged input saves nothing, as for rooms and subjects. A renamed class can't collide with another, since no class has a grade that isn't in the list.
- `gradeRows(file)`: each grade with how many classes it has, for the dialog.
- `gradeDeletionLines(file, grade)`: the delete question's lines (13.5's wording).
- `deleteGrade(state, grade)`: removes the grade, its classes, and their placements; the cards stay in the pool. `deleteClass` becomes `deleteClasses(state, classIds)`, shared by both, so the class on screen falls back to the first class by grade in one place.
- `classesByGrade` is unchanged (it groups the classes that exist); the class bar's tabs come from `file.grades`, so a grade with no classes still has its tab.

### 13.4 Screens and files

- **Class bar** (`ClassPicker.tsx`): the tabs are `file.grades` with `gradeLabel`, in place of the fixed four. The grade shown follows the class on screen, else the first grade; a browsed grade that's deleted falls back the same way. With no grades the picker row shows "No grades yet." and an Add grades pill, which goes to the Classes page and opens the Grades dialog; there's no New class tile then, and no Grade radiogroup. *As built (R5-1b review, 2026-11-09, at the user's request to fix all findings):* `App.tsx` keeps an `openGrades` request, set by the class bar's Add grades, and passes it to `ClassesScreen`, which opens the dialog on mount when it's set and clears it at once through `onGradesOpened`, so it's taken only once (R5-1c review, 2026-11-09). The dialog's grade form and delete question are `NameDialog`'s and `ConfirmDialog`'s bodies (`NameForm`, `ConfirmQuestion`), shared rather than copied.
- **Classes page:** a Grades pill (white, secondary) before Add class in the title row, opening the Grades dialog. With no grades, Add class is disabled with the tooltip "Add a grade first, with Grades.", and the empty page says "Add a grade with Grades above, then its classes with Add class." (`ListPage`'s `actions`, `addDisabledReason`, and `emptyHint`, R5-1b review, 2026-11-09).
- **Grades dialog** (`GradesDialog.tsx`, `useModalDialog`): one dialog with three views, so no dialog opens over another: the list (each grade's row with its class count, Edit, and Delete; Add grade and Close at the foot), the grade form (Add grade or Edit Grade 6, one Grade field with its message, and for Edit a muted line saying how its classes are renamed), and the delete question (as `ConfirmDialog` words it, with focus on Keep the grade). Cancel and Escape in the form or the question go back to the list; Escape on the list closes the dialog.
- **Cards page:** the Grade filter uses `gradeLabel`; it keeps offering only grades that have classes, as now.
- **Timetable screen:** the class line's "Grade 6" uses `gradeLabel`.
- **Import (release 5, section 12.4):** `importTimetable` adds the grades its classes need, into a new profile or the open one. The export doesn't change, since class names carry their grade.

### 13.5 Wording

- Edit's line under the field: "Its 4 classes are renamed to match, so 6A1 becomes 10A1." (nothing for a grade with no classes; the example is the grade's first class in class-bar order, renamed to the number typed, and while the field is empty, wrong, or unchanged the line stops at "renamed to match."; a grade with one class reads "Its class is renamed to match, so 6A1 becomes 10A1."). *As built at R5-1b (2026-11-02):* `gradeRenameLine` in `src/domain/grades.ts`; the delete question's one-class wording is "Its class 6A1 goes with it." and "18 periods placed on its grid are taken off; the cards stay in the pool."
- Delete question, with classes: "Delete Grade 6?" / "Its 4 classes go with it: 6A1, 6A2, 6AA1, 6CE1." / "42 periods placed on their grids are taken off; the cards stay in the pool." (left out when none is placed) / "This can't be undone." / Keep the grade, Delete grade. With no classes: "Grade 7 has no classes." / "This can't be undone."

### 13.6 Testing

| Kind | What it covers | Where |
|---|---|---|
| Unit | `checkGrade`'s messages; add in order; edit renaming classes and keeping ids and placements; an unchanged edit; delete taking classes and placements, keeping cards, and moving the class on screen; the deletion lines; the class-name rule for 1 to 12 and a grade not in the list; the hint | `tests/domain/grades.test.ts`, `tests/domain/className.test.ts`, `tests/domain/classes.test.ts` |
| Unit: file | 5 → 6 from the classes' grades, and none with no classes; the integrity check's two new refusals | `tests/main/fileFormat.test.ts`, `tests/domain/integrity.test.ts` |
| End-to-end | A new timetable's empty class bar and Add grades; the Grades dialog adding, editing (6A1 → 10A1 on the class bar and the Classes page, its grid kept), and deleting a grade with classes after the question; a version 5 file opening with its grades; many grades keeping the layout still | `tests/e2e/grades.spec.ts`, `tests/e2e/layout.spec.ts` |
