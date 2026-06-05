// Model-suitability ledger — persistence + MCP-facing surface (F2).
//
// The pure math lives in suitability.js (no I/O). This module is the ONLY place
// that writes the ledger to disk, which is what makes the sandbox/state-coupling
// rule hold: a .claude/workflows/*.js script cannot import this file (the sandbox
// forbids it) and therefore cannot write ledger state. State changes flow only
// through the MCP tools (byan_suitability_record / _report), which call into
// here. The workflow feeds the tool; the tool owns the write.
//
// Best-effort contract (mirrors strict-sync.js): record() NEVER throws. Bad
// input or a failed write degrades to { recorded: false, reason } and leaves the
// on-disk ledger untouched. A telemetry write must never block or corrupt the
// real work — losing one outcome is acceptable; crashing the caller is not.

import fs from 'node:fs';
import path from 'node:path';
import { recordOutcome as pureRecord, rating, report } from './suitability.js';

export function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// The ledger lives beside the FD state, under the gitignored _byan-output/.
export function ledgerPath(projectRoot) {
  return path.join(resolveRoot(projectRoot), '_byan-output', 'suitability-ledger.json');
}

// readLedger never throws: a missing, corrupt, or non-object file reads as {}.
// A consumer should always get a usable ledger, even degraded to empty.
export function readLedger({ projectRoot, io = fs } = {}) {
  const p = ledgerPath(projectRoot);
  try {
    if (!io.existsSync(p)) return {};
    const parsed = JSON.parse(io.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLedger(ledger, { projectRoot, io = fs } = {}) {
  const p = ledgerPath(projectRoot);
  io.mkdirSync(path.dirname(p), { recursive: true });
  // Atomic write: stage into a temp file ADJACENT to the target (same directory,
  // hence same filesystem, so the rename is atomic and EXDEV-free), then rename
  // over the target. A partial or failed write leaves the existing ledger
  // byte-identical. The "untouched on failure" guarantee is then literally true,
  // not merely tolerated downstream by readLedger.
  const tmp = `${p}.tmp`;
  try {
    io.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
    io.renameSync(tmp, p);
  } catch (err) {
    // Best-effort cleanup so a failed write leaves no orphan staged file behind.
    try {
      io.unlinkSync(tmp);
    } catch {
      void 0; // nothing was staged, or unlink is unsupported — nothing to clean
    }
    throw err;
  }
  return p;
}

// record one adequacy outcome. Returns { recorded, reason, rating, source }.
// recorded:false with reason 'invalid_input' (bad args) or 'persist_failed'
// (write threw). On a persist failure the rating reflects the PRE-write ledger,
// so the caller never sees a phantom update. Never throws.
export function record({ model, leafId, success, source, projectRoot, io = fs } = {}) {
  const before = readLedger({ projectRoot, io });

  let after;
  try {
    after = pureRecord(before, { model, leafId, success });
  } catch (err) {
    return { recorded: false, reason: 'invalid_input', error: err.message, source: source || null };
  }

  let recorded = true;
  let reason = null;
  try {
    writeLedger(after, { projectRoot, io });
  } catch (err) {
    recorded = false;
    reason = 'persist_failed';
    void err; // swallowed by contract — the outcome is lost, the caller is safe
  }

  return {
    recorded,
    reason,
    rating: rating(recorded ? after : before, { model, leafId }),
    source: source || null,
  };
}

// reportLedger -> advisory ratings (most-actionable first), each carrying the
// credible lower bound and n. Optional model filter. Read-only.
export function reportLedger({ model, projectRoot, io = fs } = {}) {
  const rows = report(readLedger({ projectRoot, io }));
  return model ? rows.filter((r) => r.model === model) : rows;
}
