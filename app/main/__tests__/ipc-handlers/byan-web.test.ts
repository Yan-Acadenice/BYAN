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
  // The client caches token + GET responses for the session — clear between
  // tests so per-case mockSecureStore overrides actually take effect.
  client.clearSessionCaches();
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

// ---------- fetchChatConversations ----------

describe('fetchChatConversations', () => {
  it('returns conversations array on 200', async () => {
    const convs = [
      { id: 'c1', title: 'Test conv', cli_provider: 'claude-code', owner_id: 'u1',
        created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z', deleted_at: null }
    ];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: convs }));
    const result = await client.fetchChatConversations();
    expect(result).toEqual(convs);
  });

  it('returns empty array when data is empty', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [] }));
    const result = await client.fetchChatConversations();
    expect(result).toEqual([]);
  });

  it('hits /api/chat/conversations', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [] }));
    await client.fetchChatConversations();
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/chat/conversations');
  });
});

// ---------- createChatConversation ----------

describe('createChatConversation', () => {
  it('POSTs to /api/chat/conversations and returns conversation', async () => {
    const conv = { id: 'c2', title: 'New', cli_provider: 'claude-code', owner_id: 'u1',
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z', deleted_at: null };
    mockFetch.mockResolvedValueOnce(makeResponse(201, { data: conv }));
    const result = await client.createChatConversation({ title: 'New', cli_provider: 'claude-code' });
    expect(result).toEqual(conv);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/chat/conversations');
    expect(init?.method).toBe('POST');
  });

  it('throws AUTH_REQUIRED when no token', async () => {
    mockSecureStore.get.mockResolvedValue(null);
    await expect(client.createChatConversation({ title: 'x' })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  // Regression: projectId + agentId must be forwarded in POST body so the CLI
  // scopes to the correct project instead of the default BYAN context.
  it('forwards projectId in POST body', async () => {
    const conv = { id: 'c3', title: 'Centralis', cli_provider: 'claude-code', owner_id: 'u1',
      project_id: 'proj-centralis', agent_id: null,
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z', deleted_at: null };
    mockFetch.mockResolvedValueOnce(makeResponse(201, { data: conv }));
    await client.createChatConversation({
      title: 'Centralis',
      cli_provider: 'claude-code',
      projectId: 'proj-centralis',
    });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.projectId).toBe('proj-centralis');
    expect(body.title).toBe('Centralis');
  });

  it('forwards agentId in POST body', async () => {
    const conv = { id: 'c4', title: 'Winston conv', cli_provider: 'claude-code', owner_id: 'u1',
      project_id: 'proj-x', agent_id: 'agent-winston',
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z', deleted_at: null };
    mockFetch.mockResolvedValueOnce(makeResponse(201, { data: conv }));
    await client.createChatConversation({
      projectId: 'proj-x',
      agentId: 'agent-winston',
      cli_provider: 'claude-code',
    });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.projectId).toBe('proj-x');
    expect(body.agentId).toBe('agent-winston');
  });

  it('does not include undefined fields in body when omitted', async () => {
    const conv = { id: 'c5', title: 'Min conv', cli_provider: 'claude-code', owner_id: 'u1',
      project_id: null, agent_id: null,
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z', deleted_at: null };
    mockFetch.mockResolvedValueOnce(makeResponse(201, { data: conv }));
    await client.createChatConversation({ cli_provider: 'claude-code' });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    // projectId and agentId must NOT appear — backend would ignore undefined,
    // but cleaner to not send noise.
    expect(body).not.toHaveProperty('projectId');
    expect(body).not.toHaveProperty('agentId');
  });

  it('forwards scope in POST body when provided', async () => {
    const conv = { id: 'c6', title: 'Scoped', cli_provider: 'claude-code', owner_id: 'u1',
      project_id: 'proj-y', agent_id: null,
      created_at: '2026-05-04T00:00:00Z', updated_at: '2026-05-04T00:00:00Z', deleted_at: null };
    mockFetch.mockResolvedValueOnce(makeResponse(201, { data: conv }));
    const scope = { types: ['knowledge' as const], knowledgeTags: ['api'], tokenBudget: 3000 };
    await client.createChatConversation({ projectId: 'proj-y', scope });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.scope).toEqual(scope);
  });
});

// ---------- deleteChatConversation ----------

describe('deleteChatConversation', () => {
  it('sends DELETE to correct URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: { deleted: true } }));
    await client.deleteChatConversation('c1');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/chat/conversations/c1');
    expect(init?.method).toBe('DELETE');
  });
});

// ---------- fetchChatMessages ----------

describe('fetchChatMessages', () => {
  it('returns messages array on 200', async () => {
    const msgs = [
      { id: 'm1', conversation_id: 'c1', role: 'user', content: 'hi', cli_provider: null,
        tokens_in: null, tokens_out: null, cost_usd: null, duration_ms: null,
        credential_source: null, created_at: '2026-05-04T00:00:00Z' }
    ];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: msgs }));
    const result = await client.fetchChatMessages('c1', { limit: 10 });
    expect(result).toEqual(msgs);
  });

  it('passes limit in query string', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [] }));
    await client.fetchChatMessages('c1', { limit: 25 });
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('limit=25');
  });

  it('includes conversationId in path', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [] }));
    await client.fetchChatMessages('conv-abc', {});
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/chat/conversations/conv-abc/messages');
  });
});

// ---------- Session caches (token + GET responses) ----------
//
// These tests pin down the perf optimisations introduced when the client
// gained an in-memory cache. They are deterministic — no real timers, no
// real fetch — and assert the exact call counts to fetch / secureStore.

describe('session caches', () => {
  it('fetchProjects: second call within TTL serves from cache (no fetch)', async () => {
    const projects = [{ id: 'p1', name: 'P', type: 'dev' }];
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: projects }));

    const a = await client.fetchProjects();
    const b = await client.fetchProjects();

    expect(a).toEqual(projects);
    expect(b).toEqual(projects);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('createChatConversation invalidates the conversations cache', async () => {
    const convs = [{ id: 'c1', title: 't', created_at: '', updated_at: '' }];
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { data: convs }))
      .mockResolvedValueOnce(makeResponse(200, { data: { id: 'c2' } }))
      .mockResolvedValueOnce(makeResponse(200, { data: [...convs, { id: 'c2', title: 'n', created_at: '', updated_at: '' }] }));

    await client.fetchChatConversations();
    await client.createChatConversation({ title: 'n' });
    await client.fetchChatConversations();

    // Without invalidation the second fetchChatConversations would hit the
    // cache and total fetch count would be 2 (list + post). 3 proves the
    // post wiped the cache and the second list re-fetched.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('deleteChatConversation invalidates the conversations cache', async () => {
    const convs = [{ id: 'c1', title: 't', created_at: '', updated_at: '' }];
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { data: convs }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, { data: [] }));

    await client.fetchChatConversations();
    await client.deleteChatConversation('c1');
    await client.fetchChatConversations();

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('clearSessionCaches forces the next fetch to hit the network again', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { data: [] }))
      .mockResolvedValueOnce(makeResponse(200, { data: [] }));

    await client.fetchProjects();
    client.clearSessionCaches();
    await client.fetchProjects();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('token cache: secureStore.get(auth.token) is read at most once for a streak of GETs', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { data: [] }))
      .mockResolvedValueOnce(makeResponse(200, { data: [] }))
      .mockResolvedValueOnce(makeResponse(200, { data: [] }));

    await client.fetchProjects();
    await client.fetchCustomAgents();
    await client.fetchSessions();

    const tokenReads = mockSecureStore.get.mock.calls.filter(([key]) => key === 'auth.token');
    expect(tokenReads.length).toBe(1);
  });

  it('clearSessionCaches drops the cached token (next call re-reads from store)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { data: [] }))
      .mockResolvedValueOnce(makeResponse(200, { data: [] }));

    await client.fetchProjects();
    const before = mockSecureStore.get.mock.calls.filter(([key]) => key === 'auth.token').length;

    client.clearSessionCaches();
    await client.fetchProjects();
    const after = mockSecureStore.get.mock.calls.filter(([key]) => key === 'auth.token').length;

    expect(after).toBe(before + 1);
  });

  it('cache is keyed per path — fetchMemory with different opts yields distinct fetches', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { data: [] }))
      .mockResolvedValueOnce(makeResponse(200, { data: [] }));

    await client.fetchMemory({ limit: 10 });
    await client.fetchMemory({ limit: 50 });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('cache hit returns immediately even if fetch is no longer mocked', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: [{ id: 'p1' }] }));
    await client.fetchProjects();

    // No further mockResolvedValueOnce — a cache miss would throw.
    const cached = await client.fetchProjects();
    expect(cached).toEqual([{ id: 'p1' }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
