// app/shared/dispatch/model-effort.ts
//
// La matrice MODELE x EFFORT cote codex — mesuree, pas supposee.
//
// LE PROBLEME. engine-options.ts valide l'effort PAR MOTEUR (effortsFor(engine)).
// La mesure du 2026-08-07 montre que cote codex, la validite d'un effort
// depend du MODELE, pas seulement du moteur : gpt-5.4 refuse 'max', gpt-5.6-sol
// l'accepte. Un dispatch qui choisit le modele et l'effort separement peut donc
// emettre une paire qui passe toutes les validations locales et se fait
// refuser en HTTP 400 par l'API, apres le lancement, en plein tour.
//
// QUATRE SOURCES, ET LEURS CONTRADICTIONS. Chaque fait ci-dessous porte sa
// mesure ; deux d'entre elles se contredisent, et la resolution est ecrite ici
// plutot que devinee au moment de l'usage.
//
//   1. Aide du CLI (`codex --help`, `codex exec --help`) : aucune ligne
//      d'effort. Muette — elle n'aide pas a trancher.
//
//   2. Catalogue produit (`codex debug models`, mesure le 2026-08-07,
//      codex-cli 0.146.0 — reproduit et confirme identique au tableau du
//      mandat de ce lot) : par modele, un `default_reasoning_level` et une
//      liste `supported_reasoning_levels`. C'est un MENU, pas une mesure
//      d'acceptation API — voir la contradiction du point 4.
//
//        gpt-5.6-sol         | low    | low, medium, high, xhigh, max, ultra
//        gpt-5.6-sol-wm      | low    | low, medium, high, xhigh, max, ultra   (visibility=hide)
//        gpt-5.6-terra       | medium | low, medium, high, xhigh, max, ultra
//        gpt-5.6-luna        | medium | low, medium, high, xhigh, max
//        gpt-5.5             | medium | low, medium, high, xhigh
//        gpt-5.4             | medium | low, medium, high, xhigh
//        gpt-5.4-mini        | medium | low, medium, high, xhigh
//        gpt-5.3-codex-spark | high   | low, medium, high, xhigh
//        codex-auto-review   | medium | low, medium, high, xhigh, max          (visibility=hide)
//
//   3. Message de refus HTTP 400 de l'API, verbatim, obtenu en passant une
//      valeur bidon a un tour reel :
//        "[reasoning.effort] [invalid_enum_value] Invalid value: 'bogusEffort'.
//         Supported values are: 'none', 'minimal', 'low', 'medium', 'high',
//         'xhigh', and 'max'."
//      Cette liste ne connait PAS 'ultra' — alors que le catalogue (2) annonce
//      'ultra' sur gpt-5.6-sol, gpt-5.6-sol-wm et gpt-5.6-terra.
//
//      CONTRADICTION No.1 : le catalogue annonce une valeur que le validateur
//      d'entree de l'API ne reconnait pas. Tranchee par la regle du mandat —
//      la plus restrictive gagne : 'ultra' est EXCLU de la matrice pour tous
//      les modeles codex, meme ceux qui l'annoncent. Un effort exclu a tort
//      coute un cran de moins ; un effort accepte a tort coute une erreur
//      visible a l'utilisateur en plein tour.
//
//   4. Mesure VALEUR PAR VALEUR contre l'API reelle, le 2026-08-05
//      (codex-cli 0.146.0, modele gpt-5.6-sol) : 'none', 'low', 'medium',
//      'high', 'xhigh', 'max' ACCEPTES ; 'minimal' REFUSE ("Unsupported value:
//      'minimal' is not supported with the ... model") ; 'ultracode' REFUSE
//      (valeur claude, hors domaine codex de toute facon).
//
//      CONTRADICTION No.2 : le catalogue (2) ne liste NI 'none' NI 'minimal'
//      parmi les niveaux de gpt-5.6-sol — pourtant 'none' est bel et bien
//      accepte. Le catalogue est donc un menu produit incomplet cote bas de
//      gamme ; il ne peut pas non plus servir de plafond fiable, seul, pour
//      les 8 autres modeles.
//
// CE QUI RESTE INCERTAIN, EXPLICITEMENT. Pour les 8 modeles codex AUTRES que
// gpt-5.6-sol, seule la source (2) — le catalogue — est disponible : aucune
// mesure valeur par valeur contre l'API reelle n'a ete faite pour eux. La
// matrice les marque `source: 'catalog'`, par opposition a `source: 'measured'`
// pour gpt-5.6-sol, seul modele mesure directement. Une entree 'catalog' est
// une lecture fidele du menu produit, pas une preuve d'acceptation API — a
// remesurer si un 400 apparait en usage reel sur l'un de ces modeles.
//
// PURETE. Ce module ne touche ni au disque ni au reseau : la matrice est une
// constante mesuree, avec sa date et sa version de CLI en commentaire, pas une
// lecture a l'execution du catalogue (ce serait un autre lot).
//
// POURQUOI CERTAINES LISTES SONT DUPLIQUEES ICI plutot qu'importees depuis
// engine-options.ts : ce module est importe PAR engine-options.ts (pour que
// effortsFor(engine, model) delegue ici). Importer en retour une valeur
// d'engine-options.ts creerait un cycle d'import a l'execution. Les deux
// domaines moteur (CODEX_ENGINE_DOMAIN, CLAUDE_ENGINE_DOMAIN) et l'ordre total
// des efforts (EFFORT_ORDER) sont donc de courtes copies locales — leur
// egalite avec les listes source d'engine-options.ts est verrouillee par
// test (model-effort.test.ts), pas laissee a la confiance.

import type { EngineId, ReasoningEffort } from '../engine-options';

// ---------- Domaines moteur (repli quand aucune donnee par modele n'existe) ----------

// Duplique engine-options.ts:CODEX_EFFORTS. Voir note de tete de fichier.
const CODEX_ENGINE_DOMAIN: readonly ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

// Duplique engine-options.ts:CLAUDE_EFFORTS. Aucune variation par modele n'est
// mesuree cote claude dans ce lot — le phenomene modele-dependant est, a ce
// jour, uniquement observe cote codex. effortsForModel('claude', *) rend donc
// toujours ce domaine entier.
const CLAUDE_ENGINE_DOMAIN: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'];

// Ordre total des huit valeurs, du plus bas au plus haut. Duplique
// engine-options.ts:REASONING_EFFORTS (meme raison de duplication ci-dessus).
// Sert uniquement au recalage (resolveEffort) : trouver la valeur valide la
// plus proche sans jamais depasser le plafond du modele.
const EFFORT_ORDER: readonly ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultracode',
];

const EFFORT_RANK: ReadonlyMap<ReasoningEffort, number> = new Map(EFFORT_ORDER.map((e, i) => [e, i]));

function rankOf(e: ReasoningEffort): number {
  return EFFORT_RANK.get(e) ?? 0;
}

// ---------- La matrice codex ----------

// D'ou vient une ligne de la matrice, pour que l'appelant sache combien s'y fier.
export type EffortSource =
  // gpt-5.6-sol : mesure valeur par valeur contre l'API reelle (2026-08-05).
  | 'measured'
  // Les 8 autres modeles codex : lu depuis `codex debug models` (2026-08-07),
  // pas re-verifie valeur par valeur contre l'API.
  | 'catalog'
  // claude : aucune donnee par modele n'existe dans ce lot ; c'est le domaine
  // entier du moteur, pas un repli du a un modele inconnu.
  | 'engine-domain'
  // Le modele demande est absent de la matrice codex ci-dessus : repli sur le
  // domaine du moteur. Une marque, pas une mesure — voir le champ `note`.
  | 'engine-fallback';

interface CodexModelEntry {
  readonly efforts: readonly ReasoningEffort[];
  readonly source: 'measured' | 'catalog';
  readonly visibility: 'list' | 'hide';
  readonly defaultEffort: ReasoningEffort;
}

// MESURE le 2026-08-07 (`codex debug models`, codex-cli 0.146.0). 'ultra' est
// EXCLU partout (contradiction No.1 ci-dessus). gpt-5.6-sol seul recoit 'none'
// en plus et perd 'minimal' (contradiction No.2 : c'est le modele mesure
// directement, source='measured' plutot que 'catalog').
const CODEX_MODEL_EFFORTS: Readonly<Record<string, CodexModelEntry>> = {
  'gpt-5.6-sol': {
    efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    source: 'measured',
    visibility: 'list',
    defaultEffort: 'low',
  },
  'gpt-5.6-sol-wm': {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    source: 'catalog',
    visibility: 'hide',
    defaultEffort: 'low',
  },
  'gpt-5.6-terra': {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    source: 'catalog',
    visibility: 'list',
    defaultEffort: 'medium',
  },
  'gpt-5.6-luna': {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    source: 'catalog',
    visibility: 'list',
    defaultEffort: 'medium',
  },
  'gpt-5.5': {
    efforts: ['low', 'medium', 'high', 'xhigh'],
    source: 'catalog',
    visibility: 'list',
    defaultEffort: 'medium',
  },
  'gpt-5.4': {
    efforts: ['low', 'medium', 'high', 'xhigh'],
    source: 'catalog',
    visibility: 'list',
    defaultEffort: 'medium',
  },
  'gpt-5.4-mini': {
    efforts: ['low', 'medium', 'high', 'xhigh'],
    source: 'catalog',
    visibility: 'list',
    defaultEffort: 'medium',
  },
  'gpt-5.3-codex-spark': {
    efforts: ['low', 'medium', 'high', 'xhigh'],
    source: 'catalog',
    visibility: 'list',
    defaultEffort: 'high',
  },
  'codex-auto-review': {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    source: 'catalog',
    visibility: 'hide',
    defaultEffort: 'medium',
  },
};

// ---------- API publique ----------

export interface ModelEffortInfo {
  readonly efforts: readonly ReasoningEffort[];
  readonly source: EffortSource;
  // Present seulement quand source est 'engine-fallback' : explique que la
  // reponse est un repli sur le domaine du moteur, pas une mesure pour ce
  // modele precis.
  readonly note?: string;
}

// Les efforts valides pour une paire (moteur, modele). Un modele codex connu
// de la matrice rend sa ligne mesuree/catalogue ; un modele inconnu (ou
// absent) retombe sur le domaine du moteur et le SIGNALE via `source` +
// `note`, il ne fait jamais echouer l'appel.
export function effortsForModel(engine: EngineId, model?: string | null): ModelEffortInfo {
  if (engine === 'claude') {
    // Aucune matrice par modele cote claude dans ce lot : le domaine entier
    // du moteur EST la reponse, ce n'est pas un repli.
    return { efforts: CLAUDE_ENGINE_DOMAIN, source: 'engine-domain' };
  }

  if (model) {
    const entry = CODEX_MODEL_EFFORTS[model];
    if (entry) {
      return { efforts: entry.efforts, source: entry.source };
    }
  }

  return {
    efforts: CODEX_ENGINE_DOMAIN,
    source: 'engine-fallback',
    note: model
      ? `modele codex "${model}" absent de la matrice mesuree le 2026-08-07 : `
        + 'repli sur le domaine du moteur codex, pas une mesure specifique a ce modele.'
      : 'aucun modele fourni : repli sur le domaine du moteur codex.',
  };
}

// Racourci booleen — pratique au point d'appel qui veut juste savoir si une
// paire (moteur, modele, effort) est utilisable avant de lancer le tour.
export function isValidEffortForModel(engine: EngineId, model: string | undefined, effort: unknown): boolean {
  if (typeof effort !== 'string') return false;
  const { efforts } = effortsForModel(engine, model);
  return (efforts as readonly string[]).includes(effort);
}

export interface EffortResolution {
  readonly effort: ReasoningEffort;
  readonly requested: ReasoningEffort;
  readonly wasClamped: boolean;
  readonly source: EffortSource;
  readonly note?: string;
}

// Recale un effort demande vers la valeur valide la plus proche pour cette
// paire (moteur, modele), SANS JAMAIS monter au-dessus de ce que le modele
// accepte : on prend le rang valide le plus haut qui ne depasse pas le rang
// demande. Si la demande est SOUS le plancher du modele (aucune valeur valide
// en dessous), on remonte au plancher — la seule valeur atteignable, ce n'est
// pas un depassement de plafond.
export function resolveEffort(engine: EngineId, model: string | undefined, requested: ReasoningEffort): EffortResolution {
  const info = effortsForModel(engine, model);

  if ((info.efforts as readonly string[]).includes(requested)) {
    return { effort: requested, requested, wasClamped: false, source: info.source, note: info.note };
  }

  const requestedRank = rankOf(requested);
  let floor: ReasoningEffort = info.efforts[0];
  let best: ReasoningEffort | undefined;
  for (const e of info.efforts) {
    const rank = rankOf(e);
    if (rank < rankOf(floor)) floor = e;
    if (rank <= requestedRank && (best === undefined || rank > rankOf(best))) best = e;
  }

  return {
    effort: best ?? floor,
    requested,
    wasClamped: true,
    source: info.source,
    note: info.note,
  };
}

// Les modeles codex proposables au choix (picker) : ceux marques
// visibility='list'. 'gpt-5.6-sol-wm' et 'codex-auto-review' sont
// visibility='hide' dans le catalogue lui-meme — l'app ne doit pas les
// afficher (voir MODEL_PRESETS.codex dans engine-options.ts).
export function listedCodexModels(): readonly string[] {
  return Object.keys(CODEX_MODEL_EFFORTS).filter((m) => CODEX_MODEL_EFFORTS[m].visibility === 'list');
}

// Tous les modeles codex connus de la matrice, visibles ou non — pour un
// appelant qui a explicitement besoin de le savoir (tests, diagnostics).
export function allKnownCodexModels(): readonly string[] {
  return Object.keys(CODEX_MODEL_EFFORTS);
}
