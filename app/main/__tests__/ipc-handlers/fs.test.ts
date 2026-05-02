// fs IPC handler tests — F4 implementation.
// Covers openProjectDialog, readFile, pathExists, mkdir.

import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';
import { IpcError } from '../../ipc-handlers/_error';
import * as os from 'os';
import * as nodePath from 'path';
import * as nodefs from 'fs/promises';

// Mock electron so it does not need a real Electron runtime.
vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/test-project'] }),
  },
}));

import * as fs from '../../ipc-handlers/fs';

describe('fs.openProjectDialog', () => {
  it('returns absolute path when dialog confirmed', async () => {
    const result = await fs.openProjectDialog();
    expect(typeof result).toBe('string');
    expect(result).toBe(nodePath.resolve('/tmp/test-project'));
  });

  it('returns null when dialog cancelled', async () => {
    const { dialog } = await import('electron');
    (dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    const result = await fs.openProjectDialog();
    expect(result).toBeNull();
  });
});

describe('fs.readFile', () => {
  it('throws INVALID_ARGUMENT on empty path', async () => {
    await expect(fs.readFile('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws NOT_FOUND on non-existent path', async () => {
    await expect(fs.readFile('/non/existent/file.txt')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns file content for existing file', async () => {
    const tmpFile = nodePath.join(os.tmpdir(), `byan-fs-test-${Date.now()}.txt`);
    await nodefs.writeFile(tmpFile, 'hello from test', 'utf8');
    try {
      const content = await fs.readFile(tmpFile);
      expect(content).toBe('hello from test');
    } finally {
      await nodefs.unlink(tmpFile).catch(() => undefined);
    }
  });

  it('rejects non-string path with IpcError', async () => {
    await expect(fs.readFile(42 as never)).rejects.toBeInstanceOf(IpcError);
  });
});

describe('fs.pathExists', () => {
  it('returns true for existing path (os.tmpdir)', async () => {
    const result = await fs.pathExists(os.tmpdir());
    expect(result).toBe(true);
  });

  it('returns false for non-existent path', async () => {
    const result = await fs.pathExists('/non/existent/byan-test-path-12345');
    expect(result).toBe(false);
  });

  it('throws INVALID_ARGUMENT on empty path', async () => {
    await expect(fs.pathExists('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

describe('fs.mkdir', () => {
  it('creates a directory recursively', async () => {
    const dir = nodePath.join(os.tmpdir(), `byan-mkdir-test-${Date.now()}`, 'a', 'b');
    try {
      await fs.mkdir(dir);
      const stat = await nodefs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await nodefs.rm(nodePath.dirname(nodePath.dirname(dir)), { recursive: true, force: true });
    }
  });

  it('is idempotent — does not throw if directory exists', async () => {
    await expect(fs.mkdir(os.tmpdir())).resolves.not.toThrow();
  });

  it('throws INVALID_ARGUMENT on empty path', async () => {
    await expect(fs.mkdir('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

describe('fs.register', () => {
  it('registers all four channels on ipcMain', () => {
    const handle = vi.fn();
    fs.register({ handle } as never);
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.fs.openProjectDialog);
    expect(channels).toContain(IPC_CHANNELS.fs.readFile);
    expect(channels).toContain(IPC_CHANNELS.fs.pathExists);
    expect(channels).toContain(IPC_CHANNELS.fs.mkdir);
  });
});
