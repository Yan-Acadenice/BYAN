// Content Security Policy for the renderer.
// Injected via session.webRequest.onHeadersReceived because:
// - meta tag CSP has no authority over fetch already-in-flight at parse time
// - webPreferences has no CSP knob in Electron 33
// File source for prod (file://) and Vite dev (http://localhost:5173) both go through this hook.

import type { Session } from 'electron';

// Directives kept as a structured map so tests can assert per-directive without parsing a string.
// `style-src 'unsafe-inline'` is a deliberate concession: Tailwind injects style attributes at runtime.
// Removing it would require nonces threaded through every component — out of scope for F12.
// `connect-src` whitelists:
//   - byan-api.stark.a3n.fr (cloud REST + WSS for sync, see F19)
//   - ws://localhost:* (F3 local mode WebSocket bridge)
//   - *.googleapis.com (MCP gdrive integration)
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'https:'],
  'connect-src': [
    "'self'",
    'https://byan-api.stark.a3n.fr',
    'ws://localhost:*',
    'wss://byan-api.stark.a3n.fr',
    'https://*.googleapis.com'
  ],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"]
});

export function buildCspHeader(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

export function applyCsp(session: Session): void {
  const cspHeader = buildCspHeader();

  session.webRequest.onHeadersReceived((details, callback) => {
    // Strip any pre-existing CSP header from upstream (Vite dev server etc.)
    // before we inject ours, otherwise the browser intersects both policies.
    const responseHeaders = { ...(details.responseHeaders ?? {}) };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[key];
      }
    }
    responseHeaders['Content-Security-Policy'] = [cspHeader];

    callback({ responseHeaders });
  });
}
