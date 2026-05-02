// Tests for the application menu template.
// We do not boot Electron — we mock Menu.buildFromTemplate and Menu.setApplicationMenu
// to capture the template that installMenu produces, then assert on its shape.
//
// The test matrix covers:
//   - presence of top-level sections (File, Edit, View, Help)
//   - presence of key items and their accelerators
//   - dev-only items absent in production
//   - dev-only items present when BYAN_DEV=1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

// ---------- Electron mock ----------
// We intercept Menu.buildFromTemplate to capture the template without needing
// a real Electron environment. BrowserWindow and app are stubbed minimally.

const capturedTemplates: MenuItemConstructorOptions[][] = [];
const mockSetApplicationMenu = vi.fn();
const mockBuildFromTemplate = vi.fn((template: MenuItemConstructorOptions[]) => {
  capturedTemplates.push(template);
  return {}; // opaque menu object — not used in tests
});

vi.mock('electron', () => ({
  app: {
    quit: vi.fn(),
    getVersion: vi.fn(() => '0.1.0')
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => [])
  },
  dialog: {
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 }))
  },
  Menu: {
    buildFromTemplate: mockBuildFromTemplate,
    setApplicationMenu: mockSetApplicationMenu
  },
  shell: {
    openExternal: vi.fn(() => Promise.resolve())
  }
}));

// ---------- helpers ----------

function loadMenu(env: Record<string, string> = {}) {
  // Reset module registry so the module re-reads process.env on each load.
  vi.resetModules();
  capturedTemplates.length = 0;

  // Set env before dynamic import so the module picks it up at load time.
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);

  return import('../menu').then((mod) => {
    // Restore env after module is loaded (isDev is computed at module level).
    Object.assign(process.env, originalEnv);
    for (const key of Object.keys(env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    return mod;
  });
}

function findSection(template: MenuItemConstructorOptions[], label: string) {
  return template.find((item) => item.label === label);
}

function submenuItems(section: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  return (section.submenu as MenuItemConstructorOptions[]) ?? [];
}

function findItem(section: MenuItemConstructorOptions, label: string) {
  return submenuItems(section).find((item) => item.label === label);
}

// ---------- tests ----------

describe('installMenu — production (no dev env)', () => {
  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.BYAN_DEV;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('calls Menu.buildFromTemplate and Menu.setApplicationMenu', async () => {
    const { installMenu } = await loadMenu({});
    const fakeWindow = { webContents: { send: vi.fn() } } as never;
    installMenu(fakeWindow);
    expect(mockBuildFromTemplate).toHaveBeenCalled();
    expect(mockSetApplicationMenu).toHaveBeenCalled();
  });

  it('template has exactly 4 top-level sections: File, Edit, View, Help', async () => {
    const { installMenu } = await loadMenu({});
    const fakeWindow = { webContents: { send: vi.fn() } } as never;
    installMenu(fakeWindow);
    const template = capturedTemplates[capturedTemplates.length - 1];
    const labels = template.map((s) => s.label);
    expect(labels).toEqual(['File', 'Edit', 'View', 'Help']);
  });

  describe('File menu', () => {
    it('contains New Project with Ctrl+N', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const file = findSection(template, 'File')!;
      const item = findItem(file, 'New Project');
      expect(item).toBeDefined();
      expect(item!.accelerator).toBe('Ctrl+N');
    });

    it('contains Open Project with Ctrl+O', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const file = findSection(template, 'File')!;
      const item = findItem(file, 'Open Project');
      expect(item).toBeDefined();
      expect(item!.accelerator).toBe('Ctrl+O');
    });

    it('contains Import with Ctrl+I', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const file = findSection(template, 'File')!;
      const item = findItem(file, 'Import');
      expect(item).toBeDefined();
      expect(item!.accelerator).toBe('Ctrl+I');
    });

    it('contains Quit with Ctrl+Q', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const file = findSection(template, 'File')!;
      const item = findItem(file, 'Quit');
      expect(item).toBeDefined();
      expect(item!.accelerator).toBe('Ctrl+Q');
    });
  });

  describe('Edit menu', () => {
    it('contains Undo, Redo, Cut, Copy, Paste, Select All', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const edit = findSection(template, 'Edit')!;
      const labels = submenuItems(edit)
        .filter((i) => i.type !== 'separator')
        .map((i) => i.label);
      expect(labels).toContain('Undo');
      expect(labels).toContain('Redo');
      expect(labels).toContain('Cut');
      expect(labels).toContain('Copy');
      expect(labels).toContain('Paste');
      expect(labels).toContain('Select All');
    });
  });

  describe('View menu — production', () => {
    it('does NOT contain Reload in production', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const view = findSection(template, 'View')!;
      const reload = findItem(view, 'Reload');
      expect(reload).toBeUndefined();
    });

    it('does NOT contain Toggle Developer Tools in production', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const view = findSection(template, 'View')!;
      const devtools = findItem(view, 'Toggle Developer Tools');
      expect(devtools).toBeUndefined();
    });

    it('contains Reset Zoom, Zoom In, Zoom Out', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const view = findSection(template, 'View')!;
      expect(findItem(view, 'Reset Zoom')).toBeDefined();
      expect(findItem(view, 'Zoom In')).toBeDefined();
      expect(findItem(view, 'Zoom Out')).toBeDefined();
    });
  });

  describe('Help menu', () => {
    it('contains Documentation and GitHub Issues', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const help = findSection(template, 'Help')!;
      expect(findItem(help, 'Documentation')).toBeDefined();
      expect(findItem(help, 'GitHub Issues')).toBeDefined();
    });

    it('contains About BYAN', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const help = findSection(template, 'Help')!;
      expect(findItem(help, 'About BYAN')).toBeDefined();
    });

    it('contains ELO Summary (stub for F17)', async () => {
      const { installMenu } = await loadMenu({});
      installMenu({ webContents: { send: vi.fn() } } as never);
      const template = capturedTemplates[capturedTemplates.length - 1];
      const help = findSection(template, 'Help')!;
      expect(findItem(help, 'ELO Summary')).toBeDefined();
    });
  });
});

describe('installMenu — development (BYAN_DEV=1)', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.BYAN_DEV;
  });

  it('includes Reload with Ctrl+R in dev mode', async () => {
    const { installMenu } = await loadMenu({ BYAN_DEV: '1' });
    installMenu({ webContents: { send: vi.fn() } } as never);
    const template = capturedTemplates[capturedTemplates.length - 1];
    const view = findSection(template, 'View')!;
    const reload = findItem(view, 'Reload');
    expect(reload).toBeDefined();
    expect(reload!.accelerator).toBe('Ctrl+R');
  });

  it('includes Toggle Developer Tools with Ctrl+Shift+I in dev mode', async () => {
    const { installMenu } = await loadMenu({ BYAN_DEV: '1' });
    installMenu({ webContents: { send: vi.fn() } } as never);
    const template = capturedTemplates[capturedTemplates.length - 1];
    const view = findSection(template, 'View')!;
    const devtools = findItem(view, 'Toggle Developer Tools');
    expect(devtools).toBeDefined();
    expect(devtools!.accelerator).toBe('Ctrl+Shift+I');
  });
});

describe('installMenu — development (NODE_ENV=development)', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.NODE_ENV;
  });

  it('includes dev tools when NODE_ENV=development', async () => {
    const { installMenu } = await loadMenu({ NODE_ENV: 'development' });
    installMenu({ webContents: { send: vi.fn() } } as never);
    const template = capturedTemplates[capturedTemplates.length - 1];
    const view = findSection(template, 'View')!;
    expect(findItem(view, 'Toggle Developer Tools')).toBeDefined();
  });
});
