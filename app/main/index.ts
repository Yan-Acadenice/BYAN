// Electron main process entrypoint.
// Owns app lifecycle, BrowserWindow creation, and IPC bootstrap.
// Security baseline (mantra IA-23 / IA-24): contextIsolation: true, nodeIntegration: false.
// Renderer URL is decided by env: BYAN_DEV=1 -> Vite dev server, else file:// from build output.

import { app, BrowserWindow, session, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { applyCsp } from './csp';
import { registerAll } from './ipc-handlers';
import { installMenu } from './menu';
import { createLocalServer } from './local-server';
import { setLocalServer } from './ipc-handlers/server';
import { setLocalServerForAuth } from './ipc-handlers/auth';
import { autoUpdater as electronAutoUpdater } from 'electron-updater';
import { AutoUpdaterManager, type AutoUpdaterLike } from './auto-updater';
import { _setManagerForTests as setUpdaterManager, getManager as getUpdaterManager } from './ipc-handlers/update';
import { DEEP_LINK_SCHEME, findDeepLinkInArgv, parseDeepLink } from './deep-links';

// Singleton local server — started on login (F13), stopped on quit.
const localServer = createLocalServer({ logger: console });
setLocalServer(localServer);
// auth handler needs the same singleton to check server status for mode:'local'.
setLocalServerForAuth(localServer);

localServer.on('fatal', () => {
  dialog.showErrorBox(
    'Local server failed',
    'Cannot start the local BYAN server. Switch to cloud mode in Settings.'
  );
});

const DEV_SERVER_URL = process.env.BYAN_DEV_SERVER_URL ?? 'http://localhost:5173';
const isDev = process.env.BYAN_DEV === '1';

// Tracks the main BrowserWindow at module scope so cross-event handlers
// (open-url on Mac, second-instance on Linux/Win, deep-link dispatch) can
// reach it without threading a reference through every callback.
let mainWindowRef: BrowserWindow | null = null;
// Buffer a deep link if it arrives before the window is ready to receive it.
let pendingDeepLink: string | null = null;

function dispatchDeepLink(raw: string): void {
  const link = parseDeepLink(raw);
  if (!link) return;
  if (mainWindowRef && !mainWindowRef.isDestroyed() && !mainWindowRef.webContents.isDestroyed()) {
    mainWindowRef.webContents.send('byan:deepLink', link);
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    mainWindowRef.focus();
  } else {
    pendingDeepLink = raw;
  }
}

// Register the byan:// protocol with the OS so browsers / Slack / etc. route
// links to this app. Electron requires an absolute path on Windows when the
// app is run via `electron .` for the registration to land.
function registerProtocolHandler(): void {
  if (process.defaultApp) {
    // Dev runs go through `electron .` — pass the script path so Windows
    // associates the protocol with this argv, not the bare `electron.exe`.
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  }
}

// Single-instance lock — without it, every byan:// click on Linux/Windows
// spawns a fresh Electron process instead of routing through second-instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running; it will handle whatever URL was
  // passed via second-instance below. We exit quietly.
  app.quit();
}

// E2E mode flag (F18) — main process opts into deterministic stubs read by:
//   - main/env-detect.ts          (BYAN_E2E_MOCK_CLI)
//   - main/ipc-handlers/auth.ts   (BYAN_E2E_MOCK_AUTH)
//   - main/local-server.ts        (BYAN_E2E_MOCK_SERVER_PORT)
//   - app/__tests__/e2e/fixtures  (BYAN_E2E_TMP_PROJECT_ROOT)
// The flag itself stays read-only; consumers gate on process.env.BYAN_E2E_MODE.
const isE2E = process.env.BYAN_E2E_MODE === '1';
void isE2E;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0a0f1e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    void win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexHtml = path.join(__dirname, '..', 'renderer', 'index.html');
    void win.loadFile(indexHtml);
  }

  return win;
}

const BOOT_T0 = Date.now();

// Second instance (Linux / Windows): another byan:// click while we are
// already running. The new instance hands its argv off and exits via the
// single-instance lock; we extract the URL and dispatch it locally.
app.on('second-instance', (_event, argv) => {
  const url = findDeepLinkInArgv(argv);
  if (url) dispatchDeepLink(url);
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    mainWindowRef.focus();
  }
});

// macOS: the OS delivers the protocol via this event instead of argv.
// Fires both at cold start (after whenReady) and while the app is running.
app.on('open-url', (event, url) => {
  event.preventDefault();
  dispatchDeepLink(url);
});

app.whenReady().then(() => {
  const tReady = Date.now();
  applyCsp(session.defaultSession);
  registerProtocolHandler();
  // Updater manager is created before registerAll so the IPC handler binds the
  // same singleton that main starts/stops below. electron-updater is only
  // active outside dev — start() short-circuits on isDev so the module is loaded
  // but never reaches out to the network when developing locally.
  const updater = isDev ? undefined : (electronAutoUpdater as unknown as AutoUpdaterLike);
  setUpdaterManager(new AutoUpdaterManager({ updater, isDev }));
  registerAll(ipcMain, { app });
  const tHandlers = Date.now();
  const mainWindow = createMainWindow();
  mainWindowRef = mainWindow;
  installMenu(mainWindow);

  // Start update checks once IPC + window are ready. start() is a no-op in dev.
  getUpdaterManager().start();

  // Cold-start deep link: Linux/Windows pass the URL in process.argv when the
  // OS launches the app from a byan:// click. We dispatch once the renderer is
  // loaded so the renderer listener is guaranteed to be wired.
  const argvLink = findDeepLinkInArgv(process.argv);
  if (argvLink) pendingDeepLink = argvLink;

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingDeepLink) {
      const url = pendingDeepLink;
      pendingDeepLink = null;
      dispatchDeepLink(url);
    }
    if (isDev) {
      const tLoaded = Date.now();
      console.debug(
        `[perf] main boot — whenReady=${tReady - BOOT_T0}ms, ipc-handlers=${tHandlers - tReady}ms, ` +
        `window-loaded=${tLoaded - BOOT_T0}ms`
      );
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createMainWindow();
      mainWindowRef = win;
    }
  });
});

// Gracefully stop the child server before Electron exits so the OS port is freed.
app.on('before-quit', (e) => {
  e.preventDefault();
  getUpdaterManager().stop();
  void localServer.stop().finally(() => app.exit(0));
});

app.on('window-all-closed', () => {
  // macOS convention: keep the process alive when all windows are closed; the
  // user reopens via the dock and the 'activate' handler above creates a fresh
  // window. Other platforms exit immediately.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
