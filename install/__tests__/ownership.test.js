'use strict';

/**
 * ownership.test.js -- deux familles de tests.
 *
 * A. fs SIMULE : tout ce qui ne demande pas de privilege (les trois issues, le
 *    court-circuit, la collecte des erreurs sans arret du parcours, win32, la
 *    resolution du gid via getent / dscl / recours /etc/group).
 * B. VRAI dossier temporaire : ce qui se verifie sans privilege (pose du
 *    setgid, propagation aux sous-dossiers, chown vers son propre uid, chown
 *    vers uid 0 depuis un processus non privilegie).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ownership = require('../lib/ownership');

const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;

// Construit un fs simule a partir d une carte { chemin: noeud }.
// noeud = { dir?, link?, uid, gid, mode, children? }
function makeFs(tree, options) {
  const opts = options || {};
  const fail = opts.fail || {};
  const calls = { chown: [], lchown: [], chmod: [], readdir: [] };

  function node(p) {
    const n = tree[p];
    if (!n) {
      const e = new Error('ENOENT: chemin absent, ' + p);
      e.code = 'ENOENT';
      throw e;
    }
    return n;
  }

  function maybeFail(p, op) {
    const code = fail[p];
    if (!code) return;
    const e = new Error(op + ' refuse sur ' + p);
    e.code = code;
    throw e;
  }

  const api = {
    calls: calls,
    tree: tree,
    lstatSync: function (p) {
      const n = node(p);
      const type = n.dir ? S_IFDIR : (n.link ? S_IFLNK : S_IFREG);
      return {
        uid: n.uid,
        gid: n.gid,
        mode: (n.mode || 0o644) | type,
        isDirectory: function () { return !!n.dir; },
        isSymbolicLink: function () { return !!n.link; },
      };
    },
    readdirSync: function (p) {
      calls.readdir.push(p);
      const n = node(p);
      return (n.children || []).slice();
    },
    chownSync: function (p, uid, gid) {
      const n = node(p);
      maybeFail(p, 'chown');
      n.uid = uid;
      n.gid = gid;
      calls.chown.push({ path: p, uid: uid, gid: gid });
    },
    chmodSync: function (p, mode) {
      const n = node(p);
      maybeFail(p, 'chmod');
      n.mode = mode & 0o7777;
      calls.chmod.push({ path: p, mode: mode });
    },
    readFileSync: function (p) {
      if (opts.etcGroup && p === '/etc/group') return opts.etcGroup;
      const e = new Error('ENOENT: chemin absent, ' + p);
      e.code = 'ENOENT';
      throw e;
    },
  };

  if (opts.lchown !== false) {
    api.lchownSync = function (p, uid, gid) {
      const n = node(p);
      maybeFail(p, 'lchown');
      n.uid = uid;
      n.gid = gid;
      calls.lchown.push({ path: p, uid: uid, gid: gid });
    };
  }

  return api;
}

// Arborescence de reference : racine + un fichier + un sous-dossier + un fichier
// dedans, tous en root:root (l etat mesure apres une installation sous elevation).
function rootOwnedTree() {
  return {
    '/p': { dir: true, uid: 0, gid: 0, mode: 0o755, children: ['a.txt', 'sub'] },
    '/p/a.txt': { uid: 0, gid: 0, mode: 0o644 },
    '/p/sub': { dir: true, uid: 0, gid: 0, mode: 0o755, children: ['b.txt'] },
    '/p/sub/b.txt': { uid: 0, gid: 0, mode: 0o644 },
  };
}

const TARGET = { uid: 1000, gid: 1001 };

// ---------------------------------------------------------------------------
// A. fs simule
// ---------------------------------------------------------------------------

describe('ensureOwnership (fs simule)', () => {
  it('corrige toute l arborescence et rend outcome ok', () => {
    const f = makeFs(rootOwnedTree());
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('ok');
    expect(r.changed).toBe(4);
    expect(r.skipped).toBe(0);
    expect(r.errors).toEqual([]);
    expect(f.tree['/p/sub/b.txt'].uid).toBe(1000);
    expect(f.tree['/p/sub/b.txt'].gid).toBe(1001);
  });

  it('court-circuite quand le proprietaire colle deja : 0 changement, aucun appel chown', () => {
    const tree = rootOwnedTree();
    Object.keys(tree).forEach((k) => { tree[k].uid = 1000; tree[k].gid = 1001; });
    const f = makeFs(tree);

    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('ok');
    expect(r.changed).toBe(0);
    expect(r.skipped).toBe(4);
    expect(f.calls.chown).toEqual([]);
  });

  it('arborescence mixte : seules les entrees non conformes sont touchees', () => {
    const tree = rootOwnedTree();
    tree['/p'].uid = 1000;
    tree['/p'].gid = 1001;
    tree['/p/sub'].uid = 1000;
    tree['/p/sub'].gid = 1001;
    const f = makeFs(tree);

    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.changed).toBe(2);
    expect(r.skipped).toBe(2);
    expect(f.calls.chown.map((c) => c.path).sort()).toEqual(['/p/a.txt', '/p/sub/b.txt']);
  });

  it('recursive:false ne touche que la racine', () => {
    const f = makeFs(rootOwnedTree());
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux', recursive: false });

    expect(r.outcome).toBe('ok');
    expect(r.changed).toBe(1);
    expect(f.calls.readdir).toEqual([]);
    expect(f.tree['/p/a.txt'].uid).toBe(0);
  });

  it('dryRun compte les changements sans appeler chown', () => {
    const f = makeFs(rootOwnedTree());
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux', dryRun: true });

    expect(r.outcome).toBe('ok');
    expect(r.changed).toBe(4);
    expect(f.calls.chown).toEqual([]);
    expect(f.tree['/p'].uid).toBe(0);
  });

  it('win32 : not-applicable, aucun acces au fs', () => {
    const f = makeFs(rootOwnedTree());
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'win32' });

    expect(r.outcome).toBe('not-applicable');
    expect(r.changed).toBe(0);
    expect(f.calls.chown).toEqual([]);
    expect(f.calls.readdir).toEqual([]);
  });

  it('cible sans uid : not-applicable (absence de sujet, pas une erreur)', () => {
    const f = makeFs(rootOwnedTree());
    const r = ownership.ensureOwnership('/p', { uid: null, gid: null }, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('not-applicable');
    expect(r.errors).toEqual([]);
  });

  it('EPERM sur la racine : not-applicable et parcours abandonne', () => {
    const f = makeFs(rootOwnedTree(), { fail: { '/p': 'EPERM' } });
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('not-applicable');
    expect(r.reason).toBe('montage-sans-proprietaire-posix');
    expect(f.calls.readdir).toEqual([]);
    expect(r.errors[0].code).toBe('EPERM');
  });

  it('ENOTSUP sur la racine (montage exFAT) : not-applicable', () => {
    const f = makeFs(rootOwnedTree(), { fail: { '/p': 'ENOTSUP' } });
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('not-applicable');
    expect(f.calls.chown).toEqual([]);
  });

  it('EINVAL sur la racine (montage sans metadata) : not-applicable', () => {
    const f = makeFs(rootOwnedTree(), { fail: { '/p': 'EINVAL' } });
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('not-applicable');
  });

  it('erreur ponctuelle EIO : collectee, le parcours continue, outcome failed', () => {
    const f = makeFs(rootOwnedTree(), { fail: { '/p/a.txt': 'EIO' } });
    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('failed');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ path: '/p/a.txt', code: 'EIO' });
    // Les entrees suivantes ont bien ete traitees malgre l erreur.
    expect(r.changed).toBe(3);
    expect(f.tree['/p/sub/b.txt'].uid).toBe(1000);
  });

  it('un dossier illisible est collecte sans interrompre le reste', () => {
    const tree = rootOwnedTree();
    const f = makeFs(tree);
    const realReaddir = f.readdirSync;
    f.readdirSync = function (p) {
      if (p === '/p/sub') {
        const e = new Error('EACCES: lecture refusee');
        e.code = 'EACCES';
        throw e;
      }
      return realReaddir(p);
    };

    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('failed');
    expect(r.errors[0].code).toBe('EACCES');
    expect(f.tree['/p/a.txt'].uid).toBe(1000);
  });

  it('lien symbolique : lchown utilise, aucune descente dans la cible du lien', () => {
    const tree = {
      '/p': { dir: true, uid: 0, gid: 0, mode: 0o755, children: ['lien'] },
      '/p/lien': { link: true, dir: true, uid: 0, gid: 0, mode: 0o777, children: ['piege.txt'] },
      '/p/lien/piege.txt': { uid: 0, gid: 0, mode: 0o644 },
    };
    const f = makeFs(tree);

    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('ok');
    expect(f.calls.lchown.map((c) => c.path)).toEqual(['/p/lien']);
    expect(f.calls.readdir).toEqual(['/p']);
    expect(f.tree['/p/lien/piege.txt'].uid).toBe(0);
  });

  it('lien symbolique sans lchownSync : entree ignoree, aucun chown suivant le lien', () => {
    const tree = {
      '/p': { dir: true, uid: 0, gid: 0, mode: 0o755, children: ['lien'] },
      '/p/lien': { link: true, uid: 0, gid: 0, mode: 0o777 },
    };
    const f = makeFs(tree, { lchown: false });

    const r = ownership.ensureOwnership('/p', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('ok');
    expect(r.skipped).toBe(1);
    expect(f.calls.chown.map((c) => c.path)).toEqual(['/p']);
  });

  it('racine absente : failed avec ENOENT', () => {
    const f = makeFs({});
    const r = ownership.ensureOwnership('/absent', TARGET, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('failed');
    expect(r.errors[0].code).toBe('ENOENT');
  });

  it('cible sans gid : le groupe en place est reconduit, seul l uid change', () => {
    const f = makeFs(rootOwnedTree());
    f.tree['/p/a.txt'].gid = 42;

    const r = ownership.ensureOwnership('/p', { uid: 1000, gid: null }, { fs: f, platform: 'linux' });

    expect(r.outcome).toBe('ok');
    expect(f.tree['/p/a.txt']).toMatchObject({ uid: 1000, gid: 42 });
  });
});

describe('ownershipOf (fs simule)', () => {
  it('lit uid, gid et mode', () => {
    const f = makeFs(rootOwnedTree());
    expect(ownership.ownershipOf('/p/a.txt', { fs: f })).toEqual({ uid: 0, gid: 0, mode: 0o644 });
  });

  it('rend null quand le chemin est absent', () => {
    const f = makeFs({});
    expect(ownership.ownershipOf('/absent', { fs: f })).toBeNull();
  });
});

describe('resolveGroupGid (exec simule)', () => {
  it('linux : gid lu dans le troisieme champ de getent', () => {
    const seen = [];
    const exec = (file, args) => {
      seen.push([file].concat(args).join(' '));
      return 'docker:x:995:yan\n';
    };
    const r = ownership.resolveGroupGid('docker', { platform: 'linux', exec: exec, fs: makeFs({}) });

    expect(r).toMatchObject({ gid: 995, source: 'getent' });
    expect(seen).toEqual(['getent group docker']);
  });

  it('darwin : gid lu dans PrimaryGroupID de dscl', () => {
    const seen = [];
    const exec = (file, args) => {
      seen.push([file].concat(args).join(' '));
      return 'PrimaryGroupID: 20\n';
    };
    const r = ownership.resolveGroupGid('staff', { platform: 'darwin', exec: exec, fs: makeFs({}) });

    expect(r).toMatchObject({ gid: 20, source: 'dscl' });
    expect(seen).toEqual(['dscl . -read /Groups/staff PrimaryGroupID']);
  });

  it('recours /etc/group quand getent est indisponible, et le recours est nomme', () => {
    const exec = () => { throw new Error('getent introuvable'); };
    const f = makeFs({}, { etcGroup: 'root:x:0:\ndocker:x:995:yan\n' });

    const r = ownership.resolveGroupGid('docker', { platform: 'linux', exec: exec, fs: f });

    expect(r).toMatchObject({ gid: 995, source: '/etc/group' });
    expect(r.warnings.join(' ')).toContain('/etc/group');
  });

  it('groupe absent partout : gid null', () => {
    const exec = () => { throw new Error('getent introuvable'); };
    const f = makeFs({}, { etcGroup: 'root:x:0:\n' });

    const r = ownership.resolveGroupGid('absent', { platform: 'linux', exec: exec, fs: f });

    expect(r.gid).toBeNull();
  });
});

describe('ensureSharedGroup (fs simule)', () => {
  function linuxExec(gid) {
    return () => 'byan:x:' + gid + ':yan\n';
  }

  it('pose le setgid, le groupe, et abaisse le umask a 0o002', () => {
    const f = makeFs(rootOwnedTree());
    const umaskCalls = [];
    const umask = (m) => { umaskCalls.push(m); return 0o022; };

    const r = ownership.ensureSharedGroup('/p', 'byan', {
      fs: f, platform: 'linux', exec: linuxExec(995), umask: umask,
    });

    expect(r.outcome).toBe('ok');
    expect(r.gid).toBe(995);
    expect(r.mode & ownership.SETGID).toBe(ownership.SETGID);
    expect(f.tree['/p'].gid).toBe(995);
    expect(umaskCalls).toEqual([0o002]);
    expect(r.previousUmask).toBe(0o022);
  });

  it('conserve les permissions existantes en ajoutant le bit setgid', () => {
    const f = makeFs(rootOwnedTree());
    f.tree['/p'].mode = 0o750;

    const r = ownership.ensureSharedGroup('/p', 'byan', {
      fs: f, platform: 'linux', exec: linuxExec(995), umask: () => 0o022,
    });

    expect(r.mode).toBe(0o2750);
  });

  it('groupe introuvable : failed avec la commande de creation', () => {
    const exec = () => { throw new Error('getent introuvable'); };
    const f = makeFs(rootOwnedTree(), { etcGroup: 'root:x:0:\n' });

    const r = ownership.ensureSharedGroup('/p', 'byan', {
      fs: f, platform: 'linux', exec: exec, umask: () => 0o022,
    });

    expect(r.outcome).toBe('failed');
    expect(r.message).toContain('groupadd byan');
    expect(f.calls.chmod).toEqual([]);
  });

  it('win32 : not-applicable avec la commande icacls equivalente', () => {
    const f = makeFs(rootOwnedTree());
    const r = ownership.ensureSharedGroup('C:\\projet', 'byan', { fs: f, platform: 'win32' });

    expect(r.outcome).toBe('not-applicable');
    expect(r.warnings.join(' ')).toContain('icacls C:\\projet /grant "byan:(OI)(CI)M" /T');
    expect(f.calls.chmod).toEqual([]);
  });

  // EPERM PORTE DEUX CAUSES, ET LE RAPPORT DOIT LES SEPARER.
  //
  // Mesure du 2026-08-11 : sur un tmpfs parfaitement POSIX, un chown vers uid 0
  // depuis un compte ordinaire rendait "not-applicable / montage sans
  // proprietaire POSIX". Le message envoyait chercher un probleme de systeme de
  // fichiers la ou il fallait lire "tu n'as pas les droits". La cause se tranche
  // sur l'uid effectif, pas sur le code d'erreur seul.
  it('chmod refuse en EPERM depuis un compte ordinaire : echec nomme, umask intact', () => {
    const f = makeFs(rootOwnedTree(), { fail: { '/p': 'EPERM' } });
    const umaskCalls = [];

    const r = ownership.ensureSharedGroup('/p', 'byan', {
      fs: f, platform: 'linux', exec: linuxExec(995), euid: 1000,
      umask: (m) => { umaskCalls.push(m); return 0o022; },
    });

    expect(r.outcome).toBe('failed');
    expect(r.reason).toBe('privilege-insuffisant');
    expect(umaskCalls).toEqual([]);
  });

  it('le meme EPERM depuis root : le montage n en veut pas, donc non applicable', () => {
    const f = makeFs(rootOwnedTree(), { fail: { '/p': 'EPERM' } });
    const umaskCalls = [];

    const r = ownership.ensureSharedGroup('/p', 'byan', {
      fs: f, platform: 'linux', exec: linuxExec(995), euid: 0,
      umask: (m) => { umaskCalls.push(m); return 0o022; },
    });

    expect(r.outcome).toBe('not-applicable');
    expect(r.reason).toBe('montage-sans-proprietaire-posix');
    expect(umaskCalls).toEqual([]);
  });

  it('erreur fs hors famille POSIX : failed', () => {
    const f = makeFs(rootOwnedTree(), { fail: { '/p': 'EIO' } });

    const r = ownership.ensureSharedGroup('/p', 'byan', {
      fs: f, platform: 'linux', exec: linuxExec(995), umask: () => 0o022,
    });

    expect(r.outcome).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// B. vrai dossier temporaire (sans privilege)
// ---------------------------------------------------------------------------

const posix = process.platform !== 'win32';
const describePosix = posix ? describe : describe.skip;

describePosix('ensureOwnership / ensureSharedGroup (vrai fs, sans privilege)', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-ownership-'));
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('la pose du setgid change le mode relu ensuite', () => {
    const avant = ownership.ownershipOf(dir);
    expect(avant.mode & ownership.SETGID).toBe(0);

    const previous = process.umask();
    const r = ownership.ensureSharedGroup(dir, 'peu-importe', {
      platform: 'linux',
      exec: () => 'peu-importe:x:' + process.getgid() + ':\n',
      umask: (m) => process.umask(m),
    });
    process.umask(previous);

    expect(r.outcome).toBe('ok');
    expect(r.gid).toBe(process.getgid());
    expect(ownership.ownershipOf(dir).mode & ownership.SETGID).toBe(ownership.SETGID);
  });

  it('le setgid se propage a un sous-dossier cree ensuite', () => {
    fs.chmodSync(dir, (ownership.ownershipOf(dir).mode & 0o7777) | ownership.SETGID);
    const enfant = path.join(dir, 'cree-apres');
    fs.mkdirSync(enfant);

    expect(ownership.ownershipOf(enfant).mode & ownership.SETGID).toBe(ownership.SETGID);
  });

  it('chown vers son propre uid reussit sans privilege', () => {
    const cible = { uid: process.getuid(), gid: process.getgid() };
    // skipUnchanged desactive pour forcer l appel systeme reel plutot que le
    // court-circuit (le dossier temporaire nous appartient deja).
    const r = ownership.ensureOwnership(dir, cible, { skipUnchanged: false });

    expect(r.outcome).toBe('ok');
    expect(r.errors).toEqual([]);
    expect(r.changed).toBe(4);
    expect(ownership.ownershipOf(path.join(dir, 'sub', 'b.txt'))).toMatchObject(cible);
  });

  it('le court-circuit rend 0 changement sur une arborescence deja conforme', () => {
    const cible = { uid: process.getuid(), gid: process.getgid() };
    const r = ownership.ensureOwnership(dir, cible);

    expect(r.outcome).toBe('ok');
    expect(r.changed).toBe(0);
    expect(r.skipped).toBe(4);
  });

  it('chown vers uid 0 sans privilege : issue rendue, aucune exception levee', () => {
    let r;
    expect(() => { r = ownership.ensureOwnership(dir, { uid: 0, gid: 0 }); }).not.toThrow();

    if (process.getuid() === 0) {
      expect(r.outcome).toBe('ok');
    } else {
      expect(['not-applicable', 'failed']).toContain(r.outcome);
      expect(ownership.ownershipOf(dir).uid).toBe(process.getuid());
    }
  });

  it('la sortie de target-user.js se branche telle quelle sur ensureOwnership', () => {
    const cible = require('../lib/target-user').resolveTargetUser();
    const r = ownership.ensureOwnership(dir, cible, { skipUnchanged: false });

    expect(r.outcome).toBe('ok');
    expect(r.errors).toEqual([]);
    expect(ownership.ownershipOf(dir).uid).toBe(cible.uid);
  });

  it('dryRun sur un vrai dossier ne modifie aucun proprietaire', () => {
    const avant = ownership.ownershipOf(path.join(dir, 'a.txt'));
    const r = ownership.ensureOwnership(dir, { uid: 0, gid: 0 }, { dryRun: true });

    expect(r.outcome).toBe('ok');
    expect(r.changed).toBe(4);
    expect(ownership.ownershipOf(path.join(dir, 'a.txt'))).toEqual(avant);
  });
});
