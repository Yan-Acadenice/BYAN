/**
 * RateLimitTracker Tests
 */

const { RateLimitTracker, STATES } = require('../../src/loadbalancer/rate-limit-tracker');

describe('RateLimitTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new RateLimitTracker('test-provider', {
      window_ms: 1000,
      throttle_threshold: 2,
      block_threshold: 3,
      recovery_probe_interval_ms: 100,
      half_open_max_requests: 2,
    });
  });

  afterEach(() => {
    tracker.destroy();
  });

  describe('initial state', () => {
    test('starts HEALTHY', () => {
      expect(tracker.state).toBe(STATES.HEALTHY);
      expect(tracker.canAcceptRequest()).toBe(true);
    });

    test('getState returns correct shape', () => {
      const state = tracker.getState();
      expect(state.provider).toBe('test-provider');
      expect(state.state).toBe('HEALTHY');
      expect(state.count429InWindow).toBe(0);
      expect(state.canAcceptRequest).toBe(true);
    });
  });

  describe('HEALTHY -> THROTTLED', () => {
    test('transitions after throttle_threshold 429s', () => {
      const changes = [];
      tracker.on('state_change', e => changes.push(e));

      tracker.record429();
      expect(tracker.state).toBe(STATES.HEALTHY);

      tracker.record429();
      expect(tracker.state).toBe(STATES.THROTTLED);
      expect(changes).toHaveLength(1);
      expect(changes[0].from).toBe('HEALTHY');
      expect(changes[0].to).toBe('THROTTLED');
    });

    test('still accepts requests when THROTTLED', () => {
      tracker.record429();
      tracker.record429();
      expect(tracker.state).toBe(STATES.THROTTLED);
      expect(tracker.canAcceptRequest()).toBe(true);
    });
  });

  describe('THROTTLED -> BLOCKED', () => {
    test('transitions after block_threshold 429s', () => {
      tracker.record429();
      tracker.record429();
      tracker.record429();
      expect(tracker.state).toBe(STATES.BLOCKED);
      expect(tracker.canAcceptRequest()).toBe(false);
    });
  });

  describe('BLOCKED -> RECOVERING -> HEALTHY', () => {
    test('recovers after probe interval and successful requests', (done) => {
      tracker.record429();
      tracker.record429();
      tracker.record429();
      expect(tracker.state).toBe(STATES.BLOCKED);

      setTimeout(() => {
        expect(tracker.state).toBe(STATES.RECOVERING);
        expect(tracker.canAcceptRequest()).toBe(true);

        tracker.recordSuccess();
        tracker.recordSuccess();
        expect(tracker.state).toBe(STATES.HEALTHY);
        done();
      }, 150);
    });

    test('RECOVERING -> BLOCKED on 429 during recovery', (done) => {
      tracker.record429();
      tracker.record429();
      tracker.record429();

      setTimeout(() => {
        expect(tracker.state).toBe(STATES.RECOVERING);
        tracker.record429();
        expect(tracker.state).toBe(STATES.BLOCKED);
        done();
      }, 150);
    });
  });

  describe('THROTTLED -> HEALTHY', () => {
    test('returns to HEALTHY when window clears', (done) => {
      tracker.record429();
      tracker.record429();
      expect(tracker.state).toBe(STATES.THROTTLED);

      setTimeout(() => {
        tracker.recordSuccess();
        expect(tracker.state).toBe(STATES.HEALTHY);
        done();
      }, 1100);
    });
  });

  describe('recordHeaders (preemptive detection)', () => {
    test('throttles when x-ratelimit-remaining is low', () => {
      tracker.recordHeaders({ 'x-ratelimit-remaining': '1' });
      expect(tracker.state).toBe(STATES.THROTTLED);
    });

    test('blocks via retry-after header', () => {
      tracker.recordHeaders({ 'retry-after': '60' });
      expect(tracker.state).toBe(STATES.HEALTHY);

      tracker.recordHeaders({ 'retry-after': '30' });
      expect(tracker.state).toBe(STATES.THROTTLED);

      tracker.recordHeaders({ 'retry-after': '30' });
      expect(tracker.state).toBe(STATES.BLOCKED);
    });

    test('ignores headers without relevant fields', () => {
      tracker.recordHeaders({});
      tracker.recordHeaders({ 'content-type': 'application/json' });
      expect(tracker.state).toBe(STATES.HEALTHY);
    });
  });

  describe('reset', () => {
    test('forces HEALTHY from any state', () => {
      tracker.record429();
      tracker.record429();
      tracker.record429();
      expect(tracker.state).toBe(STATES.BLOCKED);

      tracker.reset();
      expect(tracker.state).toBe(STATES.HEALTHY);
      expect(tracker.canAcceptRequest()).toBe(true);
      expect(tracker.getState().count429InWindow).toBe(0);
    });
  });

  describe('window pruning', () => {
    test('old 429s are pruned outside window', (done) => {
      tracker.record429();
      tracker.record429();
      expect(tracker.state).toBe(STATES.THROTTLED);

      setTimeout(() => {
        expect(tracker.getState().count429InWindow).toBe(0);
        done();
      }, 1100);
    });
  });

  describe('counters', () => {
    test('tracks total requests and 429s', () => {
      tracker.recordSuccess();
      tracker.record429();
      tracker.recordSuccess();

      const state = tracker.getState();
      expect(state.totalRequests).toBe(3);
      expect(state.total429s).toBe(1);
    });
  });
});
