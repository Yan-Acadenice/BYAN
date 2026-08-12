'use strict';

// Resolution d'un executable sans passer par un shell.
//
// POURQUOI ce fichier existe : l'installateur detectait un binaire avec
// execSync("command -v X", { shell: '/bin/sh' }). Trois defauts mesures le
// 2026-08-11 :
//   1. /bin/sh est absent sous Windows, la sonde ne peut pas s'executer.
//   2. Avec un PATH minimal (getconf PATH rend /bin:/usr/bin), la sonde sort en
//      1 alors que le binaire est installe : sur la machine de reference, le
//      claude actif vit dans ~/.local/bin, qui n'appartient a aucun PATH par
//      defaut. Un processus qui n'herite pas du PATH de l'utilisateur conclut a
//      tort a une absence.
//   3. Sous elevation, le PATH lu est celui de root, pas celui de l'utilisateur.
//
// POURQUOI une regle de departage : sur la meme machine, le claude actif est
// /home/yan/.local/bin/claude (lien vers .../versions/2.1.224) et quatre autres
// exemplaires 2.1.160 (plus anciens) trainent dans des node_modules hors PATH.
// Un scanner sans regle retient le 2.1.160 et l'erreur ne se voit pas.
//
// POURQUOI l'algorithme de parcours est recopie ici : il existe deja dans
// install/packages/install-core/lib/lookpath.js, mais le champ files du
// package.json racine n'expedie pas ce dossier — un require vers la-bas
// n'arriverait pas chez l'utilisateur.

const nodeFs = require('fs');
const nodePath = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

// Bit d'execution interroge par access(2). Constante nommee plutot que 1 en dur.
const X_OK = nodeFs.constants.X_OK;

// POURQUOI un module de chemin choisi par plateforme : la plateforme est
// injectee pour le test, donc nodePath (qui suit la machine hote) donnerait des
// separateurs et un delimiteur de PATH incoherents avec la plateforme simulee.
function pathFor(platform) {
  return platform === 'win32' ? nodePath.win32 : nodePath.posix;
}

// Sous Windows les noms de variables d'environnement sont insensibles a la
// casse (Path, PATH, path) ; un objet injecte, lui, est sensible a la casse.
function readEnv(env, name, platform) {
  if (!env) return undefined;
  if (typeof env[name] === 'string') return env[name];
  if (platform !== 'win32') return undefined;
  const wanted = name.toLowerCase();
  const key = Object.keys(env).find((k) => k.toLowerCase() === wanted);
  return key ? env[key] : undefined;
}

// os.homedir() leve sur un environnement sans $HOME/$USERPROFILE et sans entree
// passwd pour l'uid effectif (conteneur distroless). Le repli est une chaine
// vide : les emplacements derives du home sont alors ecartes.
function safeHome(env, platform) {
  const fromEnv = platform === 'win32'
    ? readEnv(env, 'USERPROFILE', platform) || readEnv(env, 'HOME', platform)
    : readEnv(env, 'HOME', platform);
  if (fromEnv) return fromEnv;
  try {
    return os.homedir();
  } catch (_e) {
    return '';
  }
}

function extensionsFor(env, platform) {
  if (platform !== 'win32') return [];
  const raw = readEnv(env, 'PATHEXT', platform);
  const source = typeof raw === 'string' && raw.length > 0 ? raw : DEFAULT_PATHEXT;
  return source
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean);
}

function hasKnownExtension(name, exts) {
  const lower = String(name).toLowerCase();
  return exts.some((ext) => lower.endsWith(ext.toLowerCase()));
}

// POURQUOI le nom nu n'est pas tente sous Windows : un fichier sans extension
// listee dans PATHEXT n'est pas executable par le shell Windows. On ne le
// retient donc pas, meme s'il porte le bon nom.
function candidateNames(name, ctx) {
  if (!ctx.win) return [name];
  const names = [];
  if (hasKnownExtension(name, ctx.exts)) names.push(name);
  for (const ext of ctx.exts) names.push(name + ext);
  return names;
}

function isExecutableFile(full, ctx) {
  let stat;
  try {
    stat = ctx.fs.statSync(full);
  } catch (_e) {
    // Absence ou refus de lecture : le candidat n'est pas ici, on continue.
    return false;
  }
  if (!stat || typeof stat.isFile !== 'function' || !stat.isFile()) return false;
  if (ctx.win) return hasKnownExtension(full, ctx.exts);

  // ON DEMANDE AU NOYAU, ON NE DEDUIT PAS DU MODE.
  //
  // Le masque `mode & 0o111` accepte n'importe quel bit d'execution, y compris
  // celui d'un groupe auquel on n'appartient pas. Mesure du 2026-08-12 : un
  // fichier en 0o010 (executable par son groupe seul) passait le masque pour un
  // utilisateur hors de ce groupe, et le resolveur annoncait un binaire qui
  // aurait refuse de se lancer. access(X_OK) pose la question a laquelle on veut
  // vraiment une reponse : est-ce que MOI je peux l'executer.
  if (typeof ctx.fs.accessSync === 'function') {
    try {
      ctx.fs.accessSync(full, X_OK);
      return true;
    } catch (_e) {
      return false;
    }
  }
  // Un faux systeme de fichiers de test peut ne pas exposer accessSync : on
  // retombe alors sur le masque, moins precis mais suffisant pour un decor.
  return (Number(stat.mode) & 0o111) !== 0;
}

function findInDir(dir, name, ctx) {
  for (const candidate of candidateNames(name, ctx)) {
    const full = ctx.path.join(dir, candidate);
    if (isExecutableFile(full, ctx)) return full;
  }
  return null;
}

function splitPath(env, platform) {
  const raw = readEnv(env, 'PATH', platform);
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw.split(pathFor(platform).delimiter).filter(Boolean);
}

// Le prefixe npm est retenu pour la duree du processus, par couple (home,
// systeme). Mesure du 2026-08-12 : sans cette memoire, chaque sonde relancait
// `npm config get prefix` — un sous-processus de plus de 200 ms, et
// l'installateur en lance une par binaire cherche. Le cout est desormais paye
// une seule fois.
const prefixeNpmRetenu = new Map();

// "npm bin -g" a ete retire de npm 11.16.0 (la sous-commande repond "Unknown
// command"), d'ou la lecture du prefixe. L'appel reste facultatif : un echec
// rend null et le scan continue sans ce dossier.
//
// LE PREFIXE EST CELUI DE LA CIBLE, PAS DU PROCESSUS. npm lit .npmrc dans le
// home indique par HOME (USERPROFILE sous Windows). Sous elevation, l'env du
// processus porte /root : sans surcharge, l'installateur cherchait le dossier
// bin de root au lieu de celui de l'utilisateur qui recoit l'installation.
function defaultNpmPrefix({ env, platform = process.platform, home = null }) {
  const cle = String(home || '') + '|' + platform;
  if (prefixeNpmRetenu.has(cle)) return prefixeNpmRetenu.get(cle);

  const envCible = home
    ? Object.assign({}, env, platform === 'win32' ? { USERPROFILE: home } : { HOME: home })
    : env;
  let resultat = null;
  try {
    const out = execSync('npm config get prefix', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      // 1500 ms suffisent a lire une configuration locale ; au-dela, npm est
      // indisponible et le parcours continue sans ce dossier.
      timeout: 1500,
      env: envCible,
      cwd: home && nodeFs.existsSync(home) ? home : undefined,
    });
    const trimmed = String(out || '').trim();
    if (trimmed && trimmed !== 'undefined' && trimmed !== 'null') resultat = trimmed;
  } catch (_e) {
    resultat = null;
  }
  prefixeNpmRetenu.set(cle, resultat);
  return resultat;
}

/** Vide la memoire du prefixe npm. Les tests en ont besoin, le code non. */
function _resetNpmPrefixCache() {
  prefixeNpmRetenu.clear();
}

function resolveNpmPrefix(npmPrefix, env, platform, home) {
  if (!npmPrefix) return null;
  try {
    const value = typeof npmPrefix === 'function'
      ? npmPrefix({ env, platform, home })
      : npmPrefix;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (_e) {
    return null;
  }
}

/**
 * knownBinDirs -> liste ordonnee des emplacements ou un installateur depose un
 * binaire qui n'appartient a aucun PATH par defaut. Le home est injecte.
 */
function knownBinDirs({
  env = process.env,
  platform = process.platform,
  home = safeHome(env, platform),
  npmPrefix = defaultNpmPrefix,
} = {}) {
  const p = pathFor(platform);
  const dirs = [];

  if (platform === 'win32') {
    const appData = readEnv(env, 'APPDATA', platform);
    const localAppData = readEnv(env, 'LOCALAPPDATA', platform);
    const programFiles = readEnv(env, 'ProgramFiles', platform);
    // Les emplacements derives du HOME comptent aussi sous Windows : WSL, Git
    // Bash, MSYS2, rustup et bun y deposent leurs binaires dans la meme
    // arborescence que sous POSIX. La branche n'en explorait aucun.
    if (home) {
      dirs.push(p.join(home, '.local', 'bin'));
      dirs.push(p.join(home, '.claude', 'local'));
      dirs.push(p.join(home, '.cargo', 'bin'));
      dirs.push(p.join(home, '.bun', 'bin'));
    }
    if (appData) dirs.push(p.join(appData, 'npm')); // le stub claude.cmd pose par npm
    if (localAppData) dirs.push(p.join(localAppData, 'Programs'));
    if (programFiles) dirs.push(programFiles);
  } else {
    if (home) {
      dirs.push(p.join(home, '.local', 'bin'));
      dirs.push(p.join(home, '.local', 'share', 'claude', 'versions'));
      dirs.push(p.join(home, '.claude', 'local'));
      dirs.push(p.join(home, '.cargo', 'bin'));
      dirs.push(p.join(home, 'bin'));
      dirs.push(p.join(home, '.npm-global', 'bin'));
    }
    dirs.push('/usr/local/bin');
    dirs.push('/usr/bin');
    dirs.push('/opt/homebrew/bin');
    if (home) dirs.push(p.join(home, '.bun', 'bin'));
  }

  const prefix = resolveNpmPrefix(npmPrefix, env, platform, home);
  if (prefix) dirs.push(platform === 'win32' ? prefix : p.join(prefix, 'bin'));

  return dirs;
}

// Un chemin qui traverse un node_modules perd le departage : c'est le cas
// mesure du 2026-08-11 (exemplaires 2.1.160 sous node_modules contre le 2.1.224
// actif dans ~/.local/bin).
function isInsideNodeModules(value) {
  return /(^|[\\/])node_modules([\\/]|$)/.test(String(value));
}

function normalizeKey(value, platform) {
  return platform === 'win32' ? String(value).toLowerCase() : String(value);
}

// Le lien est le bon point d'entree (il suit les mises a jour de version) ; la
// cible ne sert qu'au diagnostic, elle ne remplace pas le gagnant.
function realPathOf(target, ctx) {
  try {
    if (typeof ctx.fs.lstatSync !== 'function') return null;
    const stat = ctx.fs.lstatSync(target);
    if (!stat || typeof stat.isSymbolicLink !== 'function' || !stat.isSymbolicLink()) return null;
    if (typeof ctx.fs.realpathSync !== 'function') return null;
    const real = ctx.fs.realpathSync(target);
    if (typeof real !== 'string' || real.length === 0 || real === target) return null;
    return real;
  } catch (_e) {
    return null;
  }
}

/**
 * resolveBinary(name, options) -> { path, realPath, source, candidates, searched }
 *
 * - path       : le chemin retenu, ou null.
 * - realPath   : la cible quand le gagnant est un lien symbolique, sinon null.
 * - source     : 'path' | 'known-dir' | 'extra' | null — d'ou vient le gagnant.
 * - candidates : tous les exemplaires trouves, dans l'ordre de preference,
 *                chacun { path, source, dir }.
 * - searched   : tous les dossiers explores, dans l'ordre. Rempli meme quand
 *                path est null, pour que le rapport final dise ou il a cherche.
 *
 * Regle de departage :
 *   1. le PATH prime, premier trouve dans l'ordre du PATH ;
 *   2. sinon les emplacements connus, dans l'ordre de la liste ;
 *   3. sinon les dossiers supplementaires fournis par l'appelant ;
 *   4. un chemin sous node_modules passe derriere tout chemin hors node_modules,
 *      quel que soit son groupe.
 */
function resolveBinary(name, {
  env = process.env,
  platform = process.platform,
  fs = nodeFs,
  home = safeHome(env, platform),
  extraDirs = [],
  npmPrefix = defaultNpmPrefix,
} = {}) {
  const empty = { path: null, realPath: null, source: null, candidates: [], searched: [] };
  if (typeof name !== 'string' || name.length === 0) return empty;

  const ctx = {
    fs,
    win: platform === 'win32',
    exts: extensionsFor(env, platform),
    path: pathFor(platform),
  };

  // LE PARCOURS RESTE COMPLET, ET C'EST DELIBERE.
  //
  // Un arret des que le PATH repond irait plus vite, mais viderait `candidates`
  // et `searched` — or le rapport d'installation s'en sert pour dire OU il a
  // cherche. Le cout qui justifiait l'arret etait le sous-processus
  // `npm config get prefix` ; il est desormais paye une seule fois par
  // processus (voir prefixeNpmRetenu). Ce qui reste est une poignee de stat par
  // dossier. Rasoir d'Ockham : on garde l'inventaire, on supprime la cause.
  const groups = [
    { source: 'path', dirs: splitPath(env, platform) },
    { source: 'known-dir', dirs: knownBinDirs({ env, platform, home, npmPrefix }) },
    { source: 'extra', dirs: Array.isArray(extraDirs) ? extraDirs.filter(Boolean) : [] },
  ];

  const searched = [];
  const seenDirs = new Set();
  const seenPaths = new Set();
  const found = [];

  for (const group of groups) {
    for (const dir of group.dirs) {
      const dirKey = normalizeKey(dir, platform);
      if (seenDirs.has(dirKey)) continue;
      seenDirs.add(dirKey);
      searched.push(dir);

      const hit = findInDir(dir, name, ctx);
      if (!hit) continue;
      const hitKey = normalizeKey(hit, platform);
      if (seenPaths.has(hitKey)) continue;
      seenPaths.add(hitKey);
      found.push({ path: hit, source: group.source, dir });
    }
  }

  const candidates = found
    .filter((c) => !isInsideNodeModules(c.path))
    .concat(found.filter((c) => isInsideNodeModules(c.path)));

  if (candidates.length === 0) {
    return { path: null, realPath: null, source: null, candidates, searched };
  }

  const winner = candidates[0];
  return {
    path: winner.path,
    realPath: realPathOf(winner.path, ctx),
    source: winner.source,
    candidates,
    searched,
  };
}

/**
 * commandExists(name, options) -> booleen. Remplacement direct des sondes
 * execSync("command -v X") existantes, sans reecrire leurs appelants.
 */
function commandExists(name, options = {}) {
  return resolveBinary(name, options).path !== null;
}

/**
 * commandOnPath(name) -> booleen STRICT : le binaire est-il joignable par son
 * nom nu, c'est-a-dire present dans le PATH ?
 *
 * POURQUOI cette seconde sonde : commandExists accepte un binaire trouve dans
 * un emplacement connu hors PATH, ce qui est le bon comportement pour DETECTER
 * (claude vit dans ~/.local/bin). Mais un appelant qui va ensuite LANCER la
 * commande par son nom nu a besoin de savoir qu'elle sera resolue par le shell.
 * Repondre oui sur un binaire hors PATH lui promet un lancement qui echouera.
 */
function commandOnPath(name, options = {}) {
  return resolveBinary(name, options).source === 'path';
}

module.exports = {
  resolveBinary,
  _resetNpmPrefixCache,
  commandExists,
  commandOnPath,
  knownBinDirs,
  safeHome,
  DEFAULT_PATHEXT,
};
