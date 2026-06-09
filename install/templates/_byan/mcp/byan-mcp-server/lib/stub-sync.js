// Stub path normalizer — keep tracked agent stubs free of stale _bmad / @bmad
// PATH references.
//
// The installer generated platform stubs (.codex/prompts, .github/agents,
// .claude/skills) over many versions. Older generators emitted the legacy path
// layout (`_bmad/*/agents/X.md`, `@bmad/bmm/agents/X.md`,
// `@bmad-output/bmb-creations/X/X.md`); the current generator emits the `_byan/`
// new layout. The committed corpus therefore carries a mix of stale path forms,
// while the source agent files are clean. This module normalizes those stale
// PATH tokens to the `_byan/` canonical form, in place, touching nothing else.
//
// Two tokens look similar but are NOT paths and must survive untouched:
//   - `@bmad-<word>`  : the agent/workflow INVOCATION syntax (`@bmad-bmm-create-prd`,
//                       `@bmad-party-mode`). A command, not a file path.
//   - `_bmad-output/` : the accepted output-artifact directory (planning/
//                       implementation artifacts), documented in CLAUDE.md.
// Both are distinguished structurally: a path token is `@bmad/` or `_bmad/`
// (immediate slash); the survivors are `@bmad-` / `_bmad-` (immediate hyphen).
// The one exception is `[@_]bmad-output/bmb-creations/<name>/<name>.md`, which is
// a stale AGENT-LOAD path (the agent now lives at `_byan/agent/<name>/`), so that
// specific sub-form IS rewritten.
//
// Design mirrors template-sync.js: the risky half (the rewrite rules) is pure and
// exhaustively unit-tested; the I/O half takes an injected `io` so tests pin
// behaviour without touching the real filesystem. The tool only ever edits stale
// path tokens — it never regenerates or overwrites a stub wholesale, so the 6
// github full-copies and the 12 hand-authored rich skills keep their content.

import fs from 'node:fs';
import path from 'node:path';

// Tracked stub directories (root-relative POSIX). Each is scanned (its .md files)
// both at root and under its install/templates/ twin. `.codex` is taken whole so
// the Codex global context file (.codex/instructions.md) is normalized alongside
// the per-agent .codex/prompts/ stubs.
export const STUB_DIRS = ['.codex', '.github/agents', '.claude/skills'];
export const TEMPLATE_PREFIX = 'install/templates';

// Canonical new-layout reference for an agent name.
function agentRef(name) {
  return `_byan/agent/${name}/${name}.md`;
}

// Ordered rewrite rules. Order matters: the specific agent-load forms run before
// the generic prefix swaps, so an agent path becomes the new layout
// (`_byan/agent/X/X.md`) rather than the legacy one (`_byan/*/agents/X.md`).
const RULES = [
  // bmb-creations agent load -> new-layout agent ref. Matches both @bmad-output
  // and _bmad-output ONLY when followed by /bmb-creations/<dir>/<name>.md, so a
  // plain _bmad-output/ artifact path is left alone. Keyed on the .md FILENAME
  // (not requiring dir == filename) so it covers every form findStaleRefs flags,
  // keeping --fix and --check in lockstep (no flag-but-cannot-fix gate trap).
  [/[@_]bmad-output\/bmb-creations\/[a-z0-9-]+\/([a-z0-9-]+)\.md/gi, (_m, n) => agentRef(n)],
  // agent path, flat or nested: (@bmad|_bmad)/(*|module)/agents/<name>(/<name>)?.md
  [/(?:@bmad|_bmad)\/(?:\*|[a-z0-9_-]+)\/agents\/([a-z0-9-]+)(?:\/[a-z0-9-]+)?\.md/gi, (_m, n) => agentRef(n)],
  // generic _bmad/ path prefix. Does not touch _bmad-output (that is _bmad- then
  // a hyphen, never _bmad followed by a slash).
  [/_bmad\//g, '_byan/'],
  // generic @bmad/ path prefix. Does not touch @bmad- invocation syntax.
  [/@bmad\//g, '_byan/'],
];

// Pure: rewrite stale path tokens. Returns { text, changed }.
export function normalizeText(text) {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return { text: out, changed: out !== text };
}

// Pure: the stale path refs a clean file must NOT contain. A path token
// (`@bmad/` or `_bmad/`) or a bmb-creations agent load. Invocation `@bmad-` and
// plain `_bmad-output/` artifacts are excluded by construction.
// The generic arm uses [^...]* (zero-or-more) so a bare `@bmad/` or `_bmad/`
// prefix is flagged even when the next char is an excluded terminator (space,
// paren, quote, backtick) — rule 3/4 rewrite the prefix regardless, so --check
// must flag it regardless too.
const STALE_RE = /(?:[@_]bmad-output\/bmb-creations\/[a-z0-9-]+\/[a-z0-9-]+\.md|(?:@bmad|_bmad)\/[^\s)`'"]*)/gi;
export function findStaleRefs(text) {
  const m = text.match(STALE_RE);
  return m ? [...new Set(m)] : [];
}

// Recursively list root-relative POSIX paths of every .md file under dir. Returns
// [] if dir does not exist (an installed user without these dirs is not an error).
export function walkRelMd(dir, { io = fs, base = dir } = {}) {
  let entries;
  try {
    entries = io.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkRelMd(full, { io, base }));
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

// Every stub .md file (root-relative POSIX), root dirs + their template twins.
export function listStubFiles({ rootDir, io = fs } = {}) {
  const files = [];
  for (const d of STUB_DIRS) {
    files.push(...walkRelMd(path.join(rootDir, d), { io, base: rootDir }));
    files.push(...walkRelMd(path.join(rootDir, TEMPLATE_PREFIX, d), { io, base: rootDir }));
  }
  return files;
}

// Plan: which tracked stub files would change under normalization.
export function planFix({ rootDir, io = fs } = {}) {
  const files = listStubFiles({ rootDir, io });
  const toFix = [];
  for (const rel of files) {
    const { changed } = normalizeText(io.readFileSync(path.join(rootDir, rel), 'utf8'));
    if (changed) toFix.push(rel);
  }
  return { toFix, scanned: files.length };
}

// Apply: normalize every file that needs it. Each write is atomic (stage adjacent
// tmp, rename over the target) so a crash never leaves a half-written stub.
export function applyFix({ rootDir, io = fs } = {}) {
  const { toFix, scanned } = planFix({ rootDir, io });
  for (const rel of toFix) {
    const dest = path.join(rootDir, rel);
    const { text } = normalizeText(io.readFileSync(dest, 'utf8'));
    const tmp = `${dest}.tmp`;
    try {
      io.writeFileSync(tmp, text);
      io.chmodSync(tmp, io.statSync(dest).mode & 0o777);
      io.renameSync(tmp, dest);
    } catch (err) {
      try {
        io.unlinkSync(tmp);
      } catch {
        void 0;
      }
      throw err;
    }
  }
  return { fixed: toFix, scanned };
}

// Check: the drift verdict for --check. ok=true when no stale ref remains.
export function check({ rootDir, io = fs } = {}) {
  const files = listStubFiles({ rootDir, io });
  const stale = [];
  for (const rel of files) {
    const refs = findStaleRefs(io.readFileSync(path.join(rootDir, rel), 'utf8'));
    if (refs.length) stale.push({ file: rel, refs });
  }
  return { stale, ok: stale.length === 0, scanned: files.length };
}
