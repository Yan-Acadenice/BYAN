import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  EXCLUSIONS,
  TARGET_ADDITIONS,
  TEMPLATE_DIR,
  isExcluded,
  buildPlan,
  checkDrift,
  walkRelFiles,
  planSync,
  applyPlan,
} from '../lib/template-sync.js';

// In-memory fs double, extended from suitability-store style.
// Keys are absolute paths. readdirSync supports { withFileTypes: true }.
function memIO(initial = {}, initialModes = {}) {
  const files = { ...initial };
  const fmodes = { ...initialModes };
  return {
    files,
    fmodes,
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
    statSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) {
        const err = new Error(`ENOENT: stat '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      return { mode: p in fmodes ? fmodes[p] : 0o644, isFile: () => true, isDirectory: () => false };
    },
    chmodSync: (p, mode) => {
      fmodes[p] = mode;
    },
    readFileSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) {
        const err = new Error(`ENOENT: no such file or directory '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      return Buffer.isBuffer(files[p]) ? files[p] : Buffer.from(files[p]);
    },
    writeFileSync: (p, data) => {
      files[p] = data;
      if (!(p in fmodes)) fmodes[p] = 0o644;
    },
    renameSync: (from, to) => {
      if (!Object.prototype.hasOwnProperty.call(files, from)) {
        const err = new Error(`ENOENT: rename '${from}'`);
        err.code = 'ENOENT';
        throw err;
      }
      files[to] = files[from];
      fmodes[to] = fmodes[from];
      delete files[from];
      delete fmodes[from];
    },
    unlinkSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) {
        const err = new Error(`ENOENT: unlink '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      delete files[p];
      delete fmodes[p];
    },
    mkdirSync: () => {},
    // readdirSync with withFileTypes: true.
    // Returns immediate children of dirAbs as { name, isFile, isDirectory }.
    // Throws if dirAbs has no entries (so walkRelFiles captures the error and returns []).
    readdirSync: (dirAbs, opts = {}) => {
      const withFileTypes = opts && opts.withFileTypes;
      const prefix = dirAbs.endsWith(path.sep) ? dirAbs : dirAbs + path.sep;
      const names = new Set();
      const isDirName = new Set();
      for (const key of Object.keys(files)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf(path.sep);
        if (slash === -1) {
          names.add(rest); // direct file child
        } else {
          const seg = rest.slice(0, slash);
          names.add(seg);
          isDirName.add(seg);
        }
      }
      if (names.size === 0) {
        const err = new Error(`ENOENT: no such file or directory, scandir '${dirAbs}'`);
        err.code = 'ENOENT';
        throw err;
      }
      if (!withFileTypes) {
        return [...names];
      }
      return [...names].map((name) => {
        const isDir = isDirName.has(name);
        return {
          name,
          isFile: () => !isDir,
          isDirectory: () => isDir,
        };
      });
    },
  };
}

// -----------------------------------------------------------------------
// Pure tests (no memIO — readers are plain closures)
// -----------------------------------------------------------------------

test('isExcluded: excluded prefix matched, unrelated path not matched', () => {
  assert.equal(isExcluded('_byan/memoire/elo-profile.json'), true);
  assert.equal(isExcluded('_byan/mcp/byan-mcp-server/lib/x.js'), false);
});

test('isExcluded: OS-separator path still excluded (posix normalisation)', () => {
  const osSep = ['_byan', 'memoire', 'x.json'].join(path.sep);
  assert.equal(isExcluded(osSep), true);
});

test('buildPlan: content-different file in template -> toUpdate, not identical', () => {
  const plan = buildPlan({
    templateFiles: ['some/file.js'],
    readRoot: () => Buffer.from('root-version'),
    readTemplate: () => Buffer.from('template-version'),
    additions: [],
  });
  assert.ok(plan.toUpdate.includes('some/file.js'), 'expected in toUpdate');
  assert.ok(!plan.identical.includes('some/file.js'), 'must not be in identical');
});

test('buildPlan: identical file in template -> identical, not toUpdate', () => {
  const plan = buildPlan({
    templateFiles: ['some/file.js'],
    readRoot: () => Buffer.from('same'),
    readTemplate: () => Buffer.from('same'),
    additions: [],
  });
  assert.ok(plan.identical.includes('some/file.js'), 'expected in identical');
  assert.ok(!plan.toUpdate.includes('some/file.js'), 'must not be in toUpdate');
});

test('buildPlan: file in template absent from root -> orphans, never toUpdate', () => {
  const plan = buildPlan({
    templateFiles: ['orphan/file.js'],
    readRoot: () => null,
    readTemplate: () => Buffer.from('tmpl'),
    additions: [],
  });
  assert.ok(plan.orphans.includes('orphan/file.js'), 'expected in orphans');
  assert.ok(!plan.toUpdate.includes('orphan/file.js'), 'must not be in toUpdate');
});

test('buildPlan: excluded path in template, even if content differs -> excluded, not toUpdate', () => {
  const plan = buildPlan({
    templateFiles: ['_byan/memoire/elo.json'],
    readRoot: () => Buffer.from('root-val'),
    readTemplate: () => Buffer.from('tmpl-val'),
    additions: [],
  });
  assert.ok(plan.excluded.includes('_byan/memoire/elo.json'), 'expected in excluded');
  assert.ok(!plan.toUpdate.includes('_byan/memoire/elo.json'), 'must not be in toUpdate');
});

test('buildPlan: TARGET_ADDITIONS file absent from template, present in root -> toAdd', () => {
  const addition = TARGET_ADDITIONS[0]; // pick first real addition
  const plan = buildPlan({
    templateFiles: [], // template does not yet contain it
    readRoot: (rel) => (rel === addition ? Buffer.from('content') : null),
    readTemplate: () => { throw new Error('should not read template for new additions'); },
    additions: [addition],
  });
  assert.ok(plan.toAdd.includes(addition), 'expected in toAdd');
});

test('buildPlan: addition already in templateFiles -> not in toAdd (handled by template loop)', () => {
  const addition = TARGET_ADDITIONS[0];
  const plan = buildPlan({
    templateFiles: [addition], // already present
    readRoot: () => Buffer.from('same'),
    readTemplate: () => Buffer.from('same'),
    additions: [addition],
  });
  assert.ok(!plan.toAdd.includes(addition), 'must not be in toAdd when already in template');
});

test('buildPlan: addition absent from template AND absent from root -> missingTargets, not toAdd', () => {
  const addition = TARGET_ADDITIONS[0];
  const plan = buildPlan({
    templateFiles: [],
    readRoot: () => null, // not in root either
    readTemplate: () => { throw new Error('should not be called'); },
    additions: [addition],
  });
  assert.ok(plan.missingTargets.includes(addition), 'expected in missingTargets');
  assert.ok(!plan.toAdd.includes(addition), 'must not be in toAdd');
});

test('buildPlan ANTI-FUITE: empty templateFiles+additions -> toUpdate/toAdd/missingTargets all empty (root never walked)', () => {
  const plan = buildPlan({
    templateFiles: [],
    readRoot: () => Buffer.from('would-be-content'), // returns something for any path
    readTemplate: () => Buffer.from('tmpl'),
    additions: [],
  });
  assert.deepEqual(plan.toUpdate, []);
  assert.deepEqual(plan.toAdd, []);
  assert.deepEqual(plan.missingTargets, []);
});

test('checkDrift: toUpdate non-empty -> ok===false, drifted non-empty', () => {
  const plan = {
    toUpdate: ['a.js'],
    toAdd: [],
    missingTargets: [],
    excluded: [],
    orphans: [],
    identical: [],
  };
  const result = checkDrift(plan);
  assert.equal(result.ok, false);
  assert.ok(result.drifted.length > 0);
});

test('checkDrift: toAdd non-empty -> ok===false, missing non-empty', () => {
  const plan = {
    toUpdate: [],
    toAdd: ['new.js'],
    missingTargets: [],
    excluded: [],
    orphans: [],
    identical: [],
  };
  const result = checkDrift(plan);
  assert.equal(result.ok, false);
  assert.ok(result.missing.length > 0);
});

test('checkDrift: missingTargets non-empty -> ok===false, missing non-empty', () => {
  const plan = {
    toUpdate: [],
    toAdd: [],
    missingTargets: ['promised.js'],
    excluded: [],
    orphans: [],
    identical: [],
  };
  const result = checkDrift(plan);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('promised.js'));
});

test('checkDrift: all identical/excluded/orphans (no toUpdate/toAdd/missingTargets) -> ok===true', () => {
  const plan = {
    toUpdate: [],
    toAdd: [],
    missingTargets: [],
    excluded: ['_byan/memoire/elo.json'],
    orphans: ['ghost.js'],
    identical: ['clean.js'],
  };
  const result = checkDrift(plan);
  assert.equal(result.ok, true);
  assert.deepEqual(result.drifted, []);
  assert.deepEqual(result.missing, []);
});

// -----------------------------------------------------------------------
// memIO tests (I/O behaviour)
// -----------------------------------------------------------------------

const ROOT = '/fake-root';
const TMPL = path.join(ROOT, 'install', 'templates');

test('walkRelFiles: returns sorted relative POSIX paths for files in tree; empty for nonexistent dir', () => {
  const io = memIO({
    [path.join(ROOT, 'a.js')]: 'a',
    [path.join(ROOT, 'sub', 'b.js')]: 'b',
  });
  const result = walkRelFiles(ROOT, { io }).sort();
  assert.deepEqual(result, ['a.js', 'sub/b.js']);
  const empty = walkRelFiles('/no-such-dir', { io });
  assert.deepEqual(empty, []);
});

test('planSync + applyPlan IDEMPOTENCE: divergent mirror file synced; memoire excluded; re-plan empty', () => {
  // template has a mirrored file with stale content and a memoire file that differs
  const io = memIO({
    [path.join(ROOT, 'lib', 'tool.js')]: 'root-latest',
    [path.join(ROOT, '_byan', 'memoire', 'seed.json')]: 'root-seed',
    [path.join(TMPL, 'lib', 'tool.js')]: 'template-stale',
    [path.join(TMPL, '_byan', 'memoire', 'seed.json')]: 'template-seed',
  });

  const plan1 = planSync({ rootDir: ROOT, templateDir: TMPL, io });
  assert.ok(plan1.toUpdate.includes('lib/tool.js'), 'tool.js must be in toUpdate before sync');
  assert.ok(!plan1.toUpdate.includes('_byan/memoire/seed.json'), 'memoire must not be in toUpdate');

  applyPlan(plan1, { rootDir: ROOT, templateDir: TMPL, io });

  const plan2 = planSync({ rootDir: ROOT, templateDir: TMPL, io });
  assert.deepEqual(plan2.toUpdate, [], 'toUpdate must be empty after sync (idempotent)');
  assert.deepEqual(plan2.toAdd, [], 'toAdd must be empty after sync (idempotent)');
});

test('EXCLUSION INTACTE: memoire file in template unchanged after applyPlan', () => {
  const io = memIO({
    [path.join(ROOT, 'lib', 'tool.js')]: 'root-latest',
    [path.join(ROOT, '_byan', 'memoire', 'seed.json')]: 'root-seed',
    [path.join(TMPL, 'lib', 'tool.js')]: 'template-stale',
    [path.join(TMPL, '_byan', 'memoire', 'seed.json')]: 'template-seed-original',
  });

  const plan = planSync({ rootDir: ROOT, templateDir: TMPL, io });
  applyPlan(plan, { rootDir: ROOT, templateDir: TMPL, io });

  const tmplMemoire = path.join(TMPL, '_byan', 'memoire', 'seed.json');
  const value = io.files[tmplMemoire];
  const strValue = Buffer.isBuffer(value) ? value.toString() : String(value);
  assert.equal(strValue, 'template-seed-original', 'memoire file in template must be unchanged after applyPlan');
});

test('applyPlan: rollback removes the staged .tmp and rethrows when rename fails', () => {
  const io = memIO({
    [path.join(ROOT, 'lib', 'tool.js')]: 'root-latest',
    [path.join(TMPL, 'lib', 'tool.js')]: 'template-stale',
  });
  // Force the atomic rename to fail after the .tmp has been staged.
  io.renameSync = () => {
    const err = new Error('EXDEV: cross-device link not permitted');
    err.code = 'EXDEV';
    throw err;
  };
  const plan = { toUpdate: ['lib/tool.js'], toAdd: [], excluded: [], orphans: [], identical: [], missingTargets: [] };
  assert.throws(() => applyPlan(plan, { rootDir: ROOT, templateDir: TMPL, io }), /EXDEV/);
  // The staged .tmp must be cleaned up, not left as an orphan.
  const tmpPath = path.join(TMPL, 'lib', 'tool.js.tmp');
  assert.equal(Object.prototype.hasOwnProperty.call(io.files, tmpPath), false, 'staged .tmp must be removed on failure');
});

test('ANTI-FUITE: a root file in neither templateFiles nor additions is never emitted', () => {
  // dev-only.js exists in root (readRoot returns content for ANY path) but the
  // template tracks only kept.js and there are no additions. buildPlan must never
  // surface dev-only.js: it only ever iterates templateFiles + additions.
  const plan = buildPlan({
    templateFiles: ['kept.js'],
    readRoot: (rel) => Buffer.from('content-of-' + rel),
    readTemplate: () => Buffer.from('content-of-kept.js'),
    additions: [],
  });
  const emitted = [...plan.toUpdate, ...plan.toAdd, ...plan.missingTargets];
  assert.ok(!emitted.includes('dev-only.js'), 'a root-only dev file must never be emitted');
  assert.deepEqual(plan.toAdd, []);
  assert.ok(plan.identical.includes('kept.js'));
});

test('applyPlan: preserves the source permission bits (exec bit on a mirrored hook)', () => {
  // A mirrored hook is 0o755 at root but the stale template copy is 0o644.
  // applyPlan must re-sync the content AND restore the exec bit, otherwise the
  // shipped hook would not run for an installed user.
  const io = memIO(
    {
      [path.join(ROOT, '.githooks', 'pre-commit')]: 'root-hook',
      [path.join(TMPL, '.githooks', 'pre-commit')]: 'stale-hook',
    },
    {
      [path.join(ROOT, '.githooks', 'pre-commit')]: 0o755,
      [path.join(TMPL, '.githooks', 'pre-commit')]: 0o644,
    },
  );
  const plan = { toUpdate: ['.githooks/pre-commit'], toAdd: [], excluded: [], orphans: [], identical: [], missingTargets: [] };
  applyPlan(plan, { rootDir: ROOT, templateDir: TMPL, io });
  assert.equal(io.statSync(path.join(TMPL, '.githooks', 'pre-commit')).mode, 0o755, 'exec bit must be restored');
});

test('planSync: a content-identical file with a different mode is drift (mode fidelity)', () => {
  // Same bytes, different permission bits: the template hook lost its exec bit.
  // planSync must surface it as drift, not leave it silently in identical.
  const io = memIO(
    {
      [path.join(ROOT, '.githooks', 'pre-commit')]: 'same-content',
      [path.join(TMPL, '.githooks', 'pre-commit')]: 'same-content',
    },
    {
      [path.join(ROOT, '.githooks', 'pre-commit')]: 0o755,
      [path.join(TMPL, '.githooks', 'pre-commit')]: 0o644,
    },
  );
  const plan = planSync({ rootDir: ROOT, templateDir: TMPL, io });
  assert.ok(plan.toUpdate.includes('.githooks/pre-commit'), 'mode-only drift must be in toUpdate');
  assert.ok(!plan.identical.includes('.githooks/pre-commit'), 'must not be left as identical');
});
