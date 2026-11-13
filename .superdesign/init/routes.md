# Routes

There is no router. The app has a single screen today, rendered by `App.tsx`:

| Screen | Component | Layout |
|---|---|---|
| Timetable (default, only screen) | `src/renderer/screens/TimetableScreen.tsx` | `App.tsx` shell: `TopBar` + `main.shell-main` |

Planned screens (later releases, not built): Teachers, Classes, Rooms, Subjects lists (release 3); Import/Export (release 4).

Timetable screen summary: page title "Timetable" with a class pill; left column (280px) "Cards" panel with an "Add card" primary button and an empty state; right column the week grid — time column (block label `1-2` … `9-10` with time range) plus Monday–Friday columns, 5 period blocks, quiet break lines between blocks and a cream lunch band; empty slots are dashed placeholders. Slots hold one full-block subject card or two half-block cards stacked.
