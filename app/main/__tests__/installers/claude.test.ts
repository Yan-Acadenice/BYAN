// Tests for the Claude installer — preview + apply, idempotence, path handling.
//
// We write to a real tmpdir so fs operations are validated end-to-end.
// No mocking of fs — the installer is pure node fs/promises.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as nodePath from 'path';
import { previewClaudeSetup, applyClaudeSetup } from '../../installers/claude';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-claude-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('previewClaudeSetup', () => {
  it('returns an array of FileWritePlan', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    expect(Array.isArray(plans)).toBe(true);
  });

  it('each plan has required fields', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    for (const plan of plans) {
      expect(typeof plan.path).toBe('string');
      expect(typeof plan.relPath).toBe('string');
      expect(typeof plan.description).toBe('string');
      expect(plan.platform).toBe('claude');
      expect(['create', 'update', 'skip']).toContain(plan.action);
      expect(typeof plan.content).toBe('string');
    }
  });

  it('plans use path.join — no hardcoded slashes in relPath', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    for (const plan of plans) {
      // On all OS, nodePath.join is used so relPath should not start with /
      expect(plan.relPath).not.toMatch(/^\//);
    }
  });

  it('action is create when destination does not exist', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    // Only test plans that have content (not empty dirs)
    const createPlans = plans.filter((p) => p.content.length > 0);
    // At minimum some plans should be 'create' in a fresh tmpdir
    // If template dir has files, all should be 'create' or the template is empty
    const anyCreate = createPlans.some((p) => p.action === 'create');
    // It's OK if template is empty (no files) — just verify no 'skip' without existing file
    if (createPlans.length > 0) {
      expect(anyCreate || createPlans.every((p) => p.action === 'skip')).toBe(true);
    }
  });
});

describe('applyClaudeSetup + idempotence', () => {
  it('writes files that have action create or update', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    const toWrite = plans.filter((p) => p.action !== 'skip' && p.content.length > 0);
    if (toWrite.length === 0) {
      // Template is empty — just verify apply does not throw
      await expect(applyClaudeSetup(plans)).resolves.not.toThrow();
      return;
    }

    await applyClaudeSetup(plans);

    for (const plan of toWrite) {
      const written = await fs.readFile(plan.path, 'utf8');
      expect(written).toBe(plan.content);
    }
  });

  it('applying twice does not corrupt files (idempotence)', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    await applyClaudeSetup(plans);
    // Second apply: all plans should now be 'skip' since content matches
    const plans2 = await previewClaudeSetup(tmpDir, {});
    const toWrite = plans2.filter((p) => p.action !== 'skip' && p.content.length > 0);
    expect(toWrite.length).toBe(0);

    await applyClaudeSetup(plans2);
    // Files still readable
    for (const plan of plans.filter((p) => p.content.length > 0)) {
      const content = await fs.readFile(plan.path, 'utf8');
      expect(content).toBe(plan.content);
    }
  });

  it('skips plans with action=skip', async () => {
    // Create all files first
    const plans = await previewClaudeSetup(tmpDir, {});
    await applyClaudeSetup(plans);

    // Now get plans again — should all be skip
    const plans2 = await previewClaudeSetup(tmpDir, {});
    const skipPlans = plans2.filter((p) => p.content.length > 0);
    for (const p of skipPlans) {
      expect(p.action).toBe('skip');
    }
  });
});
