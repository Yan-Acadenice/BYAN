// Slash commands — the shared primitive behind every chat input.
//
// WHY here and not in a page: Chat.tsx grew its own inline SLASH_COMMANDS list,
// its own prefix filter and its own dispatch chain. LocalChatView needs the same
// thing, so the logic is extracted ONCE, pure, and unit-tested. The page keeps
// only the side effects (open a modal, set a default, send a message).
//
// This module is deliberately total and side-effect free: no React, no window,
// no I/O. Everything stateful lives in useSlashPalette; everything visual lives
// in SlashCommandMenu.

import type { EngineId } from '../../shared/engine-options';

// A command the input can offer. `engines` ABSENT means "available everywhere";
// present means the command only exists for those engines (see /effort, which
// claude has no flag for in --print mode).
export interface SlashCommandDef {
  cmd: string;
  description: string;
  argHint?: string;
  engines?: EngineId[];
}

// User-facing copy, French like the existing chat toasts.
export const LOCAL_SLASH_COMMANDS: SlashCommandDef[] = [
  { cmd: '/model', description: 'Choisir le modèle de la session', argHint: '<nom>' },
  // codex-only: claude exposes no reasoning-effort flag in --print mode, so
  // offering /effort there would advertise something the bridge must refuse.
  { cmd: '/effort', description: 'Régler l\'effort de raisonnement', argHint: '<niveau>', engines: ['codex'] },
  { cmd: '/engine', description: 'Choisir le moteur du prochain chat', argHint: 'claude|codex' },
  { cmd: '/agent', description: 'Choisir l\'agent BYAN', argHint: '<slug>' },
  { cmd: '/byan', description: 'Ouvrir le menu BYAN' },
  { cmd: '/mcp', description: 'Gérer les serveurs MCP' },
  { cmd: '/usage', description: 'Afficher la consommation de la session' },
  { cmd: '/new', description: 'Démarrer une nouvelle session' },
  { cmd: '/clear', description: 'Effacer la conversation affichée' },
  { cmd: '/help', description: 'Lister les commandes disponibles' },
];

export type SlashParseResult =
  | { kind: 'not-slash' }
  | { kind: 'command'; cmd: string; arg: string; def: SlashCommandDef }
  | { kind: 'unknown'; cmd: string };

// Resolution is engine-AGNOSTIC on purpose: '/effort high' typed on claude still
// parses as a known command, so the host can explain why it does not apply
// instead of pretending the command does not exist. Availability filtering is
// the menu's job (matchCommands) and the executor's job.
function findDef(token: string, commands: SlashCommandDef[]): SlashCommandDef | undefined {
  const low = token.toLowerCase();
  return commands.find((c) => c.cmd === low);
}

// The 'unknown' arm is the point of this function. Chat.tsx's dispatch chain
// tests a fixed series of literals and falls through on anything else, so '/foo'
// is SENT to the model as a plain message — the user sees their typo answered
// instead of corrected. Anything starting with '/' is therefore 'unknown' here,
// never 'not-slash', and the host is forced to handle it.
export function parseSlashInput(
  raw: string,
  commands: SlashCommandDef[] = LOCAL_SLASH_COMMANDS,
): SlashParseResult {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return { kind: 'not-slash' };

  const sep = trimmed.search(/\s/);
  const token = sep === -1 ? trimmed : trimmed.slice(0, sep);
  const arg = sep === -1 ? '' : trimmed.slice(sep).trim();

  const def = findDef(token, commands);
  if (!def) return { kind: 'unknown', cmd: token };

  return { kind: 'command', cmd: def.cmd, arg, def };
}

// An absent `engines` list means "every engine" — so a command only has to
// declare a restriction (like /effort being codex-only), never its ubiquity.
export function commandAvailableFor(def: SlashCommandDef, engine: EngineId): boolean {
  return !def.engines || def.engines.includes(engine);
}

// The menu's filter: which commands does this partial input offer?
//
// Matching is "the command starts with what was typed", which also closes the
// menu for free once a space is typed ('/model ' prefixes nothing) — the palette
// must not keep hovering while the user writes the argument.
export function matchCommands(
  input: string,
  opts: { engine: EngineId; commands?: SlashCommandDef[] },
): SlashCommandDef[] {
  const q = input.replace(/^\s+/, '').toLowerCase();
  if (!q.startsWith('/')) return [];

  const source = opts.commands ?? LOCAL_SLASH_COMMANDS;
  return source.filter((c) => commandAvailableFor(c, opts.engine) && c.cmd.startsWith(q));
}
