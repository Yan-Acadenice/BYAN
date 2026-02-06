/**
 * Tests for MetricsCollector
 * 
 * @module __tests__/metrics-collector
 */

const { MetricsCollector } = require('../src/observability/metrics/metrics-collector');

describe('MetricsCollector', () => {
  let metrics;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  describe('Constructor', () => {
    test('should initialize with empty metrics', () => {
      expect(metrics.count()).toBe(0);
      expect(metrics.getMetrics()).toEqual({});
    });
  });

  describe('recordMetric', () => {
    test('should record a simple metric', () => {
      metrics.recordMetric('memory.usage', 1024);

      const metric = metrics.getMetric('memory.usage');
      expect(metric.name).toBe('memory.usage');
      expect(metric.value).toBe(1024);
      expect(metric.type).toBe('gauge');
    });

    test('should record metric with tags', () => {
      metrics.recordMetric('cpu.usage', 75, { core: '0', server: 'main' });

      const metric = metrics.getMetric('cpu.usage', { core: '0', server: 'main' });
      expect(metric.value).toBe(75);
      expect(metric.tags).toEqual({ core: '0', server: 'main' });
    });

    test('should throw error for invalid name', () => {
      expect(() => metrics.recordMetric('', 100)).toThrow('non-empty string');
      expect(() => metrics.recordMetric(null, 100)).toThrow('non-empty string');
      expect(() => metrics.recordMetric(123, 100)).toThrow('non-empty string');
    });

    test('should throw error for invalid value', () => {
      expect(() => metrics.recordMetric('test', 'not-a-number')).toThrow('must be a number');
      expect(() => metrics.recordMetric('test', NaN)).toThrow('cannot be NaN');
    });

    test('should include timestamp', () => {
      metrics.recordMetric('test.metric', 42);

      const metric = metrics.getMetric('test.metric');
      expect(metric.timestamp).toBeDefined();
      expect(typeof metric.timestamp).toBe('string');
    });

    test('should overwrite existing metric', () => {
      metrics.recordMetric('test.metric', 100);
      metrics.recordMetric('test.metric', 200);

      const metric = metrics.getMetric('test.metric');
      expect(metric.value).toBe(200);
      expect(metrics.count()).toBe(1);
    });
  });

  describe('increment', () => {
    test('should increment counter by 1', () => {
      metrics.increment('api.calls');
      
      const metric = metrics.getMetric('api.calls');
      expect(metric.value).toBe(1);
      expect(metric.type).toBe('counter');
    });

    test('should increment existing counter', () => {
      metrics.increment('api.calls');
      metrics.increment('api.calls');
      metrics.increment('api.calls');

      const metric = metrics.getMetric('api.calls');
      expect(metric.value).toBe(3);
    });

    test('should increment by custom delta', () => {
      metrics.increment('cache.hits', {}, 5);
      metrics.increment('cache.hits', {}, 3);

      const metric = metrics.getMetric('cache.hits');
      expect(metric.value).toBe(8);
    });

    test('should increment with tags', () => {
      metrics.increment('api.calls', { endpoint: '/chat' });
      metrics.increment('api.calls', { endpoint: '/users' });
      metrics.increment('api.calls', { endpoint: '/chat' });

      const chatMetric = metrics.getMetric('api.calls', { endpoint: '/chat' });
      const usersMetric = metrics.getMetric('api.calls', { endpoint: '/users' });

      expect(chatMetric.value).toBe(2);
      expect(usersMetric.value).toBe(1);
    });

    test('should throw error for invalid name', () => {
      expect(() => metrics.increment('')).toThrow('non-empty string');
    });

    test('should throw error for invalid delta', () => {
      expect(() => metrics.increment('test', {}, 'invalid')).toThrow('Delta must be a number');
    });
  });

  describe('decrement', () => {
    test('should decrement counter by 1', () => {
      metrics.increment('connections', {}, 10);
      metrics.decrement('connections');

      const metric = metrics.getMetric('connections');
      expect(metric.value).toBe(9);
    });

    test('should decrement by custom delta', () => {
      metrics.increment('connections', {}, 10);
      metrics.decrement('connections', {}, 3);

      const metric = metrics.getMetric('connections');
      expect(metric.value).toBe(7);
    });

    test('should allow negative values', () => {
      metrics.decrement('connections');
      
      const metric = metrics.getMetric('connections');
      expect(metric.value).toBe(-1);
    });
  });

  describe('recordDuration', () => {
    test('should record duration', () => {
      metrics.recordDuration('request.duration', 150);

      const metric = metrics.getMetric('request.duration');
      expect(metric.value).toBe(150);
      expect(metric.type).toBe('timing');
    });

    test('should record duration with tags', () => {
      metrics.recordDuration('request.duration', 150, { status: '200' });
      metrics.recordDuration('request.duration', 500, { status: '500' });

      const success = metrics.getMetric('request.duration', { status: '200' });
      const error = metrics.getMetric('request.duration', { status: '500' });

      expect(success.value).toBe(150);
      expect(error.value).toBe(500);
    });

    test('should throw error for invalid name', () => {
      expect(() => metrics.recordDuration('', 100)).toThrow('non-empty string');
    });

    test('should throw error for invalid duration', () => {
      expect(() => metrics.recordDuration('test', 'invalid')).toThrow('must be a number');
    });

    test('should throw error for negative duration', () => {
      expect(() => metrics.recordDuration('test', -10)).toThrow('cannot be negative');
    });

    test('should accept zero duration', () => {
      metrics.recordDuration('instant.request', 0);

      const metric = metrics.getMetric('instant.request');
      expect(metric.value).toBe(0);
    });
  });

  describe('getMetrics', () => {
    test('should return empty object initially', () => {
      expect(metrics.getMetrics()).toEqual({});
    });

    test('should return all metrics', () => {
      metrics.recordMetric('metric1', 100);
      metrics.recordMetric('metric2', 200);
      metrics.increment('counter1');

      const allMetrics = metrics.getMetrics();
      
      expect(Object.keys(allMetrics)).toHaveLength(3);
      expect(allMetrics['metric1'].value).toBe(100);
      expect(allMetrics['metric2'].value).toBe(200);
      expect(allMetrics['counter1'].value).toBe(1);
    });

    test('should return copy of metrics', () => {
      metrics.recordMetric('test', 100);
      
      const metricsObj = metrics.getMetrics();
      metricsObj['test'].value = 999;

      const original = metrics.getMetric('test');
      expect(original.value).toBe(100);
    });
  });

  describe('getMetric', () => {
    test('should return specific metric', () => {
      metrics.recordMetric('test.metric', 42);

      const metric = metrics.getMetric('test.metric');
      expect(metric.value).toBe(42);
    });

    test('should return null for non-existent metric', () => {
      const metric = metrics.getMetric('does.not.exist');
      expect(metric).toBeNull();
    });

    test('should get metric with tags', () => {
      metrics.recordMetric('cpu', 50, { core: '0' });
      metrics.recordMetric('cpu', 75, { core: '1' });

      const core0 = metrics.getMetric('cpu', { core: '0' });
      const core1 = metrics.getMetric('cpu', { core: '1' });

      expect(core0.value).toBe(50);
      expect(core1.value).toBe(75);
    });
  });

  describe('getMetricsByPrefix', () => {
    beforeEach(() => {
      metrics.recordMetric('api.calls', 100);
      metrics.recordMetric('api.errors', 5);
      metrics.recordMetric('cache.hits', 200);
      metrics.recordMetric('cache.misses', 50);
    });

    test('should filter metrics by prefix', () => {
      const apiMetrics = metrics.getMetricsByPrefix('api.');
      
      expect(Object.keys(apiMetrics)).toHaveLength(2);
      expect(apiMetrics['api.calls']).toBeDefined();
      expect(apiMetrics['api.errors']).toBeDefined();
    });

    test('should return empty object for non-matching prefix', () => {
      const result = metrics.getMetricsByPrefix('database.');
      expect(result).toEqual({});
    });

    test('should return all metrics with empty prefix', () => {
      const result = metrics.getMetricsByPrefix('');
      expect(Object.keys(result)).toHaveLength(4);
    });
  });

  describe('getMetricsByType', () => {
    beforeEach(() => {
      metrics.recordMetric('gauge1', 100);
      metrics.increment('counter1');
      metrics.recordDuration('timing1', 150);
      metrics.increment('counter2');
    });

    test('should filter metrics by type gauge', () => {
      const gauges = metrics.getMetricsByType('gauge');
      expect(Object.keys(gauges)).toHaveLength(1);
    });

    test('should filter metrics by type counter', () => {
      const counters = metrics.getMetricsByType('counter');
      expect(Object.keys(counters)).toHaveLength(2);
    });

    test('should filter metrics by type timing', () => {
      const timings = metrics.getMetricsByType('timing');
      expect(Object.keys(timings)).toHaveLength(1);
    });

    test('should return empty object for non-existent type', () => {
      const result = metrics.getMetricsByType('invalid');
      expect(result).toEqual({});
    });
  });

  describe('clear', () => {
    test('should clear all metrics', () => {
      metrics.recordMetric('metric1', 100);
      metrics.increment('counter1');
      metrics.recordDuration('timing1', 150);

      expect(metrics.count()).toBe(3);

      metrics.clear();

      expect(metrics.count()).toBe(0);
      expect(metrics.getMetrics()).toEqual({});
    });
  });

  describe('count', () => {
    test('should return 0 initially', () => {
      expect(metrics.count()).toBe(0);
    });

    test('should return correct count', () => {
      metrics.recordMetric('metric1', 100);
      expect(metrics.count()).toBe(1);

      metrics.increment('counter1');
      expect(metrics.count()).toBe(2);

      metrics.recordDuration('timing1', 150);
      expect(metrics.count()).toBe(3);
    });
  });

  describe('resetMetric', () => {
    test('should reset existing metric to zero', () => {
      metrics.increment('counter', {}, 10);
      
      const reset = metrics.resetMetric('counter');
      
      expect(reset).toBe(true);
      expect(metrics.getMetric('counter').value).toBe(0);
    });

    test('should return false for non-existent metric', () => {
      const reset = metrics.resetMetric('does.not.exist');
      expect(reset).toBe(false);
    });

    test('should reset metric with tags', () => {
      metrics.increment('api.calls', { endpoint: '/chat' }, 5);
      
      metrics.resetMetric('api.calls', { endpoint: '/chat' });
      
      expect(metrics.getMetric('api.calls', { endpoint: '/chat' }).value).toBe(0);
    });
  });

  describe('getStats', () => {
    test('should return zero stats initially', () => {
      const stats = metrics.getStats();
      
      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
    });

    test('should return stats by type', () => {
      metrics.recordMetric('gauge1', 100);
      metrics.recordMetric('gauge2', 200);
      metrics.increment('counter1');
      metrics.increment('counter2');
      metrics.increment('counter3');
      metrics.recordDuration('timing1', 150);

      const stats = metrics.getStats();
      
      expect(stats.total).toBe(6);
      expect(stats.byType.gauge).toBe(2);
      expect(stats.byType.counter).toBe(3);
      expect(stats.byType.timing).toBe(1);
    });
  });

  describe('Tags handling', () => {
    test('should distinguish metrics with different tags', () => {
      metrics.increment('requests', { method: 'GET' });
      metrics.increment('requests', { method: 'POST' });
      metrics.increment('requests', { method: 'GET' });

      expect(metrics.getMetric('requests', { method: 'GET' }).value).toBe(2);
      expect(metrics.getMetric('requests', { method: 'POST' }).value).toBe(1);
    });

    test('should handle tags in any order', () => {
      metrics.increment('test', { a: '1', b: '2' });
      metrics.increment('test', { b: '2', a: '1' });

      expect(metrics.count()).toBe(1);
      expect(metrics.getMetric('test', { a: '1', b: '2' }).value).toBe(2);
    });

    test('should handle empty tags', () => {
      metrics.increment('test', {});
      metrics.increment('test');

      expect(metrics.count()).toBe(1);
      expect(metrics.getMetric('test').value).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large values', () => {
      const largeValue = Number.MAX_SAFE_INTEGER;
      metrics.recordMetric('large', largeValue);

      expect(metrics.getMetric('large').value).toBe(largeValue);
    });

    test('should handle negative values', () => {
      metrics.recordMetric('negative', -100);
      expect(metrics.getMetric('negative').value).toBe(-100);
    });

    test('should handle floating point values', () => {
      metrics.recordMetric('float', 3.14159);
      expect(metrics.getMetric('float').value).toBe(3.14159);
    });

    test('should handle special metric names', () => {
      metrics.recordMetric('metric.with.dots', 100);
      metrics.recordMetric('metric-with-dashes', 200);
      metrics.recordMetric('metric_with_underscores', 300);

      expect(metrics.count()).toBe(3);
    });

    test('should handle complex tag values', () => {
      metrics.increment('test', { url: 'http://example.com/path?query=value' });
      
      const metric = metrics.getMetric('test', { url: 'http://example.com/path?query=value' });
      expect(metric.value).toBe(1);
    });
  });
});
