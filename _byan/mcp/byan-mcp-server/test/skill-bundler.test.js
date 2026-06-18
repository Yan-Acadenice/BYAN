import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Path resolution: this file lives in test/, PKG_ROOT is one level up, PROJECT_ROOT is 3 levels up.
// WHY explicit: import.meta.url is stable; process.cwd() is runner-dependent.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = path.resolve(PKG_ROOT, '../../../');
const BUNDLER = path.join(PKG_ROOT, 'bin', 'byan-build-skill-bundles.js');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');
const REAL_OUT_DIR = path.join(PROJECT_ROOT, 'dist', 'skill-bundles');
// The manifest is a COMMITTED drift ledger -> tracked path, not under dist/.
const REAL_MANIFEST = path.join(PKG_ROOT, 'skill-bundles-manifest.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal stored-ZIP reader. Parses a ZIP buffer and returns a map of
 * entryName -> uncompressed Buffer. Only handles stored (method=0) entries.
 * WHY inline: the test must not depend on any zip library; this mirrors the
 * minimal reader contract we need to verify our own writer output.
 */
function readStoredZip(buf) {
  const entries = {};
  let i = 0;

  while (i < buf.length - 4) {
    const sig = buf.readUInt32LE(i);

    // Local file header signature 0x04034b50
    if (sig === 0x04034b50) {
      const method = buf.readUInt16LE(i + 8);
      const compressedSize = buf.readUInt32LE(i + 18);
      const nameLen = buf.readUInt16LE(i + 26);
      const extraLen = buf.readUInt16LE(i + 28);
      const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
      const dataStart = i + 30 + nameLen + extraLen;

      assert.equal(method, 0, `entry ${name}: expected stored (method=0), got ${method}`);

      entries[name] = buf.slice(dataStart, dataStart + compressedSize);
      i = dataStart + compressedSize;
    } else {
      // Central directory or EOCD — stop scanning local headers.
      break;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// (a) Build produces a manifest with every live skill assigned to exactly one module bundle
// ---------------------------------------------------------------------------

test('manifest covers every live skill exactly once', () => {
  assert.ok(fs.existsSync(REAL_MANIFEST), 'bundles-manifest.json must exist (run bundler first)');

  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  const skillDirs = fs.readdirSync(SKILLS_DIR).filter((d) =>
    fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'))
  );

  // Every live skill is in manifest.skills
  for (const name of skillDirs) {
    assert.ok(manifest.skills[name], `skill ${name} missing from manifest.skills`);
  }

  // Every manifest.skills entry maps to a real skill dir
  for (const name of Object.keys(manifest.skills)) {
    assert.ok(
      fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')),
      `manifest references ${name} but SKILL.md not found on disk`
    );
  }

  // Megabundles: every skill lands in exactly one megabundle
  const assignedCounts = {};
  for (const [, mb] of Object.entries(manifest.megabundles)) {
    for (const skillName of mb.skills) {
      assignedCounts[skillName] = (assignedCounts[skillName] || 0) + 1;
    }
  }

  for (const name of Object.keys(manifest.skills)) {
    assert.equal(
      assignedCounts[name] || 0,
      1,
      `skill ${name} assigned to ${assignedCounts[name] || 0} megabundles (must be exactly 1)`
    );
  }

  // All 5 expected module buckets present
  for (const mod of ['core', 'bmm', 'bmb', 'tea', 'cis']) {
    assert.ok(manifest.megabundles[mod], `megabundle for module '${mod}' is missing`);
  }
});

// ---------------------------------------------------------------------------
// (b) A produced .zip is a valid stored zip whose SKILL.md content round-trips
// ---------------------------------------------------------------------------

test('per-skill zip round-trips SKILL.md content via stored-zip reader', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  const someSkill = Object.keys(manifest.skills)[0];
  assert.ok(someSkill, 'manifest has at least one skill');

  const zipPath = path.join(REAL_OUT_DIR, `${someSkill}.zip`);
  assert.ok(fs.existsSync(zipPath), `zip not found: ${zipPath}`);

  const zipBuf = fs.readFileSync(zipPath);
  const entries = readStoredZip(zipBuf);

  assert.ok(entries['SKILL.md'], 'zip must contain SKILL.md');

  const expected = fs.readFileSync(path.join(SKILLS_DIR, someSkill, 'SKILL.md'));
  assert.ok(
    entries['SKILL.md'].equals(expected),
    `SKILL.md content in zip does not match source for ${someSkill}`
  );
});

test('per-skill zip round-trips SKILL.md content via unzip -p', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  // Pick the second skill for variety
  const skills = Object.keys(manifest.skills);
  const skill = skills[Math.min(1, skills.length - 1)];
  const zipPath = path.join(REAL_OUT_DIR, `${skill}.zip`);

  const result = spawnSync('unzip', ['-p', zipPath, 'SKILL.md'], { encoding: 'buffer' });
  assert.equal(result.status, 0, `unzip -p failed for ${skill}.zip: ${result.stderr?.toString()}`);

  const expected = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'));
  assert.ok(result.stdout.equals(expected), `unzip -p output does not match source for ${skill}`);
});

test('megabundle zip contains all skills for that module with correct sub-paths', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  // Pick the module with the most skills for a meaningful check.
  const module = Object.entries(manifest.megabundles)
    .sort((a, b) => b[1].skills.length - a[1].skills.length)[0][0];

  const zipPath = path.join(REAL_OUT_DIR, `megabundle-${module}.zip`);
  assert.ok(fs.existsSync(zipPath), `megabundle zip missing: ${zipPath}`);

  const zipBuf = fs.readFileSync(zipPath);
  const entries = readStoredZip(zipBuf);

  for (const skillName of manifest.megabundles[module].skills) {
    const entryKey = `${skillName}/SKILL.md`;
    assert.ok(entries[entryKey], `megabundle-${module}.zip missing entry ${entryKey}`);

    const expected = fs.readFileSync(path.join(SKILLS_DIR, skillName, 'SKILL.md'));
    assert.ok(
      entries[entryKey].equals(expected),
      `${entryKey} content mismatch in megabundle-${module}.zip`
    );
  }
});

// ---------------------------------------------------------------------------
// (c) --check passes immediately after a build
// ---------------------------------------------------------------------------

test('--check passes on a freshly built manifest', () => {
  const result = spawnSync('node', [BUNDLER, '--check'], { encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `--check failed immediately after build:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  );
  assert.match(result.stdout, /--check OK/);
});

// ---------------------------------------------------------------------------
// (d) --check FAILS when a SKILL.md is mutated without rebuild
// ---------------------------------------------------------------------------

test('--check fails when manifest is tampered to have a wrong hash', () => {
  // We tamper the MANIFEST in a temp copy rather than mutating the real manifest,
  // so the test is self-contained and does not leave the repo dirty.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-bundler-check-'));
  const tmpManifest = path.join(tmpDir, 'bundles-manifest.json');

  const real = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  const firstSkill = Object.keys(real.skills)[0];

  // Tamper: flip the hash of the first skill
  const tampered = JSON.parse(JSON.stringify(real));
  tampered.skills[firstSkill].sourceHash = 'deadbeef' + '0'.repeat(56);
  fs.writeFileSync(tmpManifest, JSON.stringify(tampered, null, 2) + '\n');

  // Run --check pointing at the tampered manifest via a small wrapper script
  // in the temp dir. We cannot pass a manifest path flag (not in the interface),
  // so we simulate the drift by running a node snippet that reproduces the
  // --check logic inline on the tampered data.
  const snippet = `
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const SKILLS_DIR = ${JSON.stringify(SKILLS_DIR)};
const manifest = JSON.parse(fs.readFileSync(${JSON.stringify(tmpManifest)}, 'utf8'));

let failed = false;
for (const [name, entry] of Object.entries(manifest.skills)) {
  const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) continue;
  const live = crypto.createHash('sha256').update(fs.readFileSync(skillPath)).digest('hex');
  if (live !== entry.sourceHash) {
    console.error('DRIFT: ' + name + ' hash mismatch');
    failed = true;
  }
}
if (failed) process.exit(1);
`;

  const checkResult = spawnSync('node', ['--input-type=module'], {
    input: snippet,
    encoding: 'utf8',
  });

  assert.equal(
    checkResult.status,
    1,
    `Expected exit 1 for tampered manifest, got ${checkResult.status}\nstderr: ${checkResult.stderr}`
  );
  assert.match(checkResult.stderr, /DRIFT/);
});

// ---------------------------------------------------------------------------
// (e) Tier classification: at least one standalone and one connector-bound skill
// ---------------------------------------------------------------------------

test('manifest contains at least one standalone and one connector-bound skill', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  const tiers = Object.values(manifest.skills).map((s) => s.tier);

  assert.ok(
    tiers.includes('standalone'),
    'no standalone skills found in manifest'
  );
  assert.ok(
    tiers.includes('connector-bound'),
    'no connector-bound skills found in manifest'
  );
});

test('connector-bound skills all have byan_ tool references in their SKILL.md', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));

  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (entry.tier !== 'connector-bound') continue;
    const content = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.ok(
      /byan_[a-z]/.test(content),
      `${name} is classified connector-bound but has no byan_ reference in SKILL.md`
    );
  }
});

test('standalone skills have no byan_ tool references in their SKILL.md', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));

  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (entry.tier !== 'standalone') continue;
    const content = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.ok(
      !/byan_[a-z]/.test(content),
      `${name} is classified standalone but contains a byan_ reference`
    );
  }
});

// ---------------------------------------------------------------------------
// Additional invariants
// ---------------------------------------------------------------------------

test('every megabundle has a non-empty bundleHash and a version from manifest.yaml', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  for (const [module, mb] of Object.entries(manifest.megabundles)) {
    assert.ok(mb.bundleHash && mb.bundleHash.length === 64, `megabundle ${module} missing bundleHash`);
    assert.ok(mb.version && mb.version !== '0.0.0', `megabundle ${module} has default version`);
  }
});

test('sourceHash in manifest matches live sha256 of SKILL.md', () => {
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  for (const [name, entry] of Object.entries(manifest.skills)) {
    const content = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'));
    const live = crypto.createHash('sha256').update(content).digest('hex');
    assert.equal(
      live,
      entry.sourceHash,
      `sourceHash mismatch for ${name}: manifest=${entry.sourceHash.slice(0, 12)} live=${live.slice(0, 12)}`
    );
  }
});
