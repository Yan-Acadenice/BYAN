// plan.ts — L4 : le plan de dispatch calcule a CHAQUE tour du chat.
//
// CE QUE CE FICHIER AJOUTE. router.ts decide QUOI (moteur/modele/effort pour
// UNE tache) ; agent-match.ts decide QUEL AGENT. Ni l'un ni l'autre ne dit
// QUAND appliquer sa decision. C'est le trou que ce module ferme, et c'est le
// coeur du lot L4 : la granularite hybride.
//
// LA GRANULARITE HYBRIDE (le fait qui commande tout ce fichier). Le MODELE est
// attache a la SESSION sur les deux moteurs — meme decision produit deja pour
// codex (LocalChatStartOpts.model : "keeping it per-session is a deliberate
// product choice — a mid-thread model change would otherwise be an implicit
// context reset", app/shared/ipc-contract.ts). Le CHOIX D'AGENT est lu au
// demarrage de la session, sur les deux moteurs (main/engines/claude-engine.ts
// passe --agent au spawn ; main/engines/codex-engine.ts lit la definition UNE
// fois a la creation de la session et la rejoue a chaque tour, jamais
// re-lue). Le MOTEUR lui-meme est evidemment un choix de session : changer de
// claude a codex EST relancer une session. Ces trois-la partagent donc le
// meme prix : changer l'un d'eux PERD LE FIL de la conversation, meme si le
// texte deja affiche reste visible.
//
// L'EFFORT, seul, differe : `effortAppliesAt(engine)` (engine-options.ts) rend
// 'next-turn' pour codex (`codex exec resume` accepte l'override sans perdre
// le thread_id, mesure live) et 'next-session' pour claude (--effort est un
// drapeau de spawn). Un changement d'effort sur codex ne coute donc RIEN ; sur
// claude il coute le meme prix qu'un changement de modele.
//
// LA REGLE QUI EN DECOULE, et que ce module applique field par field :
//   - PREMIER tour de la session (sessionSpawned=false) : rien a perdre, tout
//     s'applique tout seul, quel que soit le champ.
//   - Tour SUIVANT, un champ qui coute le fil (agent, moteur, modele, et
//     l'effort SUR CLAUDE) qui change : marque `applies: 'proposed'`, jamais
//     applique seul — c'est a l'ecran de le presenter et a l'utilisateur de
//     trancher (ce module RETOURNE l'information, il ne decide pas a sa
//     place).
//   - Tour suivant, l'effort qui change SUR CODEX : s'applique tout seul,
//     puisqu'il ne coute rien.
//
// M1, HERITE DE router.ts SANS ETRE REINVENTE. Le modele DEJA DECLARE par
// l'agent retenu (front-matter) est un PLANCHER, jamais un plafond
// (docs/dispatch-natif/L0-mesures.md, M1). Ce module ne recalcule pas cette
// regle : il la RECOIT en entree (`agentFloorModel`, deja lu sur disque par le
// caller — ce module reste pur) et la transmet a `dispatch()`, qui l'applique
// via `applyModelFloor`.
//
// LA PAIRE MODELE x EFFORT, VALIDEE AVANT DE RENDRE, PAS APRES. router.ts
// calcule un effort par barreau de complexite (RUNG_TO_EFFORT), sans le
// confronter au modele final : c'est explicitement le travail d'un "autre
// lot" (voir router.ts, point 2 de son en-tete). Ce module EST cet autre lot :
// tout effort — qu'il vienne du calcul par complexite OU qu'il soit herite de
// la session (nature de verification, voir plus bas) — passe par
// `resolveEffort(runtime, modele, effort)` avant d'etre rendu. Un effort
// herite d'un tour precedent peut tres bien ne plus convenir au modele en
// cours (ex : la session a change de modele codex entre deux tours) ; sans ce
// passage, la paire rendue se ferait refuser en HTTP 400 par l'API, en plein
// tour (mesure, model-effort.ts).
//
// ZERO NOM DE MODELE DANS UNE PHRASE HUMAINE. workmanship.ts pose la regle
// pour son propre perimetre ("aucune chaine exportee d'ici ne contient un nom
// de modele") ; ce module l'etend a ses propres phrases de raison, qui sont
// destinees au meme ecran. Cote Claude, la valeur retenue EST un palier de
// MODEL_TIERS ('haiku'|'sonnet'|'opus'|'fable') — jamais imprime tel quel dans
// une `reason` : on traduit via `seniorityForTier`/`seniorityLabel`. Cote
// Codex, la valeur est un identifiant de modele reel (ex. 'gpt-5.6-sol') —
// jamais nomme non plus ; la phrase reste generique ("le reglage par defaut de
// Codex"). Les noms d'ENGIN ("Claude", "Codex") ne sont pas des noms de
// modele : ce sont les deux produits que l'utilisateur choisit explicitement
// ailleurs dans l'app (LocalChatStartOpts.cli), et workmanship.ts les affiche
// lui-meme comme intervenants (PEOPLE : 'claude', 'codex').
//
// PUR : aucun acces disque, aucune horloge, aucun hasard. Le roster, les slugs
// disponibles et le plancher de modele de l'agent sont des DONNEES en entree —
// les lire est le travail du caller (main/ipc-handlers/dispatch.ts).

import { calculateComplexity, complexityRung, type ComplexityRung } from './complexity';
import { dispatch, type DispatchDecision } from './router';
import { matchAgent, type RosterAgent, type AgentMatchVerdict, type MatchAgentsOptions } from './agent-match';
import { resolveEffort, type EffortResolution } from './model-effort';
import { RUNTIMES, isVerificationNature, type Runtime } from './natures';
import { effortAppliesAt, type ReasoningEffort } from '../engine-options';
import { seniorityForTier, seniorityLabel, type ModelTier } from '../workmanship';

// ---------------------------------------------------------------------------
// Le vocabulaire du plan
// ---------------------------------------------------------------------------

// 'immediate' : s'applique tout seul, sans rien demander. 'proposed' : coute
// le fil de la conversation — l'ecran doit le presenter, l'utilisateur doit
// trancher. Ce module ne rend jamais autre chose que ces deux valeurs : il
// n'y a pas de troisieme etat (voir l'en-tete pour la regle qui les separe).
export type PlanApplies = 'immediate' | 'proposed';

// Une case du plan (agent, moteur, modele OU effort). Meme forme pour les
// quatre : la valeur retenue, si elle change par rapport a l'etat courant, si
// le changement s'applique tout seul ou doit etre propose, et POURQUOI — en
// une phrase francaise lisible par un humain, jamais un nom de modele.
export interface DispatchPlanField<T> {
  readonly value: T;
  readonly changed: boolean;
  readonly applies: PlanApplies;
  readonly reason: string;
}

// L'etat de la session TELLE QUE LE CALLER LA CONNAIT au moment ou ce tour
// commence — jamais lu par ce module, toujours recu.
export interface DispatchPlanState {
  readonly runtime: Runtime;
  readonly model: string | null;
  readonly agentSlug: string | null;
  readonly effort: ReasoningEffort | null;
  // Un processus de session tourne-t-il DEJA ?
  //
  // C'EST LA BONNE QUESTION, ET CE N'ETAIT PAS CELLE POSEE AU DEPART. Ce champ
  // s'appelait `hasPriorTurn` et recevait "y a-t-il des messages a l'ecran".
  // Constate a l'usage le 2026-08-07 : une session ouverte avec ZERO message
  // repondait "non", le plan declarait le changement d'agent immediat, et
  // l'application se contentait de poser l'etiquette — le processus, lui,
  // tournait toujours avec l'agent precedent. L'utilisateur lisait alors
  // « L'agent X est choisi. Il s'appliquera au prochain demarrage », ce qui
  // etait exact et rendait la fonctionnalite inutile.
  //
  // `--agent`, `--model` et `--effort` (cote claude) sont des drapeaux de
  // LANCEMENT : un processus deja lance ne peut pas les prendre. La question qui
  // decide "immediat ou propose" est donc bien "un processus tourne-t-il ?", pas
  // "y a-t-il un fil a perdre".
  //
  // Ce que ce champ ne dit PAS : ce que couterait le relancement. Un processus
  // sans aucun message se relance pour rien. C'est a l'appelant de le savoir et
  // d'accepter la proposition tout seul dans ce cas — ce module ne connait pas
  // la longueur du fil, et l'inventer serait pire que de l'ignorer.
  readonly sessionSpawned: boolean;
}

export interface DispatchPlanInput {
  readonly message: string;
  readonly state: DispatchPlanState;
  readonly roster: readonly RosterAgent[];
  readonly availableSlugs: readonly string[];
  // M1 : le modele DECLARE (front-matter) par l'agent que ce meme message
  // resout (le caller le lit sur disque une fois l'agent connu — voir
  // main/ipc-handlers/dispatch.ts). `null`/absent si l'agent ne declare rien,
  // ou si aucun agent n'est propose pour ce message.
  readonly agentFloorModel?: ModelTier | null;
  // Passe-plat vers matchAgent (seuil de fit, nombre de candidats) — utile aux
  // tests et a un appelant qui veut un roster plus ou moins permissif. Omis :
  // le defaut de matchAgent (FIT_THRESHOLD) s'applique.
  readonly matchOptions?: MatchAgentsOptions;
}

export interface DispatchPlan {
  readonly complexity: number;
  readonly complexityRung: ComplexityRung;
  // Le verdict brut du matcher — les TROIS issues (`resolved` / `unresolvable`
  // / `no-fit`), jamais reduites a un booleen. Rendu tel quel : l'ecran qui
  // affichera le detail (pourquoi un agent existe mais ne charge pas, etc.)
  // en a besoin en entier, pas seulement de ce que `agent` retient.
  readonly agentVerdict: AgentMatchVerdict;
  readonly agent: DispatchPlanField<string | null>;
  readonly runtime: DispatchPlanField<Runtime>;
  readonly model: DispatchPlanField<string | null>;
  readonly effort: DispatchPlanField<ReasoningEffort | null>;
  // Ce que couterait l'ACCEPTATION d'au moins un changement propose : quels
  // champs sont concernes, et que le fil actuel serait perdu. `null` quand
  // rien n'est propose — il n'y a alors rien a accepter.
  readonly acceptCost: string | null;
  // Jamais bloquant. Vient de router.ts (validateModelEffort, non branche ici
  // par defaut) et du recalage d'effort (voir resolveEffort ci-dessous).
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Aides de granularite
// ---------------------------------------------------------------------------

// agent / moteur / modele : les trois champs SESSION-scoped (voir l'en-tete).
// Premier tour -> tout de suite. Tour suivant -> tout de suite si rien ne
// change, propose si ca change.
function sessionScopedApplies(sessionSpawned: boolean, changed: boolean): PlanApplies {
  if (!sessionSpawned) return 'immediate';
  return changed ? 'proposed' : 'immediate';
}

// L'effort seul depend du MOTEUR : per-turn sur codex (rien a perdre), per-
// session sur claude (meme prix que le modele). Premier tour : meme regle que
// les trois autres champs, rien a perdre non plus.
function effortApplies(sessionSpawned: boolean, changed: boolean, runtime: Runtime): PlanApplies {
  if (!sessionSpawned || !changed) return sessionScopedApplies(sessionSpawned, changed);
  return effortAppliesAt(runtime) === 'next-turn' ? 'immediate' : 'proposed';
}

// ---------------------------------------------------------------------------
// Le vocabulaire humain (francais, jamais un nom de modele)
// ---------------------------------------------------------------------------

const RUNTIME_LABELS: Readonly<Record<Runtime, string>> = { claude: 'Claude', codex: 'Codex' };

const EFFORT_LABELS: Readonly<Record<ReasoningEffort, string>> = {
  none: 'aucun effort de raisonnement particulier',
  minimal: 'un effort de raisonnement minimal',
  low: 'un effort de raisonnement faible',
  medium: 'un effort de raisonnement moyen',
  high: 'un effort de raisonnement élevé',
  xhigh: 'un effort de raisonnement très élevé',
  max: 'un effort de raisonnement maximal',
  ultracode: 'un effort de raisonnement ultra',
};

function joinFr(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Champ AGENT
// ---------------------------------------------------------------------------

function buildAgentField(
  verdict: AgentMatchVerdict,
  state: DispatchPlanState,
): DispatchPlanField<string | null> {
  // `unresolvable` et `no-fit` ne proposent RIEN : le roster n'a soit rien
  // trouve, soit trouve un agent qui ne chargera jamais (voir agent-match.ts).
  // Dans les deux cas, ce module garde l'agent en cours plutot que de faire
  // semblant d'avoir une meilleure reponse — la ligne rouge du verdict.
  if (verdict.kind !== 'resolved') {
    return {
      value: state.agentSlug,
      changed: false,
      applies: 'immediate',
      reason: verdict.recommendation,
    };
  }
  const changed = verdict.slug !== state.agentSlug;
  return {
    value: verdict.slug,
    changed,
    applies: sessionScopedApplies(state.sessionSpawned, changed),
    reason: verdict.recommendation,
  };
}

// ---------------------------------------------------------------------------
// Champ MOTEUR (runtime)
// ---------------------------------------------------------------------------

function buildRuntimeField(
  decision: DispatchDecision,
  state: DispatchPlanState,
  isVerification: boolean,
): DispatchPlanField<Runtime> {
  const changed = decision.runtime !== state.runtime;
  // Une verification force TOUJOURS Claude (natures.ts:routeRuntime la
  // verifie avant la table Codex) — jamais "reste sur le moteur en cours" :
  // si la session tournait sur Codex, c'est justement le point de la ligne
  // rouge #2 (un moteur ne juge jamais son propre travail), donc le passage a
  // Claude est le comportement voulu, pas une anomalie a masquer.
  const reason = isVerification
    ? `une vérification tourne toujours sur ${RUNTIME_LABELS.claude} : un moteur ne juge jamais son propre travail.`
    : changed
      ? decision.runtime === RUNTIMES.CODEX
        ? `ce message ressemble à de l'exécution ou du déploiement : il part sur ${RUNTIME_LABELS.codex}.`
        : `ce message demande du jugement plutôt que de l'exécution : il reste sur ${RUNTIME_LABELS.claude}.`
      : `${RUNTIME_LABELS[decision.runtime]} convient déjà à ce message.`;
  return {
    value: decision.runtime,
    changed,
    applies: sessionScopedApplies(state.sessionSpawned, changed),
    reason,
  };
}

// ---------------------------------------------------------------------------
// Champ MODELE
// ---------------------------------------------------------------------------

function buildModelField(
  decision: DispatchDecision,
  state: DispatchPlanState,
  agentFloorModel: ModelTier | null,
  isVerification: boolean,
): DispatchPlanField<string | null> {
  // `decision.model` est `null` UNIQUEMENT pour une nature de verification
  // (router.ts) : la session garde le sien, jamais `null` a l'ecran.
  const value = decision.model ?? state.model;
  const changed = value !== state.model;

  let reason: string;
  if (isVerification) {
    reason = 'une vérification hérite du modèle déjà en place : elle ne rechoisit rien.';
  } else if (decision.runtime === RUNTIMES.CODEX) {
    reason = 'Codex tourne sur son réglage de modèle par défaut, sans variation par la complexité du message.';
  } else {
    // Claude : la valeur EST un palier de MODEL_TIERS. On ne l'imprime
    // jamais tel quel — on parle en seniorité (regle workmanship.ts).
    //
    // `agentFloorModel` (quand fourni) est TOUJOURS au plus aussi seniorise
    // que `value` : c'est la garantie meme d'applyModelFloor (router.ts),
    // qui rend le RANG maximum des deux. Nul besoin de re-comparer les rangs
    // ici pour savoir "qui a gagne" — la phrase ci-dessous est vraie dans les
    // deux cas (le plancher a determine value, ou le calcul l'a deja depasse).
    const seniority = seniorityLabel(seniorityForTier(value));
    reason = agentFloorModel
      ? `l'agent retenu impose au moins le niveau ${seniorityLabel(seniorityForTier(agentFloorModel))} ; ce message retient le niveau ${seniority}.`
      : `ce message correspond à un travail de niveau ${seniority}.`;
  }

  return {
    value,
    changed,
    applies: sessionScopedApplies(state.sessionSpawned, changed),
    reason,
  };
}

// ---------------------------------------------------------------------------
// Champ EFFORT — toujours recale pour le modele final avant d'etre rendu
// ---------------------------------------------------------------------------

interface EffortBuild {
  readonly field: DispatchPlanField<ReasoningEffort | null>;
  readonly warning: string | null;
}

function buildEffortField(
  decision: DispatchDecision,
  state: DispatchPlanState,
  effectiveRuntime: Runtime,
  effectiveModel: string | null,
  isVerification: boolean,
): EffortBuild {
  // `decision.effort` est `null` pour la meme raison que le modele : une
  // verification herite de l'effort deja en place plutot que d'en recalculer
  // un. Herite ou calcule, l'un ou l'autre passe par resolveEffort ci-dessous
  // AVANT d'etre rendu, valide contre la paire EFFECTIVE (voir
  // `effectiveRuntime`/`effectiveModel` dans buildDispatchPlan) — jamais contre
  // la paire seulement PROPOSEE : si le modele ou le moteur n'a pas encore ete
  // accepte, le tour qui part MAINTENANT tourne encore sur l'ancienne paire, et
  // c'est CETTE paire que l'effort doit satisfaire pour ne pas se faire
  // refuser en HTTP 400 en plein tour.
  const requested = decision.effort ?? state.effort;

  let resolution: EffortResolution | null = null;
  if (requested != null) {
    resolution = resolveEffort(effectiveRuntime, effectiveModel ?? undefined, requested);
  }
  const value = resolution ? resolution.effort : requested;
  const changed = value !== state.effort;

  let reason: string;
  let warning: string | null = null;
  if (resolution?.wasClamped) {
    warning = `l'effort en cours ("${resolution.requested}") n'est pas accepté par le modèle retenu : recalé sur "${resolution.effort}".`;
    reason = `le niveau d'effort en cours ne convenait plus au modèle retenu : recalé sur ${EFFORT_LABELS[resolution.effort]}.`;
  } else if (isVerification) {
    reason = "une vérification hérite de l'effort déjà en place : elle ne rechoisit rien.";
  } else if (value == null) {
    reason = "aucun niveau d'effort n'est retenu pour ce message.";
  } else {
    reason = `ce message correspond à ${EFFORT_LABELS[value]}.`;
  }

  return {
    field: {
      value,
      changed,
      applies: effortApplies(state.sessionSpawned, changed, effectiveRuntime),
      reason,
    },
    warning,
  };
}

// ---------------------------------------------------------------------------
// Le cout de l'acceptation
// ---------------------------------------------------------------------------

function buildAcceptCost(fields: {
  readonly agent: DispatchPlanField<string | null>;
  readonly runtime: DispatchPlanField<Runtime>;
  readonly model: DispatchPlanField<string | null>;
  readonly effort: DispatchPlanField<ReasoningEffort | null>;
}): string | null {
  const proposed: string[] = [];
  if (fields.agent.applies === 'proposed') proposed.push("l'agent");
  if (fields.runtime.applies === 'proposed') proposed.push('le moteur');
  if (fields.model.applies === 'proposed') proposed.push('le niveau du modèle');
  if (fields.effort.applies === 'proposed') proposed.push("l'effort de raisonnement");
  if (proposed.length === 0) return null;
  return `Accepter ce changement (${joinFr(proposed)}) relance la conversation depuis zéro : ` +
    'le fil en cours sera perdu, même si son texte reste affiché.';
}

// ---------------------------------------------------------------------------
// Le plan
// ---------------------------------------------------------------------------

// buildDispatchPlan — calcule le plan complet pour CE message, a CE point de
// la session. Appele a chaque tour (voir l'en-tete) : deterministe, memes
// entrees -> meme plan.
export function buildDispatchPlan(input: DispatchPlanInput): DispatchPlan {
  const { message, state, roster, availableSlugs, agentFloorModel = null, matchOptions } = input;

  const complexity = calculateComplexity({ prompt: message });
  const rung = complexityRung(complexity);
  const isVerification = isVerificationNature(message);

  const agentVerdict = matchAgent(message, roster, availableSlugs, matchOptions);
  const decision = dispatch({ nature: message, complexity, agentFloorModel });

  const agentField = buildAgentField(agentVerdict, state);
  const runtimeField = buildRuntimeField(decision, state, isVerification);
  const modelField = buildModelField(decision, state, agentFloorModel, isVerification);

  // La paire EFFECTIVE — celle qui tourne VRAIMENT ce tour-ci, par opposition
  // a celle que le plan recommande. Un champ `proposed` n'a pas ete accepte :
  // la session tourne encore sur sa valeur `state.*`. Sans cette distinction,
  // un modele juste PROPOSE (jamais applique) validerait un effort qui ne
  // convient qu'a lui, et le tour se ferait refuser sur l'ancien modele — le
  // scenario HTTP 400 que ce fichier existe pour fermer.
  const effectiveRuntime: Runtime = runtimeField.applies === 'immediate' ? runtimeField.value : state.runtime;
  const effectiveModel: string | null = modelField.applies === 'immediate' ? modelField.value : state.model;

  const { field: effortField, warning: effortWarning } = buildEffortField(
    decision,
    state,
    effectiveRuntime,
    effectiveModel,
    isVerification,
  );

  const warnings: string[] = [...decision.warnings];
  if (effortWarning) warnings.push(effortWarning);

  return {
    complexity,
    complexityRung: rung,
    agentVerdict,
    agent: agentField,
    runtime: runtimeField,
    model: modelField,
    effort: effortField,
    acceptCost: buildAcceptCost({ agent: agentField, runtime: runtimeField, model: modelField, effort: effortField }),
    warnings,
  };
}
