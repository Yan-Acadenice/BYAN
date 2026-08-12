// ledger.ts — le registre de suitability et son verdict : d'apres les
// observations vues jusqu'ici, un modele donne convient-il a ce type de
// tache ?
//
// Reponse deliberement CONSERVATRICE : elle ne penche vers "keep-cheap" que
// quand la preuve est a la fois bonne ET abondante, et vers "demote" que
// quand elle est clairement mauvaise. Tout le reste reste "watch" — pas assez
// de preuve pour bouger, donc l'etat par defaut (aucun changement de modele)
// tient.
//
// PUR et DETERMINISTE. Aucune horloge, aucun hasard, aucun disque : le
// registre est un objet que l'appelant possede, chaque mise a jour rend un
// NOUVEAU registre. La persistance vit derriere main/suitability-store.ts —
// voir ce fichier pour la question "ou vit cet etat" et sa reponse.
//
// Port fidele de _byan/mcp/byan-mcp-server/lib/suitability.js (design D1).

import { betaQuantile } from './beta-stats';
import type { ModelRating, SuitabilityEntry, SuitabilityLedger, SuitabilityOptions, SuitabilityVerdict } from './types';

// Prior Beta(1,1) = uniforme/neutre : le conservatisme vient de l'INTERVALLE
// de credibilite (un echantillon fin rend un intervalle large, donc un
// plancher bas), pas d'un prior charge. keepThreshold > demoteThreshold laisse
// volontairement une bande "watch" entre les deux, ou tombe un intervalle a
// cheval.
export const DEFAULTS: Required<SuitabilityOptions> = Object.freeze({
  priorAlpha: 1,
  priorBeta: 1,
  credibleLevel: 0.95,
  keepThreshold: 0.85,
  demoteThreshold: 0.7,
});

// Cle d'un couple (modele, type de tache). '::' est le separateur reserve —
// modele et taskKind sont aussi stockes sur l'entree, donc un rapport n'a
// jamais besoin de parser la cle pour retrouver ses composants.
export function entryKey(model: string, taskKind: string): string {
  return `${model}::${taskKind}`;
}

function emptyEntry(model: string, taskKind: string): SuitabilityEntry {
  return { model, taskKind, successes: 0, failures: 0 };
}

export interface RecordOutcomeInput {
  readonly model: string;
  readonly taskKind: string;
  readonly success: boolean;
}

// recordOutcome(ledger, { model, taskKind, success }) -> un NOUVEAU registre.
//
// success === true  : le modele a ete juge adequat sur ce type de tache
//                      cette fois-ci.
// success === false : il ne l'a pas ete (une verification adverse l'a
//                      infirme).
// Stocke des COMPTES BRUTS (independants du prior) : le prior reste un choix
// de LECTURE, pas un choix ecrit dans le registre. Leve sur une entree
// malformee — une erreur de programmation, a signaler bruyamment, pas a
// avaler en silence (l'absence d'exception ici serait le genre de defaut
// qu'aucun test ne rattraperait).
export function recordOutcome(ledger: SuitabilityLedger, input: RecordOutcomeInput): SuitabilityLedger {
  const { model, taskKind, success } = input ?? ({} as RecordOutcomeInput);
  if (!model || !taskKind) throw new Error('recordOutcome requiert model et taskKind');
  if (typeof success !== 'boolean') throw new Error('recordOutcome requiert success: boolean');
  const key = entryKey(model, taskKind);
  const cur = ledger[key] || emptyEntry(model, taskKind);
  const next: SuitabilityEntry = {
    model,
    taskKind,
    successes: cur.successes + (success ? 1 : 0),
    failures: cur.failures + (success ? 0 : 1),
  };
  return { ...ledger, [key]: next };
}

// posterior(entry, opts) -> { alpha, beta }. Applique le prior aux comptes
// bruts.
export function posterior(entry: SuitabilityEntry | undefined, opts?: SuitabilityOptions): { alpha: number; beta: number } {
  const o = { ...DEFAULTS, ...opts };
  return {
    alpha: o.priorAlpha + (entry ? entry.successes : 0),
    beta: o.priorBeta + (entry ? entry.failures : 0),
  };
}

// verdictFromBounds(lower, upper, opts) -> le verdict. keep-cheap et demote
// sont mutuellement exclusifs (lower <= upper), donc l'ordre des deux tests ne
// compte pas ; "watch" couvre tout ce que la preuve n'a pas encore tranche.
// C'est toute la politique de securite en trois lignes.
export function verdictFromBounds(lower: number, upper: number, opts?: SuitabilityOptions): SuitabilityVerdict {
  const o = { ...DEFAULTS, ...opts };
  if (lower >= o.keepThreshold) return 'keep-cheap';
  if (upper <= o.demoteThreshold) return 'demote';
  return 'watch';
}

// rating(ledger, { model, taskKind }, opts) -> la note complete. Porte
// TOUJOURS la borne basse de credibilite et `n` ; un consommateur qui
// n'afficherait que `mean` jetterait exactement le signal qui rend un
// echantillon fin peu fiable.
export function rating(
  ledger: SuitabilityLedger,
  target: { model: string; taskKind: string },
  opts?: SuitabilityOptions,
): ModelRating {
  const o = { ...DEFAULTS, ...opts };
  const entry = ledger[entryKey(target.model, target.taskKind)] || emptyEntry(target.model, target.taskKind);
  const { alpha, beta } = posterior(entry, o);
  const n = entry.successes + entry.failures;
  const tail = (1 - o.credibleLevel) / 2;
  const lower = betaQuantile(tail, alpha, beta);
  const upper = betaQuantile(1 - tail, alpha, beta);
  const mean = alpha / (alpha + beta);
  return {
    model: target.model,
    taskKind: target.taskKind,
    n,
    successes: entry.successes,
    failures: entry.failures,
    mean,
    lower,
    upper,
    credibleLevel: o.credibleLevel,
    verdict: verdictFromBounds(lower, upper, o),
  };
}

// Le plus actionnable d'abord : demote, puis watch, puis keep-cheap ; en cas
// d'egalite, par taskKind puis par modele pour une sortie stable.
const SEVERITY: Readonly<Record<SuitabilityVerdict, number>> = { demote: 0, watch: 1, 'keep-cheap': 2 };

// report(ledger, opts) -> la note de chaque couple present, triee par
// severite.
export function report(ledger: SuitabilityLedger, opts?: SuitabilityOptions): ModelRating[] {
  return Object.values(ledger || {})
    .map((e) => rating(ledger, { model: e.model, taskKind: e.taskKind }, opts))
    .sort(
      (a, b) => SEVERITY[a.verdict] - SEVERITY[b.verdict]
        || a.taskKind.localeCompare(b.taskKind)
        || a.model.localeCompare(b.model),
    );
}

// formatRating(rating) -> une ligne humaine. REFUSE d'afficher une simple
// moyenne : la borne basse et `n` sont toujours presents, car "92%" sur 3
// observations et "92%" sur 300 ne sont pas le meme constat, et seul le
// second devrait jamais faire changer un choix de modele.
export function formatRating(r: ModelRating): string {
  const pct = (x: number): string => (x * 100).toFixed(1);
  const lvl = Math.round(r.credibleLevel * 100);
  return `${r.model} x ${r.taskKind} : borne basse a ${lvl}% = ${pct(r.lower)}% (moyenne ${pct(r.mean)}%, n=${r.n}) -> ${r.verdict}`;
}
