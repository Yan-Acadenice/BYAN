'use strict';

// ownership.js -- reparation du proprietaire des fichiers poses par l installateur.
//
// Le probleme mesure le 2026-08-11 sur un serveur reel : le dossier parent du
// projet est en yan:docker, mais _byan/ cree sous elevation ressort en root:root.
// L utilisateur ne peut plus modifier ce que l installateur a ecrit.
//
// Quatre faits mesures sur cette machine (Node v26.2.0, Linux) portent le code :
//   1. sans le bit setgid sur le dossier, un fichier cree dedans prend le groupe
//      PRIMAIRE de son createur, pas celui du dossier ;
//   2. avec le setgid pose, le fichier herite du groupe mais ressort en 644 car
//      le umask 022 retire l ecriture au groupe -> il faut umask(0o002) ;
//   3. le setgid se propage aux sous-dossiers crees DANS un dossier qui le
//      porte. La propagation ne vaut donc que pour ce qui est cree APRES la
//      pose : sur une arborescence deja ecrite, il faut le donner a chaque
//      dossier. Mesure du 2026-08-12 sur un serveur reel : avec le bit sur la
//      seule racine, 1 dossier sur 1187 le portait et un sous-dossier cree
//      ensuite ressortait au groupe primaire de son createur ;
//   4. fs.constants n expose aucune constante S_ISGID, d ou le litteral 0o2000.
//
// Toutes les dependances a effet de bord (fs, platform, exec, umask) sont
// injectees : c est ce qui rend le test possible sans privilege ni machine hote.

const path = require('path');

// Bit setgid. WHY un litteral : fs.constants n expose aucune constante
// S_ISGID / S_ISUID / S_ISVTX (verifie sur Node v26.2.0), donc rien a importer.
const SETGID = 0o2000;

// Umask a poser pour que les fichiers crees ensuite gardent l ecriture au
// groupe (fait mesure numero 2).
const GROUP_WRITABLE_UMASK = 0o002;

// Codes d erreur qui signalent une ABSENCE DE SUJET plutot qu une panne : le
// montage ne porte pas de proprietaire POSIX (exFAT, NTFS, /mnt/c en WSL sans
// metadata).
//
// EPERM N EN FAIT PLUS PARTIE. Il portait deux causes que rien ne distinguait :
// un montage qui refuse le concept de proprietaire, et un processus qui n a pas
// le privilege de donner le fichier. Mesure du 2026-08-11 : un chown vers uid 0
// depuis un compte ordinaire rendait outcome 'not-applicable' avec la raison
// 'montage-sans-proprietaire-posix' sur un tmpfs parfaitement POSIX. Le rapport
// disait "rien a faire" la ou il fallait dire "tu n as pas les droits".
const NO_POSIX_OWNER_CODES = ['ENOTSUP', 'EOPNOTSUPP', 'EINVAL', 'ENOSYS'];

/**
 * De quelle nature est cette erreur : 'not-applicable' ou 'failed' ?
 *
 * EPERM se tranche sur le contexte, parce que le noyau rend le meme code pour
 * les deux causes :
 *  - le processus n est pas root ET vise un autre uid que le sien -> le systeme
 *    lui refuse le geste. C est un ECHEC, avec une cause nommable.
 *  - le processus est root (ou vise son propre uid) et se fait quand meme
 *    refuser -> c est le montage qui n en veut pas. Absence de sujet.
 */
function classifyError(err, { euid = null, targetUid = null } = {}) {
  if (!err) return null;
  if (NO_POSIX_OWNER_CODES.indexOf(err.code) !== -1) return 'not-applicable';
  if (err.code !== 'EPERM') return 'failed';
  if (euid !== null && euid !== 0 && targetUid !== null && targetUid !== euid) return 'failed';
  return 'not-applicable';
}

function isNoPosixOwner(err) {
  return !!err && NO_POSIX_OWNER_CODES.indexOf(err.code) !== -1;
}

function defaultFs() {
  return require('fs');
}

// exec(fichier, args) -> stdout en utf8, leve si la commande echoue.
function defaultExec(file, args) {
  const { execFileSync } = require('child_process');
  return execFileSync(file, args, {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// WHY une enveloppe et pas process.umask directement : passer la methode
// detachee la coupe de son recepteur, et l injection doit rester remplacable
// par une fonction de test qui ne touche pas au processus jest.
function defaultUmask(mask) {
  return process.umask(mask);
}

// ownershipOf(chemin) -> { uid, gid, mode } ou null quand le chemin est absent.
// Sert au court-circuit du parcours et aux verifications de test.
function ownershipOf(targetPath, options) {
  const opts = options || {};
  const fs = opts.fs || defaultFs();
  try {
    const st = fs.lstatSync(targetPath);
    return { uid: st.uid, gid: st.gid, mode: st.mode & 0o7777 };
  } catch (_err) {
    return null;
  }
}

function lstatOrNull(fs, p) {
  try {
    return fs.lstatSync(p);
  } catch (_err) {
    return null;
  }
}

function notApplicable(reason, extra) {
  const out = {
    outcome: 'not-applicable',
    changed: 0,
    skipped: 0,
    errors: [],
    reason: reason,
  };
  if (extra) Object.assign(out, extra);
  return out;
}

// ensureOwnership(racine, cible, options)
//   cible = { uid, gid } (la sortie de install/lib/target-user.js)
//   -> { outcome: 'ok' | 'not-applicable' | 'failed', changed, skipped, errors }
//
// options.recursive     (defaut true)  descend dans l arborescence
// options.dryRun        (defaut false) compte sans appeler chown
// options.skipUnchanged (defaut true)  court-circuit quand le proprietaire colle deja
function ensureOwnership(rootPath, target, options) {
  const opts = options || {};
  const fs = opts.fs || defaultFs();
  const platform = opts.platform || process.platform;
  const recursive = opts.recursive !== false;
  const dryRun = opts.dryRun === true;
  const skipUnchanged = opts.skipUnchanged !== false;
  // Pose g+w (et g+x sur les dossiers) pendant le parcours. Utilise seulement
  // quand un groupe partage est demande : sans lui, elargir les droits serait
  // un effet de bord que personne n a demande.
  const groupWritable = opts.groupWritable === true;
  // L uid effectif sert a trancher EPERM. Injectable pour les tests ; null sur
  // une plateforme sans geteuid, auquel cas EPERM retombe sur 'not-applicable'.
  const euid = Object.prototype.hasOwnProperty.call(opts, 'euid')
    ? opts.euid
    : (typeof process.geteuid === 'function' ? process.geteuid() : null);

  if (platform === 'win32') {
    return notApplicable('windows-sans-proprietaire-posix');
  }
  if (!target || target.uid === null || target.uid === undefined) {
    return notApplicable('cible-inconnue');
  }

  const uid = target.uid;
  const result = { outcome: 'ok', changed: 0, skipped: 0, errors: [] };

  function gidFor(st) {
    // Cible sans gid : on garde le groupe en place et on ne corrige que l uid.
    if (target.gid === null || target.gid === undefined) return st.gid;
    return target.gid;
  }

  function record(err, p) {
    result.errors.push({ path: p, code: err.code || null, message: err.message });
  }

  // Le groupe partage n a de sens que si le groupe peut ECRIRE. Le setgid pose
  // a la racine gouverne ce qui sera cree ensuite ; l existant, lui, garde le
  // mode qu il avait — 644 sur les fichiers, 755 sur les dossiers. Un groupe
  // partage sans droit d ecriture sur l existant ne donne accces a rien.
  function ouvrirAuGroupe(p, st) {
    if (!groupWritable || typeof fs.chmodSync !== 'function') return;
    const actuel = Number(st.mode) & 0o7777;
    const estDossier = Boolean(st.isDirectory && st.isDirectory());
    // g+w partout ; sur un dossier, g+x en plus (sinon le groupe ne peut pas le
    // traverser meme en ayant le droit d'y ecrire) ET le setgid.
    //
    // LE SETGID VA SUR CHAQUE DOSSIER, PAS SEULEMENT SUR LA RACINE.
    //
    // Mesure du 2026-08-12 sur un serveur reel, avec --group docker : le gid
    // etait bien pose sur les 7831 entrees, mais un seul dossier sur 1187
    // portait le setgid — la racine. Un sous-dossier cree ensuite sous _byan/
    // ressortait en gid 1003 (le groupe primaire de son createur) et mode 755.
    // Le groupe partage tenait donc pour ce qui existait, et lachait pour tout
    // ce qui serait ecrit apres : exactement ce dont un projet a plusieurs
    // mains a besoin.
    //
    // Le bit ne se propage qu'AUX DOSSIERS CREES DANS un dossier qui le porte.
    // Sur une arborescence deja posee, les sous-dossiers existent deja : il faut
    // le leur donner un par un, pendant ce meme parcours.
    const vise = actuel | 0o020 | (estDossier ? 0o010 | SETGID : 0);
    if (vise === actuel) return;
    try {
      fs.chmodSync(p, vise);
    } catch (err) {
      record(err, p);
    }
  }

  // Applique le proprietaire a une entree. Rend l erreur rencontree (ou null),
  // pour que l appelant puisse decider d abandonner sur la sonde racine.
  function applyOne(p, st) {
    const gid = gidFor(st);
    const isLinkTot = typeof st.isSymbolicLink === 'function' && st.isSymbolicLink();
    // chmod suit le lien : on ne touche pas au mode au travers d un lien.
    if (!isLinkTot) ouvrirAuGroupe(p, st);
    if (skipUnchanged && st.uid === uid && st.gid === gid) {
      result.skipped++;
      return null;
    }
    if (dryRun) {
      result.changed++;
      return null;
    }
    const isLink = typeof st.isSymbolicLink === 'function' && st.isSymbolicLink();
    // Un lien symbolique se corrige avec lchown, sinon chown suivrait le lien et
    // sortirait de l arborescence installee.
    if (isLink && typeof fs.lchownSync !== 'function') {
      result.skipped++;
      return null;
    }
    try {
      if (isLink) fs.lchownSync(p, uid, gid);
      else fs.chownSync(p, uid, gid);
      result.changed++;
      return null;
    } catch (err) {
      record(err, p);
      return err;
    }
  }

  const rootStat = lstatOrNull(fs, rootPath);
  if (!rootStat) {
    result.outcome = 'failed';
    result.errors.push({ path: rootPath, code: 'ENOENT', message: 'chemin absent : ' + rootPath });
    return result;
  }

  // UNE RACINE SYMBOLIQUE EST REFUSEE, PAS TRAITEE A MOITIE.
  //
  // lstat d'un lien rend isDirectory() faux : le parcours ne demarrait pas, et
  // la fonction rendait 'ok' apres avoir corrige une seule entree — le lien.
  // L'arborescence reelle, celle ou les etapes d'installation ont ecrit,
  // gardait son proprietaire. Un 'ok' portant sur une entree quand on en attend
  // des milliers est le pire des deux mondes : ni corrige, ni signale.
  // L'appelant resout le chemin (fs.realpathSync) avant d'appeler.
  if (typeof rootStat.isSymbolicLink === 'function' && rootStat.isSymbolicLink()) {
    result.outcome = 'failed';
    result.reason = 'racine-symbolique';
    result.errors.push({
      path: rootPath,
      code: 'ESYMLINK',
      message: 'la racine est un lien symbolique : resoudre le chemin avant la reprise (fs.realpathSync)',
    });
    return result;
  }

  // Sonde : la racine sert de test du montage. Une erreur de la famille
  // "pas de proprietaire POSIX" ici vaut pour toute l arborescence, on arrete
  // avant de lancer des milliers d appels qui echoueront de la meme facon.
  const rootErr = applyOne(rootPath, rootStat);
  if (rootErr) {
    const nature = classifyError(rootErr, { euid: euid, targetUid: uid });
    if (nature === 'not-applicable') {
      return notApplicable('montage-sans-proprietaire-posix', {
        errors: result.errors.slice(),
      });
    }
    if (rootErr.code === 'EPERM') {
      // Privilege insuffisant, et ca se dit. Poursuivre le parcours ne ferait
      // qu accumuler la meme erreur sur chaque entree.
      result.outcome = 'failed';
      result.reason = 'privilege-insuffisant';
      return result;
    }
  }

  if (recursive && rootStat.isDirectory()) {
    const stack = [rootPath];
    while (stack.length > 0) {
      const dir = stack.pop();
      let names;
      try {
        names = fs.readdirSync(dir);
      } catch (err) {
        record(err, dir);
        continue;
      }
      for (let i = 0; i < names.length; i++) {
        const child = path.join(dir, names[i]);
        const st = lstatOrNull(fs, child);
        // Entree disparue en cours de parcours : aucun proprietaire a corriger,
        // ce n est pas une panne.
        if (!st) {
          result.skipped++;
          continue;
        }
        // Une erreur ponctuelle est collectee et le parcours continue.
        applyOne(child, st);
        const isLink = typeof st.isSymbolicLink === 'function' && st.isSymbolicLink();
        if (st.isDirectory() && !isLink) stack.push(child);
      }
    }
  }

  if (result.errors.length === 0) {
    result.outcome = 'ok';
    return result;
  }
  const natures = result.errors.map(function (e) {
    return classifyError({ code: e.code }, { euid: euid, targetUid: uid });
  });
  if (natures.every(function (n) { return n === 'not-applicable'; })) {
    result.outcome = 'not-applicable';
    result.reason = 'montage-sans-proprietaire-posix';
  } else {
    result.outcome = 'failed';
    if (result.errors.some(function (e) { return e.code === 'EPERM'; })) {
      result.reason = 'privilege-insuffisant';
    }
  }
  return result;
}

// resolveGroupGid(nom, options) -> { gid, source, warnings }
// Node n expose pas getgrnam : le nom se resout par la base du systeme.
function resolveGroupGid(groupName, options) {
  const opts = options || {};
  const fs = opts.fs || defaultFs();
  const platform = opts.platform || process.platform;
  const exec = opts.exec || defaultExec;
  const warnings = [];

  if (platform === 'darwin') {
    // Les groupes locaux macOS vivent dans OpenDirectory, pas dans /etc/group.
    try {
      const out = String(exec('dscl', ['.', '-read', '/Groups/' + groupName, 'PrimaryGroupID']));
      const m = /PrimaryGroupID:\s*(\d+)/.exec(out);
      if (m) return { gid: Number(m[1]), source: 'dscl', warnings: warnings };
      warnings.push('dscl a repondu sans PrimaryGroupID pour ' + groupName);
    } catch (err) {
      warnings.push('dscl indisponible ou en echec : ' + err.message);
    }
  } else {
    // getent interroge nsswitch.conf, donc aussi la seconde source du systeme
    // (systemd, LDAP ou SSSD selon la machine).
    try {
      const out = String(exec('getent', ['group', groupName])).trim();
      const line = out.split('\n')[0] || '';
      const fields = line.split(':');
      if (fields.length >= 3 && /^\d+$/.test(fields[2])) {
        return { gid: Number(fields[2]), source: 'getent', warnings: warnings };
      }
      warnings.push('getent a repondu sans gid exploitable pour ' + groupName);
    } catch (err) {
      warnings.push('getent indisponible ou en echec : ' + err.message);
    }
  }

  // Dernier recours. WHY seulement en recours : le nsswitch.conf de la machine
  // de reference porte "group: files [SUCCESS=merge] systemd", donc une seconde
  // source existe et /etc/group ne suffit pas a lui seul.
  try {
    const content = String(fs.readFileSync('/etc/group', 'utf8'));
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const fields = lines[i].split(':');
      if (fields[0] === groupName && fields.length >= 3 && /^\d+$/.test(fields[2])) {
        warnings.push('gid resolu par le recours /etc/group (source secondaire du systeme non consultee)');
        return { gid: Number(fields[2]), source: '/etc/group', warnings: warnings };
      }
    }
    warnings.push('groupe ' + groupName + ' absent de /etc/group');
  } catch (err) {
    warnings.push('/etc/group illisible : ' + err.message);
  }

  return { gid: null, source: null, warnings: warnings };
}

function createGroupHint(groupName, platform) {
  if (platform === 'darwin') {
    return 'dseditgroup -o create ' + groupName;
  }
  return 'groupadd ' + groupName;
}

// ensureSharedGroup(racine, nomDeGroupe, options)
//   -> { outcome, gid, mode, warnings }
// Pose le groupe partage et le bit setgid a la racine, puis abaisse le umask.
// La creation du groupe reste une action d administrateur : on ne la fait pas.
function ensureSharedGroup(rootPath, groupName, options) {
  const opts = options || {};
  const fs = opts.fs || defaultFs();
  const platform = opts.platform || process.platform;
  const exec = opts.exec || defaultExec;
  const umask = opts.umask || defaultUmask;
  const euid = Object.prototype.hasOwnProperty.call(opts, 'euid')
    ? opts.euid
    : (typeof process.geteuid === 'function' ? process.geteuid() : null);
  const warnings = [];

  if (platform === 'win32') {
    warnings.push(
      'droits de groupe a poser a la main : icacls ' + rootPath +
      ' /grant "' + groupName + ':(OI)(CI)M" /T'
    );
    return { outcome: 'not-applicable', gid: null, mode: null, warnings: warnings, reason: 'windows-sans-setgid' };
  }

  const resolved = resolveGroupGid(groupName, { fs: fs, platform: platform, exec: exec });
  for (let i = 0; i < resolved.warnings.length; i++) warnings.push(resolved.warnings[i]);

  if (resolved.gid === null) {
    const hint = createGroupHint(groupName, platform);
    warnings.push('groupe ' + groupName + ' introuvable ; le creer avec : ' + hint);
    return {
      outcome: 'failed',
      gid: null,
      mode: null,
      warnings: warnings,
      message: 'groupe ' + groupName + ' introuvable. Creer le groupe puis relancer : ' + hint,
    };
  }

  const st = lstatOrNull(fs, rootPath);

  // MEME REFUS QUE ensureOwnership, ET POUR UNE RAISON PLUS DURE ENCORE.
  //
  // chmod suit le lien (Linux n'a pas de lchmod), mais lstat rend le mode DU
  // LIEN, qui vaut 0o777. Le calcul (st.mode & 0o7777) | SETGID posait donc
  // 2777 — drwxrwsrwx — sur le vrai dossier d'installation : ouvert en ecriture
  // au monde entier. Mesure de la revue du 2026-08-12.
  if (st && typeof st.isSymbolicLink === 'function' && st.isSymbolicLink()) {
    warnings.push('racine symbolique : resoudre le chemin avant de poser le groupe (fs.realpathSync)');
    return {
      outcome: 'failed',
      gid: resolved.gid,
      mode: null,
      warnings: warnings,
      reason: 'racine-symbolique',
      message: 'la racine ' + rootPath + ' est un lien symbolique ; le mode lu serait celui du lien (0777), pas celui du dossier',
    };
  }

  if (!st) {
    return {
      outcome: 'failed',
      gid: resolved.gid,
      mode: null,
      warnings: warnings,
      message: 'chemin absent : ' + rootPath,
    };
  }

  try {
    fs.chmodSync(rootPath, (st.mode & 0o7777) | SETGID);
    // On ne change que le groupe : l uid en place est reconduit tel quel.
    fs.chownSync(rootPath, st.uid, resolved.gid);
  } catch (err) {
    // Meme partage qu'ensureOwnership : EPERM depuis un compte ordinaire est un
    // privilege manquant, pas un montage sans proprietaire.
    const outcome = classifyError(err, { euid: euid, targetUid: st.uid });
    warnings.push('pose du groupe partage refusee (' + (err.code || 'sans code') + ')');
    return {
      outcome: outcome,
      gid: resolved.gid,
      mode: null,
      warnings: warnings,
      message: err.message,
      reason: outcome === 'not-applicable'
        ? 'montage-sans-proprietaire-posix'
        : (err.code === 'EPERM' ? 'privilege-insuffisant' : undefined),
    };
  }

  // Le setgid seul rend un fichier en 644 sous umask 022 (fait mesure numero 2).
  // On rend l ancienne valeur pour que l appelant la restaure apres l install.
  let previousUmask = null;
  try {
    previousUmask = umask(GROUP_WRITABLE_UMASK);
  } catch (err) {
    warnings.push('umask non modifiable : ' + err.message);
  }

  const after = lstatOrNull(fs, rootPath);
  return {
    outcome: 'ok',
    gid: resolved.gid,
    mode: after ? after.mode & 0o7777 : null,
    warnings: warnings,
    source: resolved.source,
    previousUmask: previousUmask,
    umask: GROUP_WRITABLE_UMASK,
  };
}

module.exports = {
  ensureOwnership,
  classifyError,
  ensureSharedGroup,
  ownershipOf,
  resolveGroupGid,
  SETGID,
  GROUP_WRITABLE_UMASK,
  NO_POSIX_OWNER_CODES,
};
