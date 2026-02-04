/**
 * Tests for StructuredLogger
 * 
 * @module __tests__/structured-logger
 */

const { StructuredLogger, LOG_LEVELS } = require('../src/observability/logger/structured-logger');

describe('StructuredLogger', () => {
  let logger;

  beforeEach(() => {
    logger = new StructuredLogger({ enableConsole: false });
  });

  describe('Constructor', () => {
    test('should initialize with default level INFO', () => {
      expect(logger.level).toBe('info');
      expect(logger.logs).toEqual([]);
    });

    test('should accept custom log level', () => {
      const customLogger = new StructuredLogger({ level: 'debug', enableConsole: false });
      expect(customLogger.level).toBe('debug');
    });

    test('should enable console by default', () => {
      const defaultLogger = new StructuredLogger();
      expect(defaultLogger.enableConsole).toBe(true);
    });
  });

  describe('setLevel', () => {
    test('should set valid log level', () => {
      logger.setLevel('debug');
      expect(logger.level).toBe('debug');

      logger.setLevel('error');
      expect(logger.level).toBe('error');
    });

    test('should throw error for invalid log level', () => {
      expect(() => logger.setLevel('invalid')).toThrow('Invalid log level');
    });
  });

  describe('Logging methods', () => {
    test('should log debug message', () => {
      logger.setLevel('debug');
      logger.debug('Debug message', { key: 'value' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('debug');
      expect(logs[0].message).toBe('Debug message');
      expect(logs[0].meta.key).toBe('value');
    });

    test('should log info message', () => {
      logger.info('Info message', { taskId: '123' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('Info message');
      expect(logs[0].meta.taskId).toBe('123');
    });

    test('should log warn message', () => {
      logger.warn('Warning message', { limit: 1000 });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');
      expect(logs[0].message).toBe('Warning message');
      expect(logs[0].meta.limit).toBe(1000);
    });

    test('should log error message', () => {
      logger.error('Error message', { error: 'Timeout' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toBe('Error message');
      expect(logs[0].meta.error).toBe('Timeout');
    });

    test('should include timestamp in log entry', () => {
      logger.info('Test message');

      const logs = logger.getLogs();
      expect(logs[0].timestamp).toBeDefined();
      expect(typeof logs[0].timestamp).toBe('string');
      expect(new Date(logs[0].timestamp).getTime()).toBeGreaterThan(0);
    });

    test('should handle empty metadata', () => {
      logger.info('Message without meta');

      const logs = logger.getLogs();
      expect(logs[0].meta).toEqual({});
    });

    test('should handle complex metadata', () => {
      const complexMeta = {
        user: { id: '123', name: 'Yan' },
        tags: ['important', 'urgent'],
        count: 42,
      };

      logger.info('Complex metadata', complexMeta);

      const logs = logger.getLogs();
      expect(logs[0].meta).toEqual(complexMeta);
    });
  });

  describe('Log level filtering', () => {
    test('should filter debug when level is info', () => {
      logger.setLevel('info');
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs.find(l => l.level === 'debug')).toBeUndefined();
    });

    test('should filter debug and info when level is warn', () => {
      logger.setLevel('warn');
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe('warn');
      expect(logs[1].level).toBe('error');
    });

    test('should only log errors when level is error', () => {
      logger.setLevel('error');
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
    });

    test('should log all when level is debug', () => {
      logger.setLevel('debug');
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(4);
    });
  });

  describe('getLogs', () => {
    test('should return empty array when no logs', () => {
      const logs = logger.getLogs();
      expect(logs).toEqual([]);
    });

    test('should return copy of logs array', () => {
      logger.info('Test message');
      
      const logs = logger.getLogs();
      logs.push({ level: 'fake' });

      expect(logger.logs).toHaveLength(1);
      expect(logs).toHaveLength(2);
    });

    test('should return all logs in order', () => {
      logger.info('First');
      logger.warn('Second');
      logger.error('Third');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('First');
      expect(logs[1].message).toBe('Second');
      expect(logs[2].message).toBe('Third');
    });
  });

  describe('getLogsByLevel', () => {
    beforeEach(() => {
      logger.setLevel('debug');
      logger.debug('Debug 1');
      logger.info('Info 1');
      logger.info('Info 2');
      logger.warn('Warn 1');
      logger.error('Error 1');
    });

    test('should filter logs by debug level', () => {
      const debugLogs = logger.getLogsByLevel('debug');
      expect(debugLogs).toHaveLength(1);
      expect(debugLogs[0].message).toBe('Debug 1');
    });

    test('should filter logs by info level', () => {
      const infoLogs = logger.getLogsByLevel('info');
      expect(infoLogs).toHaveLength(2);
    });

    test('should filter logs by warn level', () => {
      const warnLogs = logger.getLogsByLevel('warn');
      expect(warnLogs).toHaveLength(1);
    });

    test('should filter logs by error level', () => {
      const errorLogs = logger.getLogsByLevel('error');
      expect(errorLogs).toHaveLength(1);
    });

    test('should return empty array for level with no logs', () => {
      logger.clear();
      logger.info('Only info');
      
      const errorLogs = logger.getLogsByLevel('error');
      expect(errorLogs).toEqual([]);
    });
  });

  describe('clear', () => {
    test('should clear all logs', () => {
      logger.info('Message 1');
      logger.warn('Message 2');
      logger.error('Message 3');

      expect(logger.count()).toBe(3);

      logger.clear();

      expect(logger.count()).toBe(0);
      expect(logger.getLogs()).toEqual([]);
    });
  });

  describe('count', () => {
    test('should return 0 initially', () => {
      expect(logger.count()).toBe(0);
    });

    test('should return correct count', () => {
      logger.info('Message 1');
      expect(logger.count()).toBe(1);

      logger.info('Message 2');
      expect(logger.count()).toBe(2);

      logger.error('Message 3');
      expect(logger.count()).toBe(3);
    });
  });

  describe('getStats', () => {
    test('should return zero stats initially', () => {
      const stats = logger.getStats();
      
      expect(stats).toEqual({
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      });
    });

    test('should count logs by level', () => {
      logger.setLevel('debug');
      
      logger.debug('Debug 1');
      logger.debug('Debug 2');
      logger.info('Info 1');
      logger.warn('Warn 1');
      logger.warn('Warn 2');
      logger.warn('Warn 3');
      logger.error('Error 1');

      const stats = logger.getStats();
      
      expect(stats.debug).toBe(2);
      expect(stats.info).toBe(1);
      expect(stats.warn).toBe(3);
      expect(stats.error).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null metadata', () => {
      logger.info('Message', null);
      
      const logs = logger.getLogs();
      expect(logs[0].meta).toEqual({});
    });

    test('should handle undefined metadata', () => {
      logger.info('Message', undefined);
      
      const logs = logger.getLogs();
      expect(logs[0].meta).toEqual({});
    });

    test('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      logger.info(longMessage);

      const logs = logger.getLogs();
      expect(logs[0].message).toBe(longMessage);
    });

    test('should handle special characters in message', () => {
      const specialMessage = 'Message with "quotes" and \\backslashes\\ and emoji 🚀';
      logger.info(specialMessage);

      const logs = logger.getLogs();
      expect(logs[0].message).toBe(specialMessage);
    });

    test('should handle metadata with circular references', () => {
      const circular = { a: 1 };
      circular.self = circular;

      // Should not throw, but meta may be modified
      logger.info('Circular meta', circular);

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
    });
  });

  describe('LOG_LEVELS export', () => {
    test('should export LOG_LEVELS constant', () => {
      expect(LOG_LEVELS).toBeDefined();
      expect(LOG_LEVELS.DEBUG).toBe('debug');
      expect(LOG_LEVELS.INFO).toBe('info');
      expect(LOG_LEVELS.WARN).toBe('warn');
      expect(LOG_LEVELS.ERROR).toBe('error');
    });
  });
});
