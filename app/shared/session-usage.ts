// Le pli des mesures d'usage d'une session, par moteur.
//
// POURQUOI DANS shared/. Ce pli etait ne dans le contexte du renderer, ou il
// alimente le panneau d'usage. Le processus principal doit produire EXACTEMENT
// le meme total pour l'ecrire dans l'historique sur disque, sinon la page
// Historique et le panneau d'usage affichent deux chiffres differents pour la
// meme session — et rien ne dit lequel ment.

import type { EngineId, LocalChatUsage } from './ipc-contract';

// Les mesures numeriques qu'un total replie. Listees a la main plutot que
// derivees d'un objet-exemple : une mesure ajoutee a LocalChatUsage et oubliee
// ici apparait comme une colonne manquante, pas comme un nombre perdu en
// silence.
export const USAGE_METRICS = [
  'inputTokens',
  'cachedInputTokens',
  'cacheWriteInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
  'costUsd',
  'durationMs',
] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number];

// COMMENT chaque mesure s'agrege sur les tours d'une session. Tous les nombres
// rapportes ne sont pas des increments par tour, et les traiter pareil produit un
// total faux.
//
// MESURE contre le vrai CLI claude (trois tours dans une session, 2026-07-27) :
//   total_cost_usd : 0.2319165 -> 0.261986 -> 0.28187   (monotone : TOTAL SESSION)
//   duration_ms    : 4150      -> 2739     -> 2985      (non monotone : PAR TOUR)
// Le champ de cout EST donc deja le cumul. L'additionner rapportait 0.776 USD
// pour une session qui en avait coute 0.282 — presque le triple, presente comme
// une mesure. codex lance un processus par tour et chaque turn.completed ne
// rapporte que ce tour : ses compteurs sont de vrais increments et s'additionnent.
//
// 'latest' garde la valeur la plus recente ; 'sum' additionne les increments.
export const USAGE_AGGREGATION: Record<UsageMetric, 'sum' | 'latest'> = {
  inputTokens: 'sum',
  cachedInputTokens: 'sum',
  cacheWriteInputTokens: 'sum',
  outputTokens: 'sum',
  reasoningOutputTokens: 'sum',
  costUsd: 'latest',
  durationMs: 'sum',
};

// Le cumul d'un moteur. Chaque mesure est optionnelle pour la meme raison qu'elle
// l'est sur le fil : absente veut dire « jamais rapportee », ce que l'interface
// doit rendre par un tiret. Un 0 ici serait indistinguable d'un zero mesure.
export type SessionUsageTotal = {
  engine: EngineId;
  // Tours complets replies dans cette ligne — une ligne pleine de tirets doit
  // quand meme pouvoir dire combien de tours l'ont produite.
  turns: number;
  // Le modele du tour le plus recent sur ce moteur.
  model?: string | null;
} & { [K in UsageMetric]?: number };

export type SessionUsageTotals = Partial<Record<EngineId, SessionUsageTotal>>;

// Replie un tour rapporte dans les totaux courants par moteur.
//
// Trois regles portent l'honnetete de la fonctionnalite entiere. Les moteurs sont
// replies SEPAREMENT : claude rapporte des dollars et codex des jetons, un seau
// commun melangerait des unites incompatibles ou perdrait la moitie des donnees.
// Une mesure absente reste absente : traiter `undefined` comme 0 pour que
// l'arithmetique tombe juste fabriquerait une mesure a partir d'un silence. Et
// chaque mesure obeit a USAGE_AGGREGATION — un champ qui porte deja le total de
// session est REMPLACE, pas ajoute, parce qu'additionner des cumuls est
// exactement la maniere de tripler un nombre reel.
export function foldUsage(prev: SessionUsageTotals, usage: LocalChatUsage): SessionUsageTotals {
  const before = prev[usage.engine];
  const next: SessionUsageTotal = { engine: usage.engine, turns: (before?.turns ?? 0) + 1 };
  const model = typeof usage.model === 'string' ? usage.model : before?.model;
  if (model !== undefined) next.model = model;
  for (const key of USAGE_METRICS) {
    const reported = usage[key];
    const carried = before?.[key];
    if (typeof reported !== 'number') {
      // Rien rapporte ce tour-ci — on garde ce que les tours precedents ont pose.
      if (carried !== undefined) next[key] = carried;
      continue;
    }
    next[key] = USAGE_AGGREGATION[key] === 'latest' ? reported : (carried ?? 0) + reported;
  }
  return { ...prev, [usage.engine]: next };
}
