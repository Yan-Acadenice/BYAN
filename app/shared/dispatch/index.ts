// index.ts — point d'entree unique du dossier dispatch/. Les consommateurs
// (main/renderer, et les lots suivants — L3 notamment) importent depuis
// 'shared/dispatch' plutot que depuis chaque fichier interne, pour que la
// frontiere du module reste un choix explicite plutot qu'un chemin de fichier.

export {
  RUNTIMES,
  normalizeNature,
  isVerificationNature,
  isCodexNature,
  routeRuntime,
  CODEX_NATURE_STEMS,
  VERIFICATION_NATURE_STEMS,
  type Runtime,
} from './natures';

export {
  calculateComplexity,
  classifyTaskType,
  classifyKeywordWeight,
  complexityRung,
  COMPLEXITY_RUNGS,
  COMPLEXITY_THRESHOLDS,
  type TaskType,
  type ComplexityTask,
  type ComplexityRung,
} from './complexity';

export {
  dispatch,
  applyModelFloor,
  isEffortValidForRuntime,
  DEFAULT_CODEX_MODEL,
  type DispatchInput,
  type DispatchDecision,
  type ModelEffortCandidate,
} from './router';

// L4 — le plan calcule a chaque tour de chat (voir plan.ts pour la granularite
// hybride : ce qui s'applique tout seul contre ce qui se propose).
export {
  buildDispatchPlan,
  type PlanApplies,
  type DispatchPlanField,
  type DispatchPlanState,
  type DispatchPlanInput,
  type DispatchPlan,
} from './plan';
