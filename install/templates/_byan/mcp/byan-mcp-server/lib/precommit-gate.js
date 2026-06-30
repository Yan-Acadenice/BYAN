import fs from 'node:fs';
import path from 'node:path';
import { getStatus, MIN_PASSES } from './strict-mode.js';
import { fetchSession, syncEnabled } from './strict-sync.js';

// F2 (additive): the completeness-evidence gate at commit time. Reads the
// completeness ledger written by strict complete(). It only ever BLOCKS when
// delivery-default.json completenessGate.armed === true (default false). With
// the gate disarmed this is a no-op and the gate decision is exactly as before.
const DELIVERY_CONFIG_REL = path.join('_byan', '_config', 'delivery-default.json');
const COMPLETENESS_LEDGER_REL = path.join('_byan-output', 'completeness-ledger.jsonl');

function completenessGateArmed(projectRoot) {
  try {
    const p = path.join(projectRoot || process.cwd(), DELIVERY_CONFIG_REL);
    if (!fs.existsSync(p)) return false;
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    return !!(cfg && cfg.completenessGate && cfg.completenessGate.armed === true);
  } catch {
    return false; // A broken/absent config never arms the gate.
  }
}

// Last completeness-ledger entry for the given scope_hash, or null. Best-effort.
function lastCompletenessEntry(projectRoot, scopeHash) {
  try {
    const p = path.join(projectRoot || process.cwd(), COMPLETENESS_LEDGER_REL);
    if (!fs.existsSync(p)) return null;
    const lines = fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (!scopeHash || e.scope_hash === scopeHash) return e;
      } catch {
        // skip a malformed line
      }
    }
  } catch {
    // unreadable ledger -> treat as no evidence record
  }
  return null;
}

// Pure overlay: given a base decision (PASS), apply the armed completeness gate.
// Returns the base decision untouched when disarmed or when the base already
// blocks; otherwise blocks when the completeness ledger shows missing criteria.
export function applyCompletenessGate(base, { armed, entry }) {
  if (!base.pass || !armed) return base;
  if (entry && Array.isArray(entry.missing) && entry.missing.length) {
    return {
      pass: false,
      reason:
        `Completeness gate ARMED: the completed strict session left ` +
        `${entry.missing.length} code-shaped criteria without evidence ` +
        `(${entry.missing.join('; ')}). Provide the artifacts before committing.`,
    };
  }
  return base;
}

// BYAN Strict Mode pre-commit gate.
//
// The final, platform-agnostic net. Claude Code has in-session hooks; Codex
// does not. This gate runs at commit time on every platform, so an
// agent that engaged strict mode but bailed on verification cannot land the
// commit.
//
// The byan_web API is the authority. At commit time the gate asks the API for
// the session record and judges that; the local .byan-strict/ mirror is the
// fallback only when the API is genuinely unreachable (so an offline machine
// is not hard-blocked, but online the server's word is final).
//
// Decision (same on either source) :
//   - No strict session                    -> PASS (strict was not engaged).
//   - Session aborted                       -> PASS (deliberate, audited exit).
//   - Session engaged but not completed     -> BLOCK.
//   - Completed but < min passes
//     or last verdict not "ok"              -> BLOCK (completion was not earned).
//   - Completed correctly                   -> PASS.

// Pure decision over a normalized status shape:
//   { hasSession, active, scopeLocked, completed, passCount, minPasses, passes:[{verdict}], auditToken, sessionId }
export function decide(status) {
  if (!status || !status.hasSession) {
    return { pass: true, reason: 'no strict session — strict mode not engaged' };
  }
  if (status.active === false && !status.completed) {
    return { pass: true, reason: 'strict session aborted (audited) — allowed' };
  }
  if (!status.scopeLocked) {
    return { pass: true, reason: 'no scope locked — strict mode not engaged' };
  }
  if (!status.completed) {
    return {
      pass: false,
      reason:
        `Strict session ${status.sessionId} is engaged but not completed ` +
        `(${status.passCount}/${status.minPasses} self-verify passes). ` +
        `Run byan_strict_self_verify until satisfied, then byan_strict_complete. ` +
        `To exit strict mode deliberately, call byan_strict_abort.`,
    };
  }
  if (status.passCount < status.minPasses) {
    return {
      pass: false,
      reason:
        `Strict session completed with only ${status.passCount}/${status.minPasses} ` +
        `self-verify passes. This should not happen — investigate the audit trail.`,
    };
  }
  const passes = status.passes || [];
  const last = passes[passes.length - 1];
  if (!last || last.verdict !== 'ok') {
    return {
      pass: false,
      reason:
        `Strict session completed but the last self-verify verdict was ` +
        `"${last ? last.verdict : 'none'}" (must be "ok").`,
    };
  }
  return {
    pass: true,
    reason: `strict session completed (${status.source}): ${status.passCount} passes, audit token ${status.auditToken}`,
  };
}

function normalizeLocal(local) {
  const noState =
    local.active === false && !local.scope_locked && !local.completed;
  return {
    source: 'local',
    hasSession: !noState,
    active: local.active,
    scopeLocked: Boolean(local.scope_locked),
    completed: Boolean(local.completed),
    passCount: local.pass_count || 0,
    minPasses: local.min_passes || MIN_PASSES,
    passes: local.passes || [],
    auditToken: local.audit_token || null,
    sessionId: local.strict_session_id || null,
  };
}

function normalizeApi(api) {
  const passes = (api.passes || []).map((p) => ({ verdict: p.verdict }));
  return {
    source: 'api',
    hasSession: true,
    active: api.active !== false && !api.aborted && !api.completed,
    scopeLocked: true,
    completed: Boolean(api.completed),
    passCount: passes.length,
    minPasses: MIN_PASSES,
    passes,
    auditToken: api.audit_token || null,
    sessionId: api.id || null,
  };
}

export async function evaluateGate({ projectRoot, fetchImpl } = {}) {
  const local = getStatus({ projectRoot });
  const normalizedLocal = normalizeLocal(local);

  let base;
  // Consult the authority when there is a session to check and a token is set.
  if (normalizedLocal.sessionId && syncEnabled()) {
    const remote = await fetchSession(
      { sessionId: normalizedLocal.sessionId },
      fetchImpl ? { fetchImpl } : {}
    );
    if (remote.ok && remote.data) {
      base = decide(normalizeApi(remote.data));
    }
    // API unreachable / not found -> fall back to local mirror.
  }
  if (!base) base = decide(normalizedLocal);

  // F2 overlay: disarmed by default -> returns `base` unchanged.
  const armed = completenessGateArmed(projectRoot);
  if (!armed) return base;
  const entry = lastCompletenessEntry(projectRoot, local.scope_hash);
  return applyCompletenessGate(base, { armed, entry });
}
