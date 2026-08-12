// Which agent slugs `claude --agent` will actually honour.
//
// WHY THIS FILE EXISTS. Two different agent namespaces live in a BYAN project
// and they do NOT overlap:
//   _byan/agent/      -> the BYAN platform agents: byan, analyst, architect, dev
//   .claude/agents/   -> what claude --agent accepts: bmad-byan, bmad-bmm-dev
// Measured on this repo: the intersection of the two sets is EMPTY. So a slug
// taken from the BYAN side is always wrong for the CLI.
//
// And the CLI does not complain. Measured 2026-07-27 against claude 2.1.220:
// `claude --agent byan` with no such agent exits 0, answers normally, and simply
// omits the agent — its own `init` event lists the real agents and the requested
// one is absent. An invalid slug is therefore a SILENT no-op, which is exactly
// how a broken /byan looked like a working one.
//
// Validating against the real list upstream is the only way to make that honest,
// since the failure leaves no trace at the CLI boundary.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The pure slug helpers live in shared/ so the renderer validates against the
// same rules; re-exported here for main-side callers.
export { resolveClaudeAgent, suggestClaudeAgents } from '../shared/agent-slugs';

// Agent definitions are one markdown file per agent; the slug is the basename.
function slugsIn(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.slice(0, -'.md'.length));
  } catch {
    return []; // absent directory is the normal case, not an error
  }
}

// Project agents first, then the user-level ones. Deduplicated with the project
// winning, mirroring how claude resolves a name defined in both places.
export function availableClaudeAgents(projectRoot?: string | null): string[] {
  const dirs: string[] = [];
  if (projectRoot && path.isAbsolute(projectRoot)) {
    dirs.push(path.join(projectRoot, '.claude', 'agents'));
  }
  dirs.push(path.join(os.homedir(), '.claude', 'agents'));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    for (const slug of slugsIn(dir)) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
  }
  return out.sort();
}


// La DEFINITION d'un agent, pas seulement son nom.
//
// POURQUOI. `claude --agent <slug>` charge le fichier lui-meme ; codex n'a pas
// de drapeau equivalent (mesure du jour, codex-cli 0.146.0). Pour que le choix
// d'agent marche aussi sur codex, il faut le CONTENU, qu'on met en tete du tour.
// Voir shared/agent-definition.ts pour la mise en forme et ses limites.
//
// Meme ordre de resolution que les noms : le projet d'abord, l'utilisateur
// ensuite — c'est ainsi que claude tranche un nom defini des deux cotes.
export function readClaudeAgentDefinition(
  slug: string,
  projectRoot?: string | null,
): string | null {
  // Le nom vient du renderer. Un nom qui contient un separateur ou des points
  // pourrait sortir du dossier des agents : on ferme cette porte ici, une fois.
  if (!/^[A-Za-z0-9._-]+$/.test(slug) || slug.includes('..')) return null;

  const dirs: string[] = [];
  if (projectRoot) dirs.push(path.join(projectRoot, '.claude', 'agents'));
  dirs.push(path.join(os.homedir(), '.claude', 'agents'));

  for (const dir of dirs) {
    try {
      return fs.readFileSync(path.join(dir, `${slug}.md`), 'utf8');
    } catch {
      // Absent ici, on essaie le suivant. Un agent introuvable partout rend null.
    }
  }
  return null;
}
