import fs from 'node:fs';
import path from 'node:path';

const PHASES = ['BRAINSTORM', 'PRUNE', 'DISPATCH', 'BUILD', 'VALIDATE', 'COMPLETED', 'ABORTED'];

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function statePath(projectRoot) {
  return path.join(resolveRoot(projectRoot), '_byan-output', 'fd-state.json');
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

function slugify(s) {
  return String(s || 'feature')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function stampId(now = new Date(), slug) {
  const pad = (n) => String(n).padStart(2, '0');
  const s =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  return `${s}-${slugify(slug)}`;
}

export function start({ featureName, projectRoot, now = new Date(), force = false } = {}) {
  const existing = readState(projectRoot);
  if (existing && !['COMPLETED', 'ABORTED'].includes(existing.phase) && !force) {
    throw new Error(
      `FD already in progress (phase ${existing.phase}, fd_id ${existing.fd_id}). Abort or complete it first, or pass force=true.`
    );
  }

  const state = {
    fd_id: stampId(now, featureName),
    feature_name: featureName || 'unnamed',
    phase: 'BRAINSTORM',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
    phase_history: [{ phase: 'BRAINSTORM', entered_at: now.toISOString() }],
    backlog: [],
    dispatch_table: [],
    commits: [],
    notes: [],
  };
  writeState(state, projectRoot);
  return state;
}

export function status({ projectRoot } = {}) {
  const state = readState(projectRoot);
  if (!state) {
    return { active: false, phase: null, fd_id: null };
  }
  return {
    active: !['COMPLETED', 'ABORTED'].includes(state.phase),
    ...state,
  };
}

export function advance({ to, note, projectRoot, now = new Date() } = {}) {
  if (!PHASES.includes(to)) {
    throw new Error(`Invalid target phase ${to}. Must be one of ${PHASES.join(', ')}`);
  }
  const state = readState(projectRoot);
  if (!state) throw new Error('No active FD session. Call start() first.');
  if (['COMPLETED', 'ABORTED'].includes(state.phase)) {
    throw new Error(`Current FD session is ${state.phase} and cannot advance.`);
  }

  const order = PHASES.indexOf(state.phase);
  const target = PHASES.indexOf(to);
  if (target < order && !['ABORTED', 'COMPLETED'].includes(to)) {
    throw new Error(
      `Cannot move backwards from ${state.phase} to ${to}. Use abort() or fix the workflow.`
    );
  }

  state.phase = to;
  state.updated_at = now.toISOString();
  state.phase_history.push({ phase: to, entered_at: now.toISOString(), note: note || null });

  writeState(state, projectRoot);
  return state;
}

export function update({ patch = {}, projectRoot, now = new Date() } = {}) {
  const state = readState(projectRoot);
  if (!state) throw new Error('No active FD session.');

  const allowed = ['backlog', 'dispatch_table', 'commits', 'notes', 'feature_name'];
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) {
      throw new Error(`Field "${key}" is not patchable. Allowed: ${allowed.join(', ')}`);
    }
    state[key] = patch[key];
  }
  state.updated_at = now.toISOString();

  writeState(state, projectRoot);
  return state;
}

export function abort({ reason, projectRoot, now = new Date() } = {}) {
  const state = readState(projectRoot);
  if (!state) throw new Error('No FD session to abort.');
  state.phase = 'ABORTED';
  state.updated_at = now.toISOString();
  state.phase_history.push({ phase: 'ABORTED', entered_at: now.toISOString(), note: reason || null });
  writeState(state, projectRoot);
  return state;
}

export const ALL_PHASES = PHASES;
