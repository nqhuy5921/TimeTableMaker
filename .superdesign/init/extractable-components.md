# Extractable components

#### Layout Components

## TopBar
- Source: `src/renderer/components/TopBar.tsx`
- Category: layout
- Description: 56px dark top menu bar with app mark + name, pill nav links, version on the right
- Extractable props: activeItem (string, default: "timetable")
- Hardcoded: CSS-drawn 2×2 mark, "TimeTableMaker" text, link labels, version text

#### Basic Components

## SubjectCard
- Source: CSS `.tt-card` in `src/renderer/styles/app.css` (markup shown in components.md)
- Category: basic
- Description: placed subject card — family bg, 3px left bar, subject on top, teacher left and room right below
- Extractable props: subject (string), teacher (string), room (string), color (string, default: "indigo"), half (boolean, default: false)
- Hardcoded: layout CSS
