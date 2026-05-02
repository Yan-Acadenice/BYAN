// Application menu for Linux and Windows.
// Mac-specific items (BYAN menu, Hide, Cmd+,, Cmd+Q) are deferred to F21.
//
// Keyboard shortcuts use Ctrl+ (not Cmd+) because this targets Linux/Windows.
// On Mac, Electron maps CmdOrCtrl to Cmd automatically — but since we do not
// ship Mac packaging until F21, we keep explicit 'Ctrl+' strings to avoid
// confusion in the template (CmdOrCtrl would also map to Ctrl on Linux/Win,
// but being explicit makes the intent clear when F21 adds the Mac branch).

import { app, BrowserWindow, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';

const isDev = process.env.NODE_ENV === 'development' || process.env.BYAN_DEV === '1';

// Sends a named action to the renderer so it can navigate or react.
// The renderer will listen via contextBridge-exposed ipcRenderer.on('byan:menu:action', ...).
// F4 (onboarding) and F5 (login) will wire up the handler on the renderer side.
// TODO (F4/F5): renderer listens for 'byan:menu:action' and routes accordingly.
function sendMenuAction(win: BrowserWindow, action: string): void {
  win.webContents.send('byan:menu:action', { action });
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function buildTemplate(): MenuItemConstructorOptions[] {
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: 'Ctrl+N',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'newProject');
        }
      },
      {
        label: 'Open Project',
        accelerator: 'Ctrl+O',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'openProject');
        }
      },
      {
        label: 'Import',
        accelerator: 'Ctrl+I',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'import');
        }
      },
      { type: 'separator' },
      {
        label: 'Close',
        accelerator: 'Ctrl+W',
        role: 'close'
      },
      {
        label: 'Quit',
        accelerator: 'Ctrl+Q',
        click() {
          app.quit();
        }
      }
    ]
  };

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'Ctrl+Z', role: 'undo' },
      { label: 'Redo', accelerator: 'Ctrl+Y', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'Ctrl+X', role: 'cut' },
      { label: 'Copy', accelerator: 'Ctrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'Ctrl+V', role: 'paste' },
      { type: 'separator' },
      { label: 'Select All', accelerator: 'Ctrl+A', role: 'selectAll' }
    ]
  };

  // View items that are always visible
  const viewBaseItems: MenuItemConstructorOptions[] = [
    { type: 'separator' },
    {
      label: 'Reset Zoom',
      accelerator: 'Ctrl+0',
      role: 'resetZoom'
    },
    {
      label: 'Zoom In',
      accelerator: 'Ctrl+=',
      role: 'zoomIn'
    },
    {
      label: 'Zoom Out',
      accelerator: 'Ctrl+-',
      role: 'zoomOut'
    }
  ];

  // Dev-only items are included only when NODE_ENV=development or BYAN_DEV=1.
  // Exposing devtools in production would allow arbitrary JS injection in the renderer.
  const viewDevItems: MenuItemConstructorOptions[] = isDev
    ? [
        {
          label: 'Reload',
          accelerator: 'Ctrl+R',
          click() {
            const win = getMainWindow();
            if (win) win.webContents.reload();
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Ctrl+Shift+I',
          click() {
            const win = getMainWindow();
            if (win) win.webContents.toggleDevTools();
          }
        }
      ]
    : [];

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [...viewDevItems, ...viewBaseItems]
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: 'Help',
    submenu: [
      {
        label: 'Documentation',
        click() {
          void shell.openExternal('https://github.com/Yan-Acadenice/BYAN');
        }
      },
      {
        label: 'GitHub Issues',
        click() {
          void shell.openExternal('https://github.com/Yan-Acadenice/BYAN/issues');
        }
      },
      { type: 'separator' },
      {
        label: 'About BYAN',
        click() {
          void dialog.showMessageBox({
            type: 'info',
            title: 'About BYAN',
            message: 'BYAN — Builder of YAN',
            detail: [
              `App version: ${app.getVersion()}`,
              `Electron: ${process.versions.electron}`,
              `Node: ${process.versions.node}`
            ].join('\n')
          });
        }
      },
      { type: 'separator' },
      {
        // TODO (F17): replace click stub with IPC call to byan:elo:summary once F17 is wired.
        label: 'ELO Summary',
        click() {
          const win = getMainWindow();
          if (win) sendMenuAction(win, 'eloSummary');
        }
      }
    ]
  };

  // F21: add Mac-specific menu items here (BYAN app menu, Hide, Cmd+,, Cmd+Q)

  return [fileMenu, editMenu, viewMenu, helpMenu];
}

export function installMenu(mainWindow: BrowserWindow): void {
  const template = buildTemplate();
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Keep a reference to mainWindow so menu actions can reach it even if focus
  // shifts briefly (e.g., a dialog steals focus). The window is passed in from
  // index.ts which owns the lifecycle — no need to track it here.
  void mainWindow;
}
