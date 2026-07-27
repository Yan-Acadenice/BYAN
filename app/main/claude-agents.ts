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

