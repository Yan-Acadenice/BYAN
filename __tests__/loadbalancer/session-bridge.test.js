/**
 * SessionBridge Tests
 */

const { SessionBridge } = require('../../src/loadbalancer/session-bridge');

function createMockStore() {
  const conversations = {};
  const switchovers = [];

  return {
    getConversation(id) {
      return conversations[id] || null;
    },
    createConversation(id, provider) {
      conversations[id] = {
        id,
        active_provider: provider,
        context_json: null,
        status: 'active',
      };
      return conversations[id];
    },
    updateConversation(id, fields) {
      if (!conversations[id]) return;
      Object.assign(conversations[id], fields);
    },
    getSwitchoversForConversation(id) {
      return switchovers.filter(s => s.conversation_id === id);
    },
    recordSwitchover(data) {
      const entry = {
        id: switchovers.length + 1,
        conversation_id: data.conversationId,
        from_provider: data.from,
        to_provider: data.to,
        reason: data.reason,
        context_snapshot: data.contextSnapshot,
        context_fidelity_pct: data.fidelityPct,
        switched_at: new Date().toISOString(),
      };
      switchovers.push(entry);
      return entry.id;
    },
    _conversations: conversations,
    _switchovers: switchovers,
  };
}

describe('SessionBridge', () => {
  let bridge;
  let store;

  beforeEach(() => {
    store = createMockStore();
    bridge = new SessionBridge({ store, maxTokens: 2000 });
  });

  describe('extract', () => {
    test('extracts context from store', async () => {
      store.createConversation('conv-1', 'claude');
      store.updateConversation('conv-1', {
        context_json: JSON.stringify({
          summary: 'Working on loadbalancer feature',
          filesTouched: ['src/loadbalancer/config.js'],
          decisions: ['Use MCP server architecture'],
          currentTask: 'Building Sprint 1',
        }),
      });

      const provider = { name: 'claude' };
      const ctx = await bridge.extract(provider, 'conv-1');

      expect(ctx.sourceProvider).toBe('claude');
      expect(ctx.summary).toBe('Working on loadbalancer feature');
      expect(ctx.filesTouched).toContain('src/loadbalancer/config.js');
      expect(ctx.fidelityPct).toBe(85);
    });

    test('returns default context when no store data', async () => {
      const provider = { name: 'copilot' };
      const ctx = await bridge.extract(provider, 'nonexistent');

      expect(ctx.sourceProvider).toBe('copilot');
      expect(ctx.summary).toBe('No conversation summary available.');
      expect(ctx.fidelityPct).toBe(50);
    });
  });

  describe('updateContext', () => {
    test('merges new context with existing', () => {
      store.createConversation('conv-1', 'claude');
      store.updateConversation('conv-1', {
        context_json: JSON.stringify({
          filesTouched: ['file1.js'],
          decisions: ['decision1'],
        }),
      });

      bridge.updateContext('conv-1', {
        filesTouched: ['file2.js'],
        decisions: ['decision2'],
        currentTask: 'New task',
      });

      const conv = store.getConversation('conv-1');
      const ctx = JSON.parse(conv.context_json);
      expect(ctx.filesTouched).toEqual(['file1.js', 'file2.js']);
      expect(ctx.decisions).toEqual(['decision1', 'decision2']);
      expect(ctx.currentTask).toBe('New task');
    });
  });

  describe('formatInjectionPrompt', () => {
    test('generates readable prompt from context', () => {
      const ctx = {
        conversationId: 'conv-1',
        sourceProvider: 'claude',
        targetProvider: 'copilot',
        summary: 'Building a loadbalancer feature',
        filesTouched: ['config.js', 'loadbalancer.js'],
        decisions: ['Use MCP architecture', 'Claude as primary'],
        currentTask: 'Sprint 2 implementation',
        agentState: { fdPhase: 'BUILD' },
        switchHistory: [
          { from: 'claude', to: 'copilot', reason: 'rate_limit', at: '2026-04-20T08:30:00Z' },
        ],
        fidelityPct: 85,
        transferredAt: '2026-04-20T08:30:00Z',
      };

      const prompt = bridge.formatInjectionPrompt(ctx);

      expect(prompt).toContain('CONTEXT TRANSFER');
      expect(prompt).toContain('claude');
      expect(prompt).toContain('Building a loadbalancer feature');
      expect(prompt).toContain('config.js');
      expect(prompt).toContain('Use MCP architecture');
      expect(prompt).toContain('Sprint 2 implementation');
      expect(prompt).toContain('fdPhase');
      expect(prompt).toContain('85%');
    });
  });

  describe('transfer', () => {
    test('full transfer records switchover and returns injection prompt', async () => {
      store.createConversation('conv-1', 'claude');
      store.updateConversation('conv-1', {
        context_json: JSON.stringify({
          summary: 'Working on feature X',
          filesTouched: ['a.js'],
          decisions: ['Use pattern Y'],
          currentTask: 'Build',
        }),
      });

      const source = { name: 'claude' };
      const result = await bridge.transfer(source, 'copilot', 'conv-1', 'rate_limit');

      expect(result.context.sourceProvider).toBe('claude');
      expect(result.context.targetProvider).toBe('copilot');
      expect(result.injectionPrompt).toContain('CONTEXT TRANSFER');
      expect(store._switchovers).toHaveLength(1);
      expect(store._switchovers[0].from_provider).toBe('claude');
      expect(store._switchovers[0].to_provider).toBe('copilot');
    });
  });
});
