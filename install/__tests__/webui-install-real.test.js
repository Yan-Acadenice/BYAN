'use strict';

// The webui POST install must run the REAL engine and broadcast one progress
// event per real step — the simulated handler (9 steps around sleep calls) is
// gone. Tested by injecting a fake engine into a fake server and asserting the
// request flows through it, config translated (platform array -> object).

const api = require('../src/webui/api');

function fakeServer() {
  const events = { progress: [], logs: [], complete: [] };
  return {
    projectRoot: '/tmp/projet-defaut',
    broadcastProgress: (i, t, label) => events.progress.push({ i, t, label }),
    broadcastLog: (level, msg) => events.logs.push({ level, msg }),
    broadcastComplete: (ok, summary) => events.complete.push({ ok, summary }),
    events,
  };
}

function fakeRes() {
  return { writeHead: jest.fn(), end: jest.fn() };
}

test('POST install execute le moteur reel injecte et relaie sa progression', async () => {
  const server = fakeServer();
  server.installEngine = {
    runInstall: jest.fn(async (options, hooks) => {
      // The engine drives progress; the handler must relay verbatim.
      hooks.onStep({ index: 1, total: 2, id: 'copy-byan', label: 'Copie de la plateforme' });
      hooks.onStep({ index: 2, total: 2, id: 'verify', label: 'Verification finale' });
      return { ok: true, steps: [], verify: { passed: 2, total: 2, failed: [] }, launch: null };
    }),
  };

  const handler = api.resolve ? api.resolve('POST', 'install') : api['POST install'];
  // projectDir is a subdir INSIDE the server base (confineToBase honors it).
  await handler({ body: { projectName: 'demo', projectDir: 'sous-projet', platforms: ['claude'] } }, fakeRes(), server);

  // The engine received the translated options.
  const opts = server.installEngine.runInstall.mock.calls[0][0];
  expect(opts.projectRoot).toBe('/tmp/projet-defaut/sous-projet');
  expect(opts.projectName).toBe('demo');
  expect(opts.platforms).toEqual({ claude: true, codex: false });

  // Progress relayed 1:1, completion carries the verify result.
  expect(server.events.progress.map((p) => p.label)).toEqual(['Copie de la plateforme', 'Verification finale']);
  expect(server.events.complete[0].ok).toBe(true);
  expect(server.events.complete[0].summary.verify.passed).toBe(2);
});

test('POST install : un echec du moteur est diffuse comme echec (pas de faux succes)', async () => {
  const server = fakeServer();
  server.installEngine = {
    runInstall: jest.fn(async () => { throw new Error('templates introuvables (x)'); }),
  };
  const handler = api.resolve ? api.resolve('POST', 'install') : api['POST install'];
  await handler({ body: {} }, fakeRes(), server);

  expect(server.events.complete[0].ok).toBe(false);
  expect(server.events.complete[0].summary.message).toMatch(/templates introuvables/);
});

test('POST install confine projectDir a la base du serveur (pas de chemin arbitraire)', async () => {
  const server = fakeServer(); // projectRoot = /tmp/projet-defaut
  server.installEngine = { runInstall: jest.fn(async () => ({ ok: true, steps: [], verify: { passed: 1, total: 1, failed: [] }, launch: null })) };
  const handler = api.resolve ? api.resolve('POST', 'install') : api['POST install'];

  // An attempt to escape the base collapses back to the base.
  await handler({ body: { projectDir: '../../etc' } }, fakeRes(), server);
  expect(server.installEngine.runInstall.mock.calls[0][0].projectRoot).toBe('/tmp/projet-defaut');

  // An absolute path elsewhere is refused too.
  await handler({ body: { projectDir: '/root/cible' } }, fakeRes(), server);
  expect(server.installEngine.runInstall.mock.calls[1][0].projectRoot).toBe('/tmp/projet-defaut');

  // A relative subdir inside the base is honored.
  await handler({ body: { projectDir: 'sous/projet' } }, fakeRes(), server);
  expect(server.installEngine.runInstall.mock.calls[2][0].projectRoot).toBe('/tmp/projet-defaut/sous/projet');
});

test('POST update relaie le resultat reel de l updater injecte', async () => {
  const server = fakeServer();
  server.updater = jest.fn(async () => ({
    previousVersion: '2.55.0', newVersion: '2.56.0',
    filesUpdated: 3, filesAdded: 1, filesSkipped: 0,
    claudeRefreshed: true, globalSkillsDiverged: ['byan-byan'],
  }));
  const handler = api.resolve ? api.resolve('POST', 'update') : api['POST update'];
  await handler({ body: {} }, fakeRes(), server);

  const done = server.events.complete[0];
  expect(done.ok).toBe(true);
  expect(done.summary.claudeRefreshed).toBe(true);
  expect(done.summary.globalSkillsDiverged).toEqual(['byan-byan']);
});
