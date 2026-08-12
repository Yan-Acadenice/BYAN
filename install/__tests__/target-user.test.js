'use strict';

// Resolution du destinataire reel de l'installation sous elevation de privilege.
// Le contrat sous test : un echelon par mode d'elevation, un `source` qui le
// nomme, et un home resolu depuis /etc/passwd ou depuis la convention du
// systeme. Tout est simule (env, fs, userInfo, geteuid) — dans tous les cas
// testes, la machine hote n'est pas lue.

const { resolveTargetUser, resolveHomeFor } = require('../lib/target-user');

const PASSWD = [
  '# commentaire ignore',
  'root:x:0:0:root:/root:/bin/bash',
  'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
  'ligne:tronquee:2',
  'yan:x:1000:1000:Yan,,,:/home/yan:/bin/bash',
  'ada:x:1001:1002::/home/ada:/bin/sh',
  '',
].join('\n');

function fakeFs({ passwd = PASSWD, ownerUid = 1000, statThrows = false } = {}) {
  return {
    readFileSync(target) {
      if (target === '/etc/passwd' && passwd !== null) return passwd;
      const err = new Error('ENOENT: ' + target);
      err.code = 'ENOENT';
      throw err;
    },
    statSync() {
      if (statThrows) {
        const err = new Error('EACCES');
        err.code = 'EACCES';
        throw err;
      }
      return { uid: ownerUid, gid: ownerUid };
    },
  };
}

const asRoot = () => 0;
const asHuman = () => 1000;

function humanUserInfo() {
  return { uid: 1000, gid: 1000, username: 'yan', homedir: '/home/yan' };
}

function base(overrides) {
  return Object.assign({
    env: {},
    platform: 'linux',
    fs: fakeFs(),
    userInfo: humanUserInfo,
    cwd: '/home/yan/projet',
    geteuid: asHuman,
  }, overrides);
}

describe('resolveTargetUser — echelon sudo', () => {
  it('SUDO_UID + SUDO_GID + SUDO_USER : uid, gid, nom et home depuis passwd', () => {
    const r = resolveTargetUser(base({
      env: { SUDO_UID: '1000', SUDO_GID: '1000', SUDO_USER: 'yan' },
      geteuid: asRoot,
    }));

    expect(r.source).toBe('sudo');
    expect(r.uid).toBe(1000);
    expect(r.gid).toBe(1000);
    expect(r.name).toBe('yan');
    expect(r.home).toBe('/home/yan');
    expect(r.homeSource).toBe('passwd');
    expect(r.elevated).toBe(true);
  });

  it('SUDO_USER inconnu de /etc/passwd : home conventionnel, homeSource convention', () => {
    const r = resolveTargetUser(base({
      env: { SUDO_UID: '1500', SUDO_GID: '1500', SUDO_USER: 'zoe' },
      geteuid: asRoot,
    }));

    expect(r.source).toBe('sudo');
    expect(r.uid).toBe(1500);
    expect(r.name).toBe('zoe');
    expect(r.home).toBe('/home/zoe');
    expect(r.homeSource).toBe('convention');
  });

  it('SUDO_USER inconnu sous macOS : convention /Users/<nom>', () => {
    const r = resolveTargetUser(base({
      env: { SUDO_UID: '1500', SUDO_USER: 'zoe' },
      platform: 'darwin',
      geteuid: asRoot,
    }));

    expect(r.home).toBe('/Users/zoe');
    expect(r.homeSource).toBe('convention');
  });

  it('SUDO_GID absent : le gid est repris de la ligne passwd', () => {
    const r = resolveTargetUser(base({
      env: { SUDO_UID: '1001', SUDO_USER: 'ada' },
      geteuid: asRoot,
    }));

    expect(r.uid).toBe(1001);
    expect(r.gid).toBe(1002);
    expect(r.home).toBe('/home/ada');
  });
});

describe('resolveTargetUser — echelons doas et pkexec', () => {
  it('DOAS_USER : source doas, uid et home resolus depuis passwd', () => {
    const r = resolveTargetUser(base({
      env: { DOAS_USER: 'ada' },
      geteuid: asRoot,
    }));

    expect(r.source).toBe('doas');
    expect(r.uid).toBe(1001);
    expect(r.gid).toBe(1002);
    expect(r.name).toBe('ada');
    expect(r.home).toBe('/home/ada');
    expect(r.homeSource).toBe('passwd');
    expect(r.elevated).toBe(true);
  });

  it('DOAS_USER inconnu de passwd : uid null et home conventionnel', () => {
    const r = resolveTargetUser(base({
      env: { DOAS_USER: 'zoe' },
      geteuid: asRoot,
    }));

    expect(r.source).toBe('doas');
    expect(r.uid).toBeNull();
    expect(r.home).toBe('/home/zoe');
    expect(r.homeSource).toBe('convention');
  });

  it('PKEXEC_UID : source pkexec, nom retrouve depuis l uid', () => {
    const r = resolveTargetUser(base({
      env: { PKEXEC_UID: '1001' },
      geteuid: asRoot,
    }));

    expect(r.source).toBe('pkexec');
    expect(r.uid).toBe(1001);
    expect(r.name).toBe('ada');
    expect(r.home).toBe('/home/ada');
    expect(r.elevated).toBe(true);
  });

  it('SUDO_UID prime sur DOAS_USER et PKEXEC_UID quand les trois sont poses', () => {
    const r = resolveTargetUser(base({
      env: { SUDO_UID: '1000', SUDO_USER: 'yan', DOAS_USER: 'ada', PKEXEC_UID: '1001' },
      geteuid: asRoot,
    }));

    expect(r.source).toBe('sudo');
    expect(r.uid).toBe(1000);
  });
});

describe('resolveTargetUser — root sans variable exploitable', () => {
  it('dossier de travail a uid 1000 : source cwd-owner, uid 1000', () => {
    const r = resolveTargetUser(base({
      env: {},
      fs: fakeFs({ ownerUid: 1000 }),
      geteuid: asRoot,
    }));

    expect(r.source).toBe('cwd-owner');
    expect(r.uid).toBe(1000);
    expect(r.name).toBe('yan');
    expect(r.home).toBe('/home/yan');
    expect(r.homeSource).toBe('passwd');
    expect(r.elevated).toBe(true);
  });

  it('dossier de travail a root : source root, elevated true, uid 0', () => {
    const r = resolveTargetUser(base({
      env: {},
      fs: fakeFs({ ownerUid: 0 }),
      geteuid: asRoot,
    }));

    expect(r.source).toBe('root');
    expect(r.uid).toBe(0);
    expect(r.gid).toBe(0);
    expect(r.name).toBe('root');
    expect(r.home).toBe('/root');
    expect(r.elevated).toBe(true);
  });

  it('stat du dossier de travail refuse : on retombe sur root, pas sur un uid invente', () => {
    const r = resolveTargetUser(base({
      env: {},
      fs: fakeFs({ statThrows: true }),
      geteuid: asRoot,
    }));

    expect(r.source).toBe('root');
    expect(r.uid).toBe(0);
  });

  it('passwd illisible et cible root : home conventionnel /root', () => {
    const r = resolveTargetUser(base({
      env: {},
      fs: fakeFs({ passwd: null, ownerUid: 0 }),
      geteuid: asRoot,
    }));

    expect(r.source).toBe('root');
    expect(r.home).toBe('/root');
    expect(r.homeSource).toBe('convention');
  });
});

describe('resolveTargetUser — self et win32', () => {
  it('processus non-root : source self, elevated false, identite du lanceur', () => {
    const r = resolveTargetUser(base({ env: {}, geteuid: asHuman }));

    expect(r.source).toBe('self');
    expect(r.elevated).toBe(false);
    expect(r.uid).toBe(1000);
    expect(r.gid).toBe(1000);
    expect(r.name).toBe('yan');
    expect(r.home).toBe('/home/yan');
    expect(r.homeSource).toBe('env');
  });

  it('win32 : uid et gid nuls, home depuis USERPROFILE, elevation non deduite', () => {
    const r = resolveTargetUser(base({
      platform: 'win32',
      env: { USERPROFILE: 'C:\\Users\\yan', USERNAME: 'yan', SUDO_UID: '1000' },
      geteuid: null,
    }));

    expect(r.uid).toBeNull();
    expect(r.gid).toBeNull();
    expect(r.source).toBe('self');
    expect(r.elevated).toBe(false);
    expect(r.name).toBe('yan');
    expect(r.home).toBe('C:\\Users\\yan');
    expect(r.homeSource).toBe('env');
  });
});

describe('resolveTargetUser — valeurs numeriques inexploitables', () => {
  it('SUDO_UID = "abc" : l echelon est ignore, on descend a cwd-owner (aucun NaN)', () => {
    const r = resolveTargetUser(base({
      env: { SUDO_UID: 'abc', SUDO_USER: 'yan' },
      fs: fakeFs({ ownerUid: 1000 }),
      geteuid: asRoot,
    }));

    expect(r.source).toBe('cwd-owner');
    expect(r.uid).toBe(1000);
    expect(Number.isNaN(r.uid)).toBe(false);
  });

  it('PKEXEC_UID = "x" avec un processus non-root : on descend a self', () => {
    const r = resolveTargetUser(base({
      env: { PKEXEC_UID: 'x' },
      geteuid: asHuman,
    }));

    expect(r.source).toBe('self');
    expect(r.elevated).toBe(false);
  });

  it('DOAS_USER vide : chaine blanche traitee comme absente', () => {
    const r = resolveTargetUser(base({
      env: { DOAS_USER: '   ' },
      fs: fakeFs({ ownerUid: 0 }),
      geteuid: asRoot,
    }));

    expect(r.source).toBe('root');
  });
});

describe('resolveHomeFor', () => {
  it('par nom connu de passwd', () => {
    const r = resolveHomeFor('yan', { fs: fakeFs(), platform: 'linux', env: {} });
    expect(r.home).toBe('/home/yan');
    expect(r.uid).toBe(1000);
    expect(r.homeSource).toBe('passwd');
  });

  it('par uid numerique, nom retrouve', () => {
    const r = resolveHomeFor(1001, { fs: fakeFs(), platform: 'linux', env: {} });
    expect(r.name).toBe('ada');
    expect(r.home).toBe('/home/ada');
  });

  it('nom absent de passwd : repli conventionnel nomme', () => {
    const r = resolveHomeFor('zoe', { fs: fakeFs({ passwd: null }), platform: 'linux', env: {} });
    expect(r.home).toBe('/home/zoe');
    expect(r.homeSource).toBe('convention');
  });

  it('uid inconnu et sans nom : absence assumee plutot qu un home invente', () => {
    const r = resolveHomeFor(4242, { fs: fakeFs(), platform: 'linux', env: {} });
    expect(r.home).toBeNull();
    expect(r.homeSource).toBe('unknown');
  });

  it('win32 : le home vient de USERPROFILE', () => {
    const r = resolveHomeFor('yan', { fs: fakeFs(), platform: 'win32', env: { USERPROFILE: 'C:\\Users\\yan' } });
    expect(r.home).toBe('C:\\Users\\yan');
    expect(r.homeSource).toBe('env');
    expect(r.uid).toBeNull();
  });
});

describe('purete', () => {
  it('l environnement fourni est laisse intact et aucune ecriture n est tentee', () => {
    const env = { SUDO_UID: '1000', SUDO_USER: 'yan' };
    const snapshot = JSON.stringify(env);
    const fs = fakeFs();
    const writes = ['writeFileSync', 'mkdirSync', 'chownSync'];
    writes.forEach((m) => { fs[m] = jest.fn(); });

    resolveTargetUser(base({ env, fs, geteuid: asRoot }));

    expect(JSON.stringify(env)).toBe(snapshot);
    writes.forEach((m) => { expect(fs[m]).not.toHaveBeenCalled(); });
  });
});

// L'ELEVATION EST UN FAIT, PAS UNE VARIABLE D'ENVIRONNEMENT.
//
// SUDO_UID, DOAS_USER et PKEXEC_UID survivent dans l'environnement d'un shell
// lance depuis une session elevee puis redescendue. Les trois echelons
// annoncaient elevated:true sur la seule presence de la variable : l'appelant
// lancait alors une reprise de droits qui ne pouvait que se faire refuser, et
// le rapport parlait de montage sans proprietaire POSIX. L'uid effectif tranche.
describe('elevated suit l uid effectif, pas la variable', () => {
  const passwd = '/etc/passwd';
  const fauxFs = {
    readFileSync: () => 'yan:x:1000:1000::/home/yan:/bin/bash\nroot:x:0:0::/root:/bin/bash\n',
    statSync: () => ({ uid: 1000 }),
  };

  const cas = [
    ['sudo', { SUDO_UID: '1000', SUDO_USER: 'yan' }],
    ['doas', { DOAS_USER: 'yan' }],
    ['pkexec', { PKEXEC_UID: '1000' }],
  ];

  for (const [source, env] of cas) {
    it(`${source} : variable presente mais processus non-root -> elevated false`, () => {
      const t = resolveTargetUser({
        env, platform: 'linux', cwd: '/tmp', fs: fauxFs, passwdPath: passwd,
        geteuid: () => 1000,
      });
      expect(t.source).toBe(source);
      expect(t.elevated).toBe(false);
    });

    it(`${source} : variable presente et processus root -> elevated true`, () => {
      const t = resolveTargetUser({
        env, platform: 'linux', cwd: '/tmp', fs: fauxFs, passwdPath: passwd,
        geteuid: () => 0,
      });
      expect(t.source).toBe(source);
      expect(t.elevated).toBe(true);
    });
  }
});
