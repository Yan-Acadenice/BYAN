// byan-api-client.ts — thin HTTP client for the byan_web REST API.
//
// WHY a separate module: every fetch from the main process must share
// the same auth header, timeout, and error-mapping logic. Handlers are
// just thin delegators — they never touch fetch directly.
//
// Token is always read from SecureStore at call time (never cached in memory)
// so a logout + re-login in the same session is reflected immediately.
//
// Error mapping:
//   401 / 403 → IpcError('AUTH_REQUIRED', ...)  — renderer redirects to Login
//   404       → returns null (caller decides)
//   other 4xx/5xx → IpcError('INTERNAL', ...)

import { secureStore } from './secure-store';
import { AUTH_TOKEN_KEY } from './ipc-handlers/auth';
import { IpcError } from './ipc-handlers/_error';
import type {
  ByanProject,
  ByanMemory,
  ByanKnowledge,
  ByanCustomAgent,
  ByanSession,
  ByanUser,
  ByanApiListOpts,
} from '../shared/ipc-contract';

// ---------- Config ----------

const DEFAULT_URL = 'https://byan-api.stark.a3n.fr';
const AUTH_URL_KEY = 'auth.url';
const FETCH_TIMEOUT_MS = 15_000;

// ---------- Core fetch helper ----------

async function apiFetch(path: string): Promise<unknown> {
  const token = await secureStore.get(AUTH_TOKEN_KEY);
  if (!token) {
    throw new IpcError('AUTH_REQUIRED', 'No auth token — please log in.');
  }

  // Prefer the URL the user logged in with (persisted by auth.ts), fall back to cloud default.
  const storedUrl = await secureStore.get(AUTH_URL_KEY);
  const base = (storedUrl ?? DEFAULT_URL).replace(/\/$/, '');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: { Authorization: `ApiKey ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    throw new IpcError('UNAVAILABLE', `API unreachable: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new IpcError('AUTH_REQUIRED', 'Session expired or token revoked — please log in again.');
  }

  if (res.status === 404) {
    // Callers that expect a nullable response handle this via the null-returning wrappers below.
    throw new IpcError('NOT_FOUND', `Resource not found: ${path}`);
  }

  if (!res.ok) {
    throw new IpcError('INTERNAL', `API error ${res.status} for ${path}`);
  }

  return res.json();
}

// ---------- Query string builder ----------

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

// ---------- Public API ----------

export async function fetchMe(): Promise<ByanUser> {
  const body = await apiFetch('/api/auth/me') as { data: ByanUser };
  return body.data;
}

export async function fetchProjects(): Promise<ByanProject[]> {
  const body = await apiFetch('/api/projects') as { data: ByanProject[] };
  return body.data ?? [];
}

export async function fetchProject(id: string): Promise<ByanProject | null> {
  try {
    const body = await apiFetch(`/api/projects/${encodeURIComponent(id)}`) as { data: ByanProject };
    return body.data ?? null;
  } catch (err) {
    if (err instanceof IpcError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

export async function fetchMemory(opts: ByanApiListOpts = {}): Promise<ByanMemory[]> {
  const params: Record<string, string | number | undefined> = {
    limit: opts.limit,
    projectId: opts.projectId,
    category: opts.category,
    type: opts.type,
  };
  const body = await apiFetch(`/api/memory${qs(params)}`) as { data: ByanMemory[] };
  return body.data ?? [];
}

export async function fetchKnowledge(opts: ByanApiListOpts = {}): Promise<ByanKnowledge[]> {
  const params: Record<string, string | number | undefined> = {
    limit: opts.limit,
    projectId: opts.projectId,
    category: opts.category,
    tags: opts.tags,
  };
  const body = await apiFetch(`/api/knowledge${qs(params)}`) as { data: ByanKnowledge[] };
  return body.data ?? [];
}

export async function fetchCustomAgents(): Promise<ByanCustomAgent[]> {
  const body = await apiFetch('/api/custom-agents') as { data: ByanCustomAgent[] };
  return body.data ?? [];
}

export async function fetchSessions(opts: Pick<ByanApiListOpts, 'projectId' | 'limit'> = {}): Promise<ByanSession[]> {
  const params: Record<string, string | number | undefined> = {
    limit: opts.limit,
    projectId: opts.projectId,
  };
  const body = await apiFetch(`/api/sessions${qs(params)}`) as { data: ByanSession[] };
  return body.data ?? [];
}
