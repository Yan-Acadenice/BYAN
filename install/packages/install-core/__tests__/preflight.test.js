'use strict';

// Tests for lib/preflight.js (C10): an ES5-only Node version guard that can run
// on ancient Node and print a clear message before any modern require.

const fs = require('fs');
const path = require('path');

const PREFLIGHT_PATH = path.join(__dirname, '..', 'lib', 'preflight.js');
const preflight = require('../lib/preflight');

describe('preflight (lib/preflight.js)', () => {
  describe('exports', () => {
    test('exports a preflight function and MIN_MAJOR / checkNode', () => {
      expect(typeof preflight.preflight).toBe('function');
      expect(typeof preflight.checkNode).toBe('function');
      expect(preflight.MIN_MAJOR).toBe(18);
    });
  });

  describe('preflight(minMajor)', () => {
    test('ok:true on the current (modern) Node runner', () => {
      const result = preflight.preflight();
      expect(result.ok).toBe(true);
      expect(typeof result.message).toBe('string');
    });

    test('default minMajor is MIN_MAJOR (18)', () => {
      // Current Node on the runner is >= 18, so the default must pass.
      const result = preflight.preflight();
      expect(result.ok).toBe(true);
    });

    test('ok:false with a clear message when given an absurd minMajor (999)', () => {
      const result = preflight.preflight(999);
      expect(result.ok).toBe(false);
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
      // The message must name the minimum so the user knows what to do.
      expect(result.message).toMatch(/999/);
      // And must reference Node so the message is actionable.
      expect(result.message).toMatch(/[Nn]ode/);
    });

    test('does NOT call process.exit (pure function: caller decides)', () => {
      const spy = jest.spyOn(process, 'exit').mockImplementation(function () {});
      preflight.preflight(999);
      preflight.preflight();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('checkNode(versionString, minMajor)', () => {
    test("checkNode('24.13.1') => ok:true with default minimum", () => {
      expect(preflight.checkNode('24.13.1').ok).toBe(true);
    });

    test("checkNode('16.0.0') => ok:false with a message mentioning the minimum", () => {
      const result = preflight.checkNode('16.0.0');
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/18/);
    });

    test('checkNode tolerates a v-prefixed version string', () => {
      expect(preflight.checkNode('v24.13.1').ok).toBe(true);
      expect(preflight.checkNode('v16.0.0').ok).toBe(false);
    });
  });

  describe('ES5 syntax guard (static source scan)', () => {
    // WHY: this file must parse on legacy Node (0.x/4/8) to even emit the
    // "your Node is too old" message. Modern syntax would SyntaxError there.
    const source = fs.readFileSync(PREFLIGHT_PATH, 'utf8');

    test('contains no const / let declarations', () => {
      expect(source).not.toMatch(/\bconst\s/);
      expect(source).not.toMatch(/\blet\s/);
    });

    test('contains no arrow functions (=>)', () => {
      expect(source).not.toContain('=>');
    });

    test('contains no template literals (backtick)', () => {
      expect(source).not.toContain('`');
    });

    test('contains no rest/spread (...)', () => {
      expect(source).not.toContain('...');
    });
  });

  describe('isolation', () => {
    test('the module is requireable on its own with zero dependencies', () => {
      // Fresh require from a clean cache must not throw (no dependsOn).
      delete require.cache[require.resolve('../lib/preflight')];
      expect(function () {
        require('../lib/preflight');
      }).not.toThrow();
    });
  });
});
