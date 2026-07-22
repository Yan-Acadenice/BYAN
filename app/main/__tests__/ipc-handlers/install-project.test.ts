// install-project (N2) — runProjectInstall drives the engine's runInstall and
// forwards its onStep/log hooks as byan:install:progress events. Injected
// runInstall so the test never touches the real engine or disk.

import { describe, expect, it, vi } from 'vitest';
import { runProjectInstall } from '../../ipc-handlers/install-project';
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

    // Engine called with the target dir + injected templateDir.
    expect(fakeRunInstall).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: '/home/yan/nouveau', templateDir: '/tpl' }),
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
