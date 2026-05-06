// Renderer entrypoint — mounts the App component into #root.
// F4: wires the full onboarding + login flow via App.tsx.

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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
