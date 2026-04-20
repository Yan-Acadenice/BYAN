/**
 * Peer review registry for BYAN agents working in party-mode.
 *
 * Contract :
 *   - An agent producing an artefact (commit, file change, spec) opens a
 *     review request via requestReview(). The request is persisted at
 *     _byan-output/reviews/<task_id>.json.
 *   - Another agent (must be ≠ author) issues a verdict via
 *     recordVerdict() with { verdict: approve | changes | block, comments,
 *     must_fix }.
 *   - listPending() returns all unresolved requests. pickReviewer()
 *     returns an alternative agent from the roster distinct from the
 *     author.
 *
 * Enforces the "reviewer must differ from author" invariant inside
 * recordVerdict() and throws if violated.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROSTER = [
  'bmad-bmm-architect',
  'bmad-bmm-dev',
  'bmad-bmm-quinn',
  'bmad-bmm-pm',
  'bmad-bmm-sm',
  'bmad-bmm-analyst',
  'bmad-bmm-ux-designer',
  'bmad-bmm-tech-writer',
  'bmad-tea-tea',
  'bmad-compliance',
];

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function reviewsDir(projectRoot) {
  return path.join(resolveRoot(projectRoot), '_byan-output', 'reviews');
}

function reviewPath(projectRoot, taskId) {
  return path.join(reviewsDir(projectRoot), `${sanitizeId(taskId)}.json`);
}

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
}

function readReview(projectRoot, taskId) {
  const p = reviewPath(projectRoot, taskId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeReview(projectRoot, review) {
  fs.mkdirSync(reviewsDir(projectRoot), { recursive: true });
  fs.writeFileSync(reviewPath(projectRoot, review.task_id), JSON.stringify(review, null, 2));
}

export function requestReview({
  task_id,
  author,
  artifact_paths = [],
  description = '',
  projectRoot,
  now = new Date(),
} = {}) {
  if (!task_id) throw new Error('task_id is required');
  if (!author) throw new Error('author (agent name) is required');

  const existing = readReview(projectRoot, task_id);
  if (existing && existing.status === 'pending') {
    throw new Error(`review for task ${task_id} already pending (author ${existing.author})`);
  }

  const review = {
    task_id,
    author,
    artifact_paths: Array.isArray(artifact_paths) ? artifact_paths : [],
    description: String(description || ''),
    status: 'pending',
    verdicts: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  writeReview(projectRoot, review);
  return review;
}

export function recordVerdict({
  task_id,
  reviewer,
  verdict,
  comments = [],
  must_fix = [],
  projectRoot,
  now = new Date(),
} = {}) {
  if (!task_id) throw new Error('task_id is required');
  if (!reviewer) throw new Error('reviewer (agent name) is required');
  if (!['approve', 'changes', 'block'].includes(verdict)) {
    throw new Error(`verdict must be approve | changes | block, got ${verdict}`);
  }

  const review = readReview(projectRoot, task_id);
  if (!review) throw new Error(`no review found for task ${task_id} — call requestReview first`);

  if (review.author === reviewer) {
    throw new Error(
      `reviewer (${reviewer}) cannot be the same as author (${review.author}). Pick a different agent.`
    );
  }

  review.verdicts.push({
    reviewer,
    verdict,
    comments: Array.isArray(comments) ? comments : [],
    must_fix: Array.isArray(must_fix) ? must_fix : [],
    at: now.toISOString(),
  });

  if (verdict === 'approve') review.status = 'approved';
  else if (verdict === 'block') review.status = 'blocked';
  else review.status = 'changes_requested';

  review.updated_at = now.toISOString();
  writeReview(projectRoot, review);
  return review;
}

export function getReview({ task_id, projectRoot } = {}) {
  if (!task_id) throw new Error('task_id is required');
  return readReview(projectRoot, task_id);
}

export function listPending({ projectRoot } = {}) {
  const dir = reviewsDir(projectRoot);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (r.status === 'pending' || r.status === 'changes_requested') out.push(r);
    } catch {
      // skip malformed
    }
  }
  out.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  return out;
}

export function pickReviewer({ author, preferredDomain, roster = DEFAULT_ROSTER } = {}) {
  const domainPairs = {
    dev: ['bmad-bmm-quinn', 'bmad-tea-tea'],
    'bmm-dev': ['bmad-bmm-quinn', 'bmad-tea-tea'],
    'bmad-bmm-dev': ['bmad-bmm-quinn', 'bmad-tea-tea'],
    architect: ['bmad-tea-tea', 'bmad-bmm-quinn'],
    'bmad-bmm-architect': ['bmad-tea-tea', 'bmad-bmm-quinn'],
    pm: ['bmad-bmm-sm', 'bmad-bmm-analyst'],
    'bmad-bmm-pm': ['bmad-bmm-sm', 'bmad-bmm-analyst'],
    'ux-designer': ['bmad-bmm-pm', 'bmad-bmm-analyst'],
    'bmad-bmm-ux-designer': ['bmad-bmm-pm', 'bmad-bmm-analyst'],
  };

  const keys = [preferredDomain, author].filter(Boolean);
  for (const k of keys) {
    const candidates = domainPairs[k] || [];
    for (const c of candidates) {
      if (c !== author) return c;
    }
  }

  for (const r of roster) {
    if (r !== author) return r;
  }
  return null;
}

export const DEFAULT_AGENT_ROSTER = DEFAULT_ROSTER;
