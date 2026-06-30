import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildEvidence } from './completeness-evidence.js';

const STRICT_DIR = '.byan-strict';
const STATE_FILE = 'state.json';
const AUDIT_FILE = 'audit.log';
const MIN_SELF_VERIFY_PASSES = 3;

// F2 completeness-evidence gate. complete() ATTACHES an evidence report and, when
// the gate is ARMED (delivery-default.json completenessGate.armed === true),
// hard-rejects a completion that leaves code-shaped criteria without evidence.
// Default DISARMED: complete() behaves exactly as before (passCount >= 3 + last
// verdict ok), the report is pure observation, and every completion appends one
// line to the completeness ledger so arming later is data-informed.
const DELIVERY_CONFIG_REL = path.join('_byan', '_config', 'delivery-default.json');
const COMPLETENESS_LEDGER_REL = path.join('_byan-output', 'completeness-ledger.jsonl');

function readDeliveryConfig(projectRoot) {
  try {
    const p = path.join(resolveRoot(projectRoot), DELIVERY_CONFIG_REL);
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (cfg && typeof cfg === 'object') return cfg;
    }
  } catch {
    // A broken config must NOT arm the gate — fail safe toward disarmed.
  }
  return {};
}

function completenessGateArmed(config) {
  const g = config && config.completenessGate;
  return !!(g && g.armed === true);
}

function appendCompletenessLedger(entry, projectRoot) {
  try {
    const p = path.join(resolveRoot(projectRoot), COMPLETENESS_LEDGER_REL);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n');
  } catch {
    // The observation ledger is best-effort — never break completion.
  }
}

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function strictDir(projectRoot) {
  return path.join(resolveRoot(projectRoot), STRICT_DIR);
}

function statePath(projectRoot) {
  return path.join(strictDir(projectRoot), STATE_FILE);
}

function auditPath(projectRoot) {
  return path.join(strictDir(projectRoot), AUDIT_FILE);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readState(projectRoot) {
  const p = statePath(projectRoot);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state, projectRoot) {
  const p = statePath(projectRoot);
  ensureDir(p);
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
  return p;
}

function appendAudit(entry, projectRoot) {
  const p = auditPath(projectRoot);
  ensureDir(p);
  fs.appendFileSync(p, JSON.stringify(entry) + '\n');
  return p;
}

function readAuditLog(projectRoot) {
  const p = auditPath(projectRoot);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function hashScope(scopeText, acceptanceCriteria, allowedPaths) {
  const payload = JSON.stringify({
    scope: String(scopeText || '').trim(),
    criteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
    paths: Array.isArray(allowedPaths) ? allowedPaths : [],
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function stampId(now, slug) {
  const pad = (n) => String(n).padStart(2, '0');
  const s =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  return `${s}-${slug || 'strict'}`;
}

function emptyState(now) {
  return {
    strict_session_id: stampId(now, 'session'),
    active: true,
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
    scope_lock: null,
    self_verify_passes: [],
    completed: false,
    completed_at: null,
    audit_token: null,
  };
}

export function lockScope({
  scopeText,
  acceptanceCriteria = [],
  allowedPaths = [],
  domain = '',
  projectRoot,
  now = new Date(),
  force = false,
} = {}) {
  if (!scopeText || typeof scopeText !== 'string' || scopeText.trim().length < 10) {
    throw new Error(
      'scopeText must be a non-empty string of at least 10 chars describing the locked scope.'
    );
  }
  if (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
    throw new Error(
      'acceptanceCriteria must be a non-empty array of strings (explicit deliverables).'
    );
  }

  const scopeHash = hashScope(scopeText, acceptanceCriteria, allowedPaths);

  let state = readState(projectRoot);
  if (state && state.active && state.scope_lock && !state.completed && !force) {
    if (state.scope_lock.scope_hash === scopeHash) {
      return state.scope_lock;
    }
    throw new Error(
      `Scope already locked with hash ${state.scope_lock.scope_hash}. Pass force=true to relock, or call abort() first.`
    );
  }

  if (!state || state.completed || force) {
    state = emptyState(now);
  }

  state.scope_lock = {
    scope_hash: scopeHash,
    scope_text: scopeText.trim(),
    acceptance_criteria: acceptanceCriteria,
    allowed_paths: allowedPaths,
    // Optional explicit ELO domain. Stored verbatim; validated (and dropped if
    // unknown) only at outcome-emit time so lockScope never guesses. Drives the
    // C3 learning-loop feed on complete (an explicit domain -> one VALIDATED tick).
    domain: typeof domain === 'string' ? domain.trim() : '',
    locked_at: now.toISOString(),
  };
  state.updated_at = now.toISOString();
  state.self_verify_passes = [];
  state.completed = false;
  state.completed_at = null;
  state.audit_token = null;

  writeState(state, projectRoot);
  appendAudit(
    {
      ts: now.toISOString(),
      event: 'lock_scope',
      strict_session_id: state.strict_session_id,
      scope_hash: scopeHash,
      scope_text: state.scope_lock.scope_text,
      acceptance_criteria: acceptanceCriteria,
      allowed_paths: allowedPaths,
    },
    projectRoot
  );

  return state.scope_lock;
}

export function selfVerify({
  findings = [],
  verdict,
  projectRoot,
  now = new Date(),
} = {}) {
  const state = readState(projectRoot);
  if (!state || !state.active) {
    throw new Error('No active strict session. Call lockScope() first.');
  }
  if (!state.scope_lock) {
    throw new Error('Scope is not locked. Call lockScope() first.');
  }
  if (state.completed) {
    throw new Error(
      'Strict session already completed. Call abort() or lockScope({force:true}) to restart.'
    );
  }
  if (!['ok', 'gap'].includes(verdict)) {
    throw new Error('verdict must be "ok" (no gap) or "gap" (gap detected).');
  }
  if (verdict === 'gap' && (!Array.isArray(findings) || findings.length === 0)) {
    throw new Error('When verdict is "gap", findings must be a non-empty array of strings.');
  }
  if (!Array.isArray(findings)) {
    throw new Error('findings must be an array of strings (can be empty when verdict is "ok").');
  }

  const passNumber = state.self_verify_passes.length + 1;
  const passEntry = {
    pass: passNumber,
    completed_at: now.toISOString(),
    findings: findings.map((f) => String(f)),
    verdict,
  };
  state.self_verify_passes.push(passEntry);
  state.updated_at = now.toISOString();

  writeState(state, projectRoot);
  appendAudit(
    {
      ts: now.toISOString(),
      event: 'self_verify',
      strict_session_id: state.strict_session_id,
      scope_hash: state.scope_lock.scope_hash,
      pass: passNumber,
      verdict,
      findings: passEntry.findings,
    },
    projectRoot
  );

  return {
    pass_count: state.self_verify_passes.length,
    pass: passNumber,
    verdict,
    remaining_passes: Math.max(0, MIN_SELF_VERIFY_PASSES - state.self_verify_passes.length),
  };
}

export function complete({ projectRoot, now = new Date(), context = {}, evidenceIo } = {}) {
  const state = readState(projectRoot);
  if (!state || !state.active) {
    throw new Error('No active strict session.');
  }
  if (!state.scope_lock) {
    throw new Error('Scope is not locked.');
  }
  if (state.completed) {
    throw new Error('Strict session already completed.');
  }
  const passCount = state.self_verify_passes.length;
  if (passCount < MIN_SELF_VERIFY_PASSES) {
    throw new Error(
      `Cannot complete: ${passCount}/${MIN_SELF_VERIFY_PASSES} self-verify passes done. Run selfVerify() at least ${MIN_SELF_VERIFY_PASSES - passCount} more times.`
    );
  }
  const lastPass = state.self_verify_passes[state.self_verify_passes.length - 1];
  if (lastPass.verdict !== 'ok') {
    throw new Error(
      `Cannot complete: last self-verify pass returned verdict="${lastPass.verdict}". Final pass must be "ok" (zero gaps).`
    );
  }

  // F2 (additive): collect the completeness-evidence report over the locked
  // criteria + allowed paths. Always observed + ledgered; only ENFORCED when the
  // gate is armed in delivery-default.json (default false -> behaviour unchanged).
  const deliveryConfig = readDeliveryConfig(projectRoot);
  const gateArmed = completenessGateArmed(deliveryConfig);
  const evidence = buildEvidence({
    criteria: state.scope_lock.acceptance_criteria || [],
    allowedPaths: state.scope_lock.allowed_paths || [],
    context,
    projectRoot: resolveRoot(projectRoot),
    io: evidenceIo,
  });
  appendCompletenessLedger(
    {
      ts: now.toISOString(),
      event: gateArmed ? (evidence.missing.length ? 'would-reject' : 'pass') : 'observed-disarmed',
      strict_session_id: state.strict_session_id,
      scope_hash: state.scope_lock.scope_hash,
      armed: gateArmed,
      missing: evidence.missing,
      per_criterion: evidence.perCriterion.map((c) => ({
        criterion: c.criterion,
        kind: c.kind,
        hasEvidence: c.hasEvidence,
      })),
    },
    projectRoot
  );
  if (gateArmed && evidence.missing.length) {
    throw new Error(
      `Cannot complete: completeness gate is ARMED and ${evidence.missing.length} ` +
        `code-shaped criteria have no evidence (file / green test / diff): ` +
        `${evidence.missing.join('; ')}. Provide the missing artifacts or re-lock the scope.`
    );
  }

  const auditEntries = readAuditLog(projectRoot);
  const auditPayload = JSON.stringify({
    scope_hash: state.scope_lock.scope_hash,
    audit: auditEntries,
    ts: now.toISOString(),
  });
  const auditToken = crypto
    .createHash('sha256')
    .update(auditPayload)
    .digest('hex')
    .slice(0, 24);

  state.completed = true;
  state.completed_at = now.toISOString();
  state.audit_token = auditToken;
  state.updated_at = now.toISOString();

  writeState(state, projectRoot);
  appendAudit(
    {
      ts: now.toISOString(),
      event: 'complete',
      strict_session_id: state.strict_session_id,
      scope_hash: state.scope_lock.scope_hash,
      pass_count: passCount,
      audit_token: auditToken,
    },
    projectRoot
  );

  return {
    audit_token: auditToken,
    scope_hash: state.scope_lock.scope_hash,
    pass_count: passCount,
    completed_at: state.completed_at,
    // Surfaced for the C3 learning-loop feed: an explicit ELO domain on the
    // locked scope means a completed session is a VALIDATED outcome.
    domain: state.scope_lock.domain || '',
    // F2 (additive): the completeness-evidence report. Attached whether or not
    // the gate is armed; with the gate disarmed it is pure observation.
    evidence,
  };
}

export function getStatus({ projectRoot } = {}) {
  const state = readState(projectRoot);
  if (!state) {
    return {
      active: false,
      scope_locked: false,
      pass_count: 0,
      completed: false,
      min_passes: MIN_SELF_VERIFY_PASSES,
    };
  }
  return {
    active: state.active,
    strict_session_id: state.strict_session_id,
    scope_locked: Boolean(state.scope_lock),
    scope_hash: state.scope_lock ? state.scope_lock.scope_hash : null,
    scope_text: state.scope_lock ? state.scope_lock.scope_text : null,
    acceptance_criteria: state.scope_lock ? state.scope_lock.acceptance_criteria : [],
    allowed_paths: state.scope_lock ? state.scope_lock.allowed_paths : [],
    pass_count: state.self_verify_passes.length,
    passes: state.self_verify_passes,
    min_passes: MIN_SELF_VERIFY_PASSES,
    completed: state.completed,
    completed_at: state.completed_at,
    audit_token: state.audit_token,
    updated_at: state.updated_at,
  };
}

export function abort({ reason, projectRoot, now = new Date() } = {}) {
  const state = readState(projectRoot);
  if (!state) {
    throw new Error('No strict session to abort.');
  }
  state.active = false;
  state.updated_at = now.toISOString();
  writeState(state, projectRoot);
  appendAudit(
    {
      ts: now.toISOString(),
      event: 'abort',
      strict_session_id: state.strict_session_id,
      scope_hash: state.scope_lock ? state.scope_lock.scope_hash : null,
      reason: reason || null,
    },
    projectRoot
  );
  return { aborted: true, strict_session_id: state.strict_session_id };
}

export function checkAuditTrail({
  scopeHash,
  windowSeconds = 600,
  projectRoot,
  now = new Date(),
} = {}) {
  const state = readState(projectRoot);
  if (!state || !state.completed) {
    return {
      ok: false,
      reason: 'no_completed_session',
      detail: 'No completed strict session found in state.json.',
    };
  }
  if (scopeHash && state.scope_lock && state.scope_lock.scope_hash !== scopeHash) {
    return {
      ok: false,
      reason: 'scope_mismatch',
      detail: `Expected scope_hash=${scopeHash}, found ${state.scope_lock.scope_hash}.`,
    };
  }
  if (state.self_verify_passes.length < MIN_SELF_VERIFY_PASSES) {
    return {
      ok: false,
      reason: 'insufficient_passes',
      detail: `Only ${state.self_verify_passes.length}/${MIN_SELF_VERIFY_PASSES} self-verify passes.`,
    };
  }
  const completedAt = new Date(state.completed_at).getTime();
  const ageSeconds = (now.getTime() - completedAt) / 1000;
  if (ageSeconds > windowSeconds) {
    return {
      ok: false,
      reason: 'audit_expired',
      detail: `Completion is ${Math.round(ageSeconds)}s old, max allowed is ${windowSeconds}s.`,
    };
  }
  return {
    ok: true,
    audit_token: state.audit_token,
    scope_hash: state.scope_lock.scope_hash,
    pass_count: state.self_verify_passes.length,
    completed_at: state.completed_at,
    age_seconds: Math.round(ageSeconds),
  };
}

export const MIN_PASSES = MIN_SELF_VERIFY_PASSES;
