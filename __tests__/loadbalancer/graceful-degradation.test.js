/**
 * GracefulDegradation Tests
 */

const { GracefulDegradation, PRIORITY } = require('../../src/loadbalancer/graceful-degradation');

function createMockLB({ allBlocked = false } = {}) {
  const { EventEmitter } = require('events');
  const lb = new EventEmitter();
  lb.send = async (opts) => {
    if (allBlocked) {
      return { provider: null, content: null, error: 'All providers rate-limited', rateLimited: true };
    }
    return { provider: 'claude', content: `Response: ${opts.prompt}`, rateLimited: false };
  };
  return lb;
}

describe('GracefulDegradation', () => {
  let gd;

  afterEach(() => {
    if (gd) gd.destroy();
  });

  describe('enqueue', () => {
    test('queues a request and returns position', () => {
      const lb = createMockLB({ allBlocked: true });
      gd = new GracefulDegradation({ lb });

      const result = gd.enqueue({ prompt: 'test', priority: 'P1' });
      result.promise.catch(() => {});
      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);
      expect(result.estimatedWaitMs).toBeGreaterThan(0);
    });

    test('orders by priority then FIFO', () => {
      const lb = createMockLB({ allBlocked: true });
      gd = new GracefulDegradation({ lb });

      const r1 = gd.enqueue({ prompt: 'low', priority: 'P3' });
      const r2 = gd.enqueue({ prompt: 'high', priority: 'P1' });
      const r3 = gd.enqueue({ prompt: 'med', priority: 'P2' });
      [r1, r2, r3].forEach(r => r.promise.catch(() => {}));

      const status = gd.getStatus();
      expect(status.items[0].priority).toBe(PRIORITY.P1);
      expect(status.items[1].priority).toBe(PRIORITY.P2);
      expect(status.items[2].priority).toBe(PRIORITY.P3);
    });
  });

  describe('getStatus', () => {
    test('returns queue metrics', () => {
      const lb = createMockLB({ allBlocked: true });
      gd = new GracefulDegradation({ lb });

      const r1 = gd.enqueue({ prompt: 'a' });
      const r2 = gd.enqueue({ prompt: 'b' });
      [r1, r2].forEach(r => r.promise.catch(() => {}));

      const status = gd.getStatus();
      expect(status.queueSize).toBe(2);
      expect(status.totalQueued).toBe(2);
    });
  });

  describe('drop', () => {
    test('removes item from queue', () => {
      const lb = createMockLB({ allBlocked: true });
      gd = new GracefulDegradation({ lb });

      const { id, promise } = gd.enqueue({ prompt: 'test' });
      promise.catch(() => {});
      expect(gd.getStatus().queueSize).toBe(1);

      gd.drop(id);
      expect(gd.getStatus().queueSize).toBe(0);
      expect(gd.getStatus().totalDropped).toBe(1);
    });
  });

  describe('dropAll', () => {
    test('clears entire queue', () => {
      const lb = createMockLB({ allBlocked: true });
      gd = new GracefulDegradation({ lb });

      const r1 = gd.enqueue({ prompt: 'a' });
      const r2 = gd.enqueue({ prompt: 'b' });
      r1.promise.catch(() => {});
      r2.promise.catch(() => {});
      gd.dropAll();

      expect(gd.getStatus().queueSize).toBe(0);
      expect(gd.getStatus().totalDropped).toBe(2);
    });
  });

  describe('recovery', () => {
    test('processes queue when provider recovers', (done) => {
      const lb = createMockLB({ allBlocked: false });
      gd = new GracefulDegradation({ lb });

      gd.on('processed', (event) => {
        expect(event.provider).toBe('claude');
        expect(gd.getStatus().totalProcessed).toBe(1);
        done();
      });

      gd.enqueue({ prompt: 'test' });
    });
  });

  describe('PRIORITY constant', () => {
    test('P1 < P2 < P3', () => {
      expect(PRIORITY.P1).toBeLessThan(PRIORITY.P2);
      expect(PRIORITY.P2).toBeLessThan(PRIORITY.P3);
    });
  });
});
