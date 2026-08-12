// types.ts — vocabulaire du registre de suitability : des notes de fiabilite
// PAR MODELE, apprises depuis des observations passees, faites pour INFORMER
// un choix de modele — jamais une verite figee.
//
// Le champ `n` (nombre d'observations) doit TOUJOURS accompagner un taux : un
// taux de succes sans son `n` cache exactement le signal qui rend une petite
// mesure fragile. Une note fondee sur 3 observations et une note fondee sur
// 300 ne portent pas le meme poids, meme si leur moyenne affichee est
// identique — c'est pourquoi `rating()` rend `lower`/`upper`/`n`, jamais
// seulement `mean`.
//
// [CLAIM L3] L'intervalle de credibilite bayesien Beta-Binomial est une
// methode standard pour borner une proportion inconnue a partir
// d'observations binaires (Gelman et al., "Bayesian Data Analysis", chapitre
// 2 : inference sur un parametre binomial avec un prior Beta conjugue).
// Repris ici tel que
// deja implemente dans _byan/mcp/byan-mcp-server/lib/suitability.js (design
// D1 du depot BYAN), pas re-derive.
//
// RENOMMAGE DELIBERE : la source designe le second axe par "leafId" (une
// etape de workflow BYAN). L'app de bureau n'a pas cette notion — elle
// evalue un modele sur un TYPE DE TACHE de chat (ex : "gros diff de
// refactor", "resume court"), pas une etape de workflow nomme. `taskKind`
// remplace `leafId` pour ne pas importer un mot du contexte "workflow BYAN"
// dans un contexte qui n'en a pas besoin ; la cle produite reste la meme
// paire (modele, categorie), et le calcul est identique bit pour bit.

export interface SuitabilityEntry {
  readonly model: string;
  readonly taskKind: string;
  readonly successes: number;
  readonly failures: number;
}

// Le registre : une entree par couple (modele, type de tache), indexee par la
// cle produite par entryKey().
export type SuitabilityLedger = Readonly<Record<string, SuitabilityEntry>>;

// keep-cheap  : la borne basse de l'intervalle depasse keepThreshold — assez
//               d'observations favorables pour dire "ce modele convient ici".
// demote      : la borne haute est sous demoteThreshold — assez d'observations
//               defavorables pour dire "ce modele ne convient pas ici".
// watch       : ni l'un ni l'autre — pas assez de preuve pour trancher, l'etat
//               par defaut le plus honnete face a un echantillon fin.
export type SuitabilityVerdict = 'keep-cheap' | 'demote' | 'watch';

export interface ModelRating {
  readonly model: string;
  readonly taskKind: string;
  readonly n: number;
  readonly successes: number;
  readonly failures: number;
  readonly mean: number;
  readonly lower: number;
  readonly upper: number;
  readonly credibleLevel: number;
  readonly verdict: SuitabilityVerdict;
}

export interface SuitabilityOptions {
  readonly priorAlpha?: number;
  readonly priorBeta?: number;
  readonly credibleLevel?: number;
  readonly keepThreshold?: number;
  readonly demoteThreshold?: number;
}
