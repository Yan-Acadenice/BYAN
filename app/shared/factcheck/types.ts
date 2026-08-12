// types.ts — le vocabulaire partage du fact-check.
//
// Une regle domine tout ce fichier, ecrite noir sur blanc dans
// .claude/rules/fact-check.md : le detecteur ne verifie aucun fait, il repere
// des MOTIFS ("toujours", "plus rapide que"...) qui, par experience BYAN,
// accompagnent souvent un claim non source. Un `DetectedPattern` n'est donc
// pas un verdict sur la verite du texte, et un `CheckResult` n'est pas un
// jugement de verite non plus : c'est un classement du NIVEAU DE PREUVE que
// l'appelant a lui-meme declare. Le nom des champs porte cette nuance pour
// qu'un futur appelant ne lise pas "detecte" comme "faux", ni "CLAIM" comme
// "prouve".
//
// Source portee : src/byan-v2/fact-check/{index,level-scorer,claim-parser}.js
// du depot BYAN (methode "demonstrable, quantifiable, reproductible").

// Les 4 types d'assertion de la doctrine BYAN (.claude/rules/fact-check.md).
// REASONING et FACT ne sont pas produits par ce module (REASONING releve du
// raisonnement de l'agent appelant ; FACT n'apparait que via verify(), sur
// declaration explicite de l'utilisateur avec une preuve).
export type AssertionType = 'REASONING' | 'HYPOTHESIS' | 'CLAIM' | 'FACT';

// Niveau de preuve : 1 = le plus fort (spec officielle), 5 = opinion. Voir
// level-scorer.ts pour le score de confiance associe a chaque niveau.
export type ProofLevel = 1 | 2 | 3 | 4 | 5;

export function isProofLevel(v: unknown): v is ProofLevel {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

// Un domaine "strict" impose un plancher de preuve (level-scorer.ts,
// STRICT_DOMAIN_MIN_LEVEL). Les trois valeurs ci-dessous sont celles
// documentees dans .claude/rules/fact-check.md ; un domaine absent de cette
// liste n'a PAS de plancher — ce n'est pas un oubli, c'est l'etat "aucune regle
// stricte connue pour ce domaine".
export type StrictDomain = 'security' | 'performance' | 'compliance';

export interface CheckOptions {
  readonly level?: ProofLevel;
  readonly source?: string | { url?: string } | null;
  readonly proof?: string | { content?: string } | null;
  readonly domain?: string | null;
}

export type CheckStatus = 'BLOCKED' | 'OPINION' | 'CLAIM';

export interface CheckResult {
  readonly status: CheckStatus;
  readonly level: ProofLevel;
  readonly score: number;
  readonly assertionType: AssertionType;
  readonly message: string;
}

// Le resultat de detectPatterns() : une position textuelle qui correspond a un
// motif connu. Aucun champ n'affirme que le texte est faux — seulement qu'il
// contient un tour de phrase qui merite une question ("qu'est-ce qui source
// ca ?"), pas un verdict.
export interface DetectedPattern {
  readonly pattern: string;
  readonly matched: string;
  readonly position: number;
  readonly excerpt: string;
}

export interface VerifiedFact {
  readonly status: 'VERIFIED';
  readonly message: string;
}

export interface ChainResult {
  readonly finalScore: number;
  readonly steps: number;
  readonly warning: string | null;
}

export interface ExpirationResult {
  readonly expired: boolean;
  readonly daysLeft: number | null;
  readonly warning: string | null;
}
