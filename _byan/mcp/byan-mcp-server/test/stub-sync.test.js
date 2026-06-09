import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, findStaleRefs, applyFix, check } from '../lib/stub-sync.js';

const norm = (s) => normalizeText(s).text;

// Minimal in-memory io to pin the IO layer (walk + atomic apply + check) without
// touching the real filesystem, the same shape template-sync's tests would use.
function makeIo(files) {
  const norm = (p) => p.replace(/\/+/g, '/');
  return {
    readdirSync(dir) {
      const prefix = norm(dir).replace(/\/?$/, '/');
      const names = new Set();
      const dirs = new Set();
      let any = false;
      for (const f of Object.keys(files)) {
        if (f.startsWith(prefix)) {
          any = true;
          const rest = f.slice(prefix.length);
          if (rest.includes('/')) dirs.add(rest.split('/')[0]);
          else names.add(rest);
        }
      }
      if (!any) throw new Error(`ENOENT ${dir}`);
      return [
        ...[...dirs].map((n) => ({ name: n, isDirectory: () => true, isFile: () => false })),
        ...[...names].map((n) => ({ name: n, isDirectory: () => false, isFile: () => true })),
      ];
    },
    readFileSync(p) {
      const k = norm(p);
      if (!(k in files)) throw new Error(`ENOENT ${k}`);
      return files[k];
    },
    writeFileSync(p, c) {
      files[norm(p)] = c;
    },
    statSync() {
      return { mode: 0o644 };
    },
    chmodSync() {},
    renameSync(a, b) {
      files[norm(b)] = files[norm(a)];
      delete files[norm(a)];
    },
    unlinkSync(p) {
      delete files[norm(p)];
    },
  };
}

// --- agent path rewrites -> new layout _byan/agent/<name>/<name>.md ---
test('flat _bmad wildcard agent path -> new layout', () => {
  assert.equal(
    norm('LOAD {project-root}/_bmad/*/agents/analyst.md'),
    'LOAD {project-root}/_byan/agent/analyst/analyst.md',
  );
});

test('@bmad module agent path -> new layout', () => {
  assert.equal(norm('from @bmad/bmm/agents/dev.md now'), 'from _byan/agent/dev/dev.md now');
});

test('nested @bmad agent path (agents/<name>/<name>.md) -> new layout', () => {
  assert.equal(
    norm('@bmad/cis/agents/storyteller/storyteller.md'),
    '_byan/agent/storyteller/storyteller.md',
  );
});

test('hyphenated agent name nested path -> new layout', () => {
  assert.equal(
    norm('@bmad/bmm/agents/tech-writer/tech-writer.md'),
    '_byan/agent/tech-writer/tech-writer.md',
  );
});

// --- bmb-creations agent load (both @ and _ prefixes) -> agent ref ---
test('@bmad-output bmb-creations load -> agent ref', () => {
  assert.equal(
    norm('@bmad-output/bmb-creations/skeptic/skeptic.md'),
    '_byan/agent/skeptic/skeptic.md',
  );
});

test('_bmad-output bmb-creations load -> agent ref', () => {
  assert.equal(
    norm('_bmad-output/bmb-creations/skeptic/skeptic.md'),
    '_byan/agent/skeptic/skeptic.md',
  );
});

// --- generic config + workflow path prefixes -> _byan/ ---
test('_bmad/_config/ -> _byan/_config/', () => {
  assert.equal(
    norm('{project-root}/_bmad/_config/agent-manifest.csv'),
    '{project-root}/_byan/_config/agent-manifest.csv',
  );
});

test('_bmad/{module}/workflows/ -> _byan/{module}/workflows/ (placeholder preserved)', () => {
  assert.equal(
    norm('exec="{project-root}/_bmad/{module}/workflows/{workflow}/workflow.md"'),
    'exec="{project-root}/_byan/{module}/workflows/{workflow}/workflow.md"',
  );
});

// --- PRESERVE: invocation syntax @bmad-<word> ---
test('@bmad- invocation syntax is preserved', () => {
  const inv = 'Via `@bmad-bmm-create-prd`, `@bmad-agent-bmm-dev`, `@bmad-party-mode`';
  const r = normalizeText(inv);
  assert.equal(r.changed, false);
  assert.equal(r.text, inv);
});

// --- PRESERVE: _bmad-output/ artifact dirs that are NOT bmb-creations ---
test('_bmad-output/ artifact paths are preserved', () => {
  const out = '{output_folder} : `_bmad-output/`\n`_bmad-output/planning-artifacts/`\n`_bmad-output/implementation-artifacts/`';
  const r = normalizeText(out);
  assert.equal(r.changed, false);
  assert.equal(r.text, out);
});

// --- mixed real-world line: invocation preserved, path rewritten in one pass ---
test('mixed line: @bmad- invocation kept, _bmad/ path fixed', () => {
  const line = 'Via commande `@bmad-{module}-{workflow}` ; Manifeste `{project-root}/_bmad/_config/agent-manifest.csv`';
  assert.equal(
    norm(line),
    'Via commande `@bmad-{module}-{workflow}` ; Manifeste `{project-root}/_byan/_config/agent-manifest.csv`',
  );
});

// --- findStaleRefs ---
test('findStaleRefs flags stale path forms', () => {
  assert.deepEqual(findStaleRefs('x _bmad/*/agents/analyst.md y'), ['_bmad/*/agents/analyst.md']);
  assert.ok(findStaleRefs('@bmad/bmm/agents/dev.md').length === 1);
  assert.ok(findStaleRefs('_bmad-output/bmb-creations/skeptic/skeptic.md').length === 1);
});

test('findStaleRefs ignores invocation syntax and _bmad-output artifacts', () => {
  assert.deepEqual(findStaleRefs('@bmad-bmm-create-prd and @bmad-party-mode'), []);
  assert.deepEqual(findStaleRefs('`_bmad-output/planning-artifacts/`'), []);
});

test('findStaleRefs returns empty after normalization', () => {
  const dirty = [
    '_bmad/*/agents/analyst.md',
    '@bmad/cis/agents/storyteller/storyteller.md',
    '@bmad-output/bmb-creations/skeptic/skeptic.md',
    '_bmad/_config/agent-manifest.csv',
    '_bmad/{module}/workflows/{workflow}/workflow.md',
  ].join('\n');
  assert.ok(findStaleRefs(dirty).length > 0);
  assert.deepEqual(findStaleRefs(norm(dirty)), []);
});

// --- idempotence ---
test('normalization is idempotent', () => {
  const dirty = '_bmad/*/agents/analyst.md @bmad/bmm/agents/dev.md @bmad-output/bmb-creations/skeptic/skeptic.md _bmad/_config/x.csv @bmad-party-mode _bmad-output/artifacts/';
  const once = norm(dirty);
  const twice = norm(once);
  assert.equal(twice, once);
  assert.equal(normalizeText(once).changed, false);
});

// --- a clean file is left untouched ---
test('already-canonical _byan refs are untouched', () => {
  const clean = 'LOAD {project-root}/_byan/agent/dev/dev.md ; manifest _byan/_config/agent-manifest.csv';
  const r = normalizeText(clean);
  assert.equal(r.changed, false);
  assert.equal(r.text, clean);
});

// --- gate consistency: bmb-creations with dir != filename is keyed on the
//     FILENAME, so --fix resolves exactly what --check flags (no gate trap) ---
test('bmb-creations dir != filename: fix and check stay in lockstep', () => {
  const src = '@bmad-output/bmb-creations/foo/bar.md';
  assert.equal(norm(src), '_byan/agent/bar/bar.md');
  assert.equal(findStaleRefs(src).length, 1); // flagged
  assert.deepEqual(findStaleRefs(norm(src)), []); // and resolved by fix
});

// --- instructions.md shape: @bmad/<module>/ prefix paths normalized, invocation
//     and _bmad-output/ artifacts preserved in the same pass ---
test('@bmad/<module> paths normalized while invocation + output survive', () => {
  const src =
    '- **Core** (`@bmad/core/`)\nEmplacement `@bmad/{module}/agents/{name}.md`\n@bmad-bmm-create-prd\n`_bmad-output/planning-artifacts/`';
  const out = norm(src);
  assert.equal(/@bmad\//.test(out), false); // no path-form @bmad/ left
  assert.ok(out.includes('_byan/core/'));
  assert.ok(out.includes('@bmad-bmm-create-prd')); // invocation preserved
  assert.ok(out.includes('_bmad-output/planning-artifacts/')); // artifact preserved
});

// --- IO layer: applyFix via injected io is atomic + idempotent ---
test('applyFix normalizes a stale stub via injected io and is idempotent', () => {
  const files = { '/r/.codex/prompts/a.md': 'LOAD _bmad/*/agents/dev.md and @bmad-party-mode' };
  const io = makeIo(files);
  const first = applyFix({ rootDir: '/r', io });
  assert.deepEqual(first.fixed, ['.codex/prompts/a.md']);
  assert.equal(files['/r/.codex/prompts/a.md'], 'LOAD _byan/agent/dev/dev.md and @bmad-party-mode');
  const second = applyFix({ rootDir: '/r', io });
  assert.deepEqual(second.fixed, []); // idempotent
});

// --- IO layer: check via injected io flags a stale ref then clears after fix ---
test('check via injected io: flags stale then OK after fix', () => {
  const files = { '/r/.github/agents/x.md': 'see {project-root}/_bmad/_config/agent-manifest.csv' };
  const io = makeIo(files);
  const before = check({ rootDir: '/r', io });
  assert.equal(before.ok, false);
  assert.equal(before.stale.length, 1);
  applyFix({ rootDir: '/r', io });
  assert.equal(check({ rootDir: '/r', io }).ok, true);
});
