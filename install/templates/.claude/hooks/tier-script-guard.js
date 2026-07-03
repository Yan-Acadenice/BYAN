#!/usr/bin/env node
// PreToolUse hook — BYAN tier gate on the Workflow tool.
//
// The Workflow runtime executes every agent() leaf on the session model unless
// the script pins opts.model, and a script cannot import native-tiers at
// runtime (sandbox). The repo linter only sees committed .claude/workflows/
// files — an AD-HOC script written inline crosses exactly one chokepoint
// before it runs: this hook. It analyzes the script text with the same source
// of truth as the linter (lib/tier-script.js -> native-tiers.js) and:
//
//   - DENIES ONCE when exploration/mech- leaves have no model tier and no
//     acknowledgment marker, with the exact leaf list to fix. It never
//     rewrites the script (a wrong auto-stamp would be the STRICT-2 No
//     Downgrade regression the doctrine forbids).
//   - allows an IDENTICAL resubmission after a deny (forces a decision,
//     never traps the turn) — the deny memory lives in .byan-tier/ (sidecar,
//     gitignored) keyed by script hash.
//   - allows registry (name-only) invocations: those resolve to committed
//     scripts the pre-commit linter already owns.
//   - logs EVERY decision with a per-model histogram to
//     _byan-output/tier-ledger.jsonl — the measurement basis for real token
//     gains (no replay theatre).
//
// Escape hatch: `touch .byan-tier/off` disables gating (still ledger-logged as
// escape-hatch, so misses stay auditable). Non-blocking on any internal error.
//
// CJS shell + ESM lib via dynamic import() (the leantime-fd-sync bridge). The
// lib resolves relative to THIS file so tests can pass a bare tmp root for
// sidecar/ledger state without needing the lib copied there.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LIB_PATH = path.resolve(__dirname, '../../_byan/mcp/byan-mcp-server/lib/tier-script.js');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function allow() {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function sidecarPath(root) {
  return path.join(root, '.byan-tier', 'last-deny.json');
}

function readPriorDenyHash(root) {
  try {
    return JSON.parse(fs.readFileSync(sidecarPath(root), 'utf8')).hash || null;
  } catch (_e) {
    return null;
  }
}

function writePriorDenyHash(root, hash) {
  try {
    fs.mkdirSync(path.dirname(sidecarPath(root)), { recursive: true });
    fs.writeFileSync(sidecarPath(root), JSON.stringify({ hash }));
  } catch (_e) {
    // best-effort: losing the deny memory only means one extra deny, never a trap
  }
}

function clearPriorDeny(root) {
  try {
    fs.unlinkSync(sidecarPath(root));
  } catch (_e) {
    // already absent
  }
}

function ledgerLog(root, entry) {
  try {
    const dir = path.join(root, '_byan-output');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'tier-ledger.jsonl'), JSON.stringify(entry) + '\n');
  } catch (_e) {
    // the ledger is observability, never a blocker
  }
}

// Per-model histogram: pinned tiers by value; 'inherit' = deep labelled leaves
// plus unlabelled agent() calls (both run on the session model).
function modelHistogram(analysis) {
  const h = { haiku: 0, sonnet: 0, inherit: 0 };
  for (const l of analysis.leaves) {
    if (l.model === 'haiku') h.haiku += 1;
    else if (l.model === 'sonnet') h.sonnet += 1;
    else h.inherit += 1;
  }
  h.inherit += Math.max(0, analysis.agentCalls - analysis.leaves.length);
  return h;
}

async function runGuard(payload, { root = ROOT } = {}) {
  const toolName = payload.tool_name || payload.toolName || '';
  if (toolName !== 'Workflow') return allow();
  const input = payload.tool_input || payload.toolInput || {};

  let src = null;
  let source = null;
  if (typeof input.script === 'string' && input.script.trim()) {
    src = input.script;
    source = 'inline';
  } else if (typeof input.scriptPath === 'string' && input.scriptPath.trim()) {
    source = 'scriptPath';
    const p = path.isAbsolute(input.scriptPath) ? input.scriptPath : path.join(root, input.scriptPath);
    try {
      src = fs.readFileSync(p, 'utf8');
    } catch (_e) {
      // unreadable path: the Workflow tool will surface the real error itself
      return allow();
    }
  } else {
    // registry (name-only) invocation: resolves to a committed script the
    // pre-commit linter already validated
    return allow();
  }

  const lib = await import(pathToFileURL(LIB_PATH).href);
  const analysis = lib.analyzeScript(src);
  const scriptHash = lib.hashScript(src);
  const escaped = fs.existsSync(path.join(root, '.byan-tier', 'off'));
  const decision = lib.decideTierGate({
    analysis,
    escaped,
    scriptHash,
    priorDenyHash: readPriorDenyHash(root),
  });

  ledgerLog(root, {
    ts: new Date().toISOString(),
    source,
    decision: decision.decision,
    code: decision.code,
    hash: scriptHash,
    agentCalls: analysis.agentCalls,
    leaves: analysis.leaves.length,
    gaps: analysis.gaps.map((g) => g.label),
    violations: analysis.violations.map((v) => v.label),
    models: modelHistogram(analysis),
    acknowledged: analysis.acknowledged,
  });

  if (decision.decision === 'deny') {
    writePriorDenyHash(root, scriptHash);
    return deny(decision.reason);
  }
  if (decision.code === 'unchanged-after-deny') clearPriorDeny(root);
  return allow();
}

if (require.main === module) {
  (async () => {
    let out;
    try {
      const payload = JSON.parse((await readStdin()) || '{}');
      out = await runGuard(payload);
    } catch (_e) {
      out = allow();
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  })();
}

module.exports = { runGuard };
