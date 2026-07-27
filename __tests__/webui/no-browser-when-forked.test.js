// The webui server must not open a browser tab when a desktop app forked it.
//
// Reported: launching BYAN Desktop opened a page in the user's browser. Cause:
// server.js called openBrowser(url) unconditionally right after listen(), so the
// child Electron forks ran `xdg-open http://localhost:PORT`. A desktop app that
// throws the user into a browser is a desktop app that failed at being one.
//
// Standalone `byan --webui` still opens the browser: that IS its purpose. The
// distinction is whether a parent process forked us, which the code already
// knows (process.send exists only under child_process.fork).

const { shouldOpenBrowser } = require('../../install/src/webui/server');

describe('shouldOpenBrowser', () => {
  it('opens for a standalone run — that is what the web interface is for', () => {
    expect(shouldOpenBrowser({ isForked: false, env: {} })).toBe(true);
  });

  it('stays silent when a parent forked us (the desktop app)', () => {
    expect(shouldOpenBrowser({ isForked: true, env: {} })).toBe(false);
  });

  it('stays silent when asked to, even standalone', () => {
    // Explicit at the call site beats relying on the fork heuristic alone.
    expect(shouldOpenBrowser({ isForked: false, env: { BYAN_NO_BROWSER: '1' } })).toBe(false);
  });

  it('treats any non-empty value of the flag as "do not open"', () => {
    // A user typing BYAN_NO_BROWSER=true expects it to be honoured.
    expect(shouldOpenBrowser({ isForked: false, env: { BYAN_NO_BROWSER: 'true' } })).toBe(false);
    expect(shouldOpenBrowser({ isForked: false, env: { BYAN_NO_BROWSER: 'yes' } })).toBe(false);
  });

  it('an empty or absent flag does not suppress a standalone run', () => {
    expect(shouldOpenBrowser({ isForked: false, env: { BYAN_NO_BROWSER: '' } })).toBe(true);
    expect(shouldOpenBrowser({ isForked: false, env: {} })).toBe(true);
  });

  it('the fork signal wins over an absent flag', () => {
    // The desktop app should stay quiet without having to remember the flag.
    expect(shouldOpenBrowser({ isForked: true, env: { BYAN_NO_BROWSER: '' } })).toBe(false);
  });
});
