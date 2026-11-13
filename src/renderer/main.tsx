// Lexend is bundled into the app so it works offline (NF-3). These files include the
// Vietnamese subset.
import '@fontsource/lexend/300.css';
import '@fontsource/lexend/400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';

// Cards are dragged with pointer events (dnd-kit), never with the browser's own drag and
// drop. A file dragged in from outside is refused here, so dropping it on the window does
// nothing instead of opening the file in place of the app.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
