'use strict';

// Functional tests of the install engine — real dirs on disk, injected native
// setups. The contract under test: honest progress (one onStep per real
// action), zero-question defaults, home credentials memory, rtk handling.

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const engine = require('../lib/install-engine');
const homeCreds = require('../lib/home-credentials');

async function makeFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-engine-'));
  const template = path.join(base, 'templates');
  const project = path.join(base, 'project');
  const home = path.join(base, 'home');
  // Minimal but real template payload matching the verify checks.
  await fs.outputFile(path.join(template, '_byan', 'agent', 'byan', 'byan.md'), '# agent');
  await fs.outputFile(path.join(template, '_byan', 'workflow', 'w.md'), '# wf');
  await fs.outputFile(path.join(template, '_byan', 'config.yaml'), 'x: 1\n');
  await fs.outputFile(path.join(template, '.claude', 'CLAUDE.md'), '# claude');
  await fs.outputFile(path.join(template, '.claude', 'rules', 'hermes-dispatcher.md'), '# regle');
  await fs.outputFile(path.join(template, '.claude', 'skills', 'byan-byan', 'SKILL.md'), '# skill avec rail');
  await fs.outputFile(path.join(template, '.claude', 'workflows', 'byan-auto-dispatch.js'), 'export const meta = {};');
  await fs.ensureDir(project);
  await fs.ensureDir(home);
  return { base, template, project, home };
}

function hooksFor(steps) {
  return {
    onStep: (s) => steps.push(s),
    log: () => {},
    claudeSetup: jest.fn().mockResolvedValue(undefined),
    codexSetup: jest.fn().mockResolvedValue(undefined),
    rtkInstall: jest.fn().mockReturnValue('rtk installe (mock)'),
  };
}

afterEach(() => jest.clearAllMocks());

test('installation complete par defaut : fichiers poses, verification OK, progression honnete', async () => {
  const { template, project, home } = await makeFixture();
  const steps = [];
  const hooks = hooksFor(steps);

  const r = await engine.runInstall({
    projectRoot: project,
    projectName: 'mon-projet',
    platforms: { claude: true, codex: true },
    templateDir: template,
    homeDir: home,
  }, hooks);

  expect(r.ok).toBe(true);
  expect(r.verify.failed).toEqual([]);
  // Files really landed.
  expect(await fs.pathExists(path.join(project, '_byan', 'agent', 'byan', 'byan.md'))).toBe(true);
  expect(await fs.pathExists(path.join(project, '.claude', 'workflows', 'byan-auto-dispatch.js'))).toBe(true);
  // Config carries the project name and the engine mode.
  const cfg = await fs.readFile(path.join(project, '_byan', 'bmb', 'config.yaml'), 'utf8');
  expect(cfg).toContain('project_name: mon-projet');
  expect(cfg).toContain('install_mode: engine-auto');
  // Native setups were invoked for real.
  expect(hooks.claudeSetup).toHaveBeenCalledWith(project);
  expect(hooks.codexSetup).toHaveBeenCalled();
  // Honest progress: as many onStep calls as recorded step results, indices 1..N.
  expect(steps.length).toBe(r.steps.length);
  expect(steps[0].index).toBe(1);
  expect(steps[steps.length - 1].index).toBe(steps.length);
  expect(steps[steps.length - 1].total).toBe(steps.length);
});

test('credentials fournis -> memorises dans le home, merge sans effacer', async () => {
  const { template, project, home } = await makeFixture();
  homeCreds.writeCredentials({ BYAN_API_TOKEN: 'byan_' + '0'.repeat(64) }, { homeDir: home });

  await engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: false },
    templateDir: template,
    homeDir: home,
    credentials: { BYAN_API_URL: 'https://api.exemple.fr', BYAN_API_TOKEN: '' },
  }, hooksFor([]));

  const stored = homeCreds.readCredentials({ homeDir: home });
  expect(stored.BYAN_API_URL).toBe('https://api.exemple.fr');
  // The empty token in the patch did NOT erase the stored one.
  expect(stored.BYAN_API_TOKEN).toBe('byan_' + '0'.repeat(64));
});

test('rtk absent -> installeur rtk appele ; les etapes non critiques n\'avortent pas', async () => {
  const { template, project, home } = await makeFixture();
  const hooks = hooksFor([]);
  hooks.rtkInstall = jest.fn(() => { throw new Error('reseau coupe'); });
  hooks.detect = () => ({ claude: true, codex: false, rtk: false, storedCredentialKeys: [] });

  const r = await engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: false },
    templateDir: template,
    homeDir: home,
  }, hooks);

  // rtk step failed but the install completed and verify passed.
  const rtkStep = r.steps.find((s) => s.id === 'rtk');
  if (rtkStep) expect(rtkStep.ok).toBe(false);
  expect(r.verify.failed).toEqual([]);
});

test('templates introuvables -> erreur claire, rien d\'ecrit', async () => {
  const { project, home } = await makeFixture();
  await expect(engine.runInstall({
    projectRoot: project,
    templateDir: '/chemin/inexistant',
    homeDir: home,
  }, hooksFor([]))).rejects.toThrow(/templates introuvables/);
});

test('verification echoue si un fichier attendu manque (progression jamais theatrale)', async () => {
  const { template, project, home } = await makeFixture();
  await fs.remove(path.join(template, '.claude', 'workflows'));
  await expect(engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: false },
    templateDir: template,
    homeDir: home,
  }, hooksFor([]))).rejects.toThrow(/verification incomplete/);
});

// --- home-credentials (F2) ---------------------------------------------------

describe('home-credentials', () => {
  test('lecture fichier absent -> {}, ecriture -> mode 600, relecture fidele', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-creds-'));
    expect(homeCreds.readCredentials({ homeDir: home })).toEqual({});
    homeCreds.writeCredentials({ LEANTIME_API_URL: 'https://pm.exemple.fr' }, { homeDir: home });
    const file = homeCreds.credentialsPath(home);
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    expect(homeCreds.readCredentials({ homeDir: home }).LEANTIME_API_URL).toBe('https://pm.exemple.fr');
    expect(homeCreds.storedKeys({ homeDir: home })).toEqual(['LEANTIME_API_URL']);
  });

  test('les cles inconnues deja presentes sont preservees au merge', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-creds-'));
    await fs.outputJSON(homeCreds.credentialsPath(home), { CUSTOM_KEY: 'garde-moi' });
    homeCreds.writeCredentials({ BYAN_API_URL: 'http://localhost:3737' }, { homeDir: home });
    const stored = homeCreds.readCredentials({ homeDir: home });
    expect(stored.CUSTOM_KEY).toBe('garde-moi');
    expect(stored.BYAN_API_URL).toBe('http://localhost:3737');
  });

  test('une cle inconnue dans le patch n\'est PAS ajoutee (patch = corps HTTP possible)', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-creds-'));
    homeCreds.writeCredentials({ BYAN_API_URL: 'http://x', INJECTE: 'malveillant' }, { homeDir: home });
    const stored = homeCreds.readCredentials({ homeDir: home });
    expect(stored.BYAN_API_URL).toBe('http://x');
    expect(stored.INJECTE).toBeUndefined();
  });

  test('KNOWN_KEYS ne contient plus les cles Google', () => {
    const { KNOWN_KEYS } = homeCreds;
    const googleKeys = ['GOOGLE_APPLICATION_CREDENTIALS', 'GDOC_TEMPLATE_ID', 'GDOC_LOGO_PNG_URL'];
    expect(googleKeys.every((k) => !KNOWN_KEYS.includes(k))).toBe(true);
    // Core BYAN and Leantime keys must remain.
    expect(KNOWN_KEYS).toContain('BYAN_API_URL');
    expect(KNOWN_KEYS).toContain('BYAN_API_TOKEN');
    expect(KNOWN_KEYS).toContain('LEANTIME_API_URL');
    expect(KNOWN_KEYS).toContain('LEANTIME_API_TOKEN');
  });

  test('purgeGoogleKeys retire les cles Google et preserve BYAN_* et LEANTIME_*', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-creds-'));
    await fs.outputJSON(homeCreds.credentialsPath(home), {
      BYAN_API_URL: 'https://api.exemple.fr',
      BYAN_API_TOKEN: 'byan_' + '0'.repeat(64),
      LEANTIME_API_URL: 'https://pm.exemple.fr',
      GOOGLE_APPLICATION_CREDENTIALS: '/path/to/sa.json',
      GDOC_TEMPLATE_ID: 'tpl-123',
    });

    const result = homeCreds.purgeGoogleKeys({ homeDir: home });

    const stored = homeCreds.readCredentials({ homeDir: home });
    // Google keys must be gone.
    expect(stored.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(stored.GDOC_TEMPLATE_ID).toBeUndefined();
    // BYAN and Leantime keys must survive.
    expect(stored.BYAN_API_URL).toBe('https://api.exemple.fr');
    expect(stored.BYAN_API_TOKEN).toBe('byan_' + '0'.repeat(64));
    expect(stored.LEANTIME_API_URL).toBe('https://pm.exemple.fr');
    // result.purged must list exactly the keys that were present.
    expect(result.purged.sort()).toEqual(['GDOC_TEMPLATE_ID', 'GOOGLE_APPLICATION_CREDENTIALS'].sort());
    // backupPath must point to a file that exists.
    expect(result.backupPath).not.toBeNull();
    expect(await fs.pathExists(result.backupPath)).toBe(true);
  });

  test('purgeGoogleKeys sur credentials sans cles Google : no-op, pas de backup', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-creds-'));
    await fs.outputJSON(homeCreds.credentialsPath(home), {
      BYAN_API_URL: 'https://api.exemple.fr',
      BYAN_API_TOKEN: 'byan_' + '0'.repeat(64),
    });

    const result = homeCreds.purgeGoogleKeys({ homeDir: home });

    expect(result.purged).toEqual([]);
    expect(result.backupPath).toBeNull();
    // File untouched — BYAN keys still present.
    const stored = homeCreds.readCredentials({ homeDir: home });
    expect(stored.BYAN_API_URL).toBe('https://api.exemple.fr');
  });
});
