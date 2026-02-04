/**
 * Tests for Dashboard
 * 
 * @module __tests__/dashboard
 */

const { printDashboard, generateSummary } = require('../src/observability/dashboard/dashboard');

describe('Dashboard', () => {
  describe('printDashboard', () => {
    test('should return formatted dashboard with header', () => {
      const output = printDashboard();

      expect(output).toContain('BYAN v2.0 Dashboard');
      expect(output).toContain('╔═══');
      expect(output).toContain('╚═══');
    });

    test('should include status section', () => {
      const output = printDashboard();

      expect(output).toContain('Status');
      expect(output).toContain('┌─');
      expect(output).toContain('└─');
    });

    test('should display status information', () => {
      const output = printDashboard({
        status: {
          version: '2.0.0',
          uptime: '3600s',
        },
      });

      expect(output).toContain('version');
      expect(output).toContain('2.0.0');
      expect(output).toContain('uptime');
      expect(output).toContain('3600s');
    });

    test('should show message when no status available', () => {
      const output = printDashboard({ status: {} });

      expect(output).toContain('No status information available');
    });

    test('should include metrics section', () => {
      const output = printDashboard();

      expect(output).toContain('Metrics');
    });

    test('should display metrics', () => {
      const output = printDashboard({
        metrics: {
          'api.calls': { value: 100, type: 'counter' },
          'cache.hits': { value: 250, type: 'counter' },
        },
      });

      expect(output).toContain('api.calls');
      expect(output).toContain('100');
      expect(output).toContain('cache.hits');
      expect(output).toContain('250');
    });

    test('should show message when no metrics available', () => {
      const output = printDashboard({ metrics: {} });

      expect(output).toContain('No metrics available');
    });

    test('should limit metrics display to 10', () => {
      const metrics = {};
      for (let i = 0; i < 15; i++) {
        metrics[`metric${i}`] = { value: i, type: 'gauge' };
      }

      const output = printDashboard({ metrics });

      expect(output).toContain('... and 5 more metrics');
    });

    test('should truncate long metric names', () => {
      const output = printDashboard({
        metrics: {
          'very.long.metric.name.that.exceeds.thirty.characters': {
            value: 123,
            type: 'gauge',
          },
        },
      });

      expect(output).toContain('very.long.metric.name.that.');
      expect(output).toContain('...');
    });

    test('should include recent logs section', () => {
      const output = printDashboard();

      expect(output).toContain('Recent Logs');
    });

    test('should display recent logs', () => {
      const output = printDashboard({
        logs: [
          { level: 'info', message: 'Task started', timestamp: '2025-01-01T00:00:00Z' },
          { level: 'warn', message: 'Rate limit approaching', timestamp: '2025-01-01T00:00:01Z' },
          { level: 'error', message: 'Task failed', timestamp: '2025-01-01T00:00:02Z' },
        ],
      });

      expect(output).toContain('[INFO]');
      expect(output).toContain('Task started');
      expect(output).toContain('[WARN]');
      expect(output).toContain('Rate limit approaching');
      expect(output).toContain('[ERROR]');
      expect(output).toContain('Task failed');
    });

    test('should show message when no logs available', () => {
      const output = printDashboard({ logs: [] });

      expect(output).toContain('No recent logs');
    });

    test('should limit logs to last 5', () => {
      const logs = Array.from({ length: 10 }, (_, i) => ({
        level: 'info',
        message: `Message ${i}`,
        timestamp: new Date().toISOString(),
      }));

      const output = printDashboard({ logs });

      // Should only contain last 5
      expect(output).toContain('Message 5');
      expect(output).toContain('Message 6');
      expect(output).toContain('Message 7');
      expect(output).toContain('Message 8');
      expect(output).toContain('Message 9');
      expect(output).not.toContain('Message 0');
      expect(output).not.toContain('Message 4');
    });

    test('should truncate long log messages', () => {
      const output = printDashboard({
        logs: [
          {
            level: 'info',
            message: 'This is a very long log message that exceeds forty characters and should be truncated',
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      });

      expect(output).toContain('This is a very long log message that');
      expect(output).toContain('...');
    });

    test('should include workers section', () => {
      const output = printDashboard();

      expect(output).toContain('Workers');
    });

    test('should display workers', () => {
      const output = printDashboard({
        workers: [
          { id: '1', status: 'idle' },
          { id: '2', status: 'busy' },
          { id: '3', status: 'idle' },
        ],
      });

      expect(output).toContain('Worker 1');
      expect(output).toContain('idle');
      expect(output).toContain('Worker 2');
      expect(output).toContain('busy');
      expect(output).toContain('Worker 3');
    });

    test('should show message when no workers available', () => {
      const output = printDashboard({ workers: [] });

      expect(output).toContain('No active workers');
    });

    test('should handle worker without status', () => {
      const output = printDashboard({
        workers: [{ id: '1' }],
      });

      expect(output).toContain('Worker 1');
      expect(output).toContain('unknown');
    });

    test('should return string type', () => {
      const output = printDashboard();

      expect(typeof output).toBe('string');
    });

    test('should handle empty data object', () => {
      const output = printDashboard({});

      expect(output).toContain('BYAN v2.0 Dashboard');
      expect(output).toContain('Status');
      expect(output).toContain('Metrics');
      expect(output).toContain('Recent Logs');
      expect(output).toContain('Workers');
    });

    test('should handle null data', () => {
      const output = printDashboard(null);

      expect(output).toContain('BYAN v2.0 Dashboard');
    });

    test('should format large numbers with separators', () => {
      const output = printDashboard({
        metrics: {
          'large.number': { value: 1234567, type: 'counter' },
        },
      });

      // Should contain number (locale format may vary - comma, space, or non-breaking space)
      expect(output).toContain('large.number');
      expect(output).toMatch(/1[\s,]234[\s,]567/);
    });

    test('should format decimal numbers', () => {
      const output = printDashboard({
        metrics: {
          'decimal.value': { value: 3.14159, type: 'gauge' },
        },
      });

      expect(output).toContain('3.14');
    });

    test('should format integer numbers without decimals', () => {
      const output = printDashboard({
        metrics: {
          'integer.value': { value: 42, type: 'counter' },
        },
      });

      expect(output).toContain('42');
      expect(output).not.toContain('42.00');
    });

    test('should use box-drawing characters', () => {
      const output = printDashboard();

      expect(output).toContain('╔');
      expect(output).toContain('╚');
      expect(output).toContain('═');
      expect(output).toContain('║');
      expect(output).toContain('┌');
      expect(output).toContain('└');
      expect(output).toContain('─');
      expect(output).toContain('│');
    });
  });

  describe('generateSummary', () => {
    test('should generate summary with header', () => {
      const summary = generateSummary();

      expect(summary).toContain('BYAN v2.0 Summary');
      expect(summary).toContain('═══');
    });

    test('should include metrics summary', () => {
      const summary = generateSummary({
        metrics: {
          total: 10,
          byType: {
            counter: 5,
            gauge: 3,
            timing: 2,
          },
        },
      });

      expect(summary).toContain('Metrics: 10 total');
      expect(summary).toContain('counter: 5');
      expect(summary).toContain('gauge: 3');
      expect(summary).toContain('timing: 2');
    });

    test('should include logs summary', () => {
      const summary = generateSummary({
        logs: {
          debug: 10,
          info: 25,
          warn: 3,
          error: 1,
        },
      });

      expect(summary).toContain('Logs: 39 total');
      expect(summary).toContain('debug: 10');
      expect(summary).toContain('info: 25');
      expect(summary).toContain('warn: 3');
      expect(summary).toContain('error: 1');
    });

    test('should handle empty metrics', () => {
      const summary = generateSummary({ metrics: {} });

      expect(summary).toContain('BYAN v2.0 Summary');
    });

    test('should handle empty logs', () => {
      const summary = generateSummary({ logs: {} });

      expect(summary).toContain('BYAN v2.0 Summary');
    });

    test('should handle null data', () => {
      const summary = generateSummary(null);

      expect(summary).toContain('BYAN v2.0 Summary');
    });

    test('should return string type', () => {
      const summary = generateSummary();

      expect(typeof summary).toBe('string');
    });

    test('should handle partial metrics data', () => {
      const summary = generateSummary({
        metrics: {
          total: 5,
          // byType missing
        },
      });

      expect(summary).toContain('Metrics: 5 total');
    });

    test('should handle partial logs data', () => {
      const summary = generateSummary({
        logs: {
          info: 10,
          error: 2,
          // debug and warn missing
        },
      });

      expect(summary).toContain('Logs: 12 total');
      expect(summary).toContain('debug: 0');
      expect(summary).toContain('info: 10');
      expect(summary).toContain('warn: 0');
      expect(summary).toContain('error: 2');
    });
  });

  describe('Edge Cases', () => {
    test('should handle special characters in status values', () => {
      const output = printDashboard({
        status: {
          message: 'Status: OK ✓',
        },
      });

      expect(output).toContain('Status: OK ✓');
    });

    test('should handle special characters in log messages', () => {
      const output = printDashboard({
        logs: [
          {
            level: 'info',
            message: 'Task completed ✓ 🚀',
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      });

      expect(output).toContain('Task completed');
    });

    test('should handle numeric worker IDs', () => {
      const output = printDashboard({
        workers: [
          { id: 1, status: 'idle' },
          { id: 2, status: 'busy' },
        ],
      });

      expect(output).toContain('Worker 1');
      expect(output).toContain('Worker 2');
    });

    test('should handle undefined values gracefully', () => {
      const output = printDashboard({
        status: { key: undefined },
        metrics: { 'test.metric': { value: undefined } },
      });

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
    });
  });

  describe('Integration', () => {
    test('should display complete dashboard with all sections', () => {
      const output = printDashboard({
        status: {
          version: '2.0.0',
          uptime: '3600s',
        },
        metrics: {
          'api.calls': { value: 100, type: 'counter' },
          'cache.hits': { value: 250, type: 'counter' },
          'request.duration': { value: 150, type: 'timing' },
        },
        logs: [
          { level: 'info', message: 'System started' },
          { level: 'warn', message: 'High load detected' },
        ],
        workers: [
          { id: '1', status: 'idle' },
          { id: '2', status: 'busy' },
        ],
      });

      // Verify all sections present
      expect(output).toContain('BYAN v2.0 Dashboard');
      expect(output).toContain('Status');
      expect(output).toContain('version');
      expect(output).toContain('Metrics');
      expect(output).toContain('api.calls');
      expect(output).toContain('Recent Logs');
      expect(output).toContain('System started');
      expect(output).toContain('Workers');
      expect(output).toContain('Worker 1');
    });
  });
});
