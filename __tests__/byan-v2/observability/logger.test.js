/**
 * Logger Tests - TDD
 * AC: Winston structured logging, JSON format, file + console
 * Methods: logTaskRouting(), logTaskExecution(), logError()
 */

const fs = require('fs');
const path = require('path');
const Logger = require('../../../src/byan-v2/observability/logger');

// Test log directory
const TEST_LOG_DIR = path.join(__dirname, '../../../logs/test');
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, 'byan-test.log');

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    // Clean test logs before each test
    if (fs.existsSync(TEST_LOG_FILE)) {
      fs.unlinkSync(TEST_LOG_FILE);
    }
    
    logger = new Logger({
      logDir: TEST_LOG_DIR,
      logFile: 'byan-test.log',
      consoleOutput: false // Disable console for tests
    });
  });

  afterEach(() => {
    if (logger && logger.close) {
      logger.close();
    }
  });

  afterAll(() => {
    // Cleanup test logs
    if (fs.existsSync(TEST_LOG_FILE)) {
      fs.unlinkSync(TEST_LOG_FILE);
    }
  });

  describe('AC1: Initialization and Configuration', () => {
    test('should initialize with default configuration', () => {
      const defaultLogger = new Logger();
      expect(defaultLogger).toBeDefined();
      expect(defaultLogger.logger).toBeDefined();
    });

    test('should accept custom log directory and file', () => {
      const customLogger = new Logger({
        logDir: TEST_LOG_DIR,
        logFile: 'custom.log'
      });
      expect(customLogger).toBeDefined();
    });

    test('should create log directory if it does not exist', () => {
      const newDir = path.join(TEST_LOG_DIR, 'new-dir');
      
      // Ensure directory doesn't exist
      if (fs.existsSync(newDir)) {
        fs.rmSync(newDir, { recursive: true });
      }

      const newLogger = new Logger({
        logDir: newDir,
        logFile: 'test.log'
      });

      expect(fs.existsSync(newDir)).toBe(true);
      
      // Cleanup
      if (newLogger.close) newLogger.close();
      fs.rmSync(newDir, { recursive: true });
    });
  });

  describe('AC2: logTaskRouting()', () => {
    test('should log task routing decision with all required fields', (done) => {
      const routingData = {
        task: {
          type: 'explore',
          prompt: 'Find component'
        },
        executor: 'task-tool',
        complexity: 25,
        canFallback: false,
        reasoning: 'Low complexity task'
      };

      logger.logTaskRouting(routingData);

      // Wait for log to be written
      setTimeout(() => {
        expect(fs.existsSync(TEST_LOG_FILE)).toBe(true);
        
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.level).toBe('info');
        expect(lastLog.message).toContain('Task routing');
        expect(lastLog.executor).toBe('task-tool');
        expect(lastLog.complexity).toBe(25);
        expect(lastLog.taskType).toBe('explore');
        expect(lastLog.timestamp).toBeDefined();

        done();
      }, 100);
    });

    test('should handle routing data with metadata', (done) => {
      const routingData = {
        task: {
          type: 'task',
          prompt: 'Run tests',
          metadata: { priority: 'high' }
        },
        executor: 'task-tool',
        complexity: 45,
        canFallback: true
      };

      logger.logTaskRouting(routingData);

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.canFallback).toBe(true);
        expect(lastLog.metadata).toEqual({ priority: 'high' });

        done();
      }, 100);
    });
  });

  describe('AC3: logTaskExecution()', () => {
    test('should log task execution with duration and result', (done) => {
      const executionData = {
        task: {
          type: 'explore',
          prompt: 'Search files'
        },
        executor: 'task-tool',
        duration: 1250,
        success: true,
        result: 'Found 5 files'
      };

      logger.logTaskExecution(executionData);

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.level).toBe('info');
        expect(lastLog.message).toContain('Task execution');
        expect(lastLog.executor).toBe('task-tool');
        expect(lastLog.duration).toBe(1250);
        expect(lastLog.success).toBe(true);
        expect(lastLog.taskType).toBe('explore');

        done();
      }, 100);
    });

    test('should log failed execution', (done) => {
      const executionData = {
        task: {
          type: 'task',
          prompt: 'Build project'
        },
        executor: 'local',
        duration: 5000,
        success: false,
        error: 'Build failed: syntax error'
      };

      logger.logTaskExecution(executionData);

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.level).toBe('info');
        expect(lastLog.success).toBe(false);
        expect(lastLog.error).toContain('Build failed');

        done();
      }, 100);
    });

    test('should log token usage if provided', (done) => {
      const executionData = {
        task: { type: 'task', prompt: 'Test' },
        executor: 'task-tool',
        duration: 1000,
        success: true,
        tokens: 1500
      };

      logger.logTaskExecution(executionData);

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.tokens).toBe(1500);

        done();
      }, 100);
    });
  });

  describe('AC4: logError()', () => {
    test('should log error with type, message, and stack', (done) => {
      const error = new Error('Test error');
      const errorData = {
        type: 'ROUTING_ERROR',
        message: 'Failed to route task',
        error: error,
        context: {
          task: { type: 'explore' }
        }
      };

      logger.logError(errorData);

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.level).toBe('error');
        expect(lastLog.errorType).toBe('ROUTING_ERROR');
        expect(lastLog.message).toContain('Failed to route task');
        expect(lastLog.stack).toBeDefined();
        expect(lastLog.context).toBeDefined();

        done();
      }, 100);
    });

    test('should handle different error types', (done) => {
      const errorTypes = [
        'ROUTING_ERROR',
        'EXECUTION_ERROR',
        'VALIDATION_ERROR'
      ];

      errorTypes.forEach((type, index) => {
        logger.logError({
          type,
          message: `Error ${index}`,
          error: new Error(`Test ${type}`)
        });
      });

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');

        expect(logLines.length).toBe(3);
        
        logLines.forEach((line, index) => {
          const log = JSON.parse(line);
          expect(log.errorType).toBe(errorTypes[index]);
        });

        done();
      }, 100);
    });

    test('should handle error without context', (done) => {
      logger.logError({
        type: 'EXECUTION_ERROR',
        message: 'Simple error',
        error: new Error('Test')
      });

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.errorType).toBe('EXECUTION_ERROR');
        expect(lastLog.context).toBeUndefined();

        done();
      }, 100);
    });
  });

  describe('AC5: JSON Format', () => {
    test('should write logs in valid JSON format', (done) => {
      logger.logTaskRouting({
        task: { type: 'explore', prompt: 'test' },
        executor: 'task-tool',
        complexity: 20
      });

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');

        logLines.forEach(line => {
          expect(() => JSON.parse(line)).not.toThrow();
        });

        done();
      }, 100);
    });

    test('should include timestamp in ISO format', (done) => {
      logger.logTaskRouting({
        task: { type: 'explore', prompt: 'test' },
        executor: 'task-tool',
        complexity: 15
      });

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        const logLines = logContent.trim().split('\n');
        const lastLog = JSON.parse(logLines[logLines.length - 1]);

        expect(lastLog.timestamp).toBeDefined();
        const timestamp = new Date(lastLog.timestamp);
        expect(timestamp.toString()).not.toBe('Invalid Date');

        done();
      }, 100);
    });
  });

  describe('AC6: File and Console Output', () => {
    test('should write to file', (done) => {
      logger.logTaskRouting({
        task: { type: 'explore', prompt: 'test' },
        executor: 'task-tool',
        complexity: 10
      });

      setTimeout(() => {
        expect(fs.existsSync(TEST_LOG_FILE)).toBe(true);
        const stats = fs.statSync(TEST_LOG_FILE);
        expect(stats.size).toBeGreaterThan(0);

        done();
      }, 100);
    });

    test('should support console output when enabled', () => {
      const consoleLogger = new Logger({
        logDir: TEST_LOG_DIR,
        logFile: 'console-test.log',
        consoleOutput: true
      });

      // Just verify it doesn't throw
      expect(() => {
        consoleLogger.logTaskRouting({
          task: { type: 'explore', prompt: 'test' },
          executor: 'task-tool',
          complexity: 10
        });
      }).not.toThrow();

      if (consoleLogger.close) consoleLogger.close();
    });
  });

  describe('AC7: Edge Cases', () => {
    test('should handle missing optional fields gracefully', (done) => {
      logger.logTaskRouting({
        task: { type: 'explore' }, // No prompt
        executor: 'task-tool'
        // No complexity, no canFallback
      });

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        expect(() => JSON.parse(logContent)).not.toThrow();

        done();
      }, 100);
    });

    test('should handle null or undefined input safely', () => {
      expect(() => logger.logTaskRouting(null)).not.toThrow();
      expect(() => logger.logTaskExecution(undefined)).not.toThrow();
      expect(() => logger.logError(null)).not.toThrow();
    });

    test('should handle special characters in log messages', (done) => {
      logger.logTaskRouting({
        task: {
          type: 'explore',
          prompt: 'Test with "quotes" and \\backslash\\ and \nnewline'
        },
        executor: 'task-tool',
        complexity: 10
      });

      setTimeout(() => {
        const logContent = fs.readFileSync(TEST_LOG_FILE, 'utf8');
        expect(() => JSON.parse(logContent)).not.toThrow();

        done();
      }, 100);
    });
  });
});
