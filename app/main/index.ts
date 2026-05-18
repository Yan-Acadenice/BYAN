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

app.whenReady().then(() => {
  const tReady = Date.now();
  applyCsp(session.defaultSession);
  // Updater manager is created before registerAll so the IPC handler binds the
  // same singleton that main starts/stops below. electron-updater is only
  // active outside dev — start() short-circuits on isDev so the module is loaded
  // but never reaches out to the network when developing locally.
  const updater = isDev ? undefined : (electronAutoUpdater as unknown as AutoUpdaterLike);
  setUpdaterManager(new AutoUpdaterManager({ updater, isDev }));
  registerAll(ipcMain, { app });
  const tHandlers = Date.now();
  const mainWindow = createMainWindow();
  installMenu(mainWindow);

  // Start update checks once IPC + window are ready. start() is a no-op in dev.
  getUpdaterManager().start();

  if (isDev) {
    mainWindow.webContents.once('did-finish-load', () => {
      const tLoaded = Date.now();
      console.debug(
        `[perf] main boot — whenReady=${tReady - BOOT_T0}ms, ipc-handlers=${tHandlers - tReady}ms, ` +
        `window-loaded=${tLoaded - BOOT_T0}ms`
      );
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
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
