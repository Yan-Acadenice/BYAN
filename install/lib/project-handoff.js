'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FORMAT = 'byan-project-handoff';
const VERSION = '1.0';

function nowIso() {
  return new Date().toISOString();
}

function slugify(s) {
  return String(s || 'handoff')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'handoff';
}

function timestampForFile(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function handoffDir(root) {
  return path.join(root, '_byan-output', 'handoffs');
}

function defaultHandoffPath(root, handoff, date = new Date()) {
  const from = slugify(handoff.from || 'unknown');
  const to = slugify(handoff.to || 'next');
  const task = slugify(handoff.currentTask || handoff.project || 'project');
  return path.join(handoffDir(root), `${timestampForFile(date)}-${from}-to-${to}-${task}.md`);
}

function arrayify(value) {
  if (Array.isArray(value)) return value.filter((v) => String(v || '').trim()).map(String);
  if (value == null || value === '') return [];
  return [String(value)];
}

function readJsonFile(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function safeRun(cmd, { cwd, maxBuffer = 1024 * 1024 } = {}) {
  try {
    return String(execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8', maxBuffer })).trim();
  } catch {
    return '';
  }
}

function collectGitSnapshot(root, { run = safeRun } = {}) {
  const status = run('git status --short', { cwd: root });
  const branch = run('git branch --show-current', { cwd: root }) || run('git rev-parse --abbrev-ref HEAD', { cwd: root });
  const head = run('git rev-parse --short HEAD', { cwd: root });
  const changedFiles = status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^.. /, '').replace(/^..\s+/, ''));
  return { branch: branch || null, head: head || null, status, changedFiles };
}

function collectFdState(root) {
  const state = readJsonFile(path.join(root, '_byan-output', 'fd-state.json'));
  if (!state) return null;
  return {
    fd_id: state.fd_id || null,
    feature_name: state.feature_name || null,
    phase: state.phase || null,
    strict_mode: Boolean(state.strict_mode),
    backlog: Array.isArray(state.backlog) ? state.backlog : [],
    validate_verdict: state.validate_verdict || null,
  };
}

function buildHandoff(input = {}) {
  const root = path.resolve(input.root || process.cwd());
  const git = input.git || collectGitSnapshot(root, input);
  const fd = input.fd === undefined ? collectFdState(root) : input.fd;
  const project = input.project || path.basename(root);
  const from = input.from || process.env.BYAN_HANDOFF_FROM || 'unknown';
  const to = input.to || process.env.BYAN_HANDOFF_TO || 'next-assistant';
  const currentTask = input.currentTask || input.task || (fd && fd.feature_name) || 'Resume project work';
  const filesTouched = arrayify(input.filesTouched || input.files || git.changedFiles);
  const decisions = arrayify(input.decisions);
  const blockers = arrayify(input.blockers);
  const nextActions = arrayify(input.nextActions || input.next);
  const commands = arrayify(input.commands);
  const notes = arrayify(input.notes || input.note);

  return {
    format: FORMAT,
    version: VERSION,
    project,
    root,
    from,
    to,
    createdAt: input.createdAt || nowIso(),
    currentTask,
    summary: input.summary || '',
    decisions,
    filesTouched,
    commands,
    blockers,
    nextActions,
    notes,
    git,
    fd,
  };
}

function renderList(items, empty = '- (none recorded)') {
  const arr = arrayify(items);
  if (!arr.length) return empty;
  return arr.map((item) => `- ${item}`).join('\n');
}

function renderJsonBlock(handoff) {
  return [
    '```json byan-handoff',
    JSON.stringify(handoff, null, 2),
    '```',
  ].join('\n');
}

function renderMarkdown(handoff) {
  const h = buildHandoff(handoff);
  const lines = [];
  lines.push(`# BYAN Project Handoff: ${h.from} -> ${h.to}`);
  lines.push('');
  lines.push('> Portable Markdown handoff for switching between Claude Code and Codex. This file is the source of truth for the next assistant; native assistant memory is optional context only.');
  lines.push('');
  lines.push('## Machine Data');
  lines.push('');
  lines.push(renderJsonBlock(h));
  lines.push('');
  lines.push('## Resume Prompt');
  lines.push('');
  lines.push(renderResumePrompt(h));
  lines.push('');
  lines.push('## Human Summary');
  lines.push('');
  lines.push(h.summary || '_A completer avant le passage si le resume automatique est insuffisant._');
  lines.push('');
  lines.push('## Current Task');
  lines.push('');
  lines.push(h.currentTask);
  lines.push('');
  lines.push('## Decisions');
  lines.push('');
  lines.push(renderList(h.decisions));
  lines.push('');
  lines.push('## Files Touched');
  lines.push('');
  lines.push(renderList(h.filesTouched));
  lines.push('');
  lines.push('## Commands And Tests');
  lines.push('');
  lines.push(renderList(h.commands));
  lines.push('');
  lines.push('## Blockers And Risks');
  lines.push('');
  lines.push(renderList(h.blockers));
  lines.push('');
  lines.push('## Next Actions');
  lines.push('');
  lines.push(renderList(h.nextActions, '- Re-read this handoff, inspect the listed files, then continue the current task.'));
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push(renderList(h.notes));
  lines.push('');
  lines.push('## Git Snapshot');
  lines.push('');
  lines.push(`- Branch: ${h.git && h.git.branch ? h.git.branch : 'unknown'}`);
  lines.push(`- Head: ${h.git && h.git.head ? h.git.head : 'unknown'}`);
  lines.push('');
  lines.push('```text');
  lines.push((h.git && h.git.status) || '(clean or unavailable)');
  lines.push('```');
  lines.push('');
  if (h.fd) {
    lines.push('## FD Snapshot');
    lines.push('');
    lines.push(`- FD: ${h.fd.fd_id || 'unknown'}`);
    lines.push(`- Feature: ${h.fd.feature_name || 'unknown'}`);
    lines.push(`- Phase: ${h.fd.phase || 'unknown'}`);
    lines.push(`- Strict: ${h.fd.strict_mode ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('### Backlog');
    lines.push('');
    lines.push(renderList((h.fd.backlog || []).map((b) => `${b.id || '-'} [${b.status || '?'}] ${b.title || ''}`)));
    lines.push('');
  }
  return lines.join('\n');
}

function extractJsonBlock(markdown) {
  const text = String(markdown || '');
  const re = /```json\s+byan-handoff\s*\n([\s\S]*?)\n```/m;
  const m = text.match(re);
  if (!m) throw new Error('Missing ```json byan-handoff block');
  try {
    return JSON.parse(m[1]);
  } catch (err) {
    throw new Error(`Invalid byan-handoff JSON: ${err.message}`);
  }
}

function parseMarkdown(markdown) {
  const h = extractJsonBlock(markdown);
  if (h.format !== FORMAT) throw new Error(`Invalid handoff format: ${h.format || 'missing'}`);
  if (!h.version) throw new Error('Missing handoff version');
  return h;
}

function normalizeProvider(value) {
  return slugify(value || '');
}

function providerMatches(actual, expected) {
  const a = normalizeProvider(actual);
  const e = normalizeProvider(expected);
  if (!e) return true;
  return a === e || a.startsWith(`${e}-`);
}

function renderResumePrompt(handoff) {
  const h = buildHandoff(handoff);
  const lines = [];
  lines.push(`Continue this BYAN project from a portable handoff created by ${h.from} for ${h.to}.`);
  lines.push(`Project: ${h.project}`);
  lines.push(`Task: ${h.currentTask}`);
  if (h.summary) lines.push(`Summary: ${h.summary}`);
  if (h.decisions.length) lines.push(`Decisions: ${h.decisions.join(' | ')}`);
  if (h.filesTouched.length) lines.push(`Files to inspect first: ${h.filesTouched.join(', ')}`);
  if (h.commands.length) lines.push(`Known commands/tests: ${h.commands.join(' | ')}`);
  if (h.blockers.length) lines.push(`Blockers/risks: ${h.blockers.join(' | ')}`);
  if (h.nextActions.length) lines.push(`Next actions: ${h.nextActions.join(' | ')}`);
  if (h.fd && h.fd.phase) lines.push(`FD state: ${h.fd.feature_name || h.fd.fd_id || 'unknown'} is in phase ${h.fd.phase}.`);
  lines.push('Use repo files and BYAN portable state as source of truth; do not rely on native assistant memory.');
  return lines.join('\n');
}

function writeHandoff(root, handoff, { outPath, mkdirp = fs.mkdirSync, writeFile = fs.writeFileSync } = {}) {
  const h = buildHandoff({ ...handoff, root });
  const target = path.resolve(outPath || defaultHandoffPath(path.resolve(root), h));
  mkdirp(path.dirname(target), { recursive: true });
  writeFile(target, renderMarkdown(h), 'utf8');
  return { path: target, handoff: h };
}

function latestHandoff(root, { from = null, exists = fs.existsSync, readdir = fs.readdirSync, readFile = fs.readFileSync } = {}) {
  const dir = handoffDir(path.resolve(root));
  if (!exists(dir)) return null;
  const files = readdir(dir)
    .filter((f) => /\.md$/i.test(f))
    .sort()
    .reverse();
  if (!files.length) return null;
  if (!from) return path.join(dir, files[0]);

  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const handoff = parseMarkdown(readFile(full, 'utf8'));
      if (providerMatches(handoff.from, from)) return full;
    } catch {
      // Ignore non-handoff markdown files in the handoff directory.
    }
  }
  return null;
}

module.exports = {
  FORMAT,
  VERSION,
  buildHandoff,
  collectFdState,
  collectGitSnapshot,
  defaultHandoffPath,
  extractJsonBlock,
  handoffDir,
  latestHandoff,
  parseMarkdown,
  providerMatches,
  renderMarkdown,
  renderResumePrompt,
  writeHandoff,
};
