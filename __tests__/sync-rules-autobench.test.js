// C5a - byan-sync-rules autobench extension: the LEAN pointer block emitted
// idempotently into CLAUDE.md + AGENTS.md.
//
// The generator (lib/sync-rules.js) lives in the ESM-only MCP package
// (_byan/mcp/byan-mcp-server, type: module, run via `node --test`). The ROOT
// jest suite is CommonJS with no ESM transform, so importing that module here
// would fail. The authoritative unit coverage therefore lives in the ESM suite
// test/sync-rules-autobench.test.js; this root guard (a) runs that ESM suite
// via `node --test` so `npm test` exercises it, and (b) asserts the real-repo
// generated artifacts so a hand-edit or a generator regression is caught here.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MCP = path.join(ROOT, '_byan', 'mcp', 'byan-mcp-server');
const ESM_SUITE = path.join(MCP, 'test', 'sync-rules-autobench.test.js');
const STRICT_SUITE = path.join(MCP, 'test', 'sync-rules.test.js');

const AUTOBENCH_BEGIN = 'BYAN-AUTOBENCH:BEGIN';
const AUTOBENCH_END = 'BYAN-AUTOBENCH:END';
const STRICT_BEGIN = 'BYAN-STRICT:BEGIN';

const TARGETS = [
  path.join(ROOT, '.claude', 'CLAUDE.md'),
  path.join(ROOT, 'AGENTS.md'),
];

function countMatches(haystack, needle) {
  return (haystack.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

describe('byan-sync-rules autobench extension (C5a)', () => {
  test('the ESM unit suite (loader + renderer + syncAutobench + coexistence) passes', () => {
    // node --test is the authoritative runner for the ESM generator; throws on failure.
    expect(() =>
      execFileSync('node', ['--test', ESM_SUITE], { cwd: MCP, stdio: 'pipe' })
    ).not.toThrow();
  });

  test('the existing strict ESM suite still passes after the upsertBlock signature change', () => {
    expect(() =>
      execFileSync('node', ['--test', STRICT_SUITE], { cwd: MCP, stdio: 'pipe' })
    ).not.toThrow();
  });

  describe('real-repo generated artifacts', () => {
    test.each(TARGETS.map((t) => [path.relative(ROOT, t), t]))(
      '%s carries exactly one lean AUTOBENCH pointer block to the doctrine',
      (_rel, file) => {
        expect(fs.existsSync(file)).toBe(true);
        const content = fs.readFileSync(file, 'utf8');

        expect(content).toContain(AUTOBENCH_BEGIN);
        expect(content).toContain(AUTOBENCH_END);
        // Single block per file (idempotent emission, no duplication).
        expect(countMatches(content, AUTOBENCH_BEGIN)).toBe(1);
        expect(countMatches(content, AUTOBENCH_END)).toBe(1);

        // Lean pointer: names the feature, the marker one-liner, the doctrine pointer.
        const begin = content.indexOf(AUTOBENCH_BEGIN);
        const end = content.indexOf(AUTOBENCH_END);
        const block = content.slice(begin, end);
        expect(block).toContain('Auto-Benchmark');
        expect(block).toContain('BYAN-BENCH:done');
        expect(block).toContain('@.claude/rules/benchmark.md');
        // The marker note cites the autobench source of truth, not strict-mode.
        expect(block).toContain('autobench.yaml');
        // No fabricated external URL smuggled into the pointer (link rule sanity).
        expect(/https?:\/\//.test(block)).toBe(false);
      }
    );

    test('AGENTS.md keeps its STRICT block intact (coexistence with AUTOBENCH)', () => {
      const content = fs.readFileSync(TARGETS[1], 'utf8');
      expect(content).toContain(STRICT_BEGIN);
      expect(countMatches(content, STRICT_BEGIN)).toBe(1);
      // The STRICT block precedes the AUTOBENCH block (appended after).
      expect(content.indexOf(STRICT_BEGIN)).toBeLessThan(content.indexOf(AUTOBENCH_BEGIN));
    });
  });

  test('re-running the generator is idempotent (no artifact drift)', () => {
    const before = TARGETS.map((f) => fs.readFileSync(f, 'utf8'));
    execFileSync('node', [path.join(MCP, 'bin', 'byan-sync-rules.js')], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const after = TARGETS.map((f) => fs.readFileSync(f, 'utf8'));
    expect(after).toEqual(before);
  });
});
