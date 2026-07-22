// Local data provider (N1) — the LOCAL-mode data source.
//
// In local mode the app must NOT call the cloud byan_web API and must NOT need a
// token. Instead it reads the machine's own disk: the projects registry
// (~/.byan/projects.json) for the project list, and each project's `_byan/`
// tree for agents / memory / knowledge / sessions. Everything is best-effort:
// a missing directory yields [] (honest "nothing here yet"), never a throw.
//
// Shapes mirror the cloud fetch* return types (ByanProject, ByanSession, ...) so
// the renderer pages are unchanged — byan-web.ts just routes here when local.

import * as fs from 'fs';
import * as path from 'path';
import type {
  ByanProject,
  ByanSession,
  ByanMemory,
  ByanKnowledge,
  ByanCustomAgent,
  ByanUser,
  ByanApiListOpts,
} from '../shared/ipc-contract';
import { readRegistry } from './projects-registry';

// A synthetic, stable timestamp for local records that have none on disk.
const EPOCH = '1970-01-01T00:00:00.000Z';

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}
function safeReadFile(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
function statTimes(p: string): { created_at: string; updated_at: string } {
  try {
    const s = fs.statSync(p);
    return { created_at: s.birthtime.toISOString(), updated_at: s.mtime.toISOString() };
  } catch {
    return { created_at: EPOCH, updated_at: EPOCH };
  }
}

// First existing path among candidates (Gen3 then Gen2 layout).
function firstDir(root: string, candidates: string[]): string | null {
  for (const c of candidates) {
    const p = path.join(root, c);
    try { if (fs.statSync(p).isDirectory()) return p; } catch { /* next */ }
  }
  return null;
}

// The local project directory for a given project id. In local mode a project's
// id IS its absolute path (see localProjects). Falls back to the first registry
// entry when no id is supplied (pages like Agents call without a project).
export function resolveProjectRoot(projectId?: string): string | null {
  if (projectId && path.isAbsolute(projectId)) {
    try { if (fs.statSync(projectId).isDirectory()) return projectId; } catch { /* fall through */ }
  }
  const reg = readRegistry();
  return reg.projects[0]?.path ?? null;
}

// A local pseudo-user so pages calling me() do not break and never trigger a login.
export function localMe(): ByanUser {
  return { id: 'local', username: 'local', displayName: 'Local (ce PC)', email: '', role: 'owner' };
}

// Projects = the registry entries. The absolute path is the stable id, so
// per-project reads (memory/knowledge) can resolve the root from the id.
export function localProjects(): ByanProject[] {
  return readRegistry().projects.map((e) => {
    const t = statTimes(e.path);
    return {
      id: e.path,
      name: e.name,
      description: null,
      type: 'local',
      visibility: 'private',
      taxonomy_type: null,
      my_role: 'owner',
      root_node_id: null,
      metadata_tree: null,
      created_at: e.updatedAt || t.created_at,
      updated_at: e.updatedAt || t.updated_at,
    };
  });
}

export function localProject(id: string): ByanProject | null {
  return localProjects().find((p) => p.id === id) ?? null;
}

// Agents = the directories under _byan/agent/ (Gen3) or _byan/agents/ (Gen2).
export function localAgents(projectId?: string): ByanCustomAgent[] {
  const root = resolveProjectRoot(projectId);
  if (!root) return [];
  const dir = firstDir(root, ['_byan/agent', '_byan/agents']);
  if (!dir) return [];
  return safeReaddir(dir).map((slug) => {
    const agentDir = path.join(dir, slug);
    const t = statTimes(agentDir);
    return {
      id: agentDir,
      slug,
      name: slug,
      title: null,
      icon: null,
      color: null,
      role: null,
      identity: null,
      communication_style: null,
      principles: [],
      menu: [],
      soul: safeReadFile(path.join(agentDir, 'soul.md')),
      tao: safeReadFile(path.join(agentDir, 'tao.md')),
      knowledge: [],
      model_preferences: {},
      parent_slug: null,
      created_by: 'local',
      status: 'local',
      created_at: t.created_at,
      updated_at: t.updated_at,
    };
  });
}

// Memory = the stored chat-session transcripts under _byan/memoire (Gen3) or
// _byan/_memory (Gen2). Each session file becomes a coarse memory entry ; deeper
// per-message memory is out of N1 scope (kept honest, not stubbed as fake data).
export function localMemory(opts: ByanApiListOpts = {}): ByanMemory[] {
  const root = resolveProjectRoot(opts.projectId);
  if (!root) return [];
  const dir = firstDir(root, ['_byan/memoire/chat-sessions', '_byan/_memory/chat-sessions']);
  if (!dir) return [];
  const out: ByanMemory[] = [];
  for (const file of safeReaddirFiles(dir).filter((f) => f.endsWith('.json'))) {
    const raw = safeReadFile(path.join(dir, file));
    if (!raw) continue;
    try {
      const s = JSON.parse(raw) as { id?: string; messages?: Array<{ content?: string }>; updated?: string; created?: string };
      const last = s.messages?.[s.messages.length - 1]?.content ?? '';
      out.push({
        id: s.id || file.replace(/\.json$/, ''),
        project_id: opts.projectId || root,
        node_id: null,
        user_id: null,
        cli_source: 'local',
        session_id: s.id || null,
        layer: 'session',
        category: null,
        content: last.slice(0, 500),
        metadata: null,
        pinned: false,
        accessed_at: null,
        created_at: s.created || EPOCH,
        updated_at: s.updated || EPOCH,
      });
    } catch { /* skip corrupt */ }
  }
  return out.slice(0, opts.limit ?? 100);
}

// Knowledge = markdown files under _byan/connaissance (Gen3) or _byan/knowledge (Gen2).
export function localKnowledge(opts: ByanApiListOpts = {}): ByanKnowledge[] {
  const root = resolveProjectRoot(opts.projectId);
  if (!root) return [];
  const dir = firstDir(root, ['_byan/connaissance', '_byan/knowledge']);
  if (!dir) return [];
  const out: ByanKnowledge[] = [];
  for (const file of safeReaddirFiles(dir).filter((f) => /\.(md|txt)$/.test(f))) {
    const full = path.join(dir, file);
    const content = safeReadFile(full) ?? '';
    const t = statTimes(full);
    out.push({
      id: full,
      title: file.replace(/\.(md|txt)$/, ''),
      content,
      category: null,
      tags: null,
      project_id: opts.projectId || root,
      node_id: null,
      path: full,
      created_at: t.created_at,
      updated_at: t.updated_at,
    });
  }
  return out.slice(0, opts.limit ?? 100);
}

// Sessions = the stored chat-session records (same dir as memory), mapped to the
// ByanSession shape so the Sessions page lists local sessions.
export function localSessions(opts: Pick<ByanApiListOpts, 'projectId' | 'limit'> = {}): ByanSession[] {
  const root = resolveProjectRoot(opts.projectId);
  if (!root) return [];
  const dir = firstDir(root, ['_byan/memoire/chat-sessions', '_byan/_memory/chat-sessions']);
  if (!dir) return [];
  const out: ByanSession[] = [];
  for (const file of safeReaddirFiles(dir).filter((f) => f.endsWith('.json'))) {
    const raw = safeReadFile(path.join(dir, file));
    if (!raw) continue;
    try {
      const s = JSON.parse(raw) as { id?: string; created?: string; updated?: string; agent?: string | null };
      out.push({
        id: s.id || file.replace(/\.json$/, ''),
        project_id: opts.projectId || root,
        agent_slug: s.agent ?? null,
        started_at: s.created || EPOCH,
        ended_at: null,
        status: 'local',
        metadata: null,
        created_at: s.created || EPOCH,
        updated_at: s.updated || EPOCH,
      });
    } catch { /* skip corrupt */ }
  }
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return out.slice(0, opts.limit ?? 50);
}

function safeReaddirFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  } catch {
    return [];
  }
}
