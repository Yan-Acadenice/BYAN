// Renderer entrypoint — mounts the App component into #root.
// F4: wires the full onboarding + login flow via App.tsx.

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

const root = createRoot(container);
root.render(<App />);
