// Tests for the Copilot installer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as nodePath from 'path';
import { previewCopilotSetup, applyCopilotSetup } from '../../installers/copilot';

let tmpDir: string;

// The installer records a content fingerprint per written file under
// ~/.byan/. Without an isolated home these tests would write into the real one
// (measured: they did, 10 entries of /tmp test paths), and one test's record
// would turn the next test's plain 'update' into a 'conflict'.
let homeDir: string;
const origHome = process.env.BYAN_HOME;

beforeEach(async () => {
  homeDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-home-test-'));
  process.env.BYAN_HOME = homeDir;
  tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-copilot-test-'));
});

afterEach(async () => {
  if (origHome === undefined) delete process.env.BYAN_HOME;
  else process.env.BYAN_HOME = origHome;
  await fs.rm(homeDir, { recursive: true, force: true });
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
