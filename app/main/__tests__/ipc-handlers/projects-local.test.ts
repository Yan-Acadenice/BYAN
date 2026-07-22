// projects-local handler (F6) — reveal() directory guard (the trust-boundary fix)
// + record/find/list against a temp registry.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// shell.openPath is the only electron surface used ; stub it (electron is not a
// real module under vitest).
const mockOpenPath = vi.fn<[], Promise<string>>();
vi.mock('electron', () => ({ shell: { openPath: (p: string) => mockOpenPath(p) } }));

import { reveal, record, find, list } from '../../ipc-handlers/projects-local';

let home: string;
const origHome = process.env.BYAN_HOME;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-pl-'));
  process.env.BYAN_HOME = home;
  mockOpenPath.mockReset().mockResolvedValue('');
});
afterEach(() => {
  if (origHome === undefined) delete process.env.BYAN_HOME;
  else process.env.BYAN_HOME = origHome;
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('projects-local.reveal — directory guard', () => {
  it('opens an existing absolute directory', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-open-'));
    const r = await reveal(dir);
    expect(r.ok).toBe(true);
    expect(mockOpenPath).toHaveBeenCalledWith(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a relative path without touching openPath', async () => {
    const r = await reveal('relative/dir');
    expect(r.ok).toBe(false);
    expect(mockOpenPath).not.toHaveBeenCalled();
  });

  it('rejects a non-existent path', async () => {
    const r = await reveal('/definitely/not/here/xyz');
    expect(r.ok).toBe(false);
    expect(mockOpenPath).not.toHaveBeenCalled();
  });

  it('rejects a FILE (openPath would launch its associated app)', async () => {
    const file = path.join(home, 'a-file.txt');
    fs.writeFileSync(file, 'x');
    const r = await reveal(file);
    expect(r.ok).toBe(false);
    expect(mockOpenPath).not.toHaveBeenCalled();
  });

  it('surfaces an openPath error string', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-open2-'));
    mockOpenPath.mockResolvedValue('no handler');
    const r = await reveal(dir);
    expect(r).toEqual({ ok: false, message: 'no handler' });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('projects-local.record / find / list', () => {
  it('records then finds and lists the entry', async () => {
    await record({ name: 'Alpha', path: '/p/alpha', projectId: 'id-1' });
    expect((await list()).map((e) => e.path)).toContain('/p/alpha');
    expect((await find({ id: 'id-1' }))?.name).toBe('Alpha');
    expect(await find({ name: 'nope' })).toBeNull();
  });

  it('record throws without a path', async () => {
    await expect(record({ name: 'x', path: '' })).rejects.toThrow(/path/);
  });
});
