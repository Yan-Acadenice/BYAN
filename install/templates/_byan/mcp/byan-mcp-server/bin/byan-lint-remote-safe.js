#!/usr/bin/env node
/**
 * Lint the remote-safe MCP tool allowlist.
 *
 * A tool exposed on the remote Org Connector (REMOTE_SAFE_TOOLS in server.js)
 * MUST be a read-only, byan_web-backed HTTP tool with NO local-filesystem
 * dependency and NO write/import side effect. Anything matching a stateful /
 * fs-local / write / import family would, on a shared multi-tenant connector
 * host, read or mutate the wrong disk / cross-tenant state. This check fails the
 * build if such a tool ever leaks into the allowlist.
 *
 * Importing server.js is side-effect-free here: the stdio connect is guarded by
 * an entrypoint check, so this lint never grabs stdio.
 */
import { REMOTE_SAFE_TOOLS } from '../server.js';

// Shape of an acceptable remote-safe tool: ping, the user-scoped project list,
// any byan_api_* READ tool (writes/imports are filtered out below), or the styx
// discovery-index read tools (atlas/get -> GET /api/styx/*, user-scoped server
// side via the per-request token, no local-fs dependency).
const ALLOWED_SHAPE = /^byan_(ping|list_projects|api_[a-z_]+|styx_(atlas|get))$/;

// Families that are fs-local / stateful / single-tenant by construction.
const FORBIDDEN_FAMILY =
  /^byan_(fd_|strict_|kanban_|standup_|review_|soul_|suitability_|insight_|outcome_|elo_|fc_|leantime_|dispatch|import|update_)/;

// byan_api_* tools that mutate or take a local path — excluded from the
// read-only MVP surface even though they are byan_web-backed.
const FORBIDDEN_API_WRITE =
  /^byan_api_(.*_(create|run|send)|custom_agents_clone_system|import_.*)$/;

const violations = [];
for (const name of REMOTE_SAFE_TOOLS) {
  if (!ALLOWED_SHAPE.test(name)) {
    violations.push(`${name}: not a read-only byan_web tool shape (ping / list_projects / api_*)`);
  }
  if (FORBIDDEN_FAMILY.test(name)) {
    violations.push(`${name}: fs-local / stateful / cross-backend family is never remote-safe`);
  }
  if (FORBIDDEN_API_WRITE.test(name)) {
    violations.push(`${name}: write/import tool, excluded from the read-only MVP connector surface`);
  }
}

if (violations.length) {
  console.error('[byan-lint-remote-safe] FAIL - the remote-safe allowlist contains unsafe tools:');
  for (const v of violations) console.error('  - ' + v);
  console.error(
    '\nRemote-safe tools must be read-only byan_web HTTP tools with no local-fs dependency.\n' +
      'Remove the offending entry from REMOTE_SAFE_TOOLS in server.js, or it would read/mutate\n' +
      'the shared connector host on a multi-tenant deployment.'
  );
  process.exit(1);
}

console.log(
  `[byan-lint-remote-safe] OK - ${REMOTE_SAFE_TOOLS.size} remote-safe tools, all read-only byan_web, no fs-local leak`
);
