// router.ts — F1, le CERVEAU de dispatch, porte pour l'app de bureau.
//
// SOURCES LUES (pas recopiees a l'aveugle — voir
// docs/dispatch-natif/L0-mesures.md pour les mesures qui ont change trois
// choses par rapport au fichier amont) :
//   - _byan/mcp/byan-mcp-server/lib/dispatch-router.js   (la table de routage)
//   - .claude/workflows/byan-auto-dispatch.js:95-115     (la resolution DEJA
//     adoptee du conflit de doctrine entre lib/dispatch.js et
//     lib/dispatch-router.js sur la montee en gamme — reprise ici, pas
//     reinventee ; voir M4 et natures.ts)
//   - app/shared/engine-options.ts (effortsFor)           (le domaine d'effort
//     par moteur — importe, pas recopie, pour que les deux ne divergent jamais ;
//     M5 montre que cette derive existe deja ailleurs dans le depot)
//   - app/shared/workmanship.ts (MODEL_TIERS)             (le vocabulaire des 4
//     barreaux de modele — importe pour la meme raison)
//
// CE QUI CHANGE VERSUS LE FICHIER AMONT, ET POURQUOI :
//
//   1. L'effort est emis des DEUX cotes, jamais `null` sur claude. Le
//      commentaire amont ("Claude effort = model tier, no separate knob") est
//      FAUX pour le CLI que cette app pilote : `claude --effort` accepte SIX
//      valeurs, mesure contre le binaire lui-meme (commit 079518f,
//      app/shared/engine-options.ts). Rendre `effort: null` cote claude ici
//      referait la meme erreur avec un fait deja etabli dans ce depot.
//
//   2. Le modele Codex par defaut est 'gpt-5.6-sol' (mesure live sur ce depot,
//      voir engine-options.ts MODEL_PRESETS.codex), pas la constante amont
//      'gpt-5.4'. La PAIRE modele x effort (quel effort un modele codex donne
//      accepte reellement) n'est PAS validee ici : cette matrice appartient a
//      un autre lot. Ce module expose seulement un point de branchement
//      (`validateModelEffort`) pour qu'il puisse s'y accrocher sans que ce
//      fichier lui appartienne.
//
//   3. La verification est protegee PAR NATURE, avec la regle DEJA choisie par
//      .claude/workflows/byan-auto-dispatch.js pour trancher le desaccord entre
//      lib/dispatch.js (jamais de montee en gamme) et lib/dispatch-router.js
//      (montee jusqu'a fable) : une nature de verification n'impose ni modele
//      ni effort — elle herite integralement de la session. Toute autre nature
//      prend l'echelle par complexite. Voir natures.ts pour le detail de cette
//      resolution et la raison pour laquelle elle n'est pas reinventee ici.
//
//   4. Le modele DEJA DECLARE par un agent choisi est un PLANCHER, jamais un
//      plafond (mesure M1 : `--model` gagne sur la declaration d'un agent — 3
//      cas + 2 temoins, docs/dispatch-natif/L0-mesures.md). Rabaisser un agent
//      qui declare `opus` vers un `haiku` calcule par un score faible serait la
//      retrogradation que la doctrine BYAN interdit (STRICT-2, No Downgrade).
//      Voir applyModelFloor : le rang n'est defini QU'UNE FOIS, dans
//      workmanship.ts (MODEL_TIERS), pas recopie ici.
//
// PUR : aucun acces disque, aucune horloge, aucun hasard. Meme entree, meme
// sortie.

import { effortsFor, type ReasoningEffort } from '../engine-options';
import { MODEL_TIERS, type ModelTier } from '../workmanship';
import { RUNTIMES, routeRuntime, isVerificationNature, type Runtime } from './natures';
import { complexityRung, type ComplexityRung } from './complexity';

export type { Runtime } from './natures';

// MESURE (docs/dispatch-natif/L0-mesures.md) : le modele codex par defaut de ce
// depot est 'gpt-5.6-sol' (voir aussi engine-options.ts MODEL_PRESETS.codex,
// seede depuis un tour codex reel). La constante amont 'gpt-5.4' n'est PAS
// reprise — voir le point 2 en tete de fichier.
export const DEFAULT_CODEX_MODEL = 'gpt-5.6-sol';

// Barreau de complexite -> modele Claude, sur l'echelle a 4 barreaux (v3).
// UNE seule table : complexity.ts calcule le barreau depuis le score,
// celle-ci le traduit en modele. Ni l'une ni l'autre ne recopie les seuils de
// l'autre (voir complexity.ts, COMPLEXITY_THRESHOLDS, pour la raison — M5).
const RUNG_TO_CLAUDE_TIER: Readonly<Record<ComplexityRung, ModelTier>> = {
  trivial: 'haiku',
  medium: 'sonnet',
  high: 'opus',
  extreme: 'fable',
};

// Barreau de complexite -> effort. 'low'/'medium'/'high'/'max' sont CHACUN
// presents dans le domaine des DEUX moteurs (voir effortsFor plus bas) : ce
// sous-ensemble ne demande aucune validation par moteur pour etre emis sans
// risque — c'est la garantie que le test de ce fichier verifie explicitement.
const RUNG_TO_EFFORT: Readonly<Record<ComplexityRung, ReasoningEffort>> = {
  trivial: 'low',
  medium: 'medium',
  high: 'high',
  extreme: 'max',
};

function tierRank(tier: ModelTier): number {
  return MODEL_TIERS.indexOf(tier);
}

// applyModelFloor — M1 : un modele deja declare (front-matter d'agent, ou tout
// autre engagement anterieur du caller) agit comme un PLANCHER. Le calcul par
// complexite ne peut que le confirmer ou monter, jamais le rabaisser. Rend le
// maximum des deux sur l'echelle a 4 barreaux (haiku < sonnet < opus < fable).
// Le rang est lu depuis workmanship.MODEL_TIERS : defini une seule fois dans ce
// depot, pas ici.
export function applyModelFloor(computed: ModelTier, floor?: ModelTier | null): ModelTier {
  if (!floor) return computed;
  return tierRank(floor) > tierRank(computed) ? floor : computed;
}

export interface ModelEffortCandidate {
  readonly runtime: Runtime;
  readonly model: string;
  readonly effort: ReasoningEffort;
}

export interface DispatchInput {
  readonly nature: unknown;
  readonly complexity: number | string;
  // M1 : le modele deja declare par un agent choisi (front-matter `model:`),
  // s'il y en a un. Sert de PLANCHER, jamais de plafond.
  readonly agentFloorModel?: ModelTier | null;
  // Point de branchement pour la matrice modele x effort (un autre lot en est
  // proprietaire — voir le point 2 en tete de fichier). Cette fonction NE DOIT
  // PAS faire echouer la decision : un retour `false` ajoute un avertissement
  // dans `warnings`, il ne change ni le moteur, ni le modele, ni l'effort
  // rendus. Router.ts n'a pas la matrice pour trancher a la place de l'appelant.
  readonly validateModelEffort?: (candidate: ModelEffortCandidate) => boolean;
}

export interface DispatchDecision {
  readonly runtime: Runtime;
  // `null` UNIQUEMENT pour une nature de verification : aucun modele n'est
  // impose, la session garde le sien (voir le point 3 en tete de fichier).
  readonly model: string | null;
  // `null` pour la meme raison, et seulement pour elle : un modele herite sans
  // son effort n'aurait aucun sens (l'effort qualifie CE modele).
  readonly effort: ReasoningEffort | null;
  readonly reasoning: string;
  // Jamais bloquant : un avertissement du validateur optionnel, ou vide.
  readonly warnings: readonly string[];
}

export function dispatch(input: DispatchInput): DispatchDecision {
  const { nature, complexity, agentFloorModel = null, validateModelEffort } = input;
  const runtime = routeRuntime(nature);
  const warnings: string[] = [];

  // Ligne rouge #2, reprise de la resolution byan-auto-dispatch.js:95-115 (M4) :
  // une nature de verification n'a rien d'impose, elle herite de la session.
  if (isVerificationNature(nature)) {
    return {
      runtime,
      model: null,
      effort: null,
      reasoning: 'verification reste sur la session (ligne rouge : un moteur ne note jamais son propre travail)',
      warnings,
    };
  }

  const rung = complexityRung(complexity);
  const effort = RUNG_TO_EFFORT[rung];

  function checkModelEffort(model: string): void {
    if (validateModelEffort && !validateModelEffort({ runtime, model, effort })) {
      warnings.push(
        `la paire modele/effort ("${model}", "${effort}") n'est pas confirmee valide par le validateur fourni`,
      );
    }
  }

  if (runtime === RUNTIMES.CODEX) {
    const model = DEFAULT_CODEX_MODEL;
    checkModelEffort(model);
    return {
      runtime,
      model,
      effort,
      reasoning: `nature "${String(nature)}" route vers Codex ; effort cale sur la complexite (barreau "${rung}")`,
      warnings,
    };
  }

  const computedTier = RUNG_TO_CLAUDE_TIER[rung];
  const tier = applyModelFloor(computedTier, agentFloorModel);
  checkModelEffort(tier);
  const floorWon = Boolean(agentFloorModel) && tierRank(agentFloorModel as ModelTier) > tierRank(computedTier);

  return {
    runtime,
    model: tier,
    effort,
    reasoning: floorWon
      ? `plancher d'agent "${agentFloorModel}" conserve (le calcul par complexite proposait "${computedTier}")`
      : `nature "${String(nature)}" reste sur Claude ; modele cale sur la complexite (barreau "${rung}")`,
    warnings,
  };
}

// isEffortValidForRuntime — expose pour que les appelants (et les tests) qui
// veulent verifier eux-memes qu'un effort donne appartient au domaine d'un
// moteur n'aient pas a importer effortsFor directement ni a recopier la regle.
export function isEffortValidForRuntime(runtime: Runtime, effort: ReasoningEffort): boolean {
  return (effortsFor(runtime) as readonly string[]).includes(effort);
}
