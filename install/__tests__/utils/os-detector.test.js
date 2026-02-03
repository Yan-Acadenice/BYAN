/**
 * OS Detector Tests
 * 
 * Tests for install/lib/utils/os-detector.js
 */

const osDetector = require('../../lib/utils/os-detector');
const os = require('os');

describe('OS Detector', () => {
  describe('detect()', () => {
    it('should detect operating system with name, version, and platform', () => {
      const result = osDetector.detect();
      
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('platform');
      
      expect(typeof result.name).toBe('string');
      expect(typeof result.version).toBe('string');
      expect(typeof result.platform).toBe('string');
      
      // Validate name is one of expected values
      expect(['windows', 'macos', 'linux', 'unknown']).toContain(result.name);
      
      // Platform should match os.platform()
      expect(result.platform).toBe(os.platform());
      
      // Version should match os.release()
      expect(result.version).toBe(os.release());
    });
  });

  describe('isWindows()', () => {
    it('should return true on Windows, false otherwise', () => {
      const result = osDetector.isWindows();
      const expected = os.platform() === 'win32';
      
      expect(result).toBe(expected);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isMacOS()', () => {
    it('should return true on macOS, false otherwise', () => {
      const result = osDetector.isMacOS();
      const expected = os.platform() === 'darwin';
      
      expect(result).toBe(expected);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isLinux()', () => {
    it('should return true on Linux, false otherwise', () => {
      const result = osDetector.isLinux();
      const expected = os.platform() === 'linux';
      
      expect(result).toBe(expected);
      expect(typeof result).toBe('boolean');
    });
  });
});
