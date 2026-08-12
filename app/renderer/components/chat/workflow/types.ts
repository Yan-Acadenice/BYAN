// Les donnees des quatre ecrans du chantier.
//
// POURQUOI CE FICHIER. Les quatre vues sont de la presentation pure : elles
// recoivent tout par proprietes et ne vont jamais rien chercher. Leurs formes de
// donnees vivent donc ici, une fois, au lieu d'etre recopiees en quatre
// variantes qui divergent au premier ajout de champ.
//
// LE VOCABULAIRE RESTE CELUI DE `shared/workmanship.ts`. Aucune traduction n'est
// refaite ici : les etats, la seniorite, la confiance, les signaux et le cout
// estime viennent de la, et rien d'autre n'a le droit de les nommer.
//
// Les identifiants de code restent en anglais quand c'est le nom reel de la
// chose (regle app/CLAUDE.md section 8) ; ce sont les VALEURS affichees qui
// doivent etre du francais lisible.

import type {
  Confidence,
  SilenceReason,
  WorkState,
  WorkStepFact,
} from '../../../../shared/workmanship';

// ---------------------------------------------------------------------------
// Une etape rendue a l'ecran
// ---------------------------------------------------------------------------

// `WorkStepFact` porte ce qu'il faut aux trois signaux de contamination. Une
// etape AFFICHEE en demande trois de plus : qui l'a faite, a quel palier, et ou
// elle en est.
export interface WorkStep extends WorkStepFact {
  // Requis ici, la ou il est facultatif dans le fait brut : un constat peut se
  // rabattre sur l'identifiant, une ligne lue par un humain ne le peut pas.
  readonly label: string;
  // L'identifiant technique complet ('bmad-bmm-architect') ou la racine
  // ('architect') : `personForSlug` accepte les deux.
  readonly personId: string;
  // Le palier brut ('haiku' | 'sonnet' | 'opus' | 'fable'). Traduit en
  // seniorite par `seniorityForTier` au moment du rendu — jamais affiche tel
  // quel. Le quatrieme palier n'est pas une hypothese : verifie le 2026-07-31,
  // 5 occurrences de 'fable' dans `_byan/mcp/byan-mcp-server/lib/native-tiers.js`,
  // dont la constante gelee `UP_TIER_MODELS = ['opus', 'fable']`.
  readonly tier?: string;
  readonly state: WorkState;
  // `null` ou absent = le moteur n'a rien rapporte. Jamais un zero fabrique.
  readonly costUsd?: number | null;
  // Pourquoi le montant manque, quand il manque.
  readonly silenceReason?: SilenceReason;
}

// ---------------------------------------------------------------------------
// Ecran 2 — les points de reprise
// ---------------------------------------------------------------------------

// UN POINT DE REPRISE EST NOMME PAR SA DECISION, PAS PAR UN NUMERO D'ETAPE.
// « Aucun appel a migrer » se retient et se juge ; « etape 4 » ne dit rien de ce
// qu'on perd en y revenant. Le type impose donc `decision` et n'offre nulle part
// ou ranger un numero d'ordre.
export interface RewindPoint {
  readonly id: string;
  // La decision qui a ete prise ici, telle qu'elle serait dite a voix haute.
  readonly decision: string;
  readonly decidedById: string;
  // Sur quoi elle a ete prise : un fichier, une sortie de commande, un rapport.
  readonly basedOn: string;
  readonly kept: readonly string[];
  readonly redone: readonly string[];
  // Le cout estime de ce qu'on jette en revenant ici.
  readonly discardedCostUsd?: number | null;
  readonly discardedSilenceReason?: SilenceReason;
}

// ---------------------------------------------------------------------------
// Ecran 3 — la main levee
// ---------------------------------------------------------------------------

export interface RaisedHand {
  readonly personId: string;
  // Binaire par construction : le type n'a aucun champ ou ecrire un
  // pourcentage. Voir la section 3 de `shared/workmanship.ts`.
  readonly confidence: Confidence;
  // Le geste sur lequel la personne s'est arretee, en francais.
  readonly gesture: string;
}

export interface PermissionGrant {
  readonly id: string;
  // Le geste autorise, en francais.
  readonly label: string;
  readonly grantedToId: string;
  // Deja mis en forme par l'appelant : la vue ne connait ni fuseau ni locale de
  // date, et un format invente ici divergerait du reste de l'application.
  readonly when: string;
}

export interface PermissionGate {
  // false -> l'autorisation ne se garde pas : la porte se redemande a chaque
  // fois. La consequence d'interface est dure — le bouton « pour la suite » est
  // ABSENT du document, pas grise (regle produit 1 de la passation).
  readonly remembers: boolean;
}

// ---------------------------------------------------------------------------
// Ecran 4 — la frise
// ---------------------------------------------------------------------------

// Une tranche de temps reel. La hauteur de la colonne dit combien de personnes
// travaillaient en meme temps ; la part distincte dit combien de ce travail a
// ete jete.
export interface TimelineSlice {
  // Depuis le debut du chantier, en millisecondes.
  readonly startMs: number;
  readonly durationMs: number;
  readonly working: number;
  // Combien, parmi celles qui travaillaient, ont vu leur travail jete. Toujours
  // <= `working` ; une valeur au-dessus est une donnee fausse, pas un cas a
  // dessiner.
  readonly discarded: number;
}

// Re-exportes pour que les vues n'aient qu'un seul chemin d'import a connaitre.
// Ce sont bien les types de `shared/workmanship.ts`, pas des copies.
export type { SilenceReason, WorkState };
