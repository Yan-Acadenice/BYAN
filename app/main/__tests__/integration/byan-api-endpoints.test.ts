// Integration test that hits the live byan_web API to keep our endpoint
// references honest. If a release of byan_web ever renames an endpoint
// we use, this test goes red instead of the user discovering it via a
// "Server unreachable" toast at runtime.
//
// SCOPE: opt-in only. Run with BYAN_API_LIVE=1 + BYAN_API_TOKEN set, e.g.:
//   BYAN_API_LIVE=1 BYAN_API_TOKEN=byan_xxx npm test
// or via the dedicated script: npm run test:live
// Without the explicit flag the file is skipped, so the default `npm test`
// stays hermetic. We never hardcode a real token here
// (memory: feedback_no_real_tokens_in_tests).

import { describe, it, expect } from 'vitest';

const URL = process.env.BYAN_API_URL_LIVE ?? 'https://byan-api.stark.a3n.fr';
const TOKEN = process.env.BYAN_API_TOKEN;
const LIVE = process.env.BYAN_API_LIVE === '1';

const liveOnly = LIVE && TOKEN && URL ? describe : describe.skip;

liveOnly('live byan_web endpoints contract', () => {
  it('GET /api/health returns 200 with no auth', async () => {
    const res = await fetch(`${URL}/api/health`);
    expect(res.status).toBe(200);
  });

  it('GET /api/auth/me returns 200 + user object with valid ApiKey', async () => {
    const res = await fetch(`${URL}/api/auth/me`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('username');
    expect(body.data).toHaveProperty('email');
  });

  it('GET /api/auth/me returns 401 when token is missing or invalid', async () => {
    const noTokenRes = await fetch(`${URL}/api/auth/me`);
    expect(noTokenRes.status).toBe(401);

    const badTokenRes = await fetch(`${URL}/api/auth/me`, {
      headers: { Authorization: 'ApiKey byan_invalid_token_for_testing_only' }
    });
    expect(badTokenRes.status).toBe(401);
  });

  it('GET /api/projects returns 401 without token, 200 with token', async () => {
    const noTokenRes = await fetch(`${URL}/api/projects`);
    expect(noTokenRes.status).toBe(401);

    const okRes = await fetch(`${URL}/api/projects`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(okRes.status).toBe(200);
  });

  it('GET /api/projects returns { data: Project[] } shape', async () => {
    const res = await fetch(`${URL}/api/projects`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const p = body.data[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('type');
      expect(p).toHaveProperty('visibility');
      expect(p).toHaveProperty('my_role');
      expect(p).toHaveProperty('updated_at');
    }
  });

  it('GET /api/memory returns { data: Memory[] } shape', async () => {
    const res = await fetch(`${URL}/api/memory?limit=3`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const m = body.data[0];
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('content');
      expect(m).toHaveProperty('layer');
      expect(m).toHaveProperty('project_id');
      expect(typeof m.pinned).toBe('boolean');
    }
  });

  it('GET /api/knowledge returns { data: Knowledge[] } shape', { timeout: 15_000 }, async () => {
    const res = await fetch(`${URL}/api/knowledge?limit=3`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const k = body.data[0];
      expect(k).toHaveProperty('id');
      expect(k).toHaveProperty('title');
      expect(k).toHaveProperty('content');
      expect(k).toHaveProperty('project_id');
    }
  });

  it('GET /api/custom-agents returns { data: CustomAgent[] } shape', async () => {
    const res = await fetch(`${URL}/api/custom-agents`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const a = body.data[0];
      expect(a).toHaveProperty('id');
      expect(a).toHaveProperty('slug');
      expect(a).toHaveProperty('name');
      expect(a).toHaveProperty('status');
    }
  });

  it('GET /api/sessions returns { data: Session[] } shape', async () => {
    const res = await fetch(`${URL}/api/sessions?limit=3`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    // Sessions may be empty — shape is still valid
  });

  // ---------- Chat ----------

  it('GET /api/chat/conversations returns { data: Conversation[] } shape', async () => {
    const res = await fetch(`${URL}/api/chat/conversations`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const c = body.data[0];
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('title');
      expect(c).toHaveProperty('owner_id');
      expect(c).toHaveProperty('created_at');
      expect(c).toHaveProperty('updated_at');
    }
  });

  it('GET /api/chat/conversations requires auth', async () => {
    const res = await fetch(`${URL}/api/chat/conversations`);
    expect(res.status).toBe(401);
  });

  it('GET /api/chat/conversations/:id/messages returns { data: Message[] } shape', async () => {
    // Requires an existing conversation — fetch list first.
    const listRes = await fetch(`${URL}/api/chat/conversations`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    const list = await listRes.json();
    if (!list.data || list.data.length === 0) return; // no conversations to test

    const convId: string = list.data[0].id;
    const res = await fetch(`${URL}/api/chat/conversations/${convId}/messages?limit=5`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const m = body.data[0];
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('conversation_id');
      expect(m).toHaveProperty('role');
      expect(m).toHaveProperty('content');
      expect(m).toHaveProperty('created_at');
    }
  });

  it('POST /api/chat/conversations/:id/send returns SSE with type field', { timeout: 20_000 }, async () => {
    // Get any conversation owned by us — or skip if none exist.
    const listRes = await fetch(`${URL}/api/chat/conversations`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    const list = await listRes.json();
    if (!list.data || list.data.length === 0) return;

    // Find a conversation with cli_provider set (needed for the bridge to route).
    const conv = list.data.find((c: { cli_provider: string | null }) => c.cli_provider !== null) ?? list.data[0];

    const res = await fetch(`${URL}/api/chat/conversations/${conv.id}/send`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ prompt: 'ping' }),
    });

    // The endpoint always returns 200 with SSE, even on CLI errors.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Read at least one SSE line to verify the protocol.
    const reader = res.body?.getReader();
    expect(reader).toBeTruthy();
    const { value } = await reader!.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('data:');
    // The line should be valid JSON inside "data: {...}".
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    expect(line).toBeTruthy();
    const parsed = JSON.parse(line!.slice(6)) as { type: string };
    expect(['chunk', 'end', 'error']).toContain(parsed.type);
  });

  it('GET /api/projects/:id returns { data: Project } for a known project', async () => {
    // First fetch the list to get a real project ID.
    const listRes = await fetch(`${URL}/api/projects`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    const list = await listRes.json();
    if (list.data.length === 0) return; // nothing to test

    const id: string = list.data[0].id;
    const res = await fetch(`${URL}/api/projects/${id}`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body.data.id).toBe(id);
  });

  // ---------- Chat scope regression: projectId + agentId ----------
  // Regression test for the "centralis confused with byan" bug.
  // Confirms that a conversation created with projectId and agentId has the
  // correct ids in the response — so the CLI uses the right context.

  it('POST /api/chat/conversations stores project_id when projectId is sent', async () => {
    // Need a real project id — grab first from list.
    const projRes = await fetch(`${URL}/api/projects`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    const projList = await projRes.json();
    if (!projList.data || projList.data.length === 0) return;
    const projectId: string = projList.data[0].id;

    const createRes = await fetch(`${URL}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '[integration-test] scope-project',
        cli_provider: 'claude-code',
        projectId,
      }),
    });
    expect(createRes.status).toBe(201);
    const body = await createRes.json();
    expect(body.data.project_id).toBe(projectId);

    // Cleanup — delete the test conversation.
    if (body.data?.id) {
      await fetch(`${URL}/api/chat/conversations/${body.data.id}`, {
        method: 'DELETE',
        headers: { Authorization: `ApiKey ${TOKEN}` },
      });
    }
  });

  it('POST /api/chat/conversations stores agent_id when agentId is sent', async () => {
    // Need a real agent id — grab first from list.
    const agentRes = await fetch(`${URL}/api/custom-agents`, {
      headers: { Authorization: `ApiKey ${TOKEN}` }
    });
    const agentList = await agentRes.json();
    if (!agentList.data || agentList.data.length === 0) return;
    const agentId: string = agentList.data[0].id;

    const createRes = await fetch(`${URL}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '[integration-test] scope-agent',
        cli_provider: 'claude-code',
        agentId,
      }),
    });
    expect(createRes.status).toBe(201);
    const body = await createRes.json();
    expect(body.data.agent_id).toBe(agentId);

    // Cleanup.
    if (body.data?.id) {
      await fetch(`${URL}/api/chat/conversations/${body.data.id}`, {
        method: 'DELETE',
        headers: { Authorization: `ApiKey ${TOKEN}` },
      });
    }
  });
});
