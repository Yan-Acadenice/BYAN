'use strict';

/**
 * L'URL de l'API byan_web — une seule source, pour toute l'installation.
 *
 * D'OU VIENT CE FICHIER. Trois endroits posaient `http://localhost:3737` en
 * dur : codex-native-setup.js, platforms/claude-code.js et le demandeur
 * interactif token-prompt.js. Un projet installe sur une machine qui n'heberge
 * pas byan_web recevait donc une configuration pointant sur son propre port
 * 3737, ou rien n'ecoute. Le serveur MCP demarrait et ne joignait jamais l'API.
 *
 * LE HOST DE PRODUCTION, MESURE le 2026-08-11 :
 *   curl https://byan-api.stark.a3n.fr/api/health
 *     -> 200, application/json, {"status":"ok","version":"1.0.0"}
 *   curl https://byan.stark.a3n.fr/api/health
 *     -> 302 vers auth.acadenice.com, text/html
 * Le second est l'interface web derriere une authentification SSO, pas l'API.
 * C'est le piege deja ecrit dans .claude/rules/byan-api.md, et le meme que
 * celui rencontre cote Leantime (un POST qui revient en page HTML de connexion
 * au lieu d'un corps JSON). Prendre le host de l'interface pour celui de l'API
 * produit une panne difficile a lire, parce que la reponse ressemble a une
 * reponse.
 */

const path = require('path');

// Le host mesure repondant en JSON. Changer cette constante change le defaut
// de toute l'installation, terminal et assistant web compris.
const PROD_API_URL = 'https://byan-api.stark.a3n.fr';

// Conserve pour qui developpe byan_web en local et pose BYAN_API_URL lui-meme.
const LOCAL_API_URL = 'http://localhost:3737';

/**
 * Retire le suffixe /api et la barre oblique finale.
 *
 * Les endpoints portent deja /api : une base qui le contient produit
 * /api/api/projects. La verification de derive de install-core signale
 * d'ailleurs ce cas (verify.js, "BYAN_API_URL has an /api suffix"), preuve que
 * la faute a deja ete commise.
 */
function normalizeApiUrl(url) {
  if (typeof url !== 'string') return '';
  const propre = url.trim().replace(/\/+$/, '');
  if (!propre) return '';
  return propre.replace(/\/api$/i, '');
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\/\S+$/.test(url.trim());
}

/**
 * L'URL retenue, et d'ou elle vient. L'ordre est le contrat :
 *
 *   1. 'explicit'    — ce que l'appelant a passe (--api-url, une reponse a une
 *                      question). L'intention exprimee maintenant gagne.
 *   2. 'env'         — BYAN_API_URL dans l'environnement. Le geste d'un
 *                      administrateur ou d'une chaine d'integration continue.
 *   3. 'credentials' — la valeur memorisee dans ~/.byan/credentials.json lors
 *                      d'une installation precedente. Ne pas la relire ferait
 *                      re-saisir a chaque projet ce qui a deja ete donne.
 *   4. 'default'     — le host de production.
 *
 * `readCredentials` est injecte pour que ce module reste testable sans toucher
 * au home de la machine.
 */
function resolveApiUrl({
  explicit = null,
  env = process.env,
  homeDir = null,
  readCredentials = null,
} = {}) {
  if (isHttpUrl(explicit)) return { url: normalizeApiUrl(explicit), source: 'explicit' };
  if (env && isHttpUrl(env.BYAN_API_URL)) return { url: normalizeApiUrl(env.BYAN_API_URL), source: 'env' };

  const lire = readCredentials || defaultReadCredentials;
  try {
    const memorise = lire({ homeDir });
    if (memorise && isHttpUrl(memorise.BYAN_API_URL)) {
      return { url: normalizeApiUrl(memorise.BYAN_API_URL), source: 'credentials' };
    }
  } catch {
    // Un fichier de configuration absent ou abime ne doit pas arreter une
    // installation : on descend simplement a l'echelon suivant.
  }

  return { url: PROD_API_URL, source: 'default' };
}

// Chargement paresseux : home-credentials tire fs-extra, et api-defaults est
// requis par des modules qui n'ont pas besoin de cette chaine.
function defaultReadCredentials({ homeDir } = {}) {
  // eslint-disable-next-line global-require
  const homeCreds = require(path.join(__dirname, 'home-credentials.js'));
  return homeCreds.readCredentials(homeDir ? { homeDir } : {});
}

/** Raccourci pour les appelants qui ne veulent que la chaine. */
function apiUrl(options = {}) {
  return resolveApiUrl(options).url;
}

module.exports = {
  PROD_API_URL,
  LOCAL_API_URL,
  normalizeApiUrl,
  isHttpUrl,
  resolveApiUrl,
  apiUrl,
};
