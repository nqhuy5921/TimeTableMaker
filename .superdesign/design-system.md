# TimeTableMaker design system

## Product context

TimeTableMaker is an offline Windows desktop app (Electron, minimum window 1280 × 720) for one school timetable coordinator at a Vietnamese secondary school (grades 6–9). The interface language is English; data the user types (subjects, teacher short names, rooms) is often Vietnamese, for example `Toán`, `Ngữ văn`, `T. An`, `P.201`, so every font and layout must handle Vietnamese diacritics.

Job to be done: build each class's weekly timetable fast. The coordinator picks a class (such as `6A1`, `8CE1`), sees that class's subject cards, and drags each card onto an empty slot of the week grid.

Key concepts:
- **Week grid**: Monday–Friday columns × 5 period blocks per day: morning `1-2` 08:00–09:10, `3-4` 09:20–10:30, `5-6` 10:40–11:50; lunch 11:50–13:20; afternoon `7-8` 13:20–14:30, `9-10` 14:50–16:00. Short breaks (10 min) and a snack break (20 min) sit between blocks. 25 slots a week.
- **Subject card**: one subject for one class, showing subject name, teacher short name, and room, plus "placed / total" periods per week (e.g. `6 / 8`). A full-block placement counts 2 periods; a half-block placement counts 1, and a slot can hold two half-block cards stacked (e.g. `SH lớp` + `GDPC`).
- **Card panel**: the selected class's cards, filterable by teacher or subject; fully placed cards are dimmed but still draggable. "Add card" opens a form.
- **Errors and warnings** (next release): a list of problems such as a teacher in two classes at once (error, `--danger`) or the same subject twice in a day (warning, `--warning-*`). Slots involved get a small danger dot or inset border.

Screen layout (chosen by the user — keep it):
- A 56px dark top menu bar (`--rail-bg`) with the app mark and name, pill nav links (Timetable now; Teachers, Classes, Rooms, Subjects later), version on the right.
- Below it: page header with title and class picker, then a left card panel (~280px) and the week grid filling the rest.

## Colors (the only colors allowed)

```css
--primary: #533afd; --primary-deep: #4434d4; --primary-press: #2e2b8c; --primary-soft: #665efd; --primary-subdued: #b9b9f9;
--ink: #0d253d; --ink-secondary: #273951; --ink-mute: #64748d; --on-primary: #ffffff;
--canvas: #ffffff; --canvas-soft: #f6f9fc; --canvas-cream: #f5e9d4; --hairline: #e3e8ee; --hairline-input: #a8c3de;
--danger: #ea2261; --danger-bg: #fdeef5; --warning-ink: #9b6829; --warning-bg: #f7edda;
--rail-bg: #0d253d; --rail-ink-mute: #8fa2bb; --rail-highlight: rgba(255,255,255,0.12);
```

Subject color families — every subject uses exactly one (bg / bar / ink):
- indigo `#eeecfe / #533afd / #1c1e54`
- violet `#f1f0fe / #665efd / #1c1e54`
- cream `#f7edda / #9b6829 / #0d253d`
- ruby `#fdeef5 / #ea2261 / #0d253d`
- navy `#eef2f7 / #273951 / #0d253d`

No gradients, no other hues, no dark mode.

## Typography

Inter only (system-ui fallback). Light weights: display 32px/300/-0.64px; card title 26px/300; section heading 18px/300; body 15px/300; numbers 14px with `font-feature-settings: "tnum"`; buttons 16/14px/400; caption 13px/400/-0.39px; eyebrow 10px/400 uppercase/0.1px. Every count, load, and time uses tabular figures.

## Spacing, radius, elevation

Spacing 2, 4, 8, 12, 16, 24, 32px. Radius: 4 (tags), 6 (inputs), 8 (compact cards, slots), 12 (cards), 9999 (every button and tag). Shadows: `rgba(0,55,112,.08) 0 1px 3px` for cards on `--canvas-soft`; `rgba(0,55,112,.08) 0 8px 24px, rgba(0,55,112,.04) 0 2px 6px` for dialogs and drag previews.

## Components

- Buttons are always pills, at least `8px 16px` padding. Primary: `--primary` fill, white text, at most one per screen region. Secondary: white fill, `--primary` text and border. `--primary` is never body text.
- Cards: white, 1px `--hairline` border, 12px radius, shadow-1.
- Pills/chips: 9999 radius, `4px 8px` or `6px 13px`.
- Inputs: white, `--hairline-input` border, 6px radius, `--primary` border on focus.
- Placed subject card in the grid: subject family `bg` fill, 3px `bar` left accent, `ink` text; subject name on top, teacher (left) and room (right) below; half-block cards put all on one line.
- Empty slot: dashed `--hairline-input` border on `--canvas-soft`, 8px radius.
- Progress/load bars: 3–4px, pill, `--hairline` track, `--primary` fill (`--danger` when over).

## Motion

Subtle and quick (120–180ms): hover border/background shifts, drag preview lifts with shadow-2, drop target half highlights in `--primary-subdued`.

## Don'ts

No marketing-site elements (hero meshes, pricing cards, footers). No left sidebar nav. No colors, fonts, or radii outside this file.
