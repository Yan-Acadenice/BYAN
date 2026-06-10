'use strict';

// Entry-isolation tests for C10 ("a preflight runs before any modern require").
//
// These run in a CHILD Node process (not under jest's module registry) so they
// inspect the REAL require.cache. Two guarantees:
//   1. require('byan-install-core/preflight') pulls ONLY the ES5 primitive —
//      no fs-extra, no detect/plan/apply, no index. A launcher can gate the
//      Node version on ancient Node before any modern code loads.
//   2. require('byan-install-core') (index.js) does NOT eager-load the modern
//      verbs; detect.js loads only when the lazy getter is accessed.

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PREFLIGHT_ENTRY = path.join(ROOT, 'preflight.js');
const INDEX_ENTRY = path.join(ROOT, 'index.js');

// Run an inline Node program in a fresh process; return nothing on exit 0,
// throw with captured stderr otherwise so the jest assertion shows the reason.
function runNode(src) {
  try {
    execFileSync(process.execPath, ['-e', src], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
  } catch (e) {
    const err = e.stderr ? e.stderr.toString() : '';
    const out = e.stdout ? e.stdout.toString() : '';
    throw new Error('child exited ' + e.status + '\nSTDERR:\n' + err + '\nSTDOUT:\n' + out);
  }
}

describe('preflight entry isolation (C10)', () => {
  test('requiring byan-install-core/preflight loads NO modern modules', () => {
    const src = [
      'var pf = require(' + JSON.stringify(PREFLIGHT_ENTRY) + ');',
      'if (typeof pf.preflight !== "function") { process.stderr.write("no preflight fn"); process.exit(3); }',
      'var mods = Object.keys(require.cache).join("\\n");',
      'var leak = /fs-extra|[\\/\\\\]lib[\\/\\\\]detect\\.js|[\\/\\\\]lib[\\/\\\\]plan\\.js|[\\/\\\\]lib[\\/\\\\]apply\\.js|[\\/\\\\]index\\.js/;',
      'if (leak.test(mods)) { process.stderr.write("LEAK:\\n" + mods); process.exit(2); }',
      'process.exit(0);',
    ].join('\n');
    expect(() => runNode(src)).not.toThrow();
  });

  test('the preflight primitive actually works in that bare child process', () => {
    const src = [
      'var pf = require(' + JSON.stringify(PREFLIGHT_ENTRY) + ');',
      'var ok = pf.preflight();',
      'if (!ok || ok.ok !== true) { process.stderr.write("preflight not ok on current node"); process.exit(2); }',
      'var tooOld = pf.preflight(999);',
      'if (tooOld.ok !== false || typeof tooOld.message !== "string" || tooOld.message.length === 0) { process.stderr.write("bad too-old result"); process.exit(3); }',
      'process.exit(0);',
    ].join('\n');
    expect(() => runNode(src)).not.toThrow();
  });
});

describe('index lazy-loading (C10)', () => {
  test('requiring the index does NOT eager-load detect.js; the getter loads it on access', () => {
    const src = [
      'var idx = require(' + JSON.stringify(INDEX_ENTRY) + ');',
      'function detectLoaded() { return Object.keys(require.cache).some(function (p) { return /[\\/\\\\]lib[\\/\\\\]detect\\.js$/.test(p); }); }',
      'if (detectLoaded()) { process.stderr.write("detect.js eager-loaded at import"); process.exit(2); }',
      'var d = idx.detect;', // triggers the lazy getter
      'if (typeof d !== "function") { process.stderr.write("detect getter did not return a fn"); process.exit(3); }',
      'if (!detectLoaded()) { process.stderr.write("getter did not load detect.js"); process.exit(4); }',
      'process.exit(0);',
    ].join('\n');
    expect(() => runNode(src)).not.toThrow();
  });
});
