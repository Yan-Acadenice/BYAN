// Tests for the Codex installer.
//
// Hermetic: the template root is a small fixture tree injected via
// _setTemplateRootForTests (same rationale as the claude installer suite).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as nodePath from 'path';
import { previewCodexSetup, applyCodexSetup } from '../../installers/codex';
import { _setTemplateRootForTests } from '../../installers/template-root';

let tmpDir: string; // destination project root
let tplDir: string; // fixture template root

async function write(root: string, rel: string, content: string): Promise<void> {
  const p = nodePath.join(root, ...rel.split('/'));
  await fs.mkdir(nodePath.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-codex-test-'));
  tplDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-codex-tpl-'));
  await write(tplDir, '.codex/prompts/byan.md', '# byan prompt\n');
  await write(tplDir, '.codex/prompts/dev.md', '# dev prompt\n');
  _setTemplateRootForTests(tplDir);
});

afterEach(async () => {
  _setTemplateRootForTests(null);
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(tplDir, { recursive: true, force: true });
});

describe('previewCodexSetup', () => {
  it('returns an array', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBe(2);
  });

  it('all plans have platform=codex', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    for (const plan of plans) {
      expect(plan.platform).toBe('codex');
    }
  });

  it('relPath starts with .codex separator', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(plan.relPath).toMatch(/^\.codex/);
    }
  });

  it('returns zero plans when the template has no .codex tree', async () => {
    _setTemplateRootForTests(tmpDir); // an empty dir
    const plans = await previewCodexSetup(tmpDir, {});
    expect(plans).toEqual([]);
  });
});

describe('applyCodexSetup + idempotence', () => {
  it('apply does not throw on empty plans', async () => {
    await expect(applyCodexSetup([])).resolves.not.toThrow();
  });

  it('writes .codex files and is idempotent', async () => {
    const plans = await previewCodexSetup(tmpDir, {});
    expect(plans.length).toBeGreaterThan(0);

    await applyCodexSetup(plans);

    const plans2 = await previewCodexSetup(tmpDir, {});
    const toWrite = plans2.filter((p) => p.action !== 'skip' && p.content.length > 0);
    expect(toWrite.length).toBe(0);
  });
});
