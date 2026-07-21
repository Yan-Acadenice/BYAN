'use strict';

// Tests of the install-time stale-global-skills offer. Field trap (2026-07-21):
// the install lays fresh project skills while months-old ~/.claude/skills
// copies keep masking them. These tests build real dirs on disk and pin the
// consent contract: yes -> synced ; no / non-interactive -> NOTHING written in
// the home, exact command shown.

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const gss = require('../lib/global-skills-sync');

// The real comparator this package ships (no duplication in the module under
// test — it requires it from the template dir we point at).
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

async function makeFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-gss-'));
  const project = path.join(base, 'project');
  const home = path.join(base, 'home');
  await fs.outputFile(
    path.join(project, '.claude', 'skills', 'byan-byan', 'SKILL.md'),
    '# skill neuf avec le rail\n'
  );
  await fs.outputFile(
    path.join(home, '.claude', 'skills', 'byan-byan', 'SKILL.md'),
    '# vieille copie de juin\n'
  );
  return { project, home };
}

function collectLog() {
  const lines = [];
  return { log: (l) => lines.push(String(l)), lines };
}

test('divergence detectee via le comparateur du template livre', async () => {
  const { project, home } = await makeFixture();
  const r = await gss.checkGlobalSkills(project, TEMPLATE_DIR, { homeDir: home });
  expect(r.diverged).toEqual(['byan-byan']);
});

test('consentement OUI -> la copie globale est synchronisee depuis le projet', async () => {
  const { project, home } = await makeFixture();
  const { lines, log } = collectLog();
  const ask = jest.fn().mockResolvedValue(true);

  const r = await gss.offerGlobalSkillsSync(project, TEMPLATE_DIR, { ask, homeDir: home, log });

  expect(r.synced).toEqual(['byan-byan']);
  const global = await fs.readFile(path.join(home, '.claude', 'skills', 'byan-byan', 'SKILL.md'), 'utf8');
  expect(global).toContain('skill neuf avec le rail');
  expect(lines.join('\n')).toContain('synchronisee');
});

test('consentement NON -> rien ecrit dans le home, commande exacte affichee', async () => {
  const { project, home } = await makeFixture();
  const { lines, log } = collectLog();
  const ask = jest.fn().mockResolvedValue(false);

  const r = await gss.offerGlobalSkillsSync(project, TEMPLATE_DIR, { ask, homeDir: home, log });

  expect(r.synced).toEqual([]);
  const global = await fs.readFile(path.join(home, '.claude', 'skills', 'byan-byan', 'SKILL.md'), 'utf8');
  expect(global).toContain('vieille copie'); // untouched
  expect(lines.join('\n')).toContain('cp .claude/skills/byan-byan/SKILL.md');
});

test('terminal non interactif (ask absent) -> rien ecrit, signalement seulement', async () => {
  const { project, home } = await makeFixture();
  const { lines, log } = collectLog();

  const r = await gss.offerGlobalSkillsSync(project, TEMPLATE_DIR, { homeDir: home, log });

  expect(r.diverged).toEqual(['byan-byan']);
  expect(r.synced).toEqual([]);
  const global = await fs.readFile(path.join(home, '.claude', 'skills', 'byan-byan', 'SKILL.md'), 'utf8');
  expect(global).toContain('vieille copie');
  expect(lines.join('\n')).toContain('Rien n\'a ete modifie');
});

test('pas de dossier global -> silencieux (aucune ligne, aucun appel ask)', async () => {
  const { project, home } = await makeFixture();
  await fs.remove(path.join(home, '.claude'));
  const { lines, log } = collectLog();
  const ask = jest.fn();

  const r = await gss.offerGlobalSkillsSync(project, TEMPLATE_DIR, { ask, homeDir: home, log });

  expect(r).toEqual({ diverged: [], synced: [] });
  expect(ask).not.toHaveBeenCalled();
  expect(lines).toEqual([]);
});

test('copies identiques -> silencieux', async () => {
  const { project, home } = await makeFixture();
  await fs.copy(
    path.join(project, '.claude', 'skills', 'byan-byan', 'SKILL.md'),
    path.join(home, '.claude', 'skills', 'byan-byan', 'SKILL.md')
  );
  const { lines, log } = collectLog();

  const r = await gss.offerGlobalSkillsSync(project, TEMPLATE_DIR, { homeDir: home, log });
  expect(r.diverged).toEqual([]);
  expect(lines).toEqual([]);
});
