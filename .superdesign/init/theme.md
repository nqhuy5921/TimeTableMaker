# Theme

## Part 1 — Token summary

Colors: --primary #533afd, --primary-deep #4434d4, --primary-press #2e2b8c, --primary-soft #665efd, --primary-subdued #b9b9f9;
--ink #0d253d, --ink-secondary #273951, --ink-mute #64748d, --on-primary #ffffff;
--canvas #ffffff, --canvas-soft #f6f9fc, --canvas-cream #f5e9d4, --hairline #e3e8ee, --hairline-input #a8c3de;
--danger #ea2261, --danger-bg #fdeef5, --warning-ink #9b6829, --warning-bg #f7edda;
--rail-bg #0d253d (top bar), --rail-ink-mute #8fa2bb, --rail-highlight rgba(255,255,255,0.12). No dark mode.

Subject families (bg / bar / ink): indigo #eeecfe/#533afd/#1c1e54, violet #f1f0fe/#665efd/#1c1e54, cream #f7edda/#9b6829/#0d253d, ruby #fdeef5/#ea2261/#0d253d, navy #eef2f7/#273951/#0d253d.

Type: Inter, system-ui fallback. Display 32px/300/-0.64px; display-md 26px/300; heading-sm 18px/300; body 15px/300; tabular 14px (tnum); button 16/14px/400; caption 13px/400/-0.39px; micro-cap 10px/400 uppercase.
Spacing: 2, 4, 8, 12, 16, 24, 32px. Radius: xs 4, sm 6, md 8, lg 12, pill 9999. Shadows: shadow-1 rgba(0,55,112,.08) 0 1px 3px; shadow-2 rgba(0,55,112,.08) 0 8px 24px, rgba(0,55,112,.04) 0 2px 6px.
Rules: buttons always pills; one filled primary per region; primary never for body text; every number uses tnum; subject colors only from the five families; errors use --danger, warnings --warning-*.

## Part 2 — Raw sources

### `src/renderer/styles/tokens.css`

```css
/* Design tokens from docs/design/DESIGN_SYSTEM.md. Every color, space, radius, and
   shadow in the app comes from here; components never use literal hex values. */

:root {
  /* Colors */
  --primary: #533afd;
  --primary-deep: #4434d4;
  --primary-press: #2e2b8c;
  --primary-soft: #665efd;
  --primary-subdued: #b9b9f9;

  --ink: #0d253d;
  --ink-secondary: #273951;
  --ink-mute: #64748d;
  --on-primary: #ffffff;

  --canvas: #ffffff;
  --canvas-soft: #f6f9fc;
  --canvas-cream: #f5e9d4;
  --hairline: #e3e8ee;
  --hairline-input: #a8c3de;

  --danger: #ea2261;
  --danger-bg: #fdeef5;
  --warning-ink: #9b6829;
  --warning-bg: #f7edda;

  --rail-bg: #0d253d;
  --rail-ink-mute: #8fa2bb;
  --rail-highlight: rgba(255, 255, 255, 0.12); /* active item on the dark menu bar */

  /* Subject color families, indexed by Subject.colorKey */
  --subject-indigo-bg: #eeecfe;
  --subject-indigo-bar: #533afd;
  --subject-indigo-ink: #1c1e54;
  --subject-violet-bg: #f1f0fe;
  --subject-violet-bar: #665efd;
  --subject-violet-ink: #1c1e54;
  --subject-cream-bg: #f7edda;
  --subject-cream-bar: #9b6829;
  --subject-cream-ink: #0d253d;
  --subject-ruby-bg: #fdeef5;
  --subject-ruby-bar: #ea2261;
  --subject-ruby-ink: #0d253d;
  --subject-navy-bg: #eef2f7;
  --subject-navy-bar: #273951;
  --subject-navy-ink: #0d253d;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --text-display-lg: 32px;
  --text-display-md: 26px;
  --text-heading-sm: 18px;
  --text-body: 15px;
  --text-tabular: 14px;
  --text-button-md: 16px;
  --text-button-sm: 14px;
  --text-caption: 13px;
  --text-micro-cap: 10px;

  /* Spacing */
  --space-xxs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-xxl: 32px;

  /* Radius */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 9999px;

  /* Elevation */
  --shadow-1: rgba(0, 55, 112, 0.08) 0 1px 3px;
  --shadow-2: rgba(0, 55, 112, 0.08) 0 8px 24px, rgba(0, 55, 112, 0.04) 0 2px 6px;
}
```

### `src/renderer/styles/app.css`

```css
/* Shell: menu bar across the top, the screen below it. */
.shell {
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
  height: 100%;
}

.shell-main {
  min-height: 0;
  overflow: auto;
}

/* Top menu bar */
.topbar {
  display: flex;
  align-items: center;
  gap: var(--space-xxl);
  padding: 0 var(--space-xl);
  background: var(--rail-bg);
  color: var(--on-primary);
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-heading-sm);
}

.topbar-mark {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  background:
    linear-gradient(var(--rail-bg), var(--rail-bg)) 50% 0 / 2px 100% no-repeat,
    linear-gradient(var(--rail-bg), var(--rail-bg)) 0 50% / 100% 2px no-repeat,
    var(--primary-soft);
}

.topbar-links {
  display: flex;
  gap: var(--space-xs);
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.topbar-link {
  display: block;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-pill);
  color: var(--rail-ink-mute);
  font-weight: 400;
}

.topbar-link-active {
  color: var(--on-primary);
  background: var(--rail-highlight);
}

.topbar-version {
  margin-left: auto;
  font-size: var(--text-caption);
  color: var(--rail-ink-mute);
}

/* Timetable screen: class bar on top, card panel on the left, grid on the right. */
.timetable-screen {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'bar bar'
    'panel grid';
  gap: var(--space-lg) var(--space-xl);
  padding: var(--space-xl);
  min-height: 100%;
}

.class-bar {
  grid-area: bar;
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.class-pill {
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  background: var(--canvas);
}

/* Card panel */
.card-panel {
  grid-area: panel;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-lg);
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
}

.card-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-panel-empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-xl) var(--space-lg);
  border: 1px dashed var(--hairline-input);
  border-radius: var(--radius-md);
  background: var(--canvas-soft);
  text-align: center;
}

.card-panel-empty p {
  margin: 0;
}

/* Timetable grid: one CSS grid with a time column plus five equal day columns. */
.grid-region {
  grid-area: grid;
  min-width: 0;
}

.tt-grid {
  /* Slots grow with the window, so the whole week fits at 1280 × 720 without scrolling. */
  --slot-height: clamp(64px, calc((100vh - 350px) / 5), 104px);

  display: grid;
  grid-template-columns: 88px repeat(5, minmax(0, 1fr));
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg) var(--space-lg);
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
}

.tt-row {
  display: contents;
}

.tt-day {
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--hairline);
  text-align: center;
  font-size: var(--text-caption);
  font-weight: 400;
  color: var(--ink-secondary);
}

.tt-corner {
  border-bottom: 1px solid var(--hairline);
}

.tt-time {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-xxs);
  padding-left: var(--space-xs);
}

.tt-time-label {
  font-size: var(--text-heading-sm);
  color: var(--ink);
}

.tt-slot {
  height: var(--slot-height);
  border-radius: var(--radius-md);
}

.tt-slot-empty {
  border: 1px dashed var(--hairline-input);
  background: var(--canvas-soft);
  transition:
    border-color 120ms,
    background-color 120ms;
}

.tt-slot-empty:hover {
  border-color: var(--primary-subdued);
  background: var(--canvas);
}

/* A slot holding two half-block cards stacks them. */
.tt-slot-split {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: var(--space-xs);
}

/* Short breaks are a quiet line; long ones (lunch) are a warm band. */
.tt-break {
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  font-size: var(--text-micro-cap);
  font-weight: 400;
  letter-spacing: 0.1px;
  text-transform: uppercase;
  color: var(--ink-mute);
}

.tt-break::before,
.tt-break::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--hairline);
}

.tt-break-long {
  padding: var(--space-xs) 0;
  border-radius: var(--radius-xs);
  background: var(--canvas-cream);
  color: var(--warning-ink);
}

.tt-break-long::before,
.tt-break-long::after {
  content: none;
}

/* A subject card placed in a slot: family bg, 3px bar accent, ink text. */
.subject-indigo {
  --card-bg: var(--subject-indigo-bg);
  --card-bar: var(--subject-indigo-bar);
  --card-ink: var(--subject-indigo-ink);
}
.subject-violet {
  --card-bg: var(--subject-violet-bg);
  --card-bar: var(--subject-violet-bar);
  --card-ink: var(--subject-violet-ink);
}
.subject-cream {
  --card-bg: var(--subject-cream-bg);
  --card-bar: var(--subject-cream-bar);
  --card-ink: var(--subject-cream-ink);
}
.subject-ruby {
  --card-bg: var(--subject-ruby-bg);
  --card-bar: var(--subject-ruby-bar);
  --card-ink: var(--subject-ruby-ink);
}
.subject-navy {
  --card-bg: var(--subject-navy-bg);
  --card-bar: var(--subject-navy-bar);
  --card-ink: var(--subject-navy-ink);
}

.tt-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  height: 100%;
  padding: var(--space-sm) var(--space-sm) var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--card-bg);
  box-shadow: inset 3px 0 0 var(--card-bar);
  color: var(--card-ink);
}

.tt-card-subject {
  overflow: hidden;
  font-size: var(--text-tabular);
  font-weight: 400;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tt-card-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--space-xs);
  font-size: var(--text-caption);
  opacity: 0.8;
}

.tt-card-meta > span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Half-block cards put everything on one line. */
.tt-slot-split .tt-card {
  flex-direction: row;
  align-items: center;
  gap: var(--space-sm);
  padding-block: 0;
}

.tt-slot-split .tt-card-subject {
  flex: none;
  max-width: 60%;
}

.tt-slot-split .tt-card-meta {
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}
```
