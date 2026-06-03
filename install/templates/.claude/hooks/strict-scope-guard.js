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

// Pure decision : returns { deny, reason }.
function decideScope({ state, config, toolName, filePath }) {
  if (!['Write', 'Edit'].includes(toolName)) return { deny: false };
  if (!isEngaged(state)) return { deny: false };

  const guard = (config && config.scope_guard) || {};
  if (!guard.enforce_paths) return { deny: false };

  const allowed = (state.scope_lock && state.scope_lock.allowed_paths) || [];
  if (!Array.isArray(allowed) || allowed.length === 0) return { deny: false };

  const root = projectRoot();
  const rel = toRelative(filePath, root);
  if (!rel) return { deny: false };

  const exempt = guard.exempt_globs || [];
  if (exempt.some((g) => matchesPrefix(rel, g))) return { deny: false };

  if (allowed.some((a) => matchesPrefix(rel, a))) return { deny: false };

  const base =
    (config && config.banners && config.banners.scope_deny) ||
    'Strict mode: this write targets a path outside the locked scope.';
  const reason =
    `${base}\n` +
    `Target: ${rel}\n` +
    `Locked paths: ${allowed.join(', ')}\n` +
    `Either this file belongs to the scope (re-lock with byan_strict_lock_scope ` +
    `including the corrected paths) or it does not (do not write it).`;

  return { deny: true, reason };
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

    const decision = decideScope({ state, config, toolName, filePath });
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

module.exports = { decideScope, toRelative, matchesPrefix };
