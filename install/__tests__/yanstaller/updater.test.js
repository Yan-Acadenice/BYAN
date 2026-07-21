'use strict';

// Functional tests of the updater flow — written after the field failure of
// 2026-07-21: `create-byan-agent update` refreshed _byan/ but NEVER touched
// .claude/, so a project could be "up to date" while its skills (the
// auto-dispatch rail), native workflows and hooks stayed months old. These
// tests build a real old project + a real new template on disk and prove the
// update DEPLOYS the .claude payload, and restores it on failure.

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

// No network in tests: version resolution is mocked (update only proceeds when
// latest > installed).
jest.mock('../../lib/utils/version-compare', () => ({
  compareVersions: jest.requireActual('../../lib/utils/version-compare').compareVersions,
  getLatestVersion: jest.fn().mockResolvedValue('9.9.9'),
}));

const updater = require('../../lib/yanstaller/updater');

// A fake project: old _byan + old .claude (no rail section in the skill).
// A fake template: new _byan + new .claude (rail section + native workflow).
async function makeFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-updater-'));
  const project = path.join(base, 'project');
  const template = path.join(base, 'template');

  await fs.outputFile(path.join(project, '_byan', 'config.yaml'), 'version: old\n');
  await fs.outputFile(
    path.join(project, '.claude', 'skills', 'byan-byan', 'SKILL.md'),
    '# vieux skill sans le rail\n'
  );

  await fs.outputFile(path.join(template, '_byan', 'config.yaml'), 'version: new\n');
  await fs.outputFile(
    path.join(template, '.claude', 'skills', 'byan-byan', 'SKILL.md'),
    '# skill neuf\n## 0.5. Rail natif automatique\n'
  );
  await fs.outputFile(
    path.join(template, '.claude', 'workflows', 'byan-auto-dispatch.js'),
    'export const meta = {};\n'
  );

  return { base, project, template };
}

afterEach(() => jest.clearAllMocks());

test('update deploie .claude : le rail arrive dans le projet (le trou du terrain)', async () => {
  const { project, template } = await makeFixture();
  const nativeSetup = jest.fn().mockResolvedValue(undefined);

  const result = await updater.update(project, { templateDir: template, nativeSetup });

  // The skill now carries the rail section, and the native workflow exists.
  const skill = await fs.readFile(path.join(project, '.claude', 'skills', 'byan-byan', 'SKILL.md'), 'utf8');
  expect(skill).toContain('0.5. Rail natif automatique');
  expect(await fs.pathExists(path.join(project, '.claude', 'workflows', 'byan-auto-dispatch.js'))).toBe(true);

  // The native pass ran (this is what regenerates .mcp.json + MCP deps).
  expect(nativeSetup).toHaveBeenCalledWith(project);

  // The result reports it, and a dedicated .claude backup exists.
  expect(result.claudeRefreshed).toBe(true);
  expect(result.claudeBackupPath).toMatch(/\.claude\.backup-\d+$/);
  expect(await fs.pathExists(result.claudeBackupPath)).toBe(true);
  const backedUp = await fs.readFile(path.join(result.claudeBackupPath, 'skills', 'byan-byan', 'SKILL.md'), 'utf8');
  expect(backedUp).toContain('vieux skill');

  // _byan was refreshed too (the pre-existing behavior still holds).
  expect(await fs.readFile(path.join(project, '_byan', 'config.yaml'), 'utf8')).toContain('new');
});

test('projet sans .claude (install codex-only) : pas de refresh, pas de crash', async () => {
  const { project, template } = await makeFixture();
  await fs.remove(path.join(project, '.claude'));
  const nativeSetup = jest.fn();

  const result = await updater.update(project, { templateDir: template, nativeSetup });

  expect(result.claudeRefreshed).toBe(false);
  expect(result.claudeBackupPath).toBeNull();
  expect(nativeSetup).not.toHaveBeenCalled();
  expect(await fs.pathExists(path.join(project, '.claude'))).toBe(false);
});

test('rollback : un echec du setup natif restaure le .claude d origine', async () => {
  const { project, template } = await makeFixture();
  const nativeSetup = jest.fn().mockRejectedValue(new Error('npm install a echoue'));

  await expect(
    updater.update(project, { templateDir: template, nativeSetup })
  ).rejects.toThrow('npm install a echoue');

  // The project .claude is back to its pre-update content.
  const skill = await fs.readFile(path.join(project, '.claude', 'skills', 'byan-byan', 'SKILL.md'), 'utf8');
  expect(skill).toContain('vieux skill');
  expect(skill).not.toContain('0.5. Rail natif automatique');
});

test('deja a jour (sans force) : aucun refresh, resultat neutre', async () => {
  const { project, template } = await makeFixture();
  // Manifest declares the mocked latest -> "already up to date" path.
  await fs.outputJSON(path.join(project, '_byan', '.manifest.json'), { version: '9.9.9', files: {} });
  const nativeSetup = jest.fn();

  const result = await updater.update(project, { templateDir: template, nativeSetup });

  expect(result.filesUpdated).toBe(0);
  expect(nativeSetup).not.toHaveBeenCalled();
  const skill = await fs.readFile(path.join(project, '.claude', 'skills', 'byan-byan', 'SKILL.md'), 'utf8');
  expect(skill).toContain('vieux skill');
});
