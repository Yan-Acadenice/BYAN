// L'historique des sessions locales — contrat + reducteur PUR.
//
// Ce fichier ne touche ni au disque ni a Electron : il decrit la forme d'un
// enregistrement et les transitions qui le font avancer. Le magasin
// (main/session-history-store.ts) fait les entrees/sorties ; le pont
// (main/ipc-handlers/local-chat.ts) branche les evenements. Separer les deux, ce
// qui coute une indirection, rend l'arithmetique du cout testable sans monter un
// systeme de fichiers ni un processus enfant.
//
// POURQUOI CETTE COUCHE EXISTE. Le chat local natif n'ecrivait rien : la liste de
// sessions rendait un moteur en litteral ('claude') et un compteur de messages en
// litteral (0). Une page Historique branchee la-dessus afficherait des chiffres
// inventes. Le travail n'est pas la page, c'est la mesure.

import type { EngineId, LocalChatUsage, ReasoningEffort } from './ipc-contract';
import { foldUsage, type SessionUsageTotal } from './session-usage';
import { turnCostFrom, type TurnCostKind } from './turn-cost';

// Version du format sur disque. Un enregistrement d'une autre version est saute a
// la lecture plutot que reinterprete au jugé.
export const SESSION_HISTORY_SCHEMA_VERSION = 1;

// Borne du contenu d'un message ecrit sur disque. On garde la trace de l'echange,
// on ne stocke pas un vidage sans limite : un tour qui recrache un fichier entier
// ferait un enregistrement de plusieurs mega-octets, relu a chaque ouverture de
// la page.
export const MESSAGE_CONTENT_CAP = 16_000;

export const MESSAGE_TRUNCATION_MARK = '\n[... tronque a l enregistrement]';

export type SessionHistoryRole = 'user' | 'assistant' | 'system';

export interface SessionHistoryMessage {
  role: SessionHistoryRole;
  content: string;
  at: string;
  // Pose seulement quand le contenu a ete coupe, pour que la vue puisse le dire
  // au lieu de laisser croire que le moteur s'est arrete la.
  truncated?: true;
}

export interface SessionHistoryTurn {
  // Rang du tour DANS SON MOTEUR, a partir de 1. C'est ce rang qui permet de
  // distinguer un premier tour (dont le cumul est le cout) d'un tour dont le
  // precedent manque (dont on ne sait rien).
  index: number;
  startedAt: string;
  endedAt: string;
  // Ce que le moteur a rapporte, tel quel. Absent quand il n'a rien rapporte.
  usage?: LocalChatUsage;
  // Le cout de CE tour. `kind` dit ce que le nombre vaut : 'turn' un vrai cout,
  // 'cumulative' un cumul de session qu'on n'a pas pu convertir, 'none' aucun
  // montant rapporte.
  costKind: TurnCostKind;
  costUsd?: number;
  // Le tour s'est-il termine sans erreur.
  ok: boolean;
  // Nombre d'etapes d'outil observees pendant le tour.
  steps: number;
}

export interface SessionHistoryCost {
  // 'measured' : un montant a ete rapporte. 'none' : le moteur n'en publie pas
  // (cas de codex, sur abonnement) — la vue affiche un tiret, pas 0.00.
  kind: 'measured' | 'none';
  usd: number | null;
}

export interface SessionHistoryRecord {
  schemaVersion: number;
  id: string;
  engine: EngineId;
  model: string | null;
  effort: ReasoningEffort | null;
  agent: string | null;
  cwd: string | null;
  startedAt: string;
  endedAt: string | null;
  // Messages utilisateur + assistant. Les messages systeme (erreurs) sont gardes
  // dans la transcription mais ne comptent pas : ce n'est pas un echange.
  messageCount: number;
  turns: SessionHistoryTurn[];
  messages: SessionHistoryMessage[];
  usage: SessionUsageTotal | null;
  cost: SessionHistoryCost;
  lastError: string | null;
}

// La forme que la liste affiche. Deliberement sans transcription ni tours : la
// page Historique charge N resumes, et embarquer chaque transcription y ferait
// transiter des mega-octets pour afficher quatre colonnes.
export interface SessionHistorySummary {
  id: string;
  engine: EngineId;
  model: string | null;
  agent: string | null;
  cwd: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  turnCount: number;
  cost: SessionHistoryCost;
  lastError: string | null;
}

export interface CreateRecordOpts {
  id: string;
  engine: EngineId;
  model?: string | null;
  effort?: ReasoningEffort | null;
  agent?: string | null;
  cwd?: string | null;
  at: string;
}

export function createRecord(opts: CreateRecordOpts): SessionHistoryRecord {
  return {
    schemaVersion: SESSION_HISTORY_SCHEMA_VERSION,
    id: opts.id,
    engine: opts.engine,
    model: opts.model ?? null,
    effort: opts.effort ?? null,
    agent: opts.agent ?? null,
    cwd: opts.cwd ?? null,
    startedAt: opts.at,
    endedAt: null,
    messageCount: 0,
    turns: [],
    messages: [],
    usage: null,
    // Une session qui n'a pas encore tourne n'a rien coute de connu. 'none' avec
    // usd null, pas 'measured' a 0 : le second affirmerait une mesure a zero.
    cost: { kind: 'none', usd: null },
    lastError: null,
  };
}

// Coupe un contenu trop long, en disant qu'il a ete coupe.
function capContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MESSAGE_CONTENT_CAP) return { content, truncated: false };
  return { content: content.slice(0, MESSAGE_CONTENT_CAP) + MESSAGE_TRUNCATION_MARK, truncated: true };
}

// Ajoute un message a la transcription. Les fonctions de ce module rendent un
// NOUVEL enregistrement : le magasin ecrit ce qu'on lui rend, et une mutation en
// place rendrait un enregistrement deja ecrit different de ce qui est sur disque.
export function appendMessage(
  record: SessionHistoryRecord,
  role: SessionHistoryRole,
  content: string,
  at: string
): SessionHistoryRecord {
  const capped = capContent(content);
  const message: SessionHistoryMessage = { role, content: capped.content, at };
  if (capped.truncated) message.truncated = true;
  return {
    ...record,
    messages: [...record.messages, message],
    // Un message systeme est une erreur affichee, pas un tour d'echange : le
    // compter gonflerait le compteur de la page a chaque incident.
    messageCount: role === 'system' ? record.messageCount : record.messageCount + 1,
  };
}

// Cloture un tour reussi. `usage` est ce que le moteur a rapporte, ou undefined
// quand il n'a rien rapporte — auquel cas le tour est enregistre quand meme (il a
// eu lieu) avec un cout 'none'.
export function completeTurn(
  record: SessionHistoryRecord,
  input: { usage?: LocalChatUsage; startedAt: string; endedAt: string; steps?: number }
): SessionHistoryRecord {
  const usage = input.usage;
  const engine = usage?.engine ?? record.engine;

  // Le rang se compte sur les tours DEJA enregistres pour ce moteur. Un
  // enregistrement ne porte qu'un moteur, mais on compte quand meme par moteur :
  // c'est la meme regle qu'a l'ecran, et elle reste juste si un jour un
  // enregistrement en portait deux.
  const priorSameEngine = record.turns.filter((t) => (t.usage?.engine ?? record.engine) === engine);
  const index = priorSameEngine.length + 1;

  // Le dernier tour du meme moteur qui portait un cumul — la base de la
  // soustraction. Les tours sans montant ne peuvent pas servir de base.
  let previous: { rank: number; total: number } | null = null;
  for (let i = priorSameEngine.length - 1; i >= 0; i -= 1) {
    const candidate = priorSameEngine[i];
    const total = candidate.usage?.costUsd;
    if (typeof total === 'number') {
      previous = { rank: candidate.index, total };
      break;
    }
  }

  const cost = usage ? turnCostFrom(usage, index, previous) : { kind: 'none' as TurnCostKind, usd: undefined };

  const turn: SessionHistoryTurn = {
    index,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    costKind: cost.kind,
    ok: true,
    steps: input.steps ?? 0,
  };
  if (usage) turn.usage = usage;
  if (typeof cost.usd === 'number') turn.costUsd = cost.usd;

  const folded = usage ? foldUsage(record.usage ? { [record.usage.engine]: record.usage } : {}, usage)[usage.engine] ?? null : record.usage;

  return {
    ...record,
    turns: [...record.turns, turn],
    usage: folded,
    cost: sessionCost(folded),
  };
}

// Enregistre un tour qui a echoue. Le tour a eu lieu — le masquer ferait mentir le
// compteur de tours et la duree de la session.
export function failTurn(
  record: SessionHistoryRecord,
  input: { error: string; startedAt: string; endedAt: string; steps?: number }
): SessionHistoryRecord {
  const index = record.turns.length + 1;
  const turn: SessionHistoryTurn = {
    index,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    costKind: 'none',
    ok: false,
    steps: input.steps ?? 0,
  };
  return { ...record, turns: [...record.turns, turn], lastError: input.error };
}

export function closeRecord(record: SessionHistoryRecord, at: string): SessionHistoryRecord {
  // Une session deja close garde sa date de fin : une fermeture rejouee (arret
  // explicite puis balayage a la sortie de l'app) ne doit pas la repousser.
  if (record.endedAt !== null) return record;
  return { ...record, endedAt: at };
}

// Le cout de la SESSION depuis son total replie. `costUsd` y est deja agrege en
// 'latest' — c'est-a-dire le dernier cumul rapporte, qui EST le total. On ne
// re-additionne rien ici.
export function sessionCost(total: SessionUsageTotal | null): SessionHistoryCost {
  const usd = total?.costUsd;
  if (typeof usd !== 'number') return { kind: 'none', usd: null };
  return { kind: 'measured', usd };
}

export function toSummary(record: SessionHistoryRecord): SessionHistorySummary {
  return {
    id: record.id,
    engine: record.engine,
    model: record.model,
    agent: record.agent,
    cwd: record.cwd,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    messageCount: record.messageCount,
    turnCount: record.turns.length,
    cost: record.cost,
    lastError: record.lastError,
  };
}

// Valide la forme d'un objet relu du disque. Un fichier ecrit par une autre
// version, ou corrompu, doit etre saute — pas reinterprete au jugé, ce qui
// produirait des lignes a `undefined` dans le tableau.
export function isSessionHistoryRecord(value: unknown): value is SessionHistoryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<SessionHistoryRecord>;
  return (
    r.schemaVersion === SESSION_HISTORY_SCHEMA_VERSION &&
    typeof r.id === 'string' &&
    (r.engine === 'claude' || r.engine === 'codex') &&
    typeof r.startedAt === 'string' &&
    typeof r.messageCount === 'number' &&
    Array.isArray(r.turns) &&
    Array.isArray(r.messages)
  );
}
