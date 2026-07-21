'use strict';

// Field bug (2026-07-21, Arch Linux): the wizard's Detection screen showed
// "not detected" for Claude Code and Codex although both were installed. Root
// cause — GET status used the yanstaller detector, which looks for Claude
// DESKTOP's config file and for a project-local .codex/prompts dir. The fix
// routes platform detection through the install engine's detectEnvironment
// (machine-level: ~/.claude or `command -v claude`, same for codex). These
// tests pin that wiring down with an injected engine.

const api = require('../src/webui/api');

function fakeServer(engineDetect) {
  return {
    projectRoot: '/tmp/projet-detection',
    installEngine: { detectEnvironment: () => engineDetect },
  };
}

function captureRes() {
  const out = { statusCode: null, body: null };
  return {
    res: {
      writeHead: (code) => { out.statusCode = code; },
      end: (payload) => { out.body = JSON.parse(payload); },
    },
    out,
  };
}

async function getStatus(engineDetect) {
  const handler = api.resolve('GET', 'status');
  const { res, out } = captureRes();
  await handler({}, res, fakeServer(engineDetect));
  return out;
}

describe('GET status — la detection plateforme vient du moteur (niveau machine)', () => {
  test('claude + codex presents sur la machine -> les deux detectes', async () => {
    const out = await getStatus({ claude: true, codex: true, rtk: true, storedCredentialKeys: [] });
    expect(out.statusCode).toBe(200);
    expect(out.body.platforms).toEqual(['claude', 'codex']);
    expect(out.body.detection.platforms).toEqual([
      { name: 'claude', detected: true },
      { name: 'codex', detected: true },
    ]);
  });

  test('machine nue -> aucun detecte, sans planter', async () => {
    const out = await getStatus({ claude: false, codex: false, rtk: false, storedCredentialKeys: [] });
    expect(out.statusCode).toBe(200);
    expect(out.body.platforms).toEqual([]);
    expect(out.body.detection.platforms).toEqual([
      { name: 'claude', detected: false },
      { name: 'codex', detected: false },
    ]);
  });

  test('claude seul -> claude detecte, codex non', async () => {
    const out = await getStatus({ claude: true, codex: false, rtk: false, storedCredentialKeys: [] });
    expect(out.body.platforms).toEqual(['claude']);
  });
});

describe('front du wizard — defauts francais, tous les modules, prenom demande', () => {
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'webui', 'public', 'app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'webui', 'public', 'index.html'), 'utf8');

  test('la langue par defaut est Francais, pas English', () => {
    expect(appJs).toMatch(/language:\s*'Francais'/);
    expect(appJs).not.toMatch(/language:\s*'English'/);
  });

  test('les 5 modules (tous les agents) sont le defaut', () => {
    expect(appJs).toMatch(/modules:\s*\['core',\s*'bmm',\s*'bmb',\s*'tea',\s*'cis'\]/);
  });

  test('le mode AUTO ne baptise plus User et ne saute plus la question du prenom', () => {
    // l'ancien code posait userName='User' puis sautait direct au recap
    expect(appJs).not.toMatch(/userName\s*\|\|\s*'User'/);
    expect(appJs).toContain('Comment veux-tu etre appele ?');
  });

  test("l'interface est en francais (page fr, textes cles)", () => {
    expect(indexHtml).toContain('lang="fr"');
    expect(indexHtml).toContain('Bienvenue dans BYAN');
    expect(indexHtml).toContain('Confirmer et installer');
    expect(indexHtml).not.toMatch(/Welcome to BYAN/);
  });
});
