/**
 * Party Mode Native — coordination helpers.
 *
 * Manages session artifacts under _byan-output/party-mode-sessions/<session>/
 * that parallel subagents read from and write to.
 */

const path = require('path');
const fs = require('fs');

const SESSIONS_ROOT_DEFAULT = path.join(
  '_byan-output',
  'party-mode-sessions'
);

function sessionId(slug, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  const safeSlug = String(slug || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${stamp}-${safeSlug || 'session'}`;
}

function sessionPath(sessionsRoot, id) {
  return path.join(sessionsRoot, id);
}

function agentReportPath(sessionDir, role) {
  const safeRole = String(role || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!safeRole) throw new Error('role is required');
  return path.join(sessionDir, `agent-${safeRole}.json`);
}

function initSession(roles, options = {}) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('roles must be a non-empty array');
  }

  const sessionsRoot = options.sessionsRoot || SESSIONS_ROOT_DEFAULT;
  const id = options.id || sessionId(options.slug, options.now);
  const dir = sessionPath(sessionsRoot, id);

  fs.mkdirSync(dir, { recursive: true });

  const briefing = {
    session_id: id,
    created_at: (options.now || new Date()).toISOString(),
    goal: options.goal || '',
    roles: roles.map((r) => ({
      role: r.role,
      subagent_type: r.subagent_type || 'general-purpose',
      goal: r.goal || '',
      deliverables: r.deliverables || [],
      output_file: agentReportPath(dir, r.role),
    })),
  };

  fs.writeFileSync(
    path.join(dir, 'briefing.json'),
    JSON.stringify(briefing, null, 2)
  );

  return { id, dir, briefing };
}

function readAgentReport(sessionDir, role) {
  const p = agentReportPath(sessionDir, role);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { status: 'failed', summary: `Invalid JSON: ${err.message}`, raw };
  }
}

function writeAgentReport(sessionDir, role, report) {
  const p = agentReportPath(sessionDir, role);
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
  return p;
}

function validateReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') {
    return { ok: false, errors: ['report must be an object'] };
  }
  if (!['ok', 'partial', 'failed'].includes(report.status)) {
    errors.push('status must be one of ok|partial|failed');
  }
  if (typeof report.summary !== 'string' || report.summary.length === 0) {
    errors.push('summary must be a non-empty string');
  }
  if (report.files_changed && !Array.isArray(report.files_changed)) {
    errors.push('files_changed must be an array when present');
  }
  return { ok: errors.length === 0, errors };
}

function aggregate(sessionDir, briefing) {
  const results = briefing.roles.map((r) => {
    const report = readAgentReport(sessionDir, r.role);
    const validation = report ? validateReport(report) : { ok: false, errors: ['no report'] };
    return {
      role: r.role,
      subagent_type: r.subagent_type,
      present: Boolean(report),
      valid: validation.ok,
      errors: validation.errors,
      report,
    };
  });

  const allOk =
    results.every((r) => r.present && r.valid && r.report.status === 'ok');
  const anyFailed = results.some(
    (r) => !r.present || !r.valid || r.report.status === 'failed'
  );

  return { results, allOk, anyFailed, total: results.length };
}

function writeSummary(sessionDir, aggregation) {
  const lines = [];
  lines.push(`# Party Mode Native session summary`);
  lines.push('');
  lines.push(
    `Total roles: ${aggregation.total} — all ok: ${aggregation.allOk} — any failed: ${aggregation.anyFailed}`
  );
  lines.push('');
  for (const r of aggregation.results) {
    lines.push(`## ${r.role}`);
    lines.push(`- subagent: ${r.subagent_type}`);
    lines.push(`- present: ${r.present} — valid: ${r.valid}`);
    if (r.errors && r.errors.length > 0) {
      lines.push(`- errors: ${r.errors.join('; ')}`);
    }
    if (r.report) {
      lines.push(`- status: ${r.report.status}`);
      lines.push(`- summary: ${r.report.summary}`);
      if (r.report.files_changed && r.report.files_changed.length > 0) {
        lines.push(`- files_changed:`);
        for (const f of r.report.files_changed) lines.push(`  - ${f}`);
      }
    }
    lines.push('');
  }
  const p = path.join(sessionDir, 'summary.md');
  fs.writeFileSync(p, lines.join('\n'));
  return p;
}

function listSessions(sessionsRoot = SESSIONS_ROOT_DEFAULT) {
  if (!fs.existsSync(sessionsRoot)) return [];
  return fs
    .readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

module.exports = {
  SESSIONS_ROOT_DEFAULT,
  sessionId,
  sessionPath,
  agentReportPath,
  initSession,
  readAgentReport,
  writeAgentReport,
  validateReport,
  aggregate,
  writeSummary,
  listSessions,
};
