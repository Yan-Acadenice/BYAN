// Application menu — cross-platform (Linux / Windows / macOS).
//
// Accelerator strings use CmdOrCtrl which Electron maps to Cmd on macOS and
// Ctrl elsewhere. The label rendered in the menu picks up the right symbol
// automatically.
//
// On macOS, conventions add two extra top-level menus:
//   - The "BYAN" app menu (always first) — About / Hide / Quit
//   - The "Window" menu — Minimize / Zoom / Close
// We branch on process.platform === 'darwin' to insert them.

import { app, BrowserWindow, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';

const isDev = process.env.NODE_ENV === 'development' || process.env.BYAN_DEV === '1';
const isMac = process.platform === 'darwin';

function sendMenuAction(win: BrowserWindow, action: string): void {
  win.webContents.send('byan:menu:action', { action });
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function aboutMessageBoxOptions(): Electron.MessageBoxOptions {
  return {
    type: 'info',
    title: 'About BYAN',
    message: 'BYAN — Builder of YAN',
    detail: [
      `App version: ${app.getVersion()}`,
      `Electron: ${process.versions.electron}`,
      `Node: ${process.versions.node}`,
    ].join('\n'),
  };
}

function buildTemplate(): MenuItemConstructorOptions[] {
  // Mac-only "BYAN" app menu (must be first when present).
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      {
        label: `About ${app.name}`,
        click() { void dialog.showMessageBox(aboutMessageBoxOptions()); },
      },
      { type: 'separator' },
      { label: 'Services', role: 'services', submenu: [] },
      { type: 'separator' },
      { label: `Hide ${app.name}`, accelerator: 'Command+H', role: 'hide' },
      { label: 'Hide Others', accelerator: 'Command+Alt+H', role: 'hideOthers' },
      { label: 'Show All', role: 'unhide' },
      { type: 'separator' },
      { label: `Quit ${app.name}`, accelerator: 'Command+Q', click() { app.quit(); } },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: 'CmdOrCtrl+N',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'newProject');
        },
      },
      {
        label: 'Open Project',
        accelerator: 'CmdOrCtrl+O',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'openProject');
        },
      },
      {
        label: 'Import',
        accelerator: 'CmdOrCtrl+I',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'import');
        },
      },
      { type: 'separator' },
      { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
      // Quit lives in the app menu on Mac; skip the duplicate.
      ...(!isMac
        ? [{ label: 'Quit', accelerator: 'CmdOrCtrl+Q', click() { app.quit(); } } as MenuItemConstructorOptions]
        : []),
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      { type: 'separator' },
      { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      // Mac convention: Edit menu ends with a Speech submenu.
      ...(isMac
        ? ([
            { type: 'separator' },
            { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] },
          ] as MenuItemConstructorOptions[])
        : []),
    ],
  };

  const viewBaseItems: MenuItemConstructorOptions[] = [
    { type: 'separator' },
    { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
    { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
    { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
    { type: 'separator' },
    { label: 'Toggle Full Screen', role: 'togglefullscreen' },
  ];

  const viewDevItems: MenuItemConstructorOptions[] = isDev
    ? [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click() {
            const win = getMainWindow();
            if (win) win.webContents.reload();
          },
        },
        {
          // Mac shortcut convention is Cmd+Alt+I; Electron's CmdOrCtrl maps Alt to Alt.
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click() {
            const win = getMainWindow();
            if (win) win.webContents.toggleDevTools();
          },
        },
      ]
    : [];

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [...viewDevItems, ...viewBaseItems],
  };

  // Mac-only Window menu — convention places it just before Help.
  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    role: 'window',
    submenu: [
      { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
      { label: 'Zoom', role: 'zoom' },
      { type: 'separator' },
      { label: 'Bring All to Front', role: 'front' },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: 'Help',
    role: 'help',
    submenu: [
      {
        label: 'Documentation',
        click() { void shell.openExternal('https://github.com/Yan-Acadenice/BYAN'); },
      },
      {
        label: 'GitHub Issues',
        click() { void shell.openExternal('https://github.com/Yan-Acadenice/BYAN/issues'); },
      },
      // About lives in the app menu on Mac; the Help fallback covers Linux/Windows.
      ...(!isMac
        ? ([
            { type: 'separator' },
            { label: 'About BYAN', click() { void dialog.showMessageBox(aboutMessageBoxOptions()); } },
          ] as MenuItemConstructorOptions[])
        : []),
      { type: 'separator' },
      {
        label: 'ELO Summary',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'eloSummary');
        },
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [];
  if (isMac) template.push(appMenu);
  template.push(fileMenu, editMenu, viewMenu);
  if (isMac) template.push(windowMenu);
  template.push(helpMenu);
  return template;
}

export function installMenu(mainWindow: BrowserWindow): void {
  const template = buildTemplate();
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  void mainWindow;
}
