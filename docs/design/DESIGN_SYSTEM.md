# TimeTableMaker — Design System

The visual language for every screen, distilled from the mockup handoff at
[`school-timetable-builder-mockups/project/uploads/Subtle Gradient Design
System.md`](./school-timetable-builder-mockups/project/uploads/Subtle%20Gradient%20Design%20System.md)
and the mockup screens themselves
([`Timetable Builder.dc.html`](./school-timetable-builder-mockups/project/Timetable%20Builder.dc.html)).
That source file is written for a marketing site (gradient hero meshes,
pricing tiers, a public footer); none of that applies to a local single-user
dashboard app, so it's dropped here. What's kept is the token scale and the
component patterns the mockups actually use for CRUD tables, forms, the
timetable grid, and the nav rail. Implement these as real CSS custom
properties in `web/static/css/style.css` (today it only defines `--border`
and `--danger` — everything else is a literal repeated across the file; that
changes as part of this).

## Colors

```css
:root {
  --primary: #533afd;
  --primary-deep: #4434d4;
  --primary-press: #2e2b8c;
  --primary-soft: #665efd;
  --primary-subdued: #b9b9f9;   /* soft tag background */

  --ink: #0d253d;               /* default body text */
  --ink-secondary: #273951;
  --ink-mute: #64748d;          /* captions, helper text, table labels */
  --on-primary: #ffffff;

  --canvas: #ffffff;
  --canvas-soft: #f6f9fc;       /* table headers, feature bands */
  --canvas-cream: #f5e9d4;      /* warm callout band */
  --hairline: #e3e8ee;          /* 1px borders */
  --hairline-input: #a8c3de;    /* form input borders */

  --danger: #ea2261;            /* was #c0392b — clashes, delete actions */
  --danger-bg: #fdeef5;
  --warning-ink: #9b6829;       /* medium-severity clash text */
  --warning-bg: #f7edda;

  --rail-bg: #0d253d;           /* persistent nav rail background */
  --rail-ink-mute: #8fa2bb;
}
```

`--primary` replaces the old `#4f46e5` everywhere it appears — not just in
CSS, but the JS/HTML default color-picker values in `timetables.html`,
`workspace.html`, and `workspace.js`.

### Subject color families

Each `Subject.color_key` indexes into a small fixed palette, used
consistently as a drag-card accent, cell fill, and (optionally) an export
cell fill:

```js
const SUBJECT_COLOR_FAMILIES = {
  indigo: { bg: '#eeecfe', bar: '#533afd', ink: '#1c1e54' },
  violet: { bg: '#f1f0fe', bar: '#665efd', ink: '#1c1e54' },
  cream:  { bg: '#f7edda', bar: '#9b6829', ink: '#0d253d' },
  ruby:   { bg: '#fdeef5', bar: '#ea2261', ink: '#0d253d' },
  navy:   { bg: '#eef2f7', bar: '#273951', ink: '#0d253d' },
};
```

Don't add colors outside this set — a subject picker offering unlimited hex
values breaks the "color reads as a small fixed vocabulary" property the
grid relies on for scanability.

The 15 palettes in `TIMETABLE_SCREEN_LAYOUT.md` replace these families. Changed
2026-10-27 at the user's request (`SYSTEM_DESIGN.md` §10.5): the subject form
picks a palette or Custom colors, palettes first, so most subjects stay in the
fixed vocabulary. Custom colors are the user's data, not tokens, so they're
the one place a color reaches the screen as inline `--card-bg`, `--card-bar`,
and `--card-ink` (`subjectColorProps` in the renderer); the app's own styles
still use tokens only.

## Typography

Font: **Inter** (Google Fonts, with `system-ui` fallback — same substitution
rule as the source design system: never add a restricted font file). Display
sizes render at weight 300 with negative letter-spacing; body text is 300;
buttons and table numerics are weight 400.

| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `--text-display-lg` | 32px | 300 | -0.64px | Page titles ("Teachers", "Clash review") |
| `--text-display-md` | 26px | 300 | -0.26px | Card titles, teacher name header |
| `--text-heading-sm` | 18px | 300 | 0 | Section labels within a page |
| `--text-body` | 15px | 300 | 0 | Default UI text |
| `--text-tabular` | 14px | 300 | -0.42px | Any numeric cell (loads, counts, times) — pair with `font-feature-settings: "tnum"` |
| `--text-button` | 16/14px | 400 | 0 | Pill button label (md/sm) |
| `--text-caption` | 13px | 400 | -0.39px | Helper text |
| `--text-table-head` | 16px | 400 | 0 | Table column headings (added 2026-10-21) |
| `--text-micro-cap` | 10px | 400 | 0.1px, uppercase | Eyebrow labels ("REQUIRED LESSONS", "TEACHER") |

Apply `font-feature-settings: "tnum"` to every cell showing a count, load
percentage, or time (period start/end, "31 / 30 periods") — this is the one
rule from the source system worth keeping strictly, since the grid and
teacher-load tables are full of exactly this kind of numeric label.

## Spacing & radius

```css
:root {
  --space-xxs: 2px; --space-xs: 4px; --space-sm: 8px; --space-md: 12px;
  --space-lg: 16px; --space-xl: 24px; --space-xxl: 32px;

  --radius-xs: 4px;   /* tags, table chrome */
  --radius-sm: 6px;   /* form inputs */
  --radius-md: 8px;   /* compact cards, alerts */
  --radius-lg: 12px;  /* cards */
  --radius-pill: 9999px; /* every button and tag */
}
```

## Elevation

Two levels only — this app has no marketing-page gradient-mesh depth system,
just cards on a flat canvas:

```css
--shadow-1: rgba(0, 55, 112, 0.08) 0 1px 3px;   /* card resting on canvas-soft */
--shadow-2: rgba(0, 55, 112, 0.08) 0 8px 24px, rgba(0, 55, 112, 0.04) 0 2px 6px; /* modals, the nav rail's "working on" card */
```

## Components

- **Buttons** — always pill-shaped (`--radius-pill`), `8px 16px` padding,
  never smaller. Primary: `--primary` fill, white text. Secondary: white
  fill, `--primary` text and border. On the dark nav rail: `--rail-bg`
  fill... actually rail buttons use white/translucent, see nav rail below.
  Never use a non-pill rounded rectangle for a button.
- **Cards** — `--canvas` background, `--hairline` 1px border, `--radius-lg`,
  `--shadow-1`. Used for CRUD list rows-as-cards (subject library), the home
  dashboard tiles, and the clash-detail cards on the editor's side panel.
- **Pill tags/chips** — `--radius-pill`, `4px 8px` (micro-cap) or `6px 13px`
  (filter-chip size), used for: department filters, subject-in-teacher-row
  chips, clash-type filters, severity badges (`--danger-bg`/`--warning-bg`
  background matching severity).
  Toggle chips, for picking several values such as days or blocks, are
  filter-chip size: off is white with a `--line-strong` border and `--ink`
  text, on is an `--ink` fill with white text, like the chosen grade tab
  (approved 2026-10-22 for release 2's condition form). The padding is the
  `--chip-padding` token in `tokens.css` (added at R2-2, 2026-10-22).
  Color choices, for the subject form's Colors row (added 2026-10-27 at R3-5b,
  at the user's request): one radio group of pills at the toggle-chip size
  (white, `--line-strong` border) and 24px round swatches (tint fill, 2px
  inset ring in the bar). The chosen pill gets a `--primary` border, the
  chosen swatch a `--primary` ring 2px outside a `--canvas` gap, and keyboard
  focus a 2px `--primary` outline.
  Count badges on a tile or a tab use the severity colors too: errors are a
  `--danger` fill with white text, warnings a `--warning-bg` fill with
  `--warning-ink` text (approved 2026-10-22 for release 2's class tiles; see
  `TIMETABLE_SCREEN_LAYOUT.md`).
- **Tables** — header row `--canvas-soft` background with a `--line-strong`
  line under it, `--text-table-head` (16px, weight 400) labels in sentence
  case, `--ink` color, `16px 24px` padding; body rows `--text-tabular`,
  separated by `--hairline` borders, no vertical rules, generous row padding
  (`12px 24px`). (Changed on 2026-10-21 at the user's request: the header
  used to be `--text-micro-cap` uppercase labels in `--ink-mute`, which read
  too small. The Cards page is the first table; the release 3 list screens
  follow it.)
  A long table scrolls inside its bordered panel with the header row pinned
  (`position: sticky`, its bottom line drawn as an inset shadow so it stays
  with the header), and the panel keeps the scrollbar's room
  (`scrollbar-gutter: stable`) with the header's tint and line carried
  through that strip (added 2026-10-21 at the user's request).
- **Scrollbars** — every scrolling region uses the same thin bar:
  `--scrollbar-width` (8px), a `--line-strong` pill thumb that turns
  `--ink-mute` on hover, and no track. Where a region keeps the bar's room,
  its right padding is cut by the same width so both sides look even. The
  page itself never scrolls; regions do. (Added 2026-10-21 at the user's
  request, after the platform's 15–17px bar pushed the Cards page left.)
- **Inputs** — `--canvas` background, `--hairline-input` border,
  `--radius-sm`, focus state swaps border to `--primary`.
  A filter dropdown in a page's title row sits in the same pill as the
  search beside it (`--line-strong` border, `--radius-pill`, 13px, a chevron
  icon in place of the native arrow), so the row reads as one set of
  controls (added 2026-10-21 at the user's request, for the Cards page).
  A dropdown in a form (the card, teacher, and condition forms) is an input
  like the others, with the same chevron icon in `--ink-mute` in place of
  the system's arrow, 12px (`--space-md`) in from the right edge, and its
  text stopping short of it (`SelectInput.tsx`; changed 2026-10-26 at the
  user's request: the system's arrow sat too close to the edge).
  Every dropdown, in a form or a filter pill, shares one set of rules: the
  chevron is `--icon-sm` (14px) wide, 12px in from the right edge, and the
  text stops at `--select-chevron-room` (12px + the icon + 8px) from it; a
  disabled dropdown gets the normal cursor and a chevron at half strength
  (review of the change, 2026-10-26, at the user's request; the filter pills'
  text room grew from 30px to that shared 34px).
  A field that can be left empty while others on the form can't says so
  after its label: "(optional)" in `--ink-mute` at weight 300, the label's
  size (`.field-optional`; the class form's assistant homeroom teacher,
  R3-1 review, 2026-10-26, at the user's request).
- **Notices** — a problem the user needs to know about right away, such as
  a failed save, drops down from under the header over the screen instead of
  pushing it: `--danger-bg` fill, a 4px `--danger` left edge,
  `--radius-md`, `--shadow-2`, a `--danger` title line, plain words for what
  happened and what's safe, an action button, and Hide, since a notice
  covers part of the screen (added 2026-10-21 at the user's request).
- **Toggles** — pill switches (34×20px), `--primary` when on, `--hairline`
  when off — used for the structure screen's drag-rule settings and the
  export screen's checkboxes-as-toggles.
- **Segmented switches and filter dropdowns** (added 2026-10-23 at R2-5,
  the step the user asked to start) — a segmented switch is a
  `--canvas-soft` pill track with the chosen option as a white pill on
  `--shadow-1`; across a side panel its options share the width equally
  (`segmented-wide`), and each option keeps 8px a side instead of the
  buttons' 16px so "Warnings 12" fits the 288px panel (an exception to the
  button padding, settled 2026-10-23 when the user asked for R2-5's review
  findings to be fixed). A switch that can't be used right now keeps showing
  its choice, with the other options at half opacity. Each option is as wide
  as its label at the chosen option's 400 weight, so choosing another option
  never moves the options or what sits beside the switch, such as the class
  tiles beside the grade switch (added 2026-11-02 at the user's request; the
  same hidden-copy rule as the header menu's links). Filter dropdowns are
  one shared component (`FilterSelect.tsx`): a native select inside a
  search-shaped pill (`--line-strong` border, `--radius-pill`, 13px, a
  chevron icon), used on the Cards page and in the Issues tab.
- **List-row buttons** (added 2026-10-23, R2-5 review, at the user's
  request) — a list whose whole row is one button, such as the Issues tab's
  issues, is the one other exception to pill buttons: full width,
  `--radius-md`, `10px 12px` padding (`--issue-row-padding`), hover
  `--canvas-soft`, selected `--hover-tint` with a 1px `--primary` border.
  Its accessible name says the row in full, its severity first ("Error: …").
- **Menu items** (added 2026-10-29, R4-5, from the approved release 4
  mockup's Export menu) — the items of a dropdown menu, such as the class
  bar's Export menu, are rows of the menu, not pills: full width, left
  aligned, 14px, `8px 10px` padding, `--radius-sm`, no border or fill,
  `--hover-tint` on hover and keyboard focus, `--ink-mute` when disabled.
  The menu itself is a 240px white panel with a `--line-strong` border,
  `--radius-md`, `--shadow-2`, and 4px padding; groups are headed by a muted
  13px label and parted by a `--hairline` rule. The 10px side padding is
  the `--menu-item-inline` token (R4-5 review, 2026-10-29, the user asked
  for its findings to be fixed). Notices under the header stack in one
  fixed column (`notice-stack`, `--space-sm` apart) rather than covering
  each other.
- **Count badges on class tiles** (R2-7 review, 2026-10-23, at the user's
  request to fix all findings): 11px (`--text-break`) tabular numbers, parted
  from the tile by a 2px ring in the canvas color, the token `--badge-ring`.
- **Delete questions** (R2-7 review, 2026-10-23, at the user's request): the
  dialog's keep button ("Keep it", "Keep the teacher") has focus to start,
  not the `--danger` button, so Enter deletes nothing by accident.
- **Progress/load bars** — 3-4px tall, `--radius-pill`, `--hairline` track,
  `--primary` fill (or `--danger` fill once a teacher's load or a class's
  placement count goes over/at its limit).
- **Nav rail** (new — see `SYSTEM_DESIGN.md` → nav-rail shell) — persistent
  left column, `--rail-bg` background, white/`--rail-ink-mute` text, a
  "working on" card in `--shadow-2` translucent white, nav links as flat
  rows with a small status dot and an optional numeric badge
  (`--danger`-colored for the clash count), profile switcher pinned to the
  bottom.
- **Grid cells** (the timetable itself) — filled cells use the subject's
  color family (`bg` fill, `bar` as a 3px left accent, `ink` as text color);
  empty cells are dashed-border placeholders; a clash renders as a small
  `--danger` dot or a `--danger` inset border depending on density (see the
  mockup's default vs. "quiet" grid variants — this app ships the denser,
  color-filled variant, mockup option `1a`, as the default).

## Do's and don'ts (kept from the source system, trimmed to what applies here)

- Do use `--primary` sparingly — one filled pill per screen region (a table
  toolbar, a form footer), not on every action.
- Do apply `tnum` to every numeric cell.
- Do keep buttons pill-shaped and at least `8px 16px` padding.
- Don't introduce colors outside this file's palette, including for subject
  colors (fixed family list above) and clash severities (High/Medium/Low
  map to fixed colors, not user-chosen).
- Don't use `--primary` as a body-text color — CTA/link only.
- Don't carry over the source system's gradient-mesh hero, pricing-tier
  cards, or marketing footer — none of that exists in this app.
