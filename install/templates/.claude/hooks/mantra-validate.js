#!/usr/bin/env node
/**
 * Stop hook — scans files changed in the last commit on the current branch,
 * runs MantraValidator on those that look like BYAN agent files, and warns
 * when any drops below the 80% mantra compliance threshold.
 *
 * Scope: .md files under _byan/**, .github/agents/**, .claude/skills/**
 * (agent definitions). Non-blocking: never prevents Stop, only warns via
 * additionalContext.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const THRESHOLD = 80;
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
  return (
    rel.includes('_byan/bmb/agents/') ||
    rel.includes('_byan/agents/') ||
    rel.includes('.github/agents/') ||
    rel.includes('.claude/skills/')
  );
}

function runValidator(absPath) {
  try {
    const MantraValidator = require(path.join(projectDir, 'src/byan-v2/generation/mantra-validator.js'));
    const content = fs.readFileSync(absPath, 'utf8');
    const validator = new MantraValidator();
    const res = validator.validate(content);
    const score = Math.round((res.compliant.length / res.totalMantras) * 100);
    return { score, errors: res.errors || [], warnings: res.warnings || [] };
  } catch (err) {
    return { error: err.message };
  }
}

const offenders = [];
const files = changedFiles().filter(looksLikeAgentFile);

for (const rel of files) {
  const abs = path.join(projectDir, rel);
  if (!fs.existsSync(abs)) continue;
  const r = runValidator(abs);
  if (r.error) continue;
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

process.stdout.write(JSON.stringify({ hookSpecificOutput: { additionalContext } }));
