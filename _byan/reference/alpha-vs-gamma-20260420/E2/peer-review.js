// peer-review.js — BYAN peer review pipeline
// ES module. Persists one JSON file per task_id under _byan-output/reviews/.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const DEFAULT_AGENT_ROSTER = [
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

const DOMAIN_PAIRS = {
  dev: 'bmad-bmm-quinn',
  quinn: 'bmad-bmm-dev',
  architect: 'bmad-tea-tea',
  tea: 'bmad-bmm-architect',
  pm: 'bmad-bmm-sm',
  sm: 'bmad-bmm-pm',
  ux: 'bmad-bmm-pm',
};

const VALID_VERDICTS = new Set(['approve', 'changes', 'block']);

const STATUS_BY_VERDICT = {
  approve: 'approved',
  changes: 'changes_requested',
  block: 'blocked',
};

function reviewsDir(projectRoot) {
  return path.join(projectRoot, '_byan-output', 'reviews');
}

function reviewPath(projectRoot, task_id) {
  return path.join(reviewsDir(projectRoot), `${task_id}.json`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readReviewFile(projectRoot, task_id) {
  try {
    const raw = await fs.readFile(reviewPath(projectRoot, task_id), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeReviewFile(projectRoot, task_id, record) {
  await ensureDir(reviewsDir(projectRoot));
  await fs.writeFile(
    reviewPath(projectRoot, task_id),
    JSON.stringify(record, null, 2),
    'utf8',
  );
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return now;
  return new Date().toISOString();
}

export async function requestReview({
  task_id,
  author,
  artifact_paths,
  description,
  projectRoot,
  now,
}) {
  if (!task_id) throw new Error('task_id required');
  if (!author) throw new Error('author required');
  if (!Array.isArray(artifact_paths)) {
    throw new Error('artifact_paths must be an array');
  }
  if (!projectRoot) throw new Error('projectRoot required');

  const existing = await readReviewFile(projectRoot, task_id);
  if (existing && existing.status === 'pending') {
    throw new Error(`duplicate pending review for task_id=${task_id}`);
  }

  const ts = nowIso(now);
  const record = {
    task_id,
    author,
    artifact_paths,
    description: description || '',
    status: 'pending',
    verdicts: [],
    created_at: ts,
    updated_at: ts,
  };
  await writeReviewFile(projectRoot, task_id, record);
  return record;
}

export async function recordVerdict({
  task_id,
  reviewer,
  verdict,
  comments,
  must_fix,
  projectRoot,
  now,
}) {
  if (!task_id) throw new Error('task_id required');
  if (!reviewer) throw new Error('reviewer required');
  if (!VALID_VERDICTS.has(verdict)) {
    throw new Error(
      `invalid verdict "${verdict}", must be one of: approve|changes|block`,
    );
  }
  if (!projectRoot) throw new Error('projectRoot required');

  const record = await readReviewFile(projectRoot, task_id);
  if (!record) throw new Error(`no review found for task_id=${task_id}`);

  // HARD INVARIANT — never review your own work
  if (reviewer === record.author) {
    throw new Error(
      `reviewer=${reviewer} cannot review own work (author=${record.author})`,
    );
  }

  const ts = nowIso(now);
  record.verdicts.push({
    reviewer,
    verdict,
    comments: comments || '',
    must_fix: Array.isArray(must_fix) ? must_fix : [],
    at: ts,
  });
  record.status = STATUS_BY_VERDICT[verdict];
  record.updated_at = ts;

  await writeReviewFile(projectRoot, task_id, record);
  return record;
}

export async function getReview({ task_id, projectRoot }) {
  if (!task_id) throw new Error('task_id required');
  if (!projectRoot) throw new Error('projectRoot required');
  return readReviewFile(projectRoot, task_id);
}

export async function listPending({ projectRoot }) {
  if (!projectRoot) throw new Error('projectRoot required');
  const dir = reviewsDir(projectRoot);
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const pending = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(dir, name), 'utf8');
    try {
      const rec = JSON.parse(raw);
      if (rec.status === 'pending') pending.push(rec);
    } catch {
      // skip malformed
    }
  }
  return pending;
}

export function pickReviewer({ author, preferredDomain, roster }) {
  if (!author) throw new Error('author required');
  const list = Array.isArray(roster) && roster.length
    ? roster
    : DEFAULT_AGENT_ROSTER;

  // 1. Domain pair lookup
  if (preferredDomain && DOMAIN_PAIRS[preferredDomain]) {
    const paired = DOMAIN_PAIRS[preferredDomain];
    if (paired !== author && list.includes(paired)) return paired;
  }

  // 2. Infer domain from author name (bmad-bmm-dev → "dev")
  const authorDomain = inferDomain(author);
  if (authorDomain && DOMAIN_PAIRS[authorDomain]) {
    const paired = DOMAIN_PAIRS[authorDomain];
    if (paired !== author && list.includes(paired)) return paired;
  }

  // 3. Fallback — first roster member distinct from author
  for (const candidate of list) {
    if (candidate !== author) return candidate;
  }
  throw new Error('no reviewer available distinct from author');
}

function inferDomain(agentName) {
  // bmad-bmm-dev → dev ; bmad-tea-tea → tea ; bmad-bmm-ux-designer → ux
  const parts = agentName.split('-');
  const last = parts[parts.length - 1];
  if (last === 'designer' && parts.includes('ux')) return 'ux';
  return last;
}
