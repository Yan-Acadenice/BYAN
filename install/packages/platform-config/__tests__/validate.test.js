const { validateByanWebReachability } = require('../lib/validate');

describe('validate', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  test('returns reachable:true with status and latency on 200', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });
    const result = await validateByanWebReachability({
      apiUrl: 'http://localhost:3737',
      token: 'byan_test-token',
    });
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(200);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.error).toBeUndefined();
  });

  test('returns reachable:true with error message on 4xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 401 });
    const result = await validateByanWebReachability({
      apiUrl: 'http://localhost:3737',
      token: 'bad-token',
    });
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/401/);
  });

  test('returns reachable:false on network error — never throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await validateByanWebReachability({
      apiUrl: 'http://localhost:9999',
    });
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  test('sets ApiKey scheme for byan_ prefixed token', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });
    await validateByanWebReachability({
      apiUrl: 'http://localhost:3737',
      token: 'byan_abc123',
    });
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('ApiKey byan_abc123');
  });

  test('sets Bearer scheme for non-byan_ token', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });
    await validateByanWebReachability({
      apiUrl: 'http://localhost:3737',
      token: 'eyJhbGciOiJIUzI1NiJ9.foo',
    });
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toMatch(/^Bearer /);
  });

  test('strips /api suffix before appending /api/health', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });
    await validateByanWebReachability({
      apiUrl: 'http://localhost:3737/api',
    });
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toBe('http://localhost:3737/api/health');
  });

  test('sends no Authorization header when token is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });
    await validateByanWebReachability({ apiUrl: 'http://localhost:3737' });
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });
});
