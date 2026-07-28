// Renderer entrypoint — mounts the App component into #root.
// F4: wires the full onboarding + login flow via App.tsx.

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Typography is BUNDLED, not fetched. index.html used to pull Inter and JetBrains
// Mono from Google Fonts at every launch: an app whose whole point is "no cloud"
// went to the network for its own letters, and fell back to the system sans when
// offline. Josefin Sans was not loaded at all, so aliasing a title to it would
// have silently rendered something else. Only the weights actually used are
// imported. Josefin Sans stops at 700 (measured on the package), which is why no
// title may carry font-black.
import '@fontsource/josefin-sans/400.css';
import '@fontsource/josefin-sans/600.css';
import '@fontsource/josefin-sans/700.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import './index.css';

performance.mark('byan:renderer:script-start');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

const root = createRoot(container);
root.render(<App />);

// Logged once on next microtask so the React commit lands before measuring.
queueMicrotask(() => {
  performance.mark('byan:renderer:render-called');
  performance.measure('byan:renderer:bootstrap', 'byan:renderer:script-start', 'byan:renderer:render-called');
  const m = performance.getEntriesByName('byan:renderer:bootstrap').pop();
  if (m) console.debug(`[perf] renderer bootstrap ${m.duration.toFixed(1)}ms`);
});
