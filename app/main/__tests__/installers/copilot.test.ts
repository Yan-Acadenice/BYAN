// Tests for the Copilot installer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as nodePath from 'path';
import { previewCopilotSetup, applyCopilotSetup } from '../../installers/copilot';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-copilot-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('previewCopilotSetup', () => {
  it('returns an array', async () => {
    const plans = await previewCopilotSetup(tmpDir, {});
    expect(Array.isArray(plans)).toBe(true);
  });

  it('all plans have platform=copilot', async () => {
    const plans = await previewCopilotSetup(tmpDir, {});
    for (const plan of plans) {
      expect(plan.platform).toBe('copilot');
    }
  });

  it('relPath contains .github path segment', async () => {
    const plans = await previewCopilotSetup(tmpDir, {});
    for (const plan of plans) {
      expect(plan.relPath).toContain('.github');
    }
  });
});

describe('applyCopilotSetup + idempotence', () => {
  it('apply does not throw on empty plans', async () => {
    await expect(applyCopilotSetup([])).resolves.not.toThrow();
  });

  it('writes .github/agents files and is idempotent', async () => {
    const plans = await previewCopilotSetup(tmpDir, {});
    if (plans.length === 0) return; // no template files present

    await applyCopilotSetup(plans);

    const plans2 = await previewCopilotSetup(tmpDir, {});
    const toWrite = plans2.filter((p) => p.action !== 'skip' && p.content.length > 0);
    expect(toWrite.length).toBe(0);
  });

  it('path contains .github/agents for copilot files', async () => {
    const plans = await previewCopilotSetup(tmpDir, {});
    for (const plan of plans) {
      expect(plan.path).toContain(nodePath.join('.github', 'agents'));
    }
  });
});
