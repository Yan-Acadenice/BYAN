// install-project (N2) — runProjectInstall drives the engine's runInstall and
// forwards its onStep/log hooks as byan:install:progress events. Injected
// runInstall so the test never touches the real engine or disk.

import { describe, expect, it, vi } from 'vitest';
import { runProjectInstall, patchModuleResolution } from '../../ipc-handlers/install-project';
import type { LocalInstallProgress } from '../../../shared/ipc-contract';

describe('runProjectInstall', () => {
  it('maps onStep/log to progress events and returns the verdict', async () => {
    const progress: LocalInstallProgress[] = [];
    const fakeRunInstall = vi.fn(async (_opts, hooks: { onStep?: (s: unknown) => void; log?: (l: string) => void }) => {
      hooks.onStep?.({ index: 1, total: 2, id: 'copy-byan', label: 'Copie' });
      hooks.log?.('copie ok');
      hooks.onStep?.({ index: 2, total: 2, id: 'verify', label: 'Verification' });
      return { ok: true, verify: { passed: 2, total: 2, failed: [] }, launch: { command: 'claude', channel: true } };
    });

    const res = await runProjectInstall(
      { projectRoot: '/home/yan/nouveau' },
      (p) => progress.push(p),
      { runInstall: fakeRunInstall as never, templateDir: '/tpl' }
    );

    // Engine called with the target dir + injected templateDir + rtk:false
    // (desktop install must not try to install the global rtk CLI).
    expect(fakeRunInstall).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: '/home/yan/nouveau', templateDir: '/tpl', rtk: false }),
      expect.any(Object)
    );
    // Progress forwarded: 2 steps + 1 log, in order.
    expect(progress).toEqual([
      { type: 'step', index: 1, total: 2, id: 'copy-byan', label: 'Copie' },
      { type: 'log', line: 'copie ok' },
      { type: 'step', index: 2, total: 2, id: 'verify', label: 'Verification' },
    ]);
    expect(res).toMatchObject({ ok: true, verify: { passed: 2, total: 2, failed: [] } });
  });

  it('rejects without a projectRoot', async () => {
    await expect(
      runProjectInstall({ projectRoot: '' }, () => {}, { runInstall: (async () => ({})) as never, templateDir: '/t' })
    ).rejects.toThrow(/projectRoot/);
  });

  it('rejects a non-absolute projectRoot (trust boundary)', async () => {
    const spy = vi.fn(async () => ({ ok: true, verify: { passed: 0, total: 0, failed: [] }, launch: null }));
    await expect(
      runProjectInstall({ projectRoot: 'relatif/dir' }, () => {}, { runInstall: spy as never, templateDir: '/t' })
    ).rejects.toThrow(/absolu/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects when the path exists and is a FILE (never overwrite a file)', async () => {
    const os = await import('os');
    const fs = await import('fs');
    const p = await import('path');
    const file = p.join(os.tmpdir(), `byan-n2-${Date.now()}.txt`);
    fs.writeFileSync(file, 'x');
    const spy = vi.fn(async () => ({ ok: true, verify: { passed: 0, total: 0, failed: [] }, launch: null }));
    try {
      await expect(
        runProjectInstall({ projectRoot: file }, () => {}, { runInstall: spy as never, templateDir: '/t' })
      ).rejects.toThrow(/pas un dossier/);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});

// patchModuleResolution is THE fix for the field crash "Cannot find module
// 'fs-extra'": packaged Electron ignores Module.globalPaths (NODE_PATH) for a
// bare require from install-engine.js (outside the asar). The fallback retries a
// failed lookup against the unpacked node_modules.
describe('patchModuleResolution', () => {
  // Fake Module whose _resolveFilename fails for a bare dep UNLESS the caller
  // passes the unpacked dir via options.paths — the exact Electron gap.
  function fakeModule(asarResolvable: string[] = []) {
    return {
      calls: [] as Array<{ request: string; paths?: string[] }>,
      _resolveFilename(request: string, _parent: unknown, _isMain: boolean, options?: { paths?: string[] }) {
        this.calls.push({ request, paths: options?.paths });
        if (asarResolvable.includes(request) && !options?.paths) return `/asar/${request}.js`;
        if (options?.paths?.includes('/unpacked')) return `/unpacked/${request}/index.js`;
        throw new Error(`Cannot find module '${request}'`);
      },
    };
  }

  it('retries a failing bare require against the unpacked node_modules', () => {
    const M = fakeModule();
    expect(patchModuleResolution(M as never, '/unpacked')).toBe(true);
    expect(M._resolveFilename('fs-extra', {}, false)).toBe('/unpacked/fs-extra/index.js');
  });

  it('leaves a normally-resolvable module untouched (fallback not used)', () => {
    const M = fakeModule(['electron']);
    patchModuleResolution(M as never, '/unpacked');
    expect(M._resolveFilename('electron', {}, false)).toBe('/asar/electron.js');
    expect(M.calls.filter((c) => c.request === 'electron')).toHaveLength(1); // only the first attempt
  });

  it('rethrows the ORIGINAL error when the dep is nowhere', () => {
    const M = fakeModule();
    patchModuleResolution(M as never, '/wrong'); // unpacked path the fake does not honour
    expect(() => M._resolveFilename('ghost', {}, false)).toThrow(/Cannot find module 'ghost'/);
  });

  it('is idempotent (patches once)', () => {
    const M = fakeModule();
    expect(patchModuleResolution(M as never, '/unpacked')).toBe(true);
    expect(patchModuleResolution(M as never, '/unpacked')).toBe(false);
  });

  it('no-ops on a missing Module', () => {
    expect(patchModuleResolution(undefined, '/unpacked')).toBe(false);
  });
});
