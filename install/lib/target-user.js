'use strict';

/**
 * TARGET USER — qui est le destinataire reel de l'installation.
 *
 * POURQUOI ce module : sous elevation de privilege (sudo, doas, pkexec, su),
 * le processus voit os.homedir() a /root et un PATH de root. L'installateur
 * cherche ~/.claude dans /root, ne trouve rien, et annonce une reussite en
 * ayant saute l'etape Claude. Le probleme mesure le 2026-08-11 : aucune
 * occurrence de SUDO_USER, SUDO_UID, DOAS_USER, PKEXEC_UID ou geteuid dans
 * install/. Ce module rend l'humain derriere l'elevation, ou nomme
 * explicitement le cas ou il n'y en a pas.
 *
 * L'echelle de resolution, chaque echelon nomme dans le champ `source` :
 *
 *   sudo       SUDO_UID numerique       -> uid/gid/nom depuis l'environnement
 *   doas       DOAS_USER                -> nom seul, uid resolu via /etc/passwd
 *   pkexec     PKEXEC_UID numerique     -> uid seul, nom resolu via /etc/passwd
 *   cwd-owner  processus root, dossier de travail a un humain (couvre su)
 *   root       processus root, dossier de travail a root — resultat legitime
 *              (conteneur, integration continue, installation dans /opt)
 *   self       processus non-root, la cible est celui qui lance
 *
 * POURQUOI une fonction pure : elle lit l'environnement, /etc/passwd et un stat
 * du dossier de travail au travers des dependances injectees. Aucune ecriture,
 * aucun spawn, aucune lecture de la machine hote en test.
 */

const nodeFs = require('fs');
const os = require('os');

const PASSWD_PATH = '/etc/passwd';

// Home conventionnel du compte root, par famille de systeme. POURQUOI a part :
// root ne suit pas la convention /home/<nom> des comptes humains.
const ROOT_HOME = { darwin: '/var/root', linux: '/root' };

/**
 * Lit un uid/gid transmis par l'environnement. Rend un nombre ou null.
 * POURQUOI un test de forme et pas Number() seul : Number('abc') rend NaN, et
 * un NaN propage dans un uid produit un chown ou une comparaison silencieusement
 * fausse. Une valeur qui n'est pas une suite de chiffres fait descendre d'un
 * echelon plutot que de produire un uid inexploitable.
 */
function numericOrNull(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Parse /etc/passwd (format nom:x:uid:gid:gecos:home:shell). POURQUOI cette
 * source : Node n'expose pas de binding getpwnam, et /etc/passwd est la source
 * portable Linux + macOS pour les comptes locaux. Une lecture impossible rend
 * une liste vide — l'appelant descend alors sur le repli conventionnel.
 */
function readPasswdEntries(fs, passwdPath) {
  let raw;
  try {
    raw = fs.readFileSync(passwdPath, 'utf8');
  } catch (_e) {
    return [];
  }
  if (typeof raw !== 'string') return [];

  const entries = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.charAt(0) === '#') continue;
    const fields = line.split(':');
    if (fields.length < 6) continue;
    const uid = numericOrNull(fields[2]);
    if (uid === null) continue;
    entries.push({
      name: fields[0],
      uid,
      gid: numericOrNull(fields[3]),
      home: nonEmptyString(fields[5]),
    });
  }
  return entries;
}

function findEntry(entries, { name, uid }) {
  for (let i = 0; i < entries.length; i++) {
    if (name !== null && name !== undefined && entries[i].name === name) return entries[i];
  }
  for (let i = 0; i < entries.length; i++) {
    if (uid !== null && uid !== undefined && entries[i].uid === uid) return entries[i];
  }
  return null;
}

function conventionalHome(name, uid, platform) {
  if (uid === 0 || name === 'root') {
    return ROOT_HOME[platform] || ROOT_HOME.linux;
  }
  if (name === null || name === undefined) return null;
  return platform === 'darwin' ? '/Users/' + name : '/home/' + name;
}

/**
 * Coeur de la resolution nom + home. Rend une forme unique, dans tous les cas :
 * { name, uid, gid, home, homeSource }.
 *
 * homeSource nomme la source retenue, pour que le rapport final puisse la citer :
 *   'passwd'     — ligne trouvee dans /etc/passwd
 *   'convention' — /home/<nom>, /Users/<nom>, ou le home de root
 *   'env'        — variable d'environnement (USERPROFILE) ou identite du
 *                  processus courant (os.userInfo)
 *   'unknown'    — aucune des trois n'a pu conclure ; home vaut null. Ce n'est
 *                  pas un repli, c'est l'absence honnete d'un resultat.
 */
function resolveHomeDetails({ name, uid, fs, platform, env, passwdPath }) {
  if (platform === 'win32') {
    const winHome = nonEmptyString(env && env.USERPROFILE);
    return {
      name: name || nonEmptyString(env && env.USERNAME),
      uid: null,
      gid: null,
      home: winHome,
      homeSource: winHome ? 'env' : 'unknown',
    };
  }

  const entries = readPasswdEntries(fs, passwdPath);
  const entry = findEntry(entries, { name, uid });

  if (entry && entry.home) {
    return {
      name: entry.name,
      uid: uid === null || uid === undefined ? entry.uid : uid,
      gid: entry.gid,
      home: entry.home,
      homeSource: 'passwd',
    };
  }

  const resolvedName = name || (entry ? entry.name : null) || (uid === 0 ? 'root' : null);
  const home = conventionalHome(resolvedName, uid === undefined ? null : uid, platform);
  return {
    name: resolvedName,
    uid: uid === null || uid === undefined ? (entry ? entry.uid : null) : uid,
    gid: entry ? entry.gid : null,
    home,
    homeSource: home ? 'convention' : 'unknown',
  };
}

/**
 * Morceau reutilisable : resoudre le home d'un compte donne par son nom ou son
 * uid. Une suite de chiffres est lue comme un uid — sur le chemin d'elevation,
 * les sources numeriques (SUDO_UID, PKEXEC_UID) sont les seules a porter un uid.
 */
function resolveHomeFor(nameOrUid, {
  fs = nodeFs,
  platform = process.platform,
  env = process.env,
  passwdPath = PASSWD_PATH,
} = {}) {
  let name = null;
  let uid = null;

  if (typeof nameOrUid === 'number') {
    uid = Number.isFinite(nameOrUid) ? nameOrUid : null;
  } else if (typeof nameOrUid === 'string') {
    const asNumber = numericOrNull(nameOrUid);
    if (asNumber === null) name = nonEmptyString(nameOrUid);
    else uid = asNumber;
  }

  return resolveHomeDetails({ name, uid, fs, platform, env, passwdPath });
}

function safeUserInfo(userInfo) {
  if (typeof userInfo !== 'function') return null;
  try {
    const info = userInfo();
    return info && typeof info === 'object' ? info : null;
  } catch (_e) {
    // POURQUOI avaler : os.userInfo throw quand le compte du processus n'a pas
    // d'entree passwd (conteneur avec un uid arbitraire). L'absence d'identite
    // se traite comme un echelon qui ne conclut pas.
    return null;
  }
}

function ownerUidOf(fs, cwd) {
  try {
    const stat = fs.statSync(cwd);
    return stat && typeof stat.uid === 'number' ? stat.uid : null;
  } catch (_e) {
    return null;
  }
}

/**
 * resolveTargetUser — rend { uid, gid, name, home, homeSource, source, elevated }.
 * Fonction pure : rien n'est ecrit, l'environnement fourni n'est pas modifie.
 */
function resolveTargetUser({
  env = process.env,
  platform = process.platform,
  fs = nodeFs,
  userInfo = os.userInfo,
  cwd = process.cwd(),
  geteuid = typeof process.geteuid === 'function' ? process.geteuid.bind(process) : null,
  passwdPath = PASSWD_PATH,
} = {}) {
  const safeEnv = env || {};

  // Windows n'a pas d'uid/gid, et une elevation UAC ne laisse aucune variable
  // d'environnement exploitable — on ne l'invente pas.
  if (platform === 'win32') {
    const details = resolveHomeDetails({
      name: nonEmptyString(safeEnv.USERNAME),
      uid: null,
      fs,
      platform,
      env: safeEnv,
      passwdPath,
    });
    return {
      uid: null,
      gid: null,
      name: details.name,
      home: details.home,
      homeSource: details.homeSource,
      source: 'self',
      elevated: false,
    };
  }

  // L'ELEVATION EST UN FAIT, PAS UNE VARIABLE D'ENVIRONNEMENT.
  //
  // Les trois echelons ci-dessous lisaient SUDO_UID, DOAS_USER ou PKEXEC_UID et
  // annoncaient elevated:true sans regarder l'uid effectif. Or ces variables
  // survivent dans l'environnement d'un shell lance depuis une session elevee
  // puis redescendue : le processus n'est plus root, mais il se declarait
  // eleve. L'appelant lancait alors une reprise de droits qui ne pouvait que
  // se faire refuser. On lit donc l'uid effectif AVANT de trancher.
  const uidEffectif = typeof geteuid === 'function' ? geteuid() : null;
  const estRoot = uidEffectif === 0;

  const sudoUid = numericOrNull(safeEnv.SUDO_UID);
  if (sudoUid !== null) {
    const name = nonEmptyString(safeEnv.SUDO_USER);
    const details = resolveHomeDetails({ name, uid: sudoUid, fs, platform, env: safeEnv, passwdPath });
    const sudoGid = numericOrNull(safeEnv.SUDO_GID);
    return {
      uid: sudoUid,
      gid: sudoGid !== null ? sudoGid : details.gid,
      name: name || details.name,
      home: details.home,
      homeSource: details.homeSource,
      source: 'sudo',
      elevated: estRoot,
    };
  }

  const doasUser = nonEmptyString(safeEnv.DOAS_USER);
  if (doasUser !== null) {
    // doas ne pose pas d'uid : le nom est la seule prise, l'uid vient de passwd.
    const details = resolveHomeDetails({ name: doasUser, uid: null, fs, platform, env: safeEnv, passwdPath });
    return {
      uid: details.uid,
      gid: details.gid,
      name: doasUser,
      home: details.home,
      homeSource: details.homeSource,
      source: 'doas',
      elevated: estRoot,
    };
  }

  const pkexecUid = numericOrNull(safeEnv.PKEXEC_UID);
  if (pkexecUid !== null) {
    const details = resolveHomeDetails({ name: null, uid: pkexecUid, fs, platform, env: safeEnv, passwdPath });
    return {
      uid: pkexecUid,
      gid: details.gid,
      name: details.name,
      home: details.home,
      homeSource: details.homeSource,
      source: 'pkexec',
      elevated: estRoot,
    };
  }

  if (estRoot) {
    const ownerUid = ownerUidOf(fs, cwd);

    // POURQUOI ce repli : su ne laisse aucune variable derriere lui. Le
    // proprietaire du dossier de travail est alors la meilleure trace de
    // l'humain a qui appartient le projet.
    if (ownerUid !== null && ownerUid !== 0) {
      const details = resolveHomeDetails({ name: null, uid: ownerUid, fs, platform, env: safeEnv, passwdPath });
      return {
        uid: ownerUid,
        gid: details.gid,
        name: details.name,
        home: details.home,
        homeSource: details.homeSource,
        source: 'cwd-owner',
        elevated: true,
      };
    }

    // Le dossier de travail appartient a root, ou son stat a echoue : la cible
    // EST root. Resultat de premiere classe, distinguable par source === 'root'.
    const rootDetails = resolveHomeDetails({ name: 'root', uid: 0, fs, platform, env: safeEnv, passwdPath });
    return {
      uid: 0,
      gid: rootDetails.gid !== null ? rootDetails.gid : 0,
      name: rootDetails.name || 'root',
      home: rootDetails.home,
      homeSource: rootDetails.homeSource,
      source: 'root',
      elevated: true,
    };
  }

  const info = safeUserInfo(userInfo);
  const selfUid = info && typeof info.uid === 'number' ? info.uid : uidEffectif;
  const selfName = (info && nonEmptyString(info.username))
    || nonEmptyString(safeEnv.USER)
    || nonEmptyString(safeEnv.LOGNAME);
  // $HOME PRIME SUR passwd QUAND ON N'EST PAS ELEVE.
  //
  // os.userInfo().homedir lit /etc/passwd. Sans elevation, l'environnement
  // appartient a l'utilisateur lui-meme : s'il a deplace son HOME (compte de
  // service, conteneur de developpement, home monte ailleurs), c'est $HOME qui
  // dit la verite et passwd qui ment. Le resolveur de binaire applique deja
  // cette regle dans safeHome ; les deux divergeaient. Sous elevation on ne
  // touche pas a ca : $HOME y appartient a root, pas a la cible.
  const selfHome = nonEmptyString(safeEnv.HOME) || (info && nonEmptyString(info.homedir));

  if (selfHome) {
    return {
      uid: selfUid,
      gid: info && typeof info.gid === 'number' ? info.gid : null,
      name: selfName,
      home: selfHome,
      homeSource: 'env',
      source: 'self',
      elevated: false,
    };
  }

  const details = resolveHomeDetails({ name: selfName, uid: selfUid, fs, platform, env: safeEnv, passwdPath });
  return {
    uid: selfUid !== null && selfUid !== undefined ? selfUid : details.uid,
    gid: info && typeof info.gid === 'number' ? info.gid : details.gid,
    name: selfName || details.name,
    home: details.home,
    homeSource: details.homeSource,
    source: 'self',
    elevated: false,
  };
}

module.exports = {
  resolveTargetUser,
  resolveHomeFor,
  PASSWD_PATH,
};
