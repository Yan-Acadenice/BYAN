#!/usr/bin/env node
/**
 * Stop hook — scans files changed in the last commit on the current branch,
 * runs MantraValidator on those that look like BYAN agent files, and warns
 * when any drops below the domain-aware anti-stub floor.
 *
 * Scope: .md files under _byan/agent/**, .github/agents/**, .claude/skills/**.
 * Domain-aware: each persona is scored only against its applicable mantras
 * (scope-resolver), matching the blocking pre-commit gate. Non-blocking: never
 * prevents Stop, only warns via additionalContext. Deep embodiment quality is
 * the out-of-band semantic audit (src/byan-v2/generation/mantra-audit.js).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const THRESHOLD = 30;
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function changedFiles() {
  try {
    const out = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only --cached', {
      cwd: projectDir,
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function looksLikeAgentFile(rel) {
  if (!rel.endsWith('.md')) return false;
  if (rel.includes('.github/agents/') || rel.includes('.claude/skills/')) return true;
  // Layout-aware agent-path detection (Gen3 _byan/agent/, Gen2 flat + every
  // module — the old check only matched _byan/bmb/agents/, missing the rest).
  try {
    const { isAgentPath } = require(path.join(projectDir, 'src/byan-v2/lib/layout-resolver.js'));
    return isAgentPath(rel);
  } catch {
    return (
      /(^|\/)_byan\/agent\//.test(rel) ||
      /(^|\/)_byan\/agents\//.test(rel) ||
      /(^|\/)_byan\/(core|bmm|bmb|tea|cis)\/agents\//.test(rel)
    );
  }
}

function runValidator(absPath, rel) {
  try {
    const MantraValidator = require(path.join(projectDir, 'src/byan-v2/generation/mantra-validator.js'));
    const resolver = require(path.join(projectDir, 'src/byan-v2/generation/scope-resolver.js'));
    const content = fs.readFileSync(absPath, 'utf8');
    const name = path.basename(rel).replace(/\.md$/, '');
    const scopes = resolver.resolveAgentScopes({ name, content });
    const validator = new MantraValidator();
    const res = validator.validate(content, { scope: scopes });
    const score = Math.round((res.compliant.length / res.totalMantras) * 100);
    return { score, errors: res.errors || [], warnings: res.warnings || [] };
  } catch (err) {
    return { error: err.message };
  }
}

const offenders = [];
const files = changedFiles().filter(looksLikeAgentFile);

for (const rel of files) {
  if (/test|optimized|turbo-whisper/.test(rel)) continue;
  const abs = path.join(projectDir, rel);
  if (!fs.existsSync(abs)) continue;
  const r = runValidator(abs, rel);
  if (r.error) continue;
  // score 0 = parse error / derived stub / non-persona : skip, not an offender.
  if (r.score === 0) continue;
  if (r.score < THRESHOLD) {
    offenders.push({ file: rel, score: r.score, errors: r.errors.slice(0, 2) });
  }
}

let additionalContext = '';
if (offenders.length > 0) {
  const lines = [
    `BYAN mantra validator warning: ${offenders.length} changed agent file(s) below ${THRESHOLD}% threshold.`,
  ];
  for (const o of offenders) {
    lines.push(`  - ${o.file}: score ${o.score}%`);
    for (const e of o.errors) lines.push(`      ${e}`);
  }
  additionalContext = lines.join('\n');
}

if (additionalContext) {
  process.stdout.write(JSON.stringify({ systemMessage: additionalContext, continue: true }));
} else {
  process.stdout.write(JSON.stringify({ continue: true }));
}
