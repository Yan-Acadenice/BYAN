/**
 * Logger Tests
 * 
 * Tests for install/lib/utils/logger.js
 */

const logger = require('../../lib/utils/logger');

// Mock chalk
jest.mock('chalk', () => ({
  green: jest.fn((text) => `GREEN:${text}`),
  red: jest.fn((text) => `RED:${text}`),
  yellow: jest.fn((text) => `YELLOW:${text}`),
  blue: jest.fn((text) => `BLUE:${text}`),
  gray: jest.fn((text) => `GRAY:${text}`)
}));

describe('Logger', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('success()', () => {
    it('should log success message in green', () => {
      logger.success('Test success');
      
      expect(consoleLogSpy).toHaveBeenCalledWith('GREEN:✓', 'Test success');
    });
  });

  describe('error()', () => {
    it('should log error message in red', () => {
      logger.error('Test error');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('RED:✖', 'Test error');
    });
  });

  describe('warn()', () => {
    it('should log warning message in yellow', () => {
      logger.warn('Test warning');
      
      expect(consoleLogSpy).toHaveBeenCalledWith('YELLOW:⚠', 'Test warning');
    });
  });

  describe('info()', () => {
    it('should log info message in blue', () => {
      logger.info('Test info');
      
      expect(consoleLogSpy).toHaveBeenCalledWith('BLUE:ℹ', 'Test info');
    });
  });

  describe('debug()', () => {
    it('should log debug message in gray when DEBUG env is set', () => {
      process.env.DEBUG = 'true';
      
      logger.debug('Test debug');
      
      expect(consoleLogSpy).toHaveBeenCalledWith('GRAY:[DEBUG]', 'Test debug');
      
      delete process.env.DEBUG;
    });

    it('should not log when DEBUG env is not set', () => {
      delete process.env.DEBUG;
      
      logger.debug('Test debug');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
