'use strict';

// Tests de resolution d'executable avec un fs et un env simules : aucune lecture
// de la vraie machine, donc le meme verdict sur n'importe quel hote de CI.
// Le cas de reference vient de la mesure du 2026-08-11 : le claude actif est
// /home/yan/.local/bin/claude (lien vers .../versions/2.1.224) tandis que quatre
// exemplaires 2.1.160, plus anciens, trainent dans des node_modules.

const path = require('path');

const { resolveBinary, commandExists, knownBinDirs } = require('../lib/resolve-binary');

const HOME = '/home/yan';
const EXEC = 0o755;
const NO_EXEC = 0o644;

// entries : { '<chemin>': { mode, link } }. caseInsensitive reproduit le systeme
// de fichiers Windows, ou claude.CMD et claude.cmd designent le meme fichier.
function fakeFs(entries, { caseInsensitive = false } = {}) {
  const store = new Map();
  for (const key of Object.keys(entries)) {
    store.set(caseInsensitive ? key.toLowerCase() : key, entries[key] || {});
  }
  const get = (p) => store.get(caseInsensitive ? String(p).toLowerCase() : String(p));
  const missing = (p) => {
    const err = new Error('ENOENT: ' + p);
    err.code = 'ENOENT';
    return err;
  };
  return {
    statSync(p) {
      const e = get(p);
      if (!e) throw missing(p);
      const target = e.link ? get(e.link) : e;
      if (!target) throw missing(e.link);
      return { isFile: () => true, mode: target.mode === undefined ? EXEC : target.mode };
    },
    lstatSync(p) {
      const e = get(p);
      if (!e) throw missing(p);
      return { isFile: () => true, isSymbolicLink: () => Boolean(e.link) };
    },
    realpathSync(p) {
      const e = get(p);
      if (!e) throw missing(p);
      return e.link || String(p);
    },
  };
}

function posixOpts(files, extra = {}) {
  return Object.assign({
    env: { PATH: '/bin:/usr/bin', HOME },
    platform: 'linux',
    home: HOME,
    fs: fakeFs(files),
    npmPrefix: null,
  }, extra);
}

describe('resolveBinary — ordre de preference', () => {
  test('trouve dans le PATH -> source path', () => {
    const opts = posixOpts({ '/usr/local/bin/claude': { mode: EXEC } }, {
      env: { PATH: '/bin:/usr/bin:/usr/local/bin', HOME },
    });

    const r = resolveBinary('claude', opts);

    expect(r.path).toBe('/usr/local/bin/claude');
    expect(r.source).toBe('path');
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toEqual({ path: '/usr/local/bin/claude', source: 'path', dir: '/usr/local/bin' });
  });

  test('absent du PATH mais present dans <home>/.local/bin -> source known-dir', () => {
    // Le cas mesure : PATH minimal (getconf PATH) et binaire dans ~/.local/bin.
    const r = resolveBinary('claude', posixOpts({ [`${HOME}/.local/bin/claude`]: { mode: EXEC } }));

    expect(r.path).toBe(`${HOME}/.local/bin/claude`);
    expect(r.source).toBe('known-dir');
  });

  test('present dans le PATH et dans un emplacement connu -> le PATH gagne', () => {
    const r = resolveBinary('claude', posixOpts({
      '/usr/local/bin/claude': { mode: EXEC },
      [`${HOME}/.local/bin/claude`]: { mode: EXEC },
    }, { env: { PATH: '/usr/local/bin', HOME } }));

    expect(r.path).toBe('/usr/local/bin/claude');
    expect(r.source).toBe('path');
    expect(r.candidates.map((c) => c.source)).toEqual(['path', 'known-dir']);
  });

  test('les candidats sortent dans l ordre path -> known-dir -> extra', () => {
    const r = resolveBinary('claude', posixOpts({
      '/usr/local/bin/claude': { mode: EXEC },
      [`${HOME}/.local/bin/claude`]: { mode: EXEC },
      '/opt/outil/bin/claude': { mode: EXEC },
    }, {
      env: { PATH: '/usr/local/bin', HOME },
      extraDirs: ['/opt/outil/bin'],
    }));

    expect(r.candidates.map((c) => c.source)).toEqual(['path', 'known-dir', 'extra']);
  });

  test('un dossier fourni en extraDirs est explore -> source extra', () => {
    const r = resolveBinary('claude', posixOpts({ '/opt/outil/bin/claude': { mode: EXEC } }, {
      extraDirs: ['/opt/outil/bin'],
    }));

    expect(r.path).toBe('/opt/outil/bin/claude');
    expect(r.source).toBe('extra');
  });

  test('un dossier present dans le PATH et dans la liste connue est explore une seule fois', () => {
    const r = resolveBinary('claude', posixOpts({ '/usr/local/bin/claude': { mode: EXEC } }, {
      env: { PATH: '/usr/local/bin', HOME },
    }));

    expect(r.searched.filter((d) => d === '/usr/local/bin')).toHaveLength(1);
    expect(r.candidates).toHaveLength(1);
  });
});

describe('resolveBinary — departage du node_modules', () => {
  test('present dans un node_modules ET dans le PATH -> le PATH hors node_modules gagne', () => {
    const nm = '/home/yan/projet/node_modules/.bin';
    const r = resolveBinary('claude', posixOpts({
      [`${nm}/claude`]: { mode: EXEC },
      '/usr/local/bin/claude': { mode: EXEC },
    }, { env: { PATH: `${nm}:/usr/local/bin`, HOME } }));

    expect(r.path).toBe('/usr/local/bin/claude');
    expect(r.candidates[r.candidates.length - 1].path).toBe(`${nm}/claude`);
  });

  test('le node_modules perd aussi contre un emplacement connu (2.1.160 contre 2.1.224)', () => {
    const nm = '/home/yan/projet/node_modules/.bin';
    const r = resolveBinary('claude', posixOpts({
      [`${nm}/claude`]: { mode: EXEC },
      [`${HOME}/.local/bin/claude`]: { mode: EXEC },
    }, { env: { PATH: nm, HOME } }));

    expect(r.path).toBe(`${HOME}/.local/bin/claude`);
    expect(r.source).toBe('known-dir');
    expect(r.candidates[r.candidates.length - 1].source).toBe('path');
  });

  test('present uniquement dans un node_modules -> retenu, et il figure en dernier dans candidates', () => {
    const nm = '/home/yan/projet/node_modules/.bin';
    const r = resolveBinary('claude', posixOpts({ [`${nm}/claude`]: { mode: EXEC } }, {
      env: { PATH: `/bin:${nm}`, HOME },
    }));

    expect(r.path).toBe(`${nm}/claude`);
    expect(r.source).toBe('path');
    expect(r.candidates[r.candidates.length - 1].path).toBe(`${nm}/claude`);
  });
});

describe('resolveBinary — lien symbolique', () => {
  test('le lien reste le gagnant, la cible est exposee dans realPath', () => {
    const link = `${HOME}/.local/bin/claude`;
    const target = `${HOME}/.local/share/claude/versions/2.1.224`;
    const r = resolveBinary('claude', posixOpts({
      [link]: { link: target },
      [target]: { mode: EXEC },
    }));

    expect(r.path).toBe(link);
    expect(r.realPath).toBe(target);
  });

  test('un fichier ordinaire rend realPath null', () => {
    const r = resolveBinary('claude', posixOpts({ '/usr/local/bin/claude': { mode: EXEC } }, {
      env: { PATH: '/usr/local/bin', HOME },
    }));

    expect(r.realPath).toBeNull();
  });
});

describe('resolveBinary — validite du candidat', () => {
  test('POSIX : un fichier sans bit d execution n est pas retenu', () => {
    const r = resolveBinary('claude', posixOpts({ '/usr/local/bin/claude': { mode: NO_EXEC } }, {
      env: { PATH: '/usr/local/bin', HOME },
    }));

    expect(r.path).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  test('win32 : claude est resolu en claude.cmd via PATHEXT', () => {
    const dir = path.win32.join('C:\\Users\\yan\\AppData\\Roaming', 'npm');
    const r = resolveBinary('claude', {
      env: { PATH: dir, APPDATA: 'C:\\Users\\yan\\AppData\\Roaming' },
      platform: 'win32',
      home: 'C:\\Users\\yan',
      fs: fakeFs({ [path.win32.join(dir, 'claude.cmd')]: { mode: NO_EXEC } }, { caseInsensitive: true }),
      npmPrefix: null,
    });

    expect(r.path.toLowerCase()).toBe(path.win32.join(dir, 'claude.cmd').toLowerCase());
    expect(r.source).toBe('path');
  });

  test('win32 : un fichier sans extension listee dans PATHEXT n est pas retenu', () => {
    const dir = 'C:\\outils';
    const r = resolveBinary('claude', {
      env: { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' },
      platform: 'win32',
      home: 'C:\\Users\\yan',
      fs: fakeFs({
        [path.win32.join(dir, 'claude')]: { mode: EXEC },
        [path.win32.join(dir, 'claude.ps1')]: { mode: EXEC },
      }, { caseInsensitive: true }),
      npmPrefix: null,
    });

    expect(r.path).toBeNull();
  });

  test('win32 : l emplacement connu %APPDATA%\\npm est explore hors PATH', () => {
    const appData = 'C:\\Users\\yan\\AppData\\Roaming';
    const stub = path.win32.join(appData, 'npm', 'claude.cmd');
    const r = resolveBinary('claude', {
      env: { PATH: '', APPDATA: appData },
      platform: 'win32',
      home: 'C:\\Users\\yan',
      fs: fakeFs({ [stub]: { mode: NO_EXEC } }, { caseInsensitive: true }),
      npmPrefix: null,
    });

    expect(r.path.toLowerCase()).toBe(stub.toLowerCase());
    expect(r.source).toBe('known-dir');
  });
});

describe('resolveBinary — absence et diagnostic', () => {
  test('PATH vide -> rend null sans lever', () => {
    let r;
    expect(() => {
      r = resolveBinary('claude', posixOpts({}, { env: { PATH: '', HOME } }));
    }).not.toThrow();

    expect(r.path).toBeNull();
    expect(r.source).toBeNull();
    expect(r.realPath).toBeNull();
  });

  test('rien trouve -> candidates vide, mais la liste des dossiers explores est rendue', () => {
    const r = resolveBinary('claude', posixOpts({}, { env: { PATH: '/bin:/usr/bin', HOME } }));

    expect(r.candidates).toEqual([]);
    expect(r.searched).toContain('/bin');
    expect(r.searched).toContain(`${HOME}/.local/bin`);
    expect(r.searched.length).toBeGreaterThan(5);
  });
});

describe('prefixe npm', () => {
  test('le bin du prefixe npm injecte est explore -> source known-dir', () => {
    const r = resolveBinary('claude', posixOpts({ '/opt/npm-global/bin/claude': { mode: EXEC } }, {
      npmPrefix: () => '/opt/npm-global\n',
    }));

    expect(r.path).toBe('/opt/npm-global/bin/claude');
    expect(r.source).toBe('known-dir');
  });

  test('un appel npm qui echoue laisse la resolution continuer', () => {
    const r = resolveBinary('claude', posixOpts({ [`${HOME}/.local/bin/claude`]: { mode: EXEC } }, {
      npmPrefix: () => { throw new Error('Unknown command: "bin"'); },
    }));

    expect(r.path).toBe(`${HOME}/.local/bin/claude`);
  });

  test('sous win32 le prefixe npm est utilise tel quel, sans /bin', () => {
    const dirs = knownBinDirs({
      env: { APPDATA: 'C:\\Users\\yan\\AppData\\Roaming' },
      platform: 'win32',
      home: 'C:\\Users\\yan',
      npmPrefix: () => 'C:\\Users\\yan\\AppData\\Roaming\\npm',
    });

    expect(dirs).toContain('C:\\Users\\yan\\AppData\\Roaming\\npm');
    expect(dirs.some((d) => d.endsWith('npm\\bin'))).toBe(false);
  });
});

describe('commandExists', () => {
  test('rend true quand le binaire est resolu hors PATH, false quand il est absent', () => {
    const present = posixOpts({ [`${HOME}/.local/bin/claude`]: { mode: EXEC } });

    expect(commandExists('claude', present)).toBe(true);
    expect(commandExists('codex', present)).toBe(false);
  });
});

// CORRECTIFS ISSUS DE LA REVUE ADVERSARIALE DU 2026-08-12.
describe('correctifs de revue', () => {
  const { _resetNpmPrefixCache } = require('../lib/resolve-binary');

  beforeEach(() => _resetNpmPrefixCache());

  // Le prefixe npm est lu dans le .npmrc du home indique par HOME. Sous
  // elevation, l'env du processus porte /root : sans surcharge, l'installateur
  // cherchait le dossier bin de root au lieu de celui de la cible.
  test('le prefixe npm est derive du home de la CIBLE, pas de celui du processus', () => {
    const vus = [];
    const dirs = knownBinDirs({
      env: { HOME: '/root', PATH: '' },
      platform: 'linux',
      home: '/home/cible',
      npmPrefix: (args) => { vus.push(args); return '/home/cible/.npm-global'; },
    });

    expect(vus).toHaveLength(1);
    expect(vus[0].home).toBe('/home/cible');
    expect(vus[0].env.HOME).toBe('/root');   // l'env brut est transmis tel quel
    expect(dirs).toContain('/home/cible/.npm-global/bin');
  });

  test('le prefixe npm n est resolu qu une fois par couple home et systeme', () => {
    let appels = 0;
    const npmPrefix = () => { appels += 1; return '/p'; };
    // La memorisation vit dans defaultNpmPrefix ; un prefixe injecte reste
    // appele a chaque fois, c'est voulu (le test l'injecte pour le controler).
    for (let i = 0; i < 3; i++) knownBinDirs({ env: {}, platform: 'linux', home: '/h', npmPrefix });
    expect(appels).toBe(3);

    // Le defaut, lui, memorise : deux appels, un seul sous-processus.
    const rb = require('../lib/resolve-binary');
    const t0 = Date.now();
    rb.resolveBinary('binaire-qui-nexiste-pas-42');
    const premier = Date.now() - t0;
    const t1 = Date.now();
    rb.resolveBinary('binaire-qui-nexiste-pas-43');
    const second = Date.now() - t1;
    // Le second ne relance pas npm : il est strictement plus rapide, et court.
    expect(second).toBeLessThan(Math.max(premier, 50));
  });

  // WSL, Git Bash, MSYS2, rustup et bun deposent leurs binaires dans la meme
  // arborescence que sous POSIX. La branche win32 n'en explorait aucun.
  test('sous Windows, les emplacements derives du home sont explores', () => {
    const dirs = knownBinDirs({
      env: { APPDATA: 'C:\\Users\\yan\\AppData\\Roaming' },
      platform: 'win32',
      home: 'C:\\Users\\yan',
      npmPrefix: null,
    });
    for (const attendu of ['.local\\bin', '.claude\\local', '.cargo\\bin', '.bun\\bin']) {
      expect(dirs.some((d) => d.endsWith(attendu))).toBe(true);
    }
    // Les emplacements machine restent APRES ceux du home.
    const iHome = dirs.findIndex((d) => d.endsWith('.local\\bin'));
    const iAppData = dirs.findIndex((d) => d.toLowerCase().includes('appdata'));
    expect(iHome).toBeLessThan(iAppData);
  });

  // Le masque mode & 0o111 acceptait le bit d'execution d'un groupe auquel on
  // n'appartient pas : le resolveur annoncait un binaire qui aurait refuse de
  // se lancer.
  test('un fichier executable par un autre groupe seulement n est pas retenu', () => {
    const cible = '/usr/bin/outil';
    const fauxFs = {
      statSync: (p) => {
        if (p === cible) return { isFile: () => true, mode: 0o010 };
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      accessSync: () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); },
      realpathSync: (p) => p,
    };

    const r = resolveBinary('outil', {
      env: { PATH: '/usr/bin' }, platform: 'linux', fs: fauxFs, home: '', npmPrefix: null,
    });
    expect(r.path).toBeNull();
  });

  test('le meme fichier est retenu quand access dit oui', () => {
    const cible = '/usr/bin/outil';
    const fauxFs = {
      statSync: (p) => {
        if (p === cible) return { isFile: () => true, mode: 0o010 };
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      accessSync: (p) => { if (p !== cible) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
      realpathSync: (p) => p,
    };

    const r = resolveBinary('outil', {
      env: { PATH: '/usr/bin' }, platform: 'linux', fs: fauxFs, home: '', npmPrefix: null,
    });
    expect(r.path).toBe(cible);
  });
});
