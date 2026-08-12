// complexity.ts — score de complexite d'une tache (0-100), et son passage a
// l'echelle a 4 barreaux (trivial/medium/high/extreme).
//
// PORTE DEPUIS : src/byan-v2/dispatcher/complexity-scorer.js (classe
// ComplexityScorer, 4 facteurs : jetons, type de tache, taille du contexte,
// mots-cles). L'algorithme des 4 facteurs et leurs bornes (30/80/20/25 points,
// plafond 100) sont repris a l'identique — seule la RECONNAISSANCE DE MOTS
// change (voir plus bas).
//
// CE QUI CHANGE VERSUS LA SOURCE, ET POURQUOI (docs/dispatch-natif/L0-mesures.md,
// point M du brief L1) : la source ne reconnait que des mots-cles ANGLAIS, avec
// une limite de mot stricte (`\bkeyword\b`) qui ne capture pas la conjugaison
// francaise ("refactorise" ne declenche pas `\brefactor\b`). L'utilisateur de
// l'app ecrit en francais. Chaque categorie ci-dessous liste donc des RACINES
// (pas des mots entiers), comparees au texte DEBURRE (accents retires) avec un
// suffixe `\w*` qui absorbe la conjugaison — dans les deux langues, pas
// seulement le francais : c'est le meme mecanisme qui fait qu'un stem anglais
// comme "implement" capture aussi bien "implement", "implements",
// "implementation" que le francais "implemente"/"implementer" (ils partagent le
// prefixe), et c'est une amelioration honnete, pas seulement un contournement
// pour le francais.
//
// La ou les deux langues divergent de racine (analyser panache "analy" comme
// prefixe commun a "analyze"/"analysis"/"analyse"/"analyser" ; optimiser ne le
// peut pas, d'ou "optimiz"+"optimis" ; deployer non plus, d'ou "deploy"+"deploi"),
// chaque stem porte un commentaire qui le dit.
//
// PUR : aucun acces disque, aucune horloge, aucun hasard. Meme entree, meme
// sortie.

export type TaskType = 'exploration' | 'implementation' | 'analysis';

export interface ComplexityTask {
  readonly prompt: string;
  readonly type?: TaskType;
  readonly context?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Normalisation du texte : accents retires, minuscule. Copie locale (et non un
// import depuis natures.ts) pour que chaque fichier de ce lot reste lisible et
// testable seul — la fonction fait 4 lignes, la dupliquer coute moins que de
// creer un couplage entre deux modules qui n'ont sinon rien a se dire.
// ---------------------------------------------------------------------------

function deburr(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// hasStem — un stem devient `\b<stem>\w*\b` : la limite de mot au debut evite
// qu'un stem court (ex. "test") ne matche a l'interieur d'un autre mot
// ("protester" contient "test" mais n'a rien a voir), et le `\w*` en fin
// absorbe la conjugaison/le pluriel des DEUX langues plutot qu'un mot exact.
function hasStem(text: string, stem: string): boolean {
  return new RegExp(`\\b${escapeRegExp(stem)}\\w*\\b`, 'i').test(text);
}

function matchesAnyStem(text: string, stems: readonly string[]): boolean {
  return stems.some((stem) => hasStem(text, stem));
}

// ---------------------------------------------------------------------------
// Facteur 1 : nombre de jetons (max 30 points) — inchange depuis la source,
// l'algorithme est deja independant de la langue (il compte des mots separes
// par des espaces).
// ---------------------------------------------------------------------------

function estimateTokenCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

function tokenScore(prompt: string): number {
  const tokenCount = estimateTokenCount(prompt);
  if (tokenCount < 10) return 0;
  if (tokenCount >= 200) return 30;
  return Math.round(((tokenCount - 10) / 190) * 30);
}

// ---------------------------------------------------------------------------
// Facteur 2 : type de tache (max 80 points)
// ---------------------------------------------------------------------------

interface TaskTypePattern {
  readonly stems: readonly string[];
  readonly baseScore: number;
}

// L'ORDRE COMPTE : c'est l'ordre d'iteration (comme dans la source, qui rend le
// PREMIER type dont un mot-cle apparait). exploration -> implementation ->
// analysis, insertion order preservee par Object.entries sur des cles chaine.
const TASK_TYPE_PATTERNS: Readonly<Record<TaskType, TaskTypePattern>> = {
  exploration: {
    // EN : explore, find, list, show, search, get, read, view, display, check
    // FR : explore/explorer, trouve/trouver, liste/lister, montre/montrer,
    //      cherche/chercher, recupere/recuperer, lis/lire, affiche/afficher,
    //      consulte/consulter, verifie/verifier
    stems: [
      'explor', 'find', 'trouv', 'list', 'show', 'montr', 'search', 'cherch',
      'get', 'recuper', 'read', 'lis', 'view', 'display', 'affich', 'check',
      'verifi', 'consult',
    ],
    baseScore: 15,
  },
  implementation: {
    // EN (la source, mot pour mot) : implement, create, build, write, develop,
    //      code, add, generate, fix, deploy, test, document
    // FR : implemente/implementer, cree/creer, construit/construire,
    //      ecrit/ecrire, developpe/developper, code/coder, ajoute/ajouter,
    //      genere/generer, corrige/corriger, deploie/deployer, teste/tester,
    //      documente/documenter
    //
    // REGLE DE PARITE. Une racine n'entre ici que si (a) elle existe dans la
    // source, ou (b) elle traduit une racine de la source.
    //
    // Les quatre dernieres (fix, deploy, test, document) manquaient a la source
    // et y ont ete AJOUTEES le 2026-08-07 plutot que compensees ici : une copie
    // qui comble un trou en silence rend les deux versions incomparables, et le
    // test de parite existe pour l'empecher. L'ajout amont est neutre sur les
    // scores — ces verbes tombaient deja sur le meme 45 par defaut — et il
    // donne a `corrig` et `deploi` une racine a traduire.
    stems: [
      'implement', 'creat', 'cree', 'build', 'construi', 'writ', 'ecri',
      'develop', 'code', 'add', 'ajout', 'generat', 'gener',
      'fix', 'corrig', 'deploy', 'deploi', 'test', 'document',
    ],
    baseScore: 45,
  },
  analysis: {
    // EN : analyze, design, architect, evaluate, review, assess, plan, strategy
    // FR : analyse/analyser (partage le prefixe "analy" avec l'anglais
    //      "analyze"/"analysis" — un seul stem couvre les deux langues),
    //      architecture (idem, deja couvert par le stem anglais "architect"),
    //      evalue/evaluer, revise/reviser, apprecie/apprecier,
    //      planifie/planifier, strategie
    //
    // PAS de 'test' ici, et c'est mesure, pas suppose. Une premiere version du
    // portage l'y avait mis en raisonnant qu'un test est une forme
    // d'evaluation. Consequence chiffree le 2026-08-07 : "refactor the payment
    // module and cover it with tests" passait de 62 (source) a 92 (portage),
    // parce que la phrase basculait d'implementation (45) vers analyse (75).
    // A 92, l'echelle rend `fable` — le modele de dernier recours, environ deux
    // fois le prix d'Opus — pour un refactor de routine. Couvrir de tests est
    // du travail d'implementation ; l'analyser en serait un autre.
    stems: [
      'analy', 'design', 'architect', 'evalu', 'review', 'revis', 'assess',
      'appreci', 'plan', 'strateg',
    ],
    baseScore: 75,
  },
};

function inferTaskType(prompt: string): TaskType | null {
  const text = deburr(prompt);
  for (const type of Object.keys(TASK_TYPE_PATTERNS) as TaskType[]) {
    if (matchesAnyStem(text, TASK_TYPE_PATTERNS[type].stems)) return type;
  }
  return null;
}

// classifyTaskType — expose separement de calculateComplexity pour que les
// tests puissent verifier UNE phrase francaise entiere sans passer par le score
// numerique (un score peut rester "correct" par accident de calcul ; une
// classification, elle, est fausse ou juste).
export function classifyTaskType(prompt: string): TaskType | null {
  return inferTaskType(prompt);
}

const TASK_TYPE_SCORES: Readonly<Record<TaskType, number>> = {
  exploration: 15,
  implementation: 45,
  analysis: 75,
};

function taskTypeScore(task: ComplexityTask): number {
  if (task.type) return TASK_TYPE_SCORES[task.type] ?? 45;
  const inferred = inferTaskType(task.prompt);
  // Aucun motif reconnu -> complexite moyenne par defaut (fidele a la source :
  // "Default to medium complexity if no pattern matches").
  return inferred ? TASK_TYPE_SCORES[inferred] : 45;
}

// ---------------------------------------------------------------------------
// Facteur 3 : taille du contexte (max 20 points) — inchange depuis la source,
// aucune dependance a la langue.
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function countProperties(obj: unknown, visited: Set<unknown> = new Set()): number {
  if (!isPlainObject(obj) || visited.has(obj)) return 0;
  visited.add(obj);
  let count = 0;
  for (const key of Object.keys(obj)) {
    count += 1;
    const value = obj[key];
    if (isPlainObject(value)) count += countProperties(value, visited);
  }
  return count;
}

function calculateNestingDepth(obj: unknown, visited: Set<unknown> = new Set()): number {
  if (!isPlainObject(obj) || visited.has(obj)) return 0;
  visited.add(obj);
  let maxDepth = 0;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (isPlainObject(value)) {
      maxDepth = Math.max(maxDepth, calculateNestingDepth(value, visited));
    }
  }
  return maxDepth + 1;
}

function contextScore(context: Readonly<Record<string, unknown>> | undefined): number {
  if (!context || Object.keys(context).length === 0) return 0;

  const propertyCount = countProperties(context);
  const nestingDepth = calculateNestingDepth(context);

  let score: number;
  if (propertyCount < 5) score = 7;
  else if (propertyCount < 15) score = 12;
  else score = 17;

  if (nestingDepth > 2) score += Math.min(3, nestingDepth - 2);

  return Math.min(20, score);
}

// ---------------------------------------------------------------------------
// Facteur 4 : mots-cles (max 25 points)
// ---------------------------------------------------------------------------

type KeywordCategory = 'simple' | 'medium' | 'critical';

interface KeywordPattern {
  readonly stems: readonly string[];
  readonly score: number;
}

const KEYWORD_WEIGHTS: Readonly<Record<KeywordCategory, KeywordPattern>> = {
  simple: {
    // EN : list, show, find, get, read, basic, simple
    // FR : liste/lister, montre/montrer, trouve/trouver, obtiens/obtenir,
    //      lis/lire, basique, simple (identique aux deux langues)
    stems: ['list', 'show', 'montr', 'find', 'trouv', 'get', 'obtien', 'read', 'lis', 'basic', 'basiqu', 'simple'],
    score: 7,
  },
  medium: {
    // EN (la source, mot pour mot) : refactor, optimize, implement, integrate,
    //      update, modify
    // FR : refactorise/refactoriser (partage "refactor"), optimise/optimiser
    //      (racine EN "optimiz" avec un z, FR "optimis" avec un s — deux stems),
    //      implemente/implementer (partage "implement"), integre/integrer
    //      (partage "integr" avec l'anglais "integrate"), modifie/modifier
    //      (partage "modif" avec l'anglais "modify"), actualise/actualiser
    //      (synonyme francais de update, racine distincte)
    //
    // REGLE DE PARITE. Une racine n'entre ici que si (a) elle existe dans la
    // source, ou (b) elle traduit une racine de la source. Une premiere version
    // du portage y avait ajoute deploi/deploy/document/test/corrig/fix, qui ne
    // sont ni l'un ni l'autre. Mesure du 2026-08-07 : "deploy the new version
    // to the production server" passait de 45 (source) a 62 (portage) sur un
    // texte ANGLAIS identique — un changement de comportement deguise en
    // traduction. Le deploiement est bien reconnu, mais par le vocabulaire de
    // NATURE (natures.ts), qui est le bon endroit : il decide du moteur, pas de
    // la gamme de modele. Le test de parite verrouille cette regle.
    stems: [
      'refactor', 'optimiz', 'optimis', 'implement', 'integr', 'updat',
      'modif', 'actualis',
    ],
    score: 17,
  },
  critical: {
    // EN : security, performance, architecture, scalability, critical,
    //      mission-critical
    // FR : securite/securise/securiser (racine large "secur", qui couvre aussi
    //      l'anglais "security"/"secure"), performance (identique), architecture
    //      (identique), scalabilite (racine "scalab", deja partagee avec
    //      l'anglais "scalability"), critique
    stems: ['secur', 'performance', 'architect', 'scalab', 'critical', 'critique', 'mission-critical'],
    score: 25,
  },
};

function classify(prompt: string): { readonly category: KeywordCategory; readonly score: number } | null {
  const text = deburr(prompt);
  let best: { category: KeywordCategory; score: number } | null = null;
  // Le score le PLUS HAUT gagne (fidele a la source : Math.max sur toutes les
  // categories qui matchent), pas la premiere categorie trouvee.
  for (const category of Object.keys(KEYWORD_WEIGHTS) as KeywordCategory[]) {
    const pattern = KEYWORD_WEIGHTS[category];
    if (matchesAnyStem(text, pattern.stems) && (!best || pattern.score > best.score)) {
      best = { category, score: pattern.score };
    }
  }
  return best;
}

// classifyKeywordWeight — meme raison d'etre que classifyTaskType : verifier
// une phrase francaise entiere, independamment du score numerique final.
export function classifyKeywordWeight(prompt: string): KeywordCategory | null {
  return classify(prompt)?.category ?? null;
}

function keywordScore(prompt: string): number {
  return classify(prompt)?.score ?? 0;
}

// ---------------------------------------------------------------------------
// Le score combine
// ---------------------------------------------------------------------------

export function calculateComplexity(task: ComplexityTask): number {
  if (!task || !task.prompt || task.prompt.trim() === '') {
    throw new Error('prompt is required');
  }

  const total =
    tokenScore(task.prompt) +
    taskTypeScore(task) +
    contextScore(task.context) +
    keywordScore(task.prompt);

  return Math.min(100, Math.max(0, total));
}

// ---------------------------------------------------------------------------
// L'echelle a 4 barreaux (v3) : trivial -> medium -> high -> extreme.
//
// UNE SEULE COPIE DES SEUILS (docs/dispatch-natif/L0-mesures.md, M5) : la meme
// table 34/67/90 existe deja recopiee a la main dans
// _byan/mcp/byan-mcp-server/lib/dispatch-router.js ET dans
// .claude/workflows/byan-auto-dispatch.js, sans aucun test qui les compare — le
// risque de derive entre les deux n'est pas une hypothese, il est deja realise.
// Cette table-ci est donc la source pour TOUT ce module app/ : router.ts
// l'importe plutot que de la reecrire.
// ---------------------------------------------------------------------------

export const COMPLEXITY_RUNGS = ['trivial', 'medium', 'high', 'extreme'] as const;

export type ComplexityRung = (typeof COMPLEXITY_RUNGS)[number];

export const COMPLEXITY_THRESHOLDS: Readonly<Record<'medium' | 'high' | 'extreme', number>> = {
  medium: 34,
  high: 67,
  extreme: 90,
};

// Les labels acceptes en repli quand l'appelant ne fournit pas un score
// numerique (fidele a complexityBucket + claudeModelForComplexity de la
// source, qui acceptaient tous deux des labels — fusionnes ici en UNE table
// plutot que deux, pour la meme raison anti-derive que ci-dessus).
const LABEL_RUNGS: Readonly<Record<string, ComplexityRung>> = {
  trivial: 'trivial',
  low: 'trivial',
  simple: 'trivial',
  easy: 'trivial',
  medium: 'medium',
  moderate: 'medium',
  high: 'high',
  hard: 'high',
  complex: 'high',
  extreme: 'extreme',
  frontier: 'extreme',
  max: 'extreme',
};

// complexityRung — accepte un score 0-100 OU un label. Un label ou un nombre
// non reconnu retombe sur 'medium' : un milieu sur qui ne sous-arme ni ne
// sur-arme, plutot qu'une supposition dans un sens ou l'autre.
export function complexityRung(complexity: number | string): ComplexityRung {
  if (typeof complexity === 'number' && Number.isFinite(complexity)) {
    if (complexity < COMPLEXITY_THRESHOLDS.medium) return 'trivial';
    if (complexity < COMPLEXITY_THRESHOLDS.high) return 'medium';
    if (complexity < COMPLEXITY_THRESHOLDS.extreme) return 'high';
    return 'extreme';
  }
  const key = String(complexity).trim().toLowerCase();
  return LABEL_RUNGS[key] ?? 'medium';
}
