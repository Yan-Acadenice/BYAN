// Unit tests for byan-api-client + byan-web IPC handlers.
// All HTTP and SecureStore calls are mocked — no network required.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- SecureStore mock ----

const mockSecureStore = vi.hoisted(() => ({
  get: vi.fn<[string], Promise<string | null>>(),
  set: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
  delete: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  _resetForTests: vi.fn(),
}));

vi.mock('../../secure-store', () => ({
  secureStore: mockSecureStore,
  _resetKeytarState: vi.fn(),
}));

// ---- fetch mock ----

const mockFetch = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

// ---- helpers ----

function makeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

// Import after mocks are set up.
import * as client from '../../byan-api-client';
import { IpcError } from '../../ipc-handlers/_error';

beforeEach(() => {
  mockFetch.mockReset();
  mockSecureStore.get.mockReset();
  // Default: authenticated, cloud URL.
  mockSecureStore.get.mockImplementation((key: string) => {
    if (key === 'auth.token') return Promise.resolve('byan_test_token');
    if (key === 'auth.url') return Promise.resolve(null); // use default cloud URL
    return Promise.resolve(null);
  });
});

// ---------- fetchMe ----------

describe('fetchMe', () => {
  it('returns user on 200', async () => {
    const user = { id: 'u1', username: 'yan', displayName: 'Yan', email: 'y@test.com', role: 'admin' };
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: user }));
    const result = await client.fetchMe();
    expect(result).toEqual(user);
  });

  it('throws AUTH_REQUIRED when no token', async () => {
    mockSecureStore.get.mockResolvedValue(null);
    await expect(client.fetchMe()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('throws AUTH_REQUIRED on 401', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    await expect(client.fetchMe()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('sends Authorization ApiKey header', async () => {
    const user = { id: 'u1', username: 'yan', displayName: 'Yan', email: 'y@test.com', role: 'admin' };
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: user }));
    await client.fetchMe();
    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('ApiKey byan_test_token');
  });
});

// ---------- fetchProjects ----------

describe('fetchProjects', () => {
  it('returns project array on 200', async () => {
    const projects = [
      { id: 'p1', name: 'Test Project', type: 'dev', visibility: 'private', my_role: 'admin', updated_at: '2026-05-04T00:00:00Z' }
    ];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: projects }));
    const result = await client.fetchProjects();
    expect(result).toEqual(projects);
  });

  it('returns empty array when data is empty', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [] }));
    const result = await client.fetchProjects();
    expect(result).toEqual([]);
  });

  it('throws INTERNAL on 500', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500, {}));
    await expect(client.fetchProjects()).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

// ---------- fetchProject ----------

describe('fetchProject', () => {
  it('returns project on 200', async () => {
    const project = { id: 'p1', name: 'Test Project', type: 'dev' };
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: project }));
    const result = await client.fetchProject('p1');
    expect(result).toEqual(project);
  });

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, {}));
    const result = await client.fetchProject('nonexistent');
    expect(result).toBeNull();
  });
});

// ---------- fetchMemory ----------

describe('fetchMemory', () => {
  it('returns memory entries on 200', async () => {
    const entries = [{ id: 'm1', content: 'test', layer: 'long_term', project_id: 'p1', pinned: false, created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z' }];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: entries }));
    const result = await client.fetchMemory({ limit: 10, projectId: 'p1' });
    expect(result).toEqual(entries);
  });

  it('passes query params in URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [] }));
    await client.fetchMemory({ limit: 5, projectId: 'p1', category: 'decision' });
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('limit=5');
    expect(String(url)).toContain('projectId=p1');
    expect(String(url)).toContain('category=decision');
  });
});

// ---------- fetchKnowledge ----------

describe('fetchKnowledge', () => {
  it('returns knowledge entries on 200', async () => {
    const entries = [{ id: 'k1', title: 'Test', content: '...', project_id: 'p1', created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z' }];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: entries }));
    const result = await client.fetchKnowledge({ limit: 10 });
    expect(result).toEqual(entries);
  });
});

// ---------- fetchCustomAgents ----------

describe('fetchCustomAgents', () => {
  it('returns agent list on 200', async () => {
    const agents = [{ id: 'a1', slug: 'atlas-ui', name: 'Atlas', status: 'draft' }];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: agents }));
    const result = await client.fetchCustomAgents();
    expect(result).toEqual(agents);
  });
});

// ---------- fetchSessions ----------

describe('fetchSessions', () => {
  it('returns session list on 200', async () => {
    const sessions = [{ id: 's1', project_id: 'p1', agent_slug: 'byan', status: 'completed', started_at: '2026-05-04T00:00:00Z' }];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: sessions }));
    const result = await client.fetchSessions({ limit: 10 });
    expect(result).toEqual(sessions);
  });

  it('returns empty array when API returns empty data', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [] }));
    const result = await client.fetchSessions();
    expect(result).toEqual([]);
  });
});

// ---------- UNAVAILABLE on network error ----------

describe('network failure', () => {
  it('throws UNAVAILABLE when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(client.fetchProjects()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

// ---------- IpcError type guard ----------

describe('IpcError code propagation', () => {
  it('IpcError instances have code field accessible', () => {
    const err = new IpcError('AUTH_REQUIRED', 'test');
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.message).toBe('test');
    expect(err).toBeInstanceOf(Error);
  });
});
