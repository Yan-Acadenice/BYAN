// fact-check.ts — la decision de classement (CheckResult), et les utilitaires
// de confiance en chaine et d'expiration.
//
// PUR : aucun disque, aucune horloge lue en cachette. Chaque fonction qui a
// besoin de la date la recoit en parametre (`now` / `createdAt`) — une
// fonction qui appelle `new Date()` elle-meme n'est pas testable de maniere
// deterministe, et c'est precisement ce que src/byan-v2/fact-check/index.js
// fait par defaut dans `expiresAt` et `checkExpiration`. Ce module s'en ecarte
// deliberement sur ce point.
//
// Source : src/byan-v2/fact-check/index.js (methodes check/verify/chain/
// expiresAt/checkExpiration). La persistance (knowledge graph, fact sheet) de
// la source n'est PAS portee ici : ce lot porte le CALCUL, pas le stockage —
// voir le compte-rendu de livraison pour la raison (aucune demande de disque
// pour le fact-check dans ce lot, contrairement a la suitability).
//
// ECART DELIBERE VERSUS LA SOURCE : la branche BLOCKED de check() (source,
// index.js:76) rend `assertionType: 'OPINION'` — une valeur hors des 4 types
// canoniques (REASONING/HYPOTHESIS/CLAIM/FACT). Aucun test amont ne
// l'exerce (verifie : aucune occurrence de ce cas dans
// __tests__/fact-check/*.test.js). Un claim bloque par plancher de domaine
// est, comme un claim sous le plancher global, une hypothese non etayee au
// niveau requis : ce module rend `assertionType: 'HYPOTHESIS'` dans les deux
// cas, pour que `assertionType` reste toujours l'un des 4 types de la
// doctrine.

import { isBlockedInDomain, scoreForLevel } from './level-scorer';
import { isProofLevel } from './types';
import type { CheckOptions, CheckResult, ProofLevel, VerifiedFact, ChainResult, ExpirationResult } from './types';

const DEFAULT_MIN_LEVEL: ProofLevel = 3;

function sourceLabel(source: CheckOptions['source']): string {
  if (!source) return '';
  if (typeof source === 'string') return ` — ${source}`;
  return source.url ? ` — ${source.url}` : '';
}

function proofLabel(proof: CheckOptions['proof']): string {
  if (!proof) return '';
  if (typeof proof === 'string') return ` — preuve : ${proof}`;
  return proof.content ? ` — preuve : ${proof.content}` : '';
}

// check() classe UN claim. Elle ne dit jamais si le claim est vrai —
// seulement si le niveau de preuve fourni par l'appelant est suffisant au
// regard du domaine (s'il est strict) et du plancher configure (`minLevel`,
// 3 par defaut, doctrine BYAN).
export function check(claim: string, options: CheckOptions = {}, minLevel: ProofLevel = DEFAULT_MIN_LEVEL): CheckResult {
  if (typeof claim !== 'string' || !claim) {
    throw new Error('claim doit etre une chaine non vide');
  }
  const level = options.level ?? 5;
  if (!isProofLevel(level)) {
    throw new Error('level doit etre un entier entre 1 et 5');
  }
  const domain = options.domain ?? null;

  if (domain && isBlockedInDomain(level, domain)) {
    return {
      status: 'BLOCKED',
      level,
      score: scoreForLevel(level),
      assertionType: 'HYPOTHESIS',
      message: `Le domaine "${domain}" impose un plancher de preuve que ce claim (niveau ${level}) n'atteint pas.`,
    };
  }

  if (level > minLevel) {
    return {
      status: 'OPINION',
      level,
      score: scoreForLevel(level),
      assertionType: 'HYPOTHESIS',
      message: `Niveau ${level} sous le plancher configure (${minLevel}) — classe HYPOTHESIS.`,
    };
  }

  return {
    status: 'CLAIM',
    level,
    score: scoreForLevel(level),
    assertionType: 'CLAIM',
    message: `[CLAIM L${level}] ${claim}${sourceLabel(options.source)}${proofLabel(options.proof)}`,
  };
}

// verify() NE VERIFIE PAS la preuve fournie : elle formate la declaration de
// l'utilisateur comme un FACT USER-VERIFIED. C'est un acte de confiance
// explicite envers l'utilisateur, marque comme tel par le prefixe du message —
// jamais une verification independante menee par cette fonction.
export function verify(claim: string, proof: string | { content?: string } | null | undefined, now: Date): VerifiedFact {
  if (typeof claim !== 'string' || !claim) {
    throw new Error('claim doit etre une chaine non vide');
  }
  if (!proof) {
    throw new Error('une preuve (proof) est requise pour un FACT USER-VERIFIED');
  }
  const date = now.toISOString().slice(0, 10);
  return {
    status: 'VERIFIED',
    message: `[FACT USER-VERIFIED ${date}] ${claim}`,
  };
}

// chain() propage la confiance de facon MULTIPLICATIVE le long d'une chaine de
// raisonnement (80% x 80% x 80% = 51%, pas 80%). Une chaine de plus de 3 etapes
// merite un avertissement independamment du score final ; une chaine courte
// mais sous 60% en merite un aussi.
export function chain(scores: readonly number[]): ChainResult {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new Error('scores doit etre un tableau non vide de nombres');
  }
  for (const s of scores) {
    if (typeof s !== 'number' || s < 0 || s > 100) {
      throw new Error('chaque score doit etre un nombre entre 0 et 100');
    }
  }

  const finalScore = Math.round(scores.reduce((acc, s) => acc * (s / 100), 1) * 100);

  let warning: string | null = null;
  if (scores.length > 3) {
    warning = `Chaine de ${scores.length} etapes detectee. Confiance degradee a ${finalScore}% (${scores.join('% x ')}%). Une source directe vaut mieux qu'une longue deduction.`;
  } else if (finalScore < 60) {
    warning = `Confiance de chaine a ${finalScore}% — sous le seuil de 60%. Cette conclusion ne devrait pas etre presentee comme une recommandation ferme.`;
  }

  return { finalScore, steps: scores.length, warning };
}

// Demi-vie en jours par domaine (null = n'expire pas). Reprend
// DEFAULT_HALF_LIVES de src/byan-v2/fact-check/index.js : les CVE et failles
// bougent vite (security, 6 mois) ; les benchmarks dependent des versions
// (performance, 1 an) ; la complexite algorithmique n'a pas de date de
// peremption connue (algorithms, jamais).
export type HalfLifeDays = number | null;

export const DEFAULT_HALF_LIVES: Readonly<Record<string, HalfLifeDays>> = {
  security: 180,
  performance: 365,
  compliance: 180,
  javascript: 365,
  general: 730,
  algorithms: null,
};

// expiresAt() — un domaine absent de la table (comme un domaine explicitement
// marque `null`) rend `null` : c'est le meme choix que la source (aucune
// demi-vie connue => aucune expiration calculee), pas une omission de ce
// portage.
export function expiresAt(
  domain: string,
  createdAt: Date,
  halfLives: Readonly<Record<string, HalfLifeDays>> = DEFAULT_HALF_LIVES,
): string | null {
  const halfLife = halfLives[domain];
  if (halfLife === null || halfLife === undefined) return null;
  const expiry = new Date(Date.UTC(
    createdAt.getUTCFullYear(),
    createdAt.getUTCMonth(),
    createdAt.getUTCDate() + halfLife,
  ));
  return expiry.toISOString().slice(0, 10);
}

export interface ExpirableFact {
  readonly createdAt: Date;
  readonly domain?: string | null;
}

export function checkExpiration(
  fact: ExpirableFact,
  now: Date,
  halfLives: Readonly<Record<string, HalfLifeDays>> = DEFAULT_HALF_LIVES,
): ExpirationResult {
  const domain = fact.domain || 'general';
  const expiry = expiresAt(domain, fact.createdAt, halfLives);
  if (!expiry) return { expired: false, daysLeft: null, warning: null };

  const expiryDate = new Date(expiry);
  const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return {
      expired: true,
      daysLeft: 0,
      warning: `[EXPIRE] Ce fait (domaine : ${domain}) a depasse sa date d'expiration de ${Math.abs(daysLeft)} jours. A revalider avant utilisation.`,
    };
  }
  if (daysLeft <= 30) {
    return { expired: false, daysLeft, warning: `[EXPIRE BIENTOT] Ce fait expire dans ${daysLeft} jours. A revalider.` };
  }
  return { expired: false, daysLeft, warning: null };
}
