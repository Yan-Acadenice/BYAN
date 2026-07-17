#!/usr/bin/env node
/**
 * PreToolUse hook — BYAN Strict Mode scope guard.
 *
 * When a strict session is engaged and the locked scope declares allowed
 * paths, deny Write/Edit calls that target a file outside those paths. This
 * keeps the agent inside the contract it locked : it cannot silently spread
 * changes across the repo under the cover of the locked task.
 *
 * Exempt paths (the strict bookkeeping, build output, git) are always
 * allowed. If enforce_paths is off or no allowed paths were declared, every
 * write is allowed.
 *
 * Non-blocking on parse error.
 */

const path = require('path');
const { loadConfig, loadState, isEngaged, projectRoot, readStdin, parseJson } =
  require('./lib/strict-runtime');

function toRelative(filePath, root) {
  if (!filePath) return '';
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const rel = path.relative(root, abs);
  return rel.split(path.sep).join('/');
}

function matchesPrefix(rel, prefix) {
  let p = String(prefix).trim();
  // Glob-tolerant: reduce a glob to the literal part before the first wildcard,
  // then prefix-match. So "_byan/**" and "src/**/*.test.js" match their subtree
  // instead of being compared as a literal string (which never matched, wrongly
  // denying every write under a globbed allowed path).
  const star = p.indexOf('*');

  // No wildcard: exact match or directory-prefix match.
  if (star === -1) {
    p = p.replace(/\/+$/, '');
    if (p === '') return true;
    return rel === p || rel.startsWith(p + '/');
  }

  // A wildcard whose preceding char is NOT "/" sits INSIDE a path segment
  // (e.g. ".claude/skills/byan-*/**"). The literal lead before it must match as
  // a raw prefix, with no "/" boundary forced after it - otherwise
  // ".claude/skills/byan-native-dev-story/..." is wrongly denied because it does
  // not start with ".claude/skills/byan-/".
  const midSegment = star > 0 && p[star - 1] !== '/';
  p = p.slice(0, star);
  if (p === '') return true; // bare "*" / "**" -> matches everything
  if (midSegment) return rel.startsWith(p);

  // Directory-boundary wildcard (e.g. "_byan/**"): reduce to the dir and match
  // exact-or-subtree so "_byan/**" matches "_byan/x" but not "_byanX".
  p = p.replace(/\/+$/, '');
  if (p === '') return true;
  return rel === p || rel.startsWith(p + '/');
}

// WI-6 — the Bash write-redirection leak.
//
// The Write/Edit deny is bypassable : `cat > src/x.js`, `echo >> a`, `tee f`,
// `cmd <<EOF > f` write files through Bash, which the tool-name check missed.
// bashWriteTargets extracts the file targets of write-redirections from a Bash
// command so the SAME allowed-paths rule applies. Deliberately conservative to
// avoid denying legit Bash : it skips fd-dups (`2>&1`, `>&2`), process
// substitution (`>(...)`), and the /dev/* sinks. It is not a hermetic sandbox
// (pipes, `python -c open()`, variables escape) — it closes the COMMON reflex
// leak, honestly bounded (see docs).
function bashWriteTargets(command) {
  const cmd = String(command || '');
  const out = [];
  // A redirection target only counts when it LOOKS like a file path : it contains
  // a "/" or a file extension. This is the false-positive kill switch : it drops
  // comparison / arithmetic / here-string operands (`[ 5 > 3 ]`, `(( a > 2 ))`,
  // `<<< "a > b"` -> "3", "2", "b") which are numbers or bare words, and drops an
  // unexpanded variable target (`> $F`) which we cannot resolve — denying it would
  // be a false positive on a possibly in-scope path. Honest ceiling : a bare
  // filename with no extension (`> outfile`) or a variable target is NOT caught.
  const consider = (t) => {
    if (!t) return;
    if (t.startsWith('$') || t.startsWith('&') || t.startsWith('-')) return; // variable / fd-dup / flag
    if (/^\/dev\//.test(t)) return; // /dev sinks
    const pathShaped = t.includes('/') || /\.[A-Za-z0-9]+$/.test(t);
    if (pathShaped) out.push(t);
  };
  // > , >> , &> , &>> , and fd-prefixed (2>) redirections. The lookahead (?![&(])
  // drops `>&1` (fd dup) and `>(` (process substitution).
  const redir = /(?:^|[\s;|&(])\d*(?:>>?|&>>?)\s*(?![&(])("?)([^\s"'`|;&<>()]+)\1/g;
  let m;
  while ((m = redir.exec(cmd)) !== null) consider(m[2]);
  // tee [flags] file...
  const tee = /\btee\b((?:\s+-\S+)*)\s+("?)([^\s"'`|;&<>()]+)\2/g;
  while ((m = tee.exec(cmd)) !== null) consider(m[3]);
  return out;
}

// Pure decision : returns { deny, reason }. Handles Write/Edit (file_path) and,
// since WI-6, Bash (write-redirection targets that land INSIDE the repo).
function decideScope({ state, config, toolName, filePath, command }) {
  if (!['Write', 'Edit', 'Bash'].includes(toolName)) return { deny: false };
  if (!isEngaged(state)) return { deny: false };

  const guard = (config && config.scope_guard) || {};
  if (!guard.enforce_paths) return { deny: false };

  const allowed = (state.scope_lock && state.scope_lock.allowed_paths) || [];
  if (!Array.isArray(allowed) || allowed.length === 0) return { deny: false };

  const root = projectRoot();
  const exempt = guard.exempt_globs || [];
  const base =
    (config && config.banners && config.banners.scope_deny) ||
    'Strict mode: this write targets a path outside the locked scope.';

  // Returns the offending rel path, or null when the target is allowed/exempt.
  const offending = (rawTarget, { repoOnly = false } = {}) => {
    const rel = toRelative(rawTarget, root);
    if (!rel) return null;
    // repoOnly (Bash): a target outside the repo (../, /tmp, absolute elsewhere)
    // is transient, not a repo change under cover of the locked task -> ignore.
    if (repoOnly && rel.startsWith('..')) return null;
    if (exempt.some((g) => matchesPrefix(rel, g))) return null;
    if (allowed.some((a) => matchesPrefix(rel, a))) return null;
    return rel;
  };

  const buildReason = (rel) =>
    `${base}\n` +
    `Target: ${rel}\n` +
    `Locked paths: ${allowed.join(', ')}\n` +
    `Either this file belongs to the scope (re-lock with byan_strict_lock_scope ` +
    `including the corrected paths) or it does not (do not write it).`;

  if (toolName === 'Write' || toolName === 'Edit') {
    const bad = offending(filePath);
    return bad ? { deny: true, reason: buildReason(bad) } : { deny: false };
  }

  // Bash : deny if any in-repo write-redirection target is out of scope.
  const targets = bashWriteTargets(command);
  for (const t of targets) {
    const bad = offending(t, { repoOnly: true });
    if (bad) return { deny: true, reason: buildReason(bad) };
  }
  return { deny: false };
}

function allow() {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

if (require.main === module) {
  (async () => {
    const state = loadState();
    if (!isEngaged(state)) {
      process.stdout.write(JSON.stringify(allow()));
      process.exit(0);
    }
    const config = loadConfig();
    const payload = parseJson(await readStdin());
    const toolName = payload.tool_name || payload.toolName || '';
    const input = payload.tool_input || payload.toolInput || {};
    const filePath = input.file_path || '';
    const command = input.command || '';

    const decision = decideScope({ state, config, toolName, filePath, command });
    if (!decision.deny) {
      process.stdout.write(JSON.stringify(allow()));
      process.exit(0);
    }
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: decision.reason,
        },
      })
    );
    process.exit(0);
  })();
}

module.exports = { decideScope, toRelative, matchesPrefix, bashWriteTargets };
