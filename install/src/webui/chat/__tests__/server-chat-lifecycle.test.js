/**
 * WebUI server chat-lifecycle regression tests (audit findings) :
 *   - a dropped WebSocket stops + drops the claude bridge bound to it
 *     (no orphaned child process on a closed tab) ;
 *   - 'join' is handled as a subscribe verb (the browser client's word) so a
 *     reconnect actually binds the ws to its session.
 *
 * The constructor is side-effect free (no disk / no listen until start()), so we
 * drive the pure handlers directly with a fake ws + fake bridge.
 */

const ByanWebUI = require('../../server');

function fakeWs() {
  return { readyState: 1, sent: [], _chatSessionId: null, send(s) { this.sent.push(s); } };
}

describe('ByanWebUI — chat lifecycle', () => {
  it('_onWsGone stops and drops the bridge bound to the closed ws', () => {
    const server = new ByanWebUI();
    const ws = fakeWs();
    ws._chatSessionId = 'chat-abc';
    let stopped = false;
    server.chatBridges.set('chat-abc', { stop: () => { stopped = true; return Promise.resolve(); } });
    server.clients.add(ws);

    server._onWsGone(ws);

    expect(stopped).toBe(true); // claude child asked to stop
    expect(server.chatBridges.has('chat-abc')).toBe(false); // map entry gone
    expect(server.clients.has(ws)).toBe(false); // client forgotten
  });

  it('_onWsGone is a no-op when the ws has no session bound', () => {
    const server = new ByanWebUI();
    const ws = fakeWs();
    server.clients.add(ws);
    expect(() => server._onWsGone(ws)).not.toThrow();
    expect(server.clients.has(ws)).toBe(false);
  });

  it("handles 'join' as a subscribe : binds the ws to its session", () => {
    const server = new ByanWebUI();
    const ws = fakeWs();
    server.handleChatMessage(ws, JSON.stringify({ type: 'join', sessionId: 'chat-xyz' }));
    expect(ws._chatSessionId).toBe('chat-xyz');
    const reply = JSON.parse(ws.sent[0]);
    expect(reply).toMatchObject({ type: 'subscribed', sessionId: 'chat-xyz' });
  });

  it("still handles 'chat-subscribe' identically", () => {
    const server = new ByanWebUI();
    const ws = fakeWs();
    server.handleChatMessage(ws, JSON.stringify({ type: 'chat-subscribe', sessionId: 'chat-1' }));
    expect(ws._chatSessionId).toBe('chat-1');
    expect(JSON.parse(ws.sent[0])).toMatchObject({ type: 'subscribed', sessionId: 'chat-1' });
  });
});
