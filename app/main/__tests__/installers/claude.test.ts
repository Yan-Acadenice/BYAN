// Tests for the Claude installer — preview + apply, idempotence, path handling.
//
// Hermetic: the template root is a SMALL fixture tree injected via
// _setTemplateRootForTests, so the suite does not walk the real
// install/templates (1000+ files — walking it in every test under full-suite
// disk contention is what pushed these tests past their 5s timeout).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as nodePath from 'path';
import { previewClaudeSetup, applyClaudeSetup } from '../../installers/claude';
import { _setTemplateRootForTests } from '../../installers/template-root';

let tmpDir: string; // destination project root
let tplDir: string; // fixture template root

async function write(root: string, rel: string, content: string): Promise<void> {
  const p = nodePath.join(root, ...rel.split('/'));
  await fs.mkdir(nodePath.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-claude-test-'));
  tplDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'byan-claude-tpl-'));
  await write(tplDir, '.claude/hooks/hook-a.js', 'console.log("a");\n');
  await write(tplDir, '.claude/skills/s1/SKILL.md', '# s1\n');
  await write(tplDir, '.claude/settings.json', '{ "hooks": {} }\n');
  await write(tplDir, '_byan/config.yaml', 'name: byan\n');
  // A dependency tree that must be PRUNED during the walk, not filtered after.
  await write(tplDir, '_byan/mcp/byan-mcp-server/node_modules/dep/index.js', 'module.exports = 1;\n');
  _setTemplateRootForTests(tplDir);
});

afterEach(async () => {
  _setTemplateRootForTests(null);
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(tplDir, { recursive: true, force: true });
});

describe('previewClaudeSetup', () => {
  it('returns an array of FileWritePlan', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
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
      expect(plan.relPath).not.toMatch(/^\//);
    }
  });

  it('action is create when destination does not exist', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(plan.action).toBe('create');
    }
  });

  it('covers hooks, skills, settings.json and the _byan tree', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    const rels = plans.map((p) => p.relPath);
    expect(rels).toContain(nodePath.join('.claude', 'hooks', 'hook-a.js'));
    expect(rels).toContain(nodePath.join('.claude', 'skills', 's1', 'SKILL.md'));
    expect(rels).toContain(nodePath.join('.claude', 'settings.json'));
    expect(rels).toContain(nodePath.join('_byan', 'config.yaml'));
  });

  it('never plans a node_modules file (pruned during the walk)', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    for (const plan of plans) {
      expect(plan.relPath.split(nodePath.sep)).not.toContain('node_modules');
    }
  });
});

describe('applyClaudeSetup + idempotence', () => {
  it('writes files that have action create or update', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    const toWrite = plans.filter((p) => p.action !== 'skip' && p.content.length > 0);
    expect(toWrite.length).toBeGreaterThan(0);

    await applyClaudeSetup(plans);

    for (const plan of toWrite) {
      const written = await fs.readFile(plan.path, 'utf8');
      expect(written).toBe(plan.content);
    }
  });

  it('applying twice does not corrupt files (idempotence)', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    await applyClaudeSetup(plans);
    // Second preview: all plans should now be 'skip' since content matches.
    const plans2 = await previewClaudeSetup(tmpDir, {});
    const toWrite = plans2.filter((p) => p.action !== 'skip' && p.content.length > 0);
    expect(toWrite.length).toBe(0);

    await applyClaudeSetup(plans2);
    for (const plan of plans.filter((p) => p.content.length > 0)) {
      const content = await fs.readFile(plan.path, 'utf8');
      expect(content).toBe(plan.content);
    }
  });

  it('skips plans with action=skip', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    await applyClaudeSetup(plans);

    const plans2 = await previewClaudeSetup(tmpDir, {});
    for (const p of plans2.filter((x) => x.content.length > 0)) {
      expect(p.action).toBe('skip');
    }
  });

  it('marks update (not create) when destination differs', async () => {
    const plans = await previewClaudeSetup(tmpDir, {});
    await applyClaudeSetup(plans);
    await write(tmpDir, '.claude/hooks/hook-a.js', 'console.log("modified");\n');

    const plans2 = await previewClaudeSetup(tmpDir, {});
    const hook = plans2.find((p) => p.relPath === nodePath.join('.claude', 'hooks', 'hook-a.js'));
    expect(hook?.action).toBe('update');
  });
});
