// glicko2.ts — variante simplifiee de Glicko-2, echelle 0-1000 (au lieu de
// l'echelle canonique 1500 +/- 400). Fonctions pures : aucun effet de bord,
// aucun acces disque, aucune horloge.
//
// [CLAIM L3] Glicko-2 (Glickman, 2001, "Example of the Glicko-2 system") est
// un systeme de notation par mise a jour bayesienne approchee qui, en plus du
// rating, suit une deviation (incertitude) — repris ici pour sa mise a jour
// mu/phi, pas pour son usage sportif d'origine.
//
// Source : src/byan-v2/elo/glicko2.js. Un ecart deliberement introduit par ce
// portage : ce fichier reutilise `BASE_K` depuis domain-config.ts au lieu de
// redefinir sa propre constante `BASE_K = 32` — la source amont definissait la
// meme valeur deux fois (domain-config.js ET glicko2.js), un doublon qui
// aurait pu diverger sans qu'aucun test ne le remarque.

import { BASE_K, INITIAL_RATING, INITIAL_RD } from './domain-config';

const SCALE = 173.7178;
const TAU = 0.5; // volatilite du systeme — controle la vitesse de changement du rating

function toGlicko(rating: number, rd: number): { mu: number; phi: number } {
  return { mu: (rating - 500) / SCALE, phi: rd / SCALE };
}

function fromGlicko(mu: number, phi: number): { rating: number; rd: number } {
  return {
    rating: Math.max(0, Math.min(1000, Math.round(mu * SCALE + 500))),
    rd: Math.max(10, Math.round(phi * SCALE)),
  };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export interface GlickoUpdate {
  readonly newRating: number;
  readonly newRd: number;
  readonly delta: number;
  readonly probability: number;
}

// update() fait jouer le rating contre un "adversaire virtuel" = la base du
// domaine (rating 500, RD 100). result : 0 = BLOCKED, 0.5 = PARTIALLY_VALID,
// 1 = VALIDATED. `newRating` est TOUJOURS ramene dans [0, 1000] par
// fromGlicko(), quel que soit l'enchainement d'appels.
export function update(
  rating: number = INITIAL_RATING,
  rd: number = INITIAL_RD,
  result: number,
  kFactor: number = BASE_K,
): GlickoUpdate {
  if (result < 0 || result > 1) throw new Error('result doit valoir 0, 0.5 ou 1');

  const { mu, phi } = toGlicko(rating, rd);

  // Adversaire virtuel = base du domaine (rating 500 -> mu 0, RD 100).
  const muJ = 0;
  const phiJ = 100 / SCALE;

  const gPhi = g(phiJ);
  const expected = expectedScore(mu, muJ, phiJ);

  const v = 1 / (gPhi * gPhi * expected * (1 - expected));

  // Le K-factor met a l'echelle l'amplitude de la mise a jour — un ecart
  // deliberee de Glicko-2 pur, pour garder le systeme reactif par domaine.
  const kScale = kFactor / BASE_K;

  const phiStar = Math.sqrt(phi * phi + TAU * TAU);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * gPhi * (result - expected) * kScale;

  const current = fromGlicko(mu, phi);
  const next = fromGlicko(muNew, phiNew);

  return {
    newRating: next.rating,
    newRd: next.rd,
    delta: next.rating - current.rating,
    probability: Math.round(expected * 100),
  };
}

// decayRd — l'incertitude grandit avec l'inactivite. `daysSince` est fourni
// par l'appelant : cette fonction ne lit jamais l'horloge systeme elle-meme.
export function decayRd(rd: number, daysSince: number): number {
  if (daysSince <= 0) return rd;
  const phiNew = Math.sqrt((rd / SCALE) ** 2 + (TAU ** 2 * daysSince) / 365) * SCALE;
  return Math.min(INITIAL_RD, Math.round(phiNew));
}
