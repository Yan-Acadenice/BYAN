// session-facts — the words the chat surface uses to describe a local session.
//
// WHY a module of its own, pure, with no React and no window: these sentences
// ARE the substance of the two temporalities (handoff lot 1.2). A header that
// only shows chips cannot say "this setting is chosen but the conversation in
// front of you is not running it" — and an amber line that does not name BOTH
// sides is a warning colour with no information in it. Keeping the wording pure
// makes it readable, reusable by the mode switcher, and testable without
// mounting a chat.
//
// Tone: French, tutoiement, no emoji (mantras IA-23 / IA-26).

import type { EngineId } from '../../../shared/engine-options';

// Short display for a directory path (last segment, or the whole thing if short).
export function folderLabel(dir: string): string {
  const parts = dir.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || dir;
}

// French plural mark. Kept here so a count and its noun cannot drift apart in
// one sentence and agree in the next.
export function pluralS(n: number): string {
  return n > 1 ? 's' : '';
}

// How long the session has been open. Coarse ON PURPOSE: a second-by-second
// counter on an identity line reads as a stopwatch on something that is not a
// race. The turn already has its own precise counter (ActivityLine).
export function openForLabel(seconds: number): string {
  if (seconds < 60) return 'ouverte depuis moins d\'une minute';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `ouverte depuis ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `ouverte depuis ${hours} h`
    : `ouverte depuis ${hours} h ${rest} min`;
}

// What the session that is ACTUALLY running was started with.
export interface LiveSessionFacts {
  engine: EngineId;
  // null = the CLI's own default was used, and its name is not something the app
  // can know. That is a named state, not a missing one.
  model: string | null;
  agent: string | null;
  // The folder main resolved, which can differ from the one that was asked for.
  folder: string | null;
}

// What the NEXT session will be started with. A null field means "no explicit
// choice" — the CLI decides — which is never reported as a divergence: the user
// did not choose anything for it to diverge from.
export interface NextStartFacts {
  engine: EngineId;
  model: string | null;
  agent: string | null;
  folder: string | null;
}

// One sentence per setting that is chosen but not in force. Empty when the
// selection and the live session already agree — an empty list is what makes the
// amber line disappear, so silence here means "nothing to say", never "unknown".
export function divergenceLines(live: LiveSessionFacts, next: NextStartFacts): string[] {
  const lines: string[] = [];

  // The engine is never unset, so it is always comparable.
  if (next.engine !== live.engine) {
    lines.push(
      `Le moteur ${next.engine} est choisi. Il s'appliquera au prochain démarrage `
      + `— la conversation en cours tourne toujours sur ${live.engine}.`,
    );
  }

  if (next.model && next.model !== live.model) {
    const running = live.model ?? 'le modèle par défaut du CLI';
    lines.push(
      `Le modèle ${next.model} est choisi. Il s'appliquera au prochain démarrage `
      + `— la conversation en cours tourne sur ${running}.`,
    );
  }

  if (next.agent && next.agent !== live.agent) {
    const running = live.agent ? `avec l'agent ${live.agent}` : 'sans agent';
    lines.push(
      `L'agent ${next.agent} est choisi. Il s'appliquera au prochain démarrage `
      + `— la conversation en cours tourne ${running}.`,
    );
  }

  // Only comparable when BOTH sides are known: an unresolved live folder would
  // otherwise produce "le dossier X est choisi — la conversation travaille dans
  // null", which invents a fact to fill a hole.
  if (next.folder && live.folder && next.folder !== live.folder) {
    lines.push(
      `Le dossier ${folderLabel(next.folder)} est choisi. Il s'appliquera au prochain démarrage `
      + `— la conversation en cours travaille dans ${folderLabel(live.folder)}.`,
    );
  }

  return lines;
}
