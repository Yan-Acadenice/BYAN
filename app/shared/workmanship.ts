// Le vocabulaire du travail rendu — la couche que toutes les vues du chantier
// partagent.
//
// POURQUOI CE FICHIER EXISTE. Quatre surfaces differentes vont montrer le meme
// travail : la phrase au fil de l'eau, le bon de livraison, la frise technique,
// et les avatars. Si chacune traduit "haiku" ou "failed" dans son coin, l'ecran
// se met a parler quatre langues, et le mot technique finit par passer. Les
// traductions vivent donc ici, une seule fois, epinglees par des tests.
//
// LA REGLE QUI GOUVERNE TOUT LE FICHIER : zero mot technique a l'ecran. Aucune
// chaine exportee d'ici ne contient "agent", "worker", "haiku", "sonnet",
// "opus", "fable", "echec", "token" ou "workflow". Les identifiants de code, eux,
// restent en anglais quand c'est le nom reel de la chose (regle app/CLAUDE.md
// section 8) — c'est la VALEUR affichee qui doit etre du francais lisible, pas
// la cle qui la designe.
//
// PUR : aucun acces disque, aucun Electron, aucun React. Le module tourne aussi
// bien dans main que dans renderer, et ses fonctions se testent sans monter quoi
// que ce soit.
//
// TAILWIND — ce fichier EST scanne, et aucune correction n'est requise.
// Les classes utilitaires renvoyees plus bas (`text-accent-change`,
// `bg-wash-danger`, ...) sont ecrites en toutes lettres ici pour que le scanner
// de Tailwind les voie, et il les voit.
//
// Une version anterieure de cet en-tete affirmait le contraire : que le `content`
// de `app/renderer/tailwind.config.js` (`./**/*.{ts,tsx,html}`) se resolvait
// RELATIVEMENT au dossier renderer/, laissant `app/shared/` dehors. C'est faux.
// Tailwind resout un glob relatif depuis le repertoire de travail du PROCESSUS,
// pas depuis le dossier du fichier de configuration ; or `dev:renderer` et
// `build:renderer` sont deux scripts npm, donc tournent depuis `app/`. Le glob
// couvre bien `app/shared/`.
//
// MESURE, pas deduit (2026-07-31) : `bg-accent-change` n'existe dans AUCUN
// fichier de renderer/ — uniquement ici — et il est present dans la CSS de
// production `dist/renderer/assets/index-*.css` produite par `npm run build`.
// S'il n'etait pas scanne, il en serait absent.
//
// La fragilite reelle, celle qui merite d'etre connue : lancer vite DEPUIS
// `renderer/` ferait bien tomber `app/shared/` hors du scan, et ces classes
// disparaitraient silencieusement du bundle. C'est le repertoire de lancement
// qu'il faut preserver, pas le `content`.

// ---------------------------------------------------------------------------
// 1. Les paliers de modele, lus comme une echelle de seniorite
// ---------------------------------------------------------------------------

// Les quatre paliers existent bien dans le depot : `UP_TIER_MODELS` et la
// classification de `_byan/mcp/byan-mcp-server/lib/native-tiers.js` citent
// haiku, sonnet, opus et fable. Verifie le 2026-07-31 : 5 occurrences de 'fable'
// dans ce fichier, dont la constante gelee `UP_TIER_MODELS = ['opus', 'fable']`.
// Le quatrieme palier n'est donc pas une hypothese.
export const MODEL_TIERS = ['haiku', 'sonnet', 'opus', 'fable'] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];

export const SENIORITIES = ['junior', 'confirme', 'senior', 'expert'] as const;

export type Seniority = (typeof SENIORITIES)[number];

// Cle ASCII -> libelle accentue. La cle est du code, le libelle est ce que
// l'utilisateur lit.
export const SENIORITY_LABELS: Readonly<Record<Seniority, string>> = {
  junior: 'junior',
  confirme: 'confirmé',
  senior: 'senior',
  expert: 'expert',
};

// Ce qu'on affiche quand le palier n'est pas reconnu. Une phrase qui dit
// l'ignorance vaut mieux qu'un palier devine : se tromper de seniorite, c'est
// mentir sur le prix.
export const UNKNOWN_SENIORITY_LABEL = 'niveau non précisé';

const TIER_TO_SENIORITY: Readonly<Record<ModelTier, Seniority>> = {
  haiku: 'junior',
  sonnet: 'confirme',
  opus: 'senior',
  fable: 'expert',
};

const SENIORITY_TO_TIER: Readonly<Record<Seniority, ModelTier>> = {
  junior: 'haiku',
  confirme: 'sonnet',
  senior: 'opus',
  expert: 'fable',
};

export function isModelTier(value: unknown): value is ModelTier {
  return typeof value === 'string'
    && (MODEL_TIERS as readonly string[]).includes(value.trim().toLowerCase());
}

// POURQUOI UNE CORRESPONDANCE EXACTE, ET PAS UNE RECHERCHE DANS LA CHAINE.
// La tentation serait de faire correspondre 'claude-opus-5' a 'opus'. Mais
// 'opus-mini' contiendrait aussi 'opus' et ne serait pas du meme palier : la
// recherche approximative est precisement la supposition que la branche
// "inconnu" existe pour eviter. La donnee reelle vient de `opts.model` des
// etapes, qui porte litteralement 'haiku' | 'sonnet' | 'opus' | 'fable' — la
// correspondance exacte couvre donc la source, et tout le reste rend `null`.
export function seniorityForTier(tier: unknown): Seniority | null {
  if (typeof tier !== 'string') return null;
  const key = tier.trim().toLowerCase();
  return (TIER_TO_SENIORITY as Record<string, Seniority | undefined>)[key] ?? null;
}

export function tierForSeniority(seniority: Seniority): ModelTier {
  return SENIORITY_TO_TIER[seniority];
}

export function seniorityLabel(seniority: Seniority | null): string {
  return seniority ? SENIORITY_LABELS[seniority] : UNKNOWN_SENIORITY_LABEL;
}

// Le rang, de 1 (le moins cher) a 4. Sert a ordonner et a positionner, pas a
// juger : un junior bien place coute moins cher et fait le meme travail.
export function seniorityRank(seniority: Seniority): 1 | 2 | 3 | 4 {
  return (SENIORITIES.indexOf(seniority) + 1) as 1 | 2 | 3 | 4;
}

// LA DISTINCTION QUI DISPARAIT DANS L'ECHELLE. Le systeme separe deux facons
// d'executer une etape, et cette difference est topologique, pas hierarchique.
// L'interface a tranche : elle ne montre pas deux notions, elle en montre UNE —
// une echelle de seniorite. Le palier bas est tenu par l'execution sequentielle
// deleguee, les trois au-dessus par l'execution isolee. Le mot technique des
// deux cotes n'est jamais exporte d'ici : il n'a rien a faire a l'ecran.
export function isBottomRung(seniority: Seniority): boolean {
  return seniority === 'junior';
}

// ---------------------------------------------------------------------------
// 2. Les quatre etats d'un intervenant
// ---------------------------------------------------------------------------

// QUATRE, pas trois. Le systeme actuel n'en connait que trois et perd celui qui
// compte : une etape qui a bien rendu quelque chose, mais dont le rendu porte un
// signal mecanique de contamination (section 4). Sans ce quatrieme etat, ce
// rendu-la se lit comme un rendu propre.
export const WORK_STATES = ['en-cours', 'rendu', 'rendu-suspect', 'arrete-en-route'] as const;

export type WorkState = (typeof WORK_STATES)[number];

// Les quatre roles de couleur du systeme. 'action' est le teal, deja depense par
// l'ossature de l'application (boutons, navigation active, focus) : le peindre
// une fois de plus ne coute rien au budget.
export type AccentRole = 'action' | 'change' | 'danger' | 'success';

// Les classes sont ecrites EN TOUTES LETTRES, jamais composees a la volee :
// Tailwind ne genere que ce qu'il lit litteralement dans les sources.
export interface AccentClasses {
  readonly text: string;
  readonly bg: string;
  readonly border: string;
  readonly washBg: string;
  readonly washText: string;
}

export const ACCENT_CLASSES: Readonly<Record<AccentRole, AccentClasses>> = {
  action: {
    text: 'text-accent-action',
    bg: 'bg-accent-action',
    border: 'border-edge-action',
    washBg: 'bg-wash-action',
    washText: 'text-on-wash-action',
  },
  change: {
    text: 'text-accent-change',
    bg: 'bg-accent-change',
    border: 'border-edge-change',
    washBg: 'bg-wash-change',
    washText: 'text-on-wash-change',
  },
  danger: {
    text: 'text-accent-danger',
    bg: 'bg-accent-danger',
    border: 'border-edge-danger',
    washBg: 'bg-wash-danger',
    washText: 'text-on-wash-danger',
  },
  success: {
    text: 'text-accent-success',
    bg: 'bg-accent-success',
    border: 'border-edge-success',
    washBg: 'bg-wash-success',
    washText: 'text-on-wash-success',
  },
};

export interface WorkStateStyle {
  readonly state: WorkState;
  // Ce que l'utilisateur lit. Une phrase, pas une etiquette de machine.
  readonly label: string;
  readonly accent: AccentRole;
  readonly classes: AccentClasses;
  // true pour le seul etat qui dit "c'est arrive, mais regarde-le de pres".
  readonly suspect: boolean;
}

export const WORK_STATE_STYLES: Readonly<Record<WorkState, WorkStateStyle>> = {
  // Le teal porte l'etat actif : c'est sa definition dans le systeme, et il ne
  // coute rien de plus au budget d'accents.
  'en-cours': {
    state: 'en-cours',
    label: 'en cours',
    accent: 'action',
    classes: ACCENT_CLASSES.action,
    suspect: false,
  },
  // Le vert est reserve au bilan de fin. Un rendu propre EST un bilan de fin.
  rendu: {
    state: 'rendu',
    label: 'rendu',
    accent: 'success',
    classes: ACCENT_CLASSES.success,
    suspect: false,
  },
  // L'AMBRE, ET PAS UNE CINQUIEME COULEUR. Le systeme lui a donne "le changement
  // et l'attente" ; un rendu suspect est exactement une attente : quelque chose
  // est arrive, et il reste un geste a faire dessus. Ajouter une teinte ici
  // aurait creve le budget de deux accents pour une seule nuance.
  'rendu-suspect': {
    state: 'rendu-suspect',
    label: 'rendu mais suspect',
    accent: 'change',
    classes: ACCENT_CLASSES.change,
    suspect: true,
  },
  // Le rouge dit l'arret seul, jamais un simple avertissement — c'est le travail
  // de l'ambre.
  'arrete-en-route': {
    state: 'arrete-en-route',
    label: "s'est arrêté en route",
    accent: 'danger',
    classes: ACCENT_CLASSES.danger,
    suspect: false,
  },
};

export function isWorkState(value: unknown): value is WorkState {
  return typeof value === 'string' && (WORK_STATES as readonly string[]).includes(value);
}

export function workStateLabel(state: WorkState): string {
  return WORK_STATE_STYLES[state].label;
}

// LE BUDGET D'ACCENTS. La regle de marque autorise le teal PLUS UNE seule autre
// teinte par ecran. Le teal etant deja depense par l'ossature, il reste
// exactement une teinte non-teal disponible.
export const NON_TEAL_ACCENT_BUDGET = 1;

export function nonTealAccents(states: readonly WorkState[]): AccentRole[] {
  const seen = new Set<AccentRole>();
  for (const state of states) {
    const role = WORK_STATE_STYLES[state].accent;
    if (role !== 'action') seen.add(role);
  }
  return [...seen];
}

export function accentBudgetExceeded(states: readonly WorkState[]): boolean {
  return nonTealAccents(states).length > NON_TEAL_ACCENT_BUDGET;
}

// DECISION EN ATTENTE: quel etat perd sa couleur quand le budget d'un seul
// accent non-teal est depasse. Le defaut ci-dessous protege d'abord le trou dans
// la livraison (une etape arretee), puis le rendu suspect (le quatrieme etat
// n'existe que pour etre vu), et laisse le rendu propre tomber en neutre le
// premier : c'est le cas attendu, il n'apprend rien. 'en-cours' n'apparait pas
// dans cet ordre parce qu'il est teal — il ne consomme pas le budget et n'est
// donc jamais sacrifie.
const ACCENT_PROTECTION_ORDER: readonly WorkState[] = ['arrete-en-route', 'rendu-suspect', 'rendu'];

// Les etats qui gardent leur couleur. Les autres se rendent en neutre : la
// forme, la position et la phrase les portent deja.
export function statesKeepingTheirAccent(
  present: readonly WorkState[],
  budget: number = NON_TEAL_ACCENT_BUDGET,
): WorkState[] {
  const unique = new Set(present);
  const kept = new Set<WorkState>();
  // Le teal est gratuit : tout etat porte par 'action' garde sa couleur.
  for (const state of unique) {
    if (WORK_STATE_STYLES[state].accent === 'action') kept.add(state);
  }
  let spent = 0;
  for (const state of ACCENT_PROTECTION_ORDER) {
    if (!unique.has(state) || spent >= budget) continue;
    kept.add(state);
    spent += 1;
  }
  return WORK_STATES.filter((state) => kept.has(state));
}

// ---------------------------------------------------------------------------
// 3. La confiance, binaire par construction
// ---------------------------------------------------------------------------

// UN POURCENTAGE EST IMPOSSIBLE A EXPRIMER ICI, ET C'EST LE POINT. Le type n'a
// aucun champ numerique : il n'y a pas d'endroit ou ecrire "87 %". Un
// pourcentage de confiance donne une precision que rien ne mesure, et fait
// perdre la seule information utile — SUR QUOI ca hesite.
//
// La branche "pas sure" exige son objet dans le TYPE, pas dans une convention :
// une hesitation sans objet n'informe personne.
export type Confidence =
  | { readonly sure: true }
  | { readonly sure: false; readonly about: string };

// Le genre grammatical de celui ou celle qui parle. La phrase de confiance est
// a la premiere personne ("je suis sûr" / "je suis sûre") : sans cette donnee,
// l'ecran ecrit du francais faux une fois sur deux.
export type GrammaticalGender = 'f' | 'm';

const CONFIDENCE_EMPTY_OBJECT_REASON = 'une hésitation sans objet n\'informe pas';

export function confident(): Confidence {
  return { sure: true };
}

// Leve si l'objet est vide : c'est une erreur de programmation, pas une donnee
// d'entree. Pour une donnee venue de l'exterieur, passer par `readConfidence`.
export function unsureAbout(about: string): Confidence {
  const trimmed = about.trim();
  if (!trimmed) throw new Error(`unsureAbout: ${CONFIDENCE_EMPTY_OBJECT_REASON}`);
  return { sure: false, about: trimmed };
}

// Lecture totale d'une donnee non fiable. Rend `null` — donc rien a afficher —
// quand la confiance est inexploitable, notamment "pas sure" sans objet. Ne rien
// dire vaut mieux que dire "je doute" sans pouvoir dire de quoi.
export function readConfidence(value: unknown): Confidence | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { sure?: unknown; about?: unknown };
  if (record.sure === true) return { sure: true };
  if (record.sure !== false) return null;
  if (typeof record.about !== 'string') return null;
  const trimmed = record.about.trim();
  return trimmed ? { sure: false, about: trimmed } : null;
}

// Deux moities, parce que l'ecran les traite differemment : la tete est du texte
// courant, l'objet est un nom de fichier ou de decision et se compose en chasse
// fixe.
export interface ConfidencePhrase {
  readonly head: string;
  readonly about: string | null;
}

export function confidencePhrase(
  confidence: Confidence,
  gender: GrammaticalGender = 'f',
): ConfidencePhrase {
  const agreed = gender === 'f' ? 'sûre' : 'sûr';
  return confidence.sure
    ? { head: `je suis ${agreed}`, about: null }
    : { head: `je ne suis pas ${agreed}`, about: confidence.about };
}

// La version d'une seule ligne, quand la place manque pour deux registres.
export function confidenceLine(
  confidence: Confidence,
  gender: GrammaticalGender = 'f',
): string {
  const phrase = confidencePhrase(confidence, gender);
  return phrase.about ? `${phrase.head} — ${phrase.about}` : phrase.head;
}

// ---------------------------------------------------------------------------
// 4. Les trois signaux mecaniques de contamination
// ---------------------------------------------------------------------------

// AUCUN DES TROIS NE JUGE LA QUALITE. Chacun mesure une propriete de la FORME du
// travail — un compte a zero, une duree hors norme, une topologie sans second
// appui — et rend un constat. Aucun ne lit ce qui a ete produit.
export const NO_SIGNAL_CATCHES_A_PLAUSIBLE_FALSEHOOD =
  "Aucun de ces trois signaux ne repère une sortie fausse mais plausible : ils mesurent la forme du travail, jamais sa justesse.";

// La nature d'une etape. 'reperage' est la seule qui compte pour le premier
// signal : une etape qui cherche et ne trouve rien laisse la suite travailler
// dans le vide.
export const STEP_NATURES = ['reperage', 'implementation', 'verification', 'autre'] as const;

export type StepNature = (typeof STEP_NATURES)[number];

export interface WorkStepFact {
  readonly id: string;
  // Le nom lisible de l'etape, pour que le constat puisse la nommer.
  readonly label?: string;
  readonly nature: StepNature;
  // `undefined` veut dire "pas mesure", jamais "zero". Un tiret n'est pas un
  // zero : c'est une regle dure du produit et elle s'applique aussi ici, dans
  // les entrees, pas seulement a l'affichage.
  readonly durationMs?: number;
  readonly resultCount?: number;
  // Les identifiants des etapes dont celle-ci a consomme la sortie.
  readonly consumes?: readonly string[];
  // A-t-elle rapporte quelque chose par elle-meme (lu un fichier, lance une
  // commande) plutot que de seulement reprendre le travail d'une autre ?
  readonly hasOwnSource?: boolean;
}

export const SIGNAL_KINDS = ['reperage-vide', 'duree-aberrante', 'maillon-unique'] as const;

export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface ContaminationSignal {
  readonly kind: SignalKind;
  readonly stepId: string;
  // Le fait observe, en francais, sans jugement.
  readonly fact: string;
  // Ce que ce signal ne peut PAS voir. Present sur chaque constat : un signal
  // qui ne dit pas son angle mort se fait lire comme une garantie.
  readonly blindSpot: string;
}

export const SIGNAL_BLIND_SPOTS: Readonly<Record<SignalKind, string>> = {
  'reperage-vide':
    "ne voit pas un repérage qui a rapporté des résultats à côté de la plaque : un résultat non vide passe, même faux.",
  'duree-aberrante':
    "compare une étape à ses voisines de même nature : si toutes ont bâclé de la même façon, plus rien ne dépasse et le signal reste muet.",
  'maillon-unique':
    "ne dit pas que ce maillon est faux — seulement que rien, dans ce chantier, ne peut le contredire.",
};

function stepName(step: WorkStepFact): string {
  return step.label?.trim() || step.id;
}

// --- Signal 1 : un repérage qui n'a rien rapporté --------------------------

export function emptyReconnaissance(step: WorkStepFact): ContaminationSignal | null {
  if (step.nature !== 'reperage') return null;
  // Strictement zero. `undefined` (non mesure) ne declenche rien : sinon le
  // signal transformerait une absence de mesure en constat, ce qui est
  // exactement le defaut que la regle du tiret interdit.
  if (step.resultCount !== 0) return null;
  return {
    kind: 'reperage-vide',
    stepId: step.id,
    fact: `« ${stepName(step)} » cherchait et n'a rien rapporté.`,
    blindSpot: SIGNAL_BLIND_SPOTS['reperage-vide'],
  };
}

// --- Signal 2 : une durée aberrante face aux voisines de même nature -------

// POURQUOI 12, ET POURQUOI SEULEMENT VERS LE BAS.
//
// Le seuil. Deux etapes de meme nature varient couramment d'un ordre de grandeur
// entre elles — lire 50 lignes ou en lire 5 000, ce n'est pas le meme travail et
// c'est pourtant la meme nature. Un facteur 10 est donc du bruit ordinaire et ne
// peut pas servir de seuil. Le seul cas reellement observe est une etape a 4 s
// contre des voisines a 2 ou 3 min, soit un facteur d'environ 37. On pose 12 :
// juste au-dessus du bruit ordinaire, et il reste un facteur 3 de marge sous le
// defaut mesure. HONNETE SUR LA CALIBRATION : un seul cas observe ne fait pas
// une statistique — ce nombre est a revoir des qu'il y en aura d'autres.
//
// La direction. Une etape beaucoup plus LONGUE que ses voisines n'est pas un
// signal de contamination, c'est du travail lent ; la contamination ressemble a
// l'inverse — une etape qui rend quelque chose sans avoir eu le temps de le
// faire. Le signal ne regarde donc que vers le bas.
export const ABERRANT_SHORT_RATIO = 12;

// Une mediane sur un seul echantillon n'est pas une mediane, c'est
// l'echantillon. En dessous de deux voisines mesurees, le signal se tait.
export const MIN_MEASURED_NEIGHBOURS = 2;

function isMeasuredDuration(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function aberrantDuration(
  step: WorkStepFact,
  allSteps: readonly WorkStepFact[],
): ContaminationSignal | null {
  if (!isMeasuredDuration(step.durationMs)) return null;
  const neighbours = allSteps
    .filter((other) => other.id !== step.id && other.nature === step.nature)
    .map((other) => other.durationMs)
    .filter(isMeasuredDuration);
  if (neighbours.length < MIN_MEASURED_NEIGHBOURS) return null;
  const reference = median(neighbours);
  if (step.durationMs * ABERRANT_SHORT_RATIO > reference) return null;
  return {
    kind: 'duree-aberrante',
    stepId: step.id,
    fact: `« ${stepName(step)} » a duré ${formatDuration(step.durationMs)} là où celles de même nature tournent plutôt autour de ${formatDuration(reference)}.`,
    blindSpot: SIGNAL_BLIND_SPOTS['duree-aberrante'],
  };
}

// --- Signal 3 : tout l'aval repose sur un seul maillon ---------------------

// Sur quoi une etape repose reellement, une fois la chaine remontee. Une etape
// qui rapporte quelque chose par elle-meme est son propre appui ; une etape qui
// ne fait que reprendre le travail d'autres herite de leurs appuis.
function groundingRoots(steps: readonly WorkStepFact[]): Map<string, Set<string>> {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const roots = new Map<string, Set<string>>();
  // `visiting` coupe les cycles : un graphe d'etapes ne devrait pas en avoir,
  // mais une boucle ferait tourner la remontee indefiniment et un plantage vaut
  // moins qu'un resultat prudent.
  const visiting = new Set<string>();

  const resolve = (id: string): Set<string> => {
    const cached = roots.get(id);
    if (cached) return cached;
    const step = byId.get(id);
    if (!step || visiting.has(id)) return new Set();
    visiting.add(id);
    const found = new Set<string>();
    if (step.hasOwnSource) {
      found.add(id);
    } else {
      for (const upstream of step.consumes ?? []) {
        for (const root of resolve(upstream)) found.add(root);
      }
    }
    visiting.delete(id);
    roots.set(id, found);
    return found;
  };

  for (const step of steps) resolve(step.id);
  return roots;
}

// Rend l'identifiant du maillon dont tout l'aval depend, ou `null`. Il ne peut y
// en avoir qu'un par construction : des que deux appuis independants existent
// dans le chantier, la dependance n'est plus totale.
export function soleLoadBearingLink(steps: readonly WorkStepFact[]): string | null {
  const roots = groundingRoots(steps);
  const allRoots = new Set<string>();
  for (const step of steps) {
    for (const root of roots.get(step.id) ?? []) allRoots.add(root);
  }
  if (allRoots.size !== 1) return null;
  const [only] = [...allRoots];
  // Il faut au moins une etape en aval, sinon il n'y a rien a contaminer.
  const dependents = steps.filter(
    (step) => step.id !== only && (roots.get(step.id)?.has(only) ?? false),
  );
  return dependents.length > 0 ? only : null;
}

export function soleLoadBearingSignal(
  steps: readonly WorkStepFact[],
): ContaminationSignal | null {
  const id = soleLoadBearingLink(steps);
  if (!id) return null;
  const step = steps.find((candidate) => candidate.id === id);
  const name = step ? stepName(step) : id;
  return {
    kind: 'maillon-unique',
    stepId: id,
    fact: `tout ce qui suit repose sur « ${name} », et rien d'autre n'a été rapporté pour le recouper.`,
    blindSpot: SIGNAL_BLIND_SPOTS['maillon-unique'],
  };
}

// --- Les trois d'un coup ---------------------------------------------------

// Ordre stable : les constats par etape dans l'ordre des etapes, puis le constat
// qui porte sur le chantier entier. Un ordre stable rend l'affichage
// reproductible et le test lisible.
export function scanContamination(steps: readonly WorkStepFact[]): ContaminationSignal[] {
  const signals: ContaminationSignal[] = [];
  for (const step of steps) {
    const empty = emptyReconnaissance(step);
    if (empty) signals.push(empty);
    const aberrant = aberrantDuration(step, steps);
    if (aberrant) signals.push(aberrant);
  }
  const sole = soleLoadBearingSignal(steps);
  if (sole) signals.push(sole);
  return signals;
}

// ---------------------------------------------------------------------------
// 5. Les durees et le cout estime
// ---------------------------------------------------------------------------

// Le tiret d'une valeur non mesuree. Cadratin, jamais un zero.
export const DASH = '—';

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return DASH;
  if (ms < 1000) return "moins d'une seconde";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds ? `${totalMinutes} min ${seconds} s` : `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`;
}

// LE MOT "ESTIME" EST DANS LE LIBELLE, PAS DANS UNE NOTE DE BAS DE PAGE. Un
// libelle "total dépensé" promet une facture ; ce chiffre n'en est pas une.
export const COST_LABEL = 'coût estimé';

// La phrase qui doit etre a l'ecran, pas seulement dans ce commentaire.
export const COST_IS_AN_ESTIMATE =
  "Ces montants sont des estimations. L'abonnement ne bouge pas : le chiffre sert à comparer deux chantiers, pas à payer.";

export const SILENCE_REASONS = ['abonnement', 'non-rapporte', 'rien-a-mesurer'] as const;

export type SilenceReason = (typeof SILENCE_REASONS)[number];

export const SILENCE_REASON_LABELS: Readonly<Record<SilenceReason, string>> = {
  abonnement: "ce moteur ne publie aucun montant : il tourne sur abonnement",
  'non-rapporte': "ce moteur ne l'a pas rapporté",
  'rien-a-mesurer': 'aucun tour terminé pour le moment',
};

export interface CostReading {
  readonly label: string;
  readonly value: string;
  // Non nul UNIQUEMENT quand `value` est le tiret. Un tiret sans raison est la
  // moitie d'une information.
  readonly reason: string | null;
  readonly measured: boolean;
}

// La devise est celle que le moteur rapporte : `total_cost_usd`, donc des
// dollars. On ne convertit pas en euros — aucun taux n'est mesure dans cette
// application, et un taux invente serait un fait fabrique dans un chiffre qui se
// presente deja comme une estimation. Le formatage, lui, est francais.
const COST_FORMAT = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' });

// En dessous d'un centime, l'arrondi ecrirait "0,00" — la forme meme qu'on
// s'interdit. Le seuil rend visible que la mesure existe et qu'elle est petite.
const SMALLEST_SHOWN = 0.01;

export function formatEstimatedCost(
  amountUsd: number | null | undefined,
  reason: SilenceReason = 'non-rapporte',
): CostReading {
  const silent: CostReading = {
    label: COST_LABEL,
    value: DASH,
    reason: SILENCE_REASON_LABELS[reason],
    measured: false,
  };
  // Absent, nul, non fini ou negatif : le moteur n'a rien rapporte
  // d'exploitable. Un zero FABRIQUE a partir d'une absence serait lu comme une
  // mesure — c'est precisement l'erreur interdite.
  if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd) || amountUsd < 0) return silent;
  // Un zero MESURE, lui, reste un zero : un tour entierement servi par le cache
  // peut coûter zero, et c'est une vraie information.
  const value = amountUsd > 0 && amountUsd < SMALLEST_SHOWN
    ? `< ${COST_FORMAT.format(SMALLEST_SHOWN)}`
    : COST_FORMAT.format(amountUsd);
  return { label: COST_LABEL, value, reason: null, measured: true };
}

export interface CostTotal {
  readonly measuredUsd: number;
  // Combien de parts n'ont rapporte aucun montant. Un total qui les avale
  // silencieusement ment sur son perimetre.
  readonly silentCount: number;
  readonly countedCount: number;
}

export function totalEstimatedCost(
  amounts: ReadonlyArray<number | null | undefined>,
): CostTotal {
  let measuredUsd = 0;
  let countedCount = 0;
  let silentCount = 0;
  for (const amount of amounts) {
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) {
      measuredUsd += amount;
      countedCount += 1;
    } else {
      silentCount += 1;
    }
  }
  return { measuredUsd, silentCount, countedCount };
}

// La phrase qui accompagne un total partiel. `null` quand tout a ete rapporte :
// il n'y a alors rien a dire, et une phrase de plus serait du bruit.
export function partialTotalNote(total: CostTotal): string | null {
  if (total.silentCount === 0) return null;
  const parts = total.silentCount + total.countedCount;
  return total.silentCount === 1
    ? `1 intervenant sur ${parts} ne publie aucun montant : ce total ne le compte pas.`
    : `${total.silentCount} intervenants sur ${parts} ne publient aucun montant : ce total ne les compte pas.`;
}

// ---------------------------------------------------------------------------
// 6. Les intervenants : un prenom, un role en francais
// ---------------------------------------------------------------------------

// Un prenom se retient, un identifiant technique non. Le role est ecrit en
// francais courant : personne n'a besoin de savoir ce qu'est une architecture
// hexagonale pour comprendre "dessine la structure d'ensemble".
export interface Person {
  // La cle stable. C'est aussi la racine du nom technique cote depot, ce qui
  // permet de retrouver la personne depuis un identifiant complet.
  readonly id: string;
  readonly firstName: string;
  // Une phrase courte, sans mot technique.
  readonly role: string;
  // Pour accorder la phrase de confiance. Voir section 3.
  readonly gender: GrammaticalGender;
  // false -> la mention `NOT_BILLED_NOTE` doit apparaitre a cote du prenom.
  readonly billed: boolean;
}

export const NOT_BILLED_NOTE = "n'est pas facturé";

// DECISION EN ATTENTE: prenom du relecteur adverse. Le designer marque ce trou
// comme bloquant. Defaut pose ici : "Cassandre" — celle qui voit le probleme et
// qu'on n'ecoute pas. A remplacer, ou a confirmer, avant la livraison.
export const ADVERSE_REVIEWER_ID = 'relecteur-adverse';

// DECISION EN ATTENTE: genre grammatical de Quinn. Le depot ne le tranche pas —
// `_byan/agent/quinn/quinn-soul.md` n'emploie que des adjectifs invariables
// ("Je suis pratique", "Je suis tenace"). Defaut pose ici : feminin, parce que
// c'est la forme que le brief de conception ecrit en toutes lettres pour la
// phrase de confiance. A confirmer.
export const PEOPLE: readonly Person[] = [
  // Les deux moteurs locaux. Ils ne remplacent aucun agent : en mode local, c'est
  // EUX qui font le travail, et l'ecran affichait « intervenant non identifie »
  // pour quelqu'un que l'application connait parfaitement (vu le 2026-08-05).
  // Le genre grammatical porte l'accord de la phrase de confiance ; « le moteur »
  // est masculin, ce n'est pas une affirmation sur autre chose.
  { id: 'claude', firstName: 'Claude', role: 'exécute le tour sur ta machine', gender: 'm', billed: true },
  { id: 'codex', firstName: 'Codex', role: 'exécute le tour sur ta machine', gender: 'm', billed: true },  { id: 'architect', firstName: 'Winston', role: "dessine la structure d'ensemble", gender: 'm', billed: true },
  { id: 'dev', firstName: 'Amelia', role: 'écrit le code', gender: 'f', billed: true },
  { id: 'quinn', firstName: 'Quinn', role: 'vérifie que ça marche', gender: 'f', billed: true },
  { id: 'quick-flow-solo-dev', firstName: 'Barry', role: "répare vite dans l'existant", gender: 'm', billed: true },
  { id: 'tea', firstName: 'Murat', role: 'prépare la façon de tester', gender: 'm', billed: true },
  { id: 'carmack', firstName: 'Carmack', role: 'allège ce qui coûte cher', gender: 'm', billed: true },
  { id: 'rachid', firstName: 'Rachid', role: 'met en ligne', gender: 'm', billed: true },
  { id: ADVERSE_REVIEWER_ID, firstName: 'Cassandre', role: 'cherche ce qui cloche', gender: 'f', billed: true },
  // Les deux qui sont a part. Ils conduisent le chantier ; le temps qu'ils
  // passent n'est pas compte dans le cout du travail rendu.
  { id: 'hermes', firstName: 'Hermes', role: 'répartit le travail', gender: 'm', billed: false },
  { id: 'byan', firstName: 'BYAN', role: "conduit l'ensemble", gender: 'm', billed: false },
];

const PEOPLE_BY_ID: ReadonlyMap<string, Person> = new Map(PEOPLE.map((p) => [p.id, p]));

// Retrouve la personne derriere un identifiant technique complet
// ('bmad-bmm-architect', 'architect', ...). LE PLUS LONG GAGNE : sans cette
// regle, 'bmad-bmm-quick-flow-solo-dev' se terminerait par '-dev' et serait
// attribue a Amelia alors qu'il designe Barry.
export function personForSlug(slug: unknown): Person | null {
  if (typeof slug !== 'string') return null;
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  const exact = PEOPLE_BY_ID.get(key);
  if (exact) return exact;
  const suffixed = PEOPLE
    .filter((person) => key.endsWith(`-${person.id}`))
    .sort((a, b) => b.id.length - a.id.length);
  return suffixed[0] ?? null;
}

export function isBilled(person: Person): boolean {
  return person.billed;
}

// Le prenom, suivi de la mention quand elle s'applique. Une seule fonction pour
// que la mention ne soit jamais oubliee sur un ecran et presente sur un autre.
export function personLabel(person: Person): string {
  return person.billed ? person.firstName : `${person.firstName} — ${NOT_BILLED_NOTE}`;
}

// ---------------------------------------------------------------------------
// 7. Les trois profondeurs de lecture
// ---------------------------------------------------------------------------

// Dans cet ordre, et la troisieme est derriere un bouton. Le vocabulaire vit ici
// pour que les quatre surfaces nomment les memes trois etages.
export const READING_DEPTHS = ['phrase', 'bon-de-livraison', 'minute'] as const;

export type ReadingDepth = (typeof READING_DEPTHS)[number];

export const READING_DEPTH_LABELS: Readonly<Record<ReadingDepth, string>> = {
  phrase: 'en une phrase',
  'bon-de-livraison': 'ce qui a été rendu',
  minute: 'le détail minute par minute',
};
