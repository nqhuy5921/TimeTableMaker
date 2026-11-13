# Components

Framework: React 19 + TypeScript in an Electron 44 desktop app (Windows 10/11 target), built with electron-vite/Vite 8.
Component library: none (custom components). CSS: vanilla CSS with custom properties (no Tailwind, no CSS modules).
Drag and drop (planned): @dnd-kit/core. Font: Inter (bundled via @fontsource/inter, weights 300 and 400).
Window: minimum 1280 × 720, default 1440 × 900. Desktop only, no mobile layout.

There is no shared UI primitives folder yet. Primitives are CSS classes in `src/renderer/styles/base.css`:

- `.btn` — pill button, 8px 16px padding, white fill with `--primary` text and border.
- `.btn-primary` — filled `--primary` pill with white text (one per screen region).
- `.caption` — 13px, weight 400, `--ink-mute`.
- `.micro-cap` — 10px uppercase eyebrow label.
- `.tnum` — tabular figures only (keeps surrounding size).

Placed subject card (CSS in `app.css`, markup not yet a React component):

```html
<div class="tt-card subject-indigo">
  <span class="tt-card-subject">Toán</span>
  <span class="tt-card-meta"><span>T. An</span><span>P.201</span></span>
</div>
```

Subject color families: `subject-indigo | subject-violet | subject-cream | subject-ruby | subject-navy` set `--card-bg/--card-bar/--card-ink`.

### `src/renderer/styles/base.css`

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-body);
  font-weight: 300;
  color: var(--ink);
  background: var(--canvas-soft);
}

h1,
h2,
h3 {
  margin: 0;
  font-weight: 300;
}

h1 {
  font-size: var(--text-display-lg);
  letter-spacing: -0.64px;
}

h2 {
  font-size: var(--text-heading-sm);
}

/* Every count, load, and time uses tabular figures. Only sets the figures, so it
   keeps the size of the text around it. */
.tnum {
  font-feature-settings: 'tnum';
}

.caption {
  font-size: var(--text-caption);
  font-weight: 400;
  letter-spacing: -0.39px;
  color: var(--ink-mute);
}

.micro-cap {
  font-size: var(--text-micro-cap);
  font-weight: 400;
  letter-spacing: 0.1px;
  text-transform: uppercase;
  color: var(--ink-mute);
}

/* Buttons are always pills, at least 8px 16px. */
.btn {
  border-radius: var(--radius-pill);
  padding: var(--space-sm) var(--space-lg);
  font: inherit;
  font-size: var(--text-button-sm);
  font-weight: 400;
  cursor: pointer;
  border: 1px solid var(--primary);
  background: var(--canvas);
  color: var(--primary);
}

.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-deep);
}

.btn-primary:active:not(:disabled) {
  background: var(--primary-press);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
```
