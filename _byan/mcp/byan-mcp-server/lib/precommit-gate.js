import { getStatus } from './strict-mode.js';

// BYAN Strict Mode pre-commit gate.
//
// The final, platform-agnostic net. Claude Code has in-session hooks; Codex
// and Copilot do not. This gate runs at commit time on every platform, so an
// agent that engaged strict mode but bailed on verification cannot land the
// commit.
//
// Decision :
//   - No strict session on disk           -> PASS (strict was not engaged).
//   - Session aborted (active === false)   -> PASS (deliberate, audited exit).
//   - Session engaged but not completed    -> BLOCK (you locked a scope and
//                                              never finished verifying it).
//   - Session completed but < min passes
//     or last verdict not "ok"             -> BLOCK (completion was not earned).
//   - Session completed correctly          -> PASS.
//
// Freshness is intentionally not enforced here : the in-session hook guards
// against token reuse within a turn; the commit gate only cares that the
// engaged session was completed correctly.

export function evaluateGate({ projectRoot } = {}) {
  const status = getStatus({ projectRoot });

  if (!status || status.active === false && !status.scope_locked && !status.completed) {
    // getStatus returns active:false with no scope when there is no state file.
    return { pass: true, reason: 'no strict session — strict mode not engaged' };
  }

  // Aborted session : active flipped to false but a scope was locked.
  if (status.active === false) {
    return { pass: true, reason: 'strict session aborted (audited) — allowed' };
  }

  if (!status.scope_locked) {
    return { pass: true, reason: 'no scope locked — strict mode not engaged' };
  }

  if (!status.completed) {
    return {
      pass: false,
      reason:
        `Strict session ${status.strict_session_id} is engaged but not completed ` +
        `(${status.pass_count}/${status.min_passes} self-verify passes). ` +
        `Run byan_strict_self_verify until satisfied, then byan_strict_complete. ` +
        `To exit strict mode deliberately, call byan_strict_abort.`,
    };
  }

  if (status.pass_count < status.min_passes) {
    return {
      pass: false,
      reason:
        `Strict session completed with only ${status.pass_count}/${status.min_passes} ` +
        `self-verify passes. This should not happen — investigate the audit log.`,
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
    reason: `strict session completed: ${status.pass_count} passes, audit token ${status.audit_token}`,
  };
}
