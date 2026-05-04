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
});
