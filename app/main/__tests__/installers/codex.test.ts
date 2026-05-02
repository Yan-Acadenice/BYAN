// Tests for the Codex installer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as nodePath from 'path';
import { previewCodexSetup, applyCodexSetup } from '../../installers/codex';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-codex-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('previewCodexSetup', () => {
  it('returns an array', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    expect(Array.isArray(plans)).toBe(true);
  });

  it('all plans have platform=codex', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    for (const plan of plans) {
      expect(plan.platform).toBe('codex');
    }
  });

  it('relPath starts with .codex separator', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    for (const plan of plans) {
      expect(plan.relPath).toMatch(/^\.codex/);
    }
  });
});

describe('applyCodexSetup + idempotence', () => {
  it('apply does not throw on empty plans', async () => {
    await expect(applyCodexSetup([])).resolves.not.toThrow();
  });

  it('writes .codex files and is idempotent', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    if (plans.length === 0) return; // no template files present

    await applyCodexSetup(plans);

    const plans2 = await previewCodexSetup(tmpDir, {});
    const toWrite = plans2.filter((p) => p.action !== 'skip' && p.content.length > 0);
    expect(toWrite.length).toBe(0);
  });
});
