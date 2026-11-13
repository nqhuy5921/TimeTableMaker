# Layouts

The app shell is a 56px dark top menu bar (`TopBar`) above the current screen (`main.shell-main`). There is no sidebar.

### `src/renderer/App.tsx`

```tsx
import { TopBar } from './components/TopBar';
import { TimetableScreen } from './screens/TimetableScreen';

export function App() {
  return (
    <div className="shell">
      <TopBar />
      <main className="shell-main">
        <TimetableScreen />
      </main>
    </div>
  );
}
```

### `src/renderer/components/TopBar.tsx`

```tsx
import { useEffect, useState } from 'react';

export function TopBar() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.api.getAppInfo().then((info) => setVersion(info.version));
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true" />
        TimeTableMaker
      </div>
      <nav aria-label="Main">
        <ul className="topbar-links">
          <li>
            <a className="topbar-link topbar-link-active" aria-current="page">
              Timetable
            </a>
          </li>
        </ul>
      </nav>
      {version && <div className="topbar-version tnum">Version {version}</div>}
    </header>
  );
}
```

### `src/renderer/main.tsx`

```tsx
// Inter is bundled into the app so it works offline (NF-3).
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```
