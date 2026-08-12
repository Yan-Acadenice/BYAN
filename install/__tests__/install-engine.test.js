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
    // La sonde par defaut lance vraiment `claude --help` avec un delai de 8 s.
    // Injectee ici, la suite cesse de dependre de ce que porte la machine hote.
    launchProbe: () => null,
    // Idem pour la detection : sans injection, runInstall interrogeait le vrai
    // environnement et le nombre d'etapes variait d'une machine a l'autre.
    detect: () => ({ claude: true, codex: true, rtk: true, storedCredentialKeys: [] }),
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
  // Progression honnete : un onStep par etape REELLEMENT EXECUTEE, indices 1..N.
  // Le rapport, lui, porte l'ensemble intendu — donc il en contient davantage.
  const executees = r.steps.filter((s) => s.status !== 'skipped');
  expect(steps.length).toBe(executees.length);
  expect(steps[0].index).toBe(1);
  expect(steps[steps.length - 1].index).toBe(steps.length);
  expect(steps[steps.length - 1].total).toBe(steps.length);
  // Ce qui n'a pas tourne reste dans le rapport, avec sa raison. Ici, aucune
  // valeur a memoriser : l'etape credentials est ecartee et le dit.
  const sautees = r.steps.filter((s) => s.status === 'skipped');
  expect(sautees.map((s) => s.id)).toContain('credentials');
  for (const s of sautees) expect(typeof s.reason).toBe('string');
});

// LE DEFAUT D'HONNETETE, mesure le 2026-08-11 sur install-engine.js:285.
//
// Quand la detection rendait claude:false — ce qui arrivait sous elevation de
// privilege parce que os.homedir() rend /root — l'etape Claude n'etait pas
// ajoutee au plan. Absente du plan, elle etait absente de results, donc le
// `results.every(...)` final passait a vide. Les quatre controles Claude
// n'etaient pas ajoutes non plus. L'installateur affichait "4/4 controles OK"
// et ok:true, sur un perimetre ampute en silence.
//
// Ce test tient le contrat inverse : ce qui est ecarte doit rester visible.
test('plan ampute : l\'etape ecartee reste dans le rapport avec sa raison', async () => {
  const { template, project, home } = await makeFixture();
  const steps = [];
  const hooks = hooksFor(steps);

  const r = await engine.runInstall({
    projectRoot: project,
    platforms: { claude: false, codex: true },
    templateDir: template,
    homeDir: home,
  }, hooks);

  // L'installation reste une reussite : sans Claude sur la machine, sauter
  // l'etape est le bon comportement. C'est le SILENCE qui etait le defaut.
  expect(r.ok).toBe(true);
  expect(hooks.claudeSetup).not.toHaveBeenCalled();

  const claude = r.steps.find((s) => s.id === 'claude');
  expect(claude.status).toBe('skipped');
  expect(claude.reason).toMatch(/Claude Code non detecte/);
  expect(r.skipped.map((s) => s.id)).toEqual(expect.arrayContaining(['claude', 'skills-sync']));

  // Les quatre controles Claude figurent dans le denominateur intendu, sautes
  // avec leur raison, au lieu de disparaitre du compte.
  expect(r.verify.intendedTotal).toBe(8);
  expect(r.verify.total).toBe(4);
  expect(r.verify.skipped).toHaveLength(4);
  expect(r.verify.skipped.map((c) => c.name)).toContain('Skill byan-byan');
  for (const c of r.verify.skipped) expect(c.reason).toMatch(/Claude Code non detecte/);
});

// LA REPRISE DES DROITS (F5) ET SES SORTIES DE SECOURS (F8).
//
// Mesure du 2026-08-11 sur un serveur reel : le dossier parent du projet est en
// yan:docker, le dossier _byan/ pose sous elevation est en root:root, et
// l'utilisateur ne peut plus modifier ce que l'installateur a ecrit.

const CIBLE_ELEVEE = {
  uid: 1000, gid: 1000, name: 'yan', home: '/home/yan',
  homeSource: 'passwd', source: 'sudo', elevated: true,
};

function hooksDroits(steps, repriseImpl, groupeImpl) {
  return {
    ...hooksFor(steps),
    ensureOwnership: repriseImpl || jest.fn(() => ({ outcome: 'ok', changed: 42, skipped: 0, errors: [] })),
    ensureSharedGroup: groupeImpl || jest.fn(() => ({ outcome: 'ok', gid: 950, mode: 0o2775, warnings: [] })),
  };
}

test('sous elevation : la reprise des droits tourne, et sur l\'utilisateur cible', async () => {
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);

  const r = await engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: false },
    templateDir: template,
    homeDir: home,
    targetUser: CIBLE_ELEVEE,
  }, hooks);

  expect(hooks.ensureOwnership).toHaveBeenCalledWith(project, { uid: 1000, gid: 1000 }, { groupWritable: false });
  expect(r.ownership.outcome).toBe('ok');
  expect(r.ownership.changed).toBe(42);
  expect(r.targetUser).toMatchObject({ uid: 1000, name: 'yan', source: 'sudo', elevated: true });
});

test('ce qui est ecrit dans le home est repris AU NOM de l\'utilisateur cible', async () => {
  // Router ~/.byan vers le bon home ne suffit pas : sous elevation le fichier y
  // arrive en root:root. credentials.json est ecrit en 0600 — un fichier de
  // secrets que son proprietaire ne peut plus lire est un etat pire que la
  // panne d'origine, ou il etait seulement au mauvais endroit.
  const { template, project, home } = await makeFixture();
  const repris = [];
  const hooks = hooksDroits([]);
  hooks.ensureOwnership = jest.fn((p) => { repris.push(p); return { outcome: 'ok', changed: 1, errors: [] }; });

  const r = await engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: false },
    templateDir: template,
    homeDir: home,
    targetUser: CIBLE_ELEVEE,
    credentials: { BYAN_API_URL: 'https://api.exemple.fr' },
  }, hooks);

  expect(repris).toContain(project);
  expect(repris).toContain(path.join(home, '.byan'));
  expect(r.ownership.home.map((h) => h.path)).toContain(path.join(home, '.byan'));
});

test('l\'etape de reprise passe APRES le dernier sous-processus', async () => {
  // Contrainte d'ordonnancement, pas de style : npm install (serveur MCP) et
  // setup-rtk creent des fichiers qu'aucun crochet fs ne voit. Une reprise
  // placee avant eux laisserait node_modules en root:root.
  const { template, project, home } = await makeFixture();
  const ordre = [];
  const hooks = hooksDroits([]);
  hooks.claudeSetup = jest.fn(async () => { ordre.push('claude'); });
  hooks.rtkInstall = jest.fn(() => { ordre.push('rtk'); return 'rtk installe'; });
  hooks.ensureOwnership = jest.fn(() => { ordre.push('ownership'); return { outcome: 'ok', changed: 1, errors: [] }; });
  hooks.detect = () => ({ claude: true, codex: false, rtk: false, storedCredentialKeys: [] });

  await engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: false },
    templateDir: template,
    homeDir: home,
    targetUser: CIBLE_ELEVEE,
  }, hooks);

  expect(ordre).toEqual(['claude', 'rtk', 'ownership']);
});

test('la cible se lit sur le dossier D INSTALLATION, pas sur le dossier courant', async () => {
  // `create-byan-agent --cli --dir /opt/byan` lance depuis le home lisait le
  // proprietaire du home. La regle qui protege une installation deliberee en
  // root portait donc sur la mauvaise arborescence.
  const { template, project, home } = await makeFixture();
  const sousDossier = path.join(project, 'pas', 'encore', 'cree');

  const r = await engine.runInstall({
    projectRoot: sousDossier,
    platforms: { claude: false, codex: false },
    templateDir: template,
    homeDir: home,
  }, hooksDroits([]));

  // Le dossier n'existe pas encore : c'est le premier ancetre existant qui
  // porte l'identite lue, et l'installation aboutit quand meme.
  expect(r.ok).toBe(true);
  expect(r.targetUser.uid).toBe(process.getuid ? process.getuid() : r.targetUser.uid);
  expect(await fs.pathExists(path.join(sousDossier, '_byan', 'agent', 'byan', 'byan.md'))).toBe(true);
});

test('--no-chown : la reprise est ecartee, et le rapport dit pourquoi', async () => {
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home, targetUser: CIBLE_ELEVEE, chown: false,
  }, hooks);

  expect(hooks.ensureOwnership).not.toHaveBeenCalled();
  const etape = r.steps.find((s) => s.id === 'ownership');
  expect(etape.status).toBe('skipped');
  expect(etape.reason).toMatch(/no-chown/);
});

// LA PROTECTION D'UNE INSTALLATION DELIBEREE EN ROOT PORTE SUR LE DOSSIER.
//
// La premiere version la posait sur l'echelon de resolution (source === 'root'),
// un echelon qui n'est atteint que lorsque AUCUNE variable d'elevation n'est
// posee. Sous un simple sudo la source vaut 'sudo' : installer dans /opt aurait
// remis l'arborescence a l'utilisateur appelant, cassant un montage qui marche.
describe('installationEnRootAssumee', () => {
  it('reconnait un dossier root sous un parent root', () => {
    // /opt et / sont en uid 0 sur cette machine (verifie par ls -ldn).
    expect(engine.installationEnRootAssumee('/opt')).toBe(true);
    // Le dossier peut ne pas exister encore : c'est le premier ancetre qui parle.
    expect(engine.installationEnRootAssumee('/opt/byan-pas-encore-cree')).toBe(true);
  });

  it('ne se declenche pas sur un dossier de l utilisateur', () => {
    expect(engine.installationEnRootAssumee(os.homedir())).toBe(false);
    expect(engine.installationEnRootAssumee(process.cwd())).toBe(false);
  });
});

test('une cible resolue a root : la reprise refuse, elle sert a sortir de root', async () => {
  // Mesure du 2026-08-11 : avec SUDO_UID=0 dans l'environnement, la cible
  // ressortait a uid 0 avec source 'sudo'. La garde de l'epoque testait la
  // source, pas l'uid : l'arborescence de l'utilisateur passait en root:root,
  // soit exactement la panne que ce chantier corrige.
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home,
    targetUser: { uid: 0, gid: 0, name: 'root', home: '/root', source: 'sudo', elevated: true },
  }, hooks);

  expect(hooks.ensureOwnership).not.toHaveBeenCalled();
  expect(r.steps.find((s) => s.id === 'ownership').reason).toMatch(/sortir une arborescence de root/);
});

test('--owner avec un compte inconnu : la raison nomme le compte, pas le systeme de fichiers', async () => {
  // Dire "ce systeme ne porte pas de proprietaire POSIX" a quelqu un qui a tape
  // un nom inexistant l envoie chercher au mauvais endroit.
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home,
    owner: 'compte-qui-nexiste-pas-42',
  }, hooks);

  expect(hooks.ensureOwnership).not.toHaveBeenCalled();
  expect(r.steps.find((s) => s.id === 'ownership').reason).toMatch(/inconnu de ce systeme/);
});

test('home de la cible non resolu : rien n est repris dans le home du processus', async () => {
  // Sous pkexec avec un uid absent de /etc/passwd, cible.home vaut null et
  // homeDir retombe sur le home du PROCESSUS — /root sous elevation. Reprendre
  // ce chemin donnerait le home de root a la cible.
  const { template, project, home } = await makeFixture();
  const repris = [];
  const hooks = hooksDroits([]);
  hooks.ensureOwnership = jest.fn((p) => { repris.push(p); return { outcome: 'ok', changed: 1, errors: [] }; });
  await fs.ensureDir(path.join(home, '.byan'));

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home,
    targetUser: { uid: 4242, gid: null, name: null, home: null, homeSource: 'unknown', source: 'pkexec', elevated: true },
  }, hooks);

  expect(repris).toEqual([project]);
  expect(r.ownership.homeSkipped).toMatch(/non resolu/);
});

test('un echec dans le home remonte au rapport, il ne reste pas dans le projet', async () => {
  // credentials.json porte un token. Un echec de reprise sur ~/.byan qui
  // n apparait pas dans l issue d ensemble est un silence sur le fichier le
  // plus sensible de l installation.
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);
  await fs.ensureDir(path.join(home, '.byan'));
  hooks.ensureOwnership = jest.fn((p) => (p === project
    ? { outcome: 'ok', changed: 3, errors: [] }
    : { outcome: 'failed', changed: 0, reason: 'privilege-insuffisant', errors: [{ code: 'EPERM', message: 'refuse' }] }));

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home, targetUser: CIBLE_ELEVEE,
  }, hooks);

  expect(r.ownership.outcome).toBe('ok');           // le projet, lui, est passe
  expect(r.ownership.overall).toBe('failed');       // mais l ensemble ne l est pas
  expect(r.ownership.homeFailed).toContain(path.join(home, '.byan'));
  expect(r.steps.find((s) => s.id === 'ownership').status).toBe('failed');
  // Et ok BASCULE. Les fichiers sont bien poses, mais avec des droits que
  // l'utilisateur ne controle pas : annoncer une reussite serait le meme
  // silence que celui corrige plus haut, deplace d'un cran.
  expect(r.ok).toBe(false);
  expect(r.failed.map((f) => f.id)).toContain('ownership');
});

test('le umask abaisse par le groupe partage est restaure', async () => {
  // Le module rend previousUmask en ecrivant que l appelant doit le restaurer.
  // Sans restitution, le reste de la commande — et le claude qu elle lance —
  // heriterait d un umask 002 qu aucun d eux n a demande.
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);
  hooks.ensureSharedGroup = jest.fn(() => ({ outcome: 'ok', gid: 950, previousUmask: 0o022, warnings: [] }));
  const avant = process.umask();

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home,
    targetUser: { uid: process.getuid(), gid: process.getgid(), name: 'yan', home, source: 'self', elevated: false },
    group: 'byan',
  }, hooks);

  expect(r.ownership.group.umaskRestored).toBe(true);
  expect(process.umask()).toBe(avant);
});

test('sans elevation ni groupe partage : il n\'y a rien a reprendre', async () => {
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home,
    targetUser: { uid: 1000, gid: 1000, name: 'yan', home, source: 'self', elevated: false },
  }, hooks);

  expect(hooks.ensureOwnership).not.toHaveBeenCalled();
  expect(r.steps.find((s) => s.id === 'ownership').reason).toMatch(/aucune elevation/);
});

test('--group : le groupe est pose ET memorise, puis relu a la reinstallation', async () => {
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);
  const cfg = path.join(project, '_byan', 'bmb', 'config.yaml');

  await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home,
    targetUser: { uid: 1000, gid: 1000, name: 'yan', home, source: 'self', elevated: false },
    group: 'byan',
  }, hooks);

  expect(hooks.ensureSharedGroup).toHaveBeenCalledWith(project, 'byan');
  expect(await fs.readFile(cfg, 'utf8')).toContain('shared_group: byan');

  // Reinstallation SANS l'option : la cle survit et le groupe est repose.
  // L'ancienne etape config reecrivait le fichier depuis un objet fixe, ce qui
  // aurait efface la cle a chaque passage.
  const hooks2 = hooksDroits([]);
  await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home,
    targetUser: { uid: 1000, gid: 1000, name: 'yan', home, source: 'self', elevated: false },
  }, hooks2);

  expect(await fs.readFile(cfg, 'utf8')).toContain('shared_group: byan');
  expect(hooks2.ensureSharedGroup).toHaveBeenCalledWith(project, 'byan');
});

test('une reprise en echec n\'abat pas l\'installation, mais figure au rapport', async () => {
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([], jest.fn(() => ({
    outcome: 'not-applicable', changed: 0, errors: [{ code: 'ENOTSUP', message: 'montage sans proprietaire POSIX' }],
  })));

  const r = await engine.runInstall({
    projectRoot: project, platforms: { claude: true, codex: false },
    templateDir: template, homeDir: home, targetUser: CIBLE_ELEVEE,
  }, hooks);

  expect(r.ok).toBe(true);
  expect(r.ownership.outcome).toBe('not-applicable');
  expect(r.steps.find((s) => s.id === 'ownership').status).toBe('done');
});

test('les ecritures hors projet partent dans le home de l\'utilisateur CIBLE', async () => {
  // Deux classes d'ecritures, deux regles. Le projet suit le proprietaire du
  // dossier cible ; ce qui va dans le home suit l'utilisateur cible. Sous
  // elevation, os.homedir() rend /root et ~/.codex y atterrissait.
  const { template, project, home } = await makeFixture();
  const hooks = hooksDroits([]);

  await engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: true },
    templateDir: template,
    homeDir: home,
    targetUser: CIBLE_ELEVEE,
  }, hooks);

  expect(hooks.codexSetup).toHaveBeenCalledWith(project, expect.objectContaining({ homeDir: home }));
});

// L'URL DE L'API TRANSITE JUSQU'AUX ETAPES.
//
// Le defaut valait http://localhost:3737 : un projet installe sur une machine
// qui n'heberge pas byan_web recevait une configuration pointant sur son propre
// port 3737, ou rien n'ecoute. Le serveur MCP demarrait et ne joignait jamais
// l'API. La resolution est faite UNE fois par le moteur, puis transmise.
describe('URL de l API byan_web', () => {
  test('sans rien de precise, le host de production est transmis a Codex', async () => {
    const { template, project, home } = await makeFixture();
    const hooks = hooksFor([]);

    await engine.runInstall({
      projectRoot: project, platforms: { claude: false, codex: true },
      templateDir: template, homeDir: home,
    }, hooks);

    const passe = hooks.codexSetup.mock.calls[0][1];
    expect(passe.apiUrl).toBe('https://byan-api.stark.a3n.fr');
    expect(passe.apiUrl).not.toContain('localhost');
  });

  test('--api-url l emporte, et son suffixe /api est retire', async () => {
    const { template, project, home } = await makeFixture();
    const hooks = hooksFor([]);

    await engine.runInstall({
      projectRoot: project, platforms: { claude: false, codex: true },
      templateDir: template, homeDir: home,
      apiUrl: 'https://byan-perso.exemple/api/',
    }, hooks);

    expect(hooks.codexSetup.mock.calls[0][1].apiUrl).toBe('https://byan-perso.exemple');
  });
});

test('la sonde de lancement est injectable : aucun `claude --help` pendant les tests', async () => {
  const { template, project, home } = await makeFixture();
  const sonde = jest.fn(() => ({ command: 'claude', channel: false }));
  const hooks = { ...hooksFor([]), launchProbe: sonde };

  const r = await engine.runInstall({
    projectRoot: project,
    platforms: { claude: true, codex: false },
    templateDir: template,
    homeDir: home,
  }, hooks);

  expect(sonde).toHaveBeenCalledTimes(1);
  expect(r.launch).toEqual({ command: 'claude', channel: false });
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

// CORRECTIFS ISSUS DE LA SECONDE REVUE ADVERSARIALE (2026-08-12).
// Six lentilles, 27 agents, 20 constats confirmes par reproduction.
describe('correctifs de la seconde revue', () => {
  // BLOQUANT. Sous pkexec ou su avec un compte absent de /etc/passwd (annuaire
  // LDAP ou SSSD, cas courant en entreprise), cible.home vaut null et homeDir
  // retombait sur le home du PROCESSUS — /root sous elevation. Le jeton d'API
  // partait alors dans /root/.byan/credentials.json, la configuration Codex
  // dans /root/.codex, et le rapport rendait ok:true.
  test('home cible non resolu sous elevation : les etapes qui ecrivent hors projet sont ECARTEES', async () => {
    const { template, project, home } = await makeFixture();
    const hooks = hooksDroits([]);

    const r = await engine.runInstall({
      projectRoot: project,
      platforms: { claude: true, codex: true },
      templateDir: template,
      homeDir: home,
      credentials: { BYAN_API_TOKEN: 'byan_' + '0'.repeat(64) },
      targetUser: { uid: 90210, gid: null, name: null, home: null, homeSource: 'unknown', source: 'pkexec', elevated: true },
    }, hooks);

    // Rien n'est ecrit dans le home du processus.
    expect(hooks.codexSetup).not.toHaveBeenCalled();
    expect(await fs.pathExists(path.join(home, '.byan', 'credentials.json'))).toBe(false);

    // Et les quatre etapes concernees le disent, chacune avec la meme raison.
    const parId = Object.fromEntries(r.steps.map((s) => [s.id, s]));
    for (const id of ['codex', 'credentials', 'google-purge', 'skills-sync']) {
      expect(parId[id].status).toBe('skipped');
      expect(parId[id].reason).toMatch(/home de l'utilisateur cible non resolu/);
    }
    // Le projet, lui, est bien installe : c'est une abstention ciblee.
    expect(await fs.pathExists(path.join(project, '_byan', 'agent', 'byan', 'byan.md'))).toBe(true);
  });

  test('sans elevation, un home non resolu ne bloque rien', async () => {
    // La garde ne vise que l'elevation : sans elle, os.homedir() EST le bon home.
    const { template, project, home } = await makeFixture();
    const hooks = hooksDroits([]);

    const r = await engine.runInstall({
      projectRoot: project, platforms: { claude: true, codex: true },
      templateDir: template, homeDir: home,
      targetUser: { uid: 1000, gid: 1000, name: 'yan', home: null, homeSource: 'unknown', source: 'self', elevated: false },
    }, hooks);

    expect(hooks.codexSetup).toHaveBeenCalled();
    expect(r.steps.find((s) => s.id === 'codex').status).toBe('done');
  });

  // BLOQUANT. `--dir /srv/byan` ou /srv/byan est un lien vers /mnt/data/byan :
  // les etapes d'ecriture suivent le lien, la reprise des droits lisait le lien
  // lui-meme. lstat d'un lien rend isDirectory() faux, donc le parcours ne
  // demarrait pas et l'arborescence reelle gardait son proprietaire.
  test('projectRoot symbolique : la reprise vise le chemin RESOLU', async () => {
    const { base, template, home } = await makeFixture();
    const reel = path.join(base, 'reel');
    await fs.ensureDir(reel);
    const lien = path.join(base, 'lien');
    await fs.symlink(reel, lien);

    const vus = [];
    const hooks = hooksDroits([]);
    hooks.ensureOwnership = jest.fn((p) => { vus.push(p); return { outcome: 'ok', changed: 5, errors: [] }; });

    await engine.runInstall({
      projectRoot: lien, platforms: { claude: true, codex: false },
      templateDir: template, homeDir: home, targetUser: CIBLE_ELEVEE,
    }, hooks);

    expect(vus[0]).toBe(await fs.realpath(reel));
    expect(vus[0]).not.toBe(lien);
  });

  // ok ne pouvait structurellement pas basculer : les etapes listees comme
  // critiques levent toutes, donc on n'atteignait jamais le calcul avec l'une
  // d'elles en echec, et les etapes laterales n'entraient pas dans le test.
  describe('ok est fonde sur les echecs reels', () => {
    test('un echec de rtk n abat pas l installation', async () => {
      const { template, project, home } = await makeFixture();
      const hooks = hooksDroits([]);
      // rtk absent, sinon l'etape rend "rtk deja present" sans rien installer.
      hooks.detect = () => ({ claude: true, codex: false, rtk: false, storedCredentialKeys: [] });
      hooks.rtkInstall = jest.fn(() => { throw new Error('reseau coupe'); });

      const r = await engine.runInstall({
        projectRoot: project, platforms: { claude: true, codex: false },
        templateDir: template, homeDir: home,
      }, hooks);

      expect(r.steps.find((s) => s.id === 'rtk').status).toBe('failed');
      expect(r.ok).toBe(true);
      expect(r.failed).toEqual([]);
    });

    test('un echec de codex, lui, fait basculer ok', async () => {
      // Codex change ce qui est livre : le taire serait le meme silence que
      // celui corrige sur le plan ampute.
      const { template, project, home } = await makeFixture();
      const hooks = hooksDroits([]);
      hooks.codexSetup = jest.fn(async () => { throw new Error('config.toml illisible'); });

      const r = await engine.runInstall({
        projectRoot: project, platforms: { claude: true, codex: true },
        templateDir: template, homeDir: home,
      }, hooks);

      expect(r.ok).toBe(false);
      expect(r.failed.map((f) => f.id)).toContain('codex');
    });
  });

  // Le groupe partage ne portait que sur la racine : ensureOwnership reposait
  // cible.gid partout, puis ensureSharedGroup ne rattrapait que le dossier de
  // tete. Un groupe partage qui ne s'applique a rien ne donne acces a rien.
  test('--group : le gid du groupe est applique a TOUTE l arborescence', async () => {
    const { template, project, home } = await makeFixture();
    const hooks = hooksDroits([]);
    hooks.resolveGroupGid = jest.fn(() => ({ gid: 950, source: 'getent', warnings: [] }));

    await engine.runInstall({
      projectRoot: project, platforms: { claude: true, codex: false },
      templateDir: template, homeDir: home,
      targetUser: { uid: 1000, gid: 1000, name: 'yan', home, source: 'self', elevated: false },
      group: 'byan',
    }, hooks);

    expect(hooks.resolveGroupGid).toHaveBeenCalledWith('byan');
    // Le gid transmis est celui du GROUPE PARTAGE, pas le groupe primaire.
    const [, cible, opts] = hooks.ensureOwnership.mock.calls[0];
    expect(cible.gid).toBe(950);
    expect(opts.groupWritable).toBe(true);
  });

  // Node ignore silencieusement un gid null sur spawnSync : le sous-processus
  // tournait sous l'uid de la cible mais gardait le GROUPE root.
  test('descente de privilege impossible : rtk refuse plutot que de tourner a moitie depouille', async () => {
    const { template, project, home } = await makeFixture();
    const hooks = hooksDroits([]);
    delete hooks.rtkInstall;   // on veut le vrai corps de l'etape
    hooks.detect = () => ({ claude: true, codex: false, rtk: false, storedCredentialKeys: [] });

    const r = await engine.runInstall({
      projectRoot: project, platforms: { claude: true, codex: false },
      templateDir: template, homeDir: home,
      targetUser: { uid: 1000, gid: null, name: 'yan', home, source: 'sudo', elevated: true },
    }, hooks);

    const rtk = r.steps.find((s) => s.id === 'rtk');
    expect(rtk.status).toBe('failed');
    expect(rtk.detail).toMatch(/descente de privilege impossible/);
    // Etape toleree : l'installation tient malgre tout.
    expect(r.ok).toBe(true);
  });
});
