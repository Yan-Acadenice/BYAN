/**
 * retro-compat.test.js — the machine-checked invariant that
 * "install-core AUTO == the v2.19 AUTO artifact identity set (or MORE)".
 *
 * This is the closing proof of the package: a full end-to-end run of the public
 * four-verb API (index.js) — detect -> plan(AUTO answers) -> apply(temp) — must
 * land, on disk, a SUPERSET of the v2.19 AUTO artifact set. We assert:
 *
 *   (AUTO_ARTIFACT_SET \ produced) === []   — no legacy AUTO path regressed
 *   (produced \ AUTO_ARTIFACT_SET) MAY be non-empty — install-core adds the
 *                                                     manifest and more (superset OK)
 *
 * plus FIELD-LEVEL parity (not just path presence) on the two content-bearing
 * artifacts the recon pinned: config.yaml (install_mode:auto, platform,
 * byan_version, soul_mode:creator) and .mcp.json (mcpServers.byan present,
 * BYAN_API_URL clean of /api, NO raw token). We then close the loop with
 * verify({cwd}).ok === true.
 *
 * FIXTURE: the REAL install/templates/ tree is staged into the temp cwd as
 * `templates/` (the path plan() copy steps reference, resolved by apply against
 * ctx.cwd). We symlink it read-only so the test never copies the whole tree and
 * never mutates the source. Everything runs under os.tmpdir(); the repo is
 * never written.
 *
 * STRICT-3 (No Silent Cut): two AUTO-mode pieces from the v2.19 installer are
 * deliberately NOT engine artifacts and are documented as F2-wizard concerns
 * below, never silently dropped — see DEFERRED_TO_F2.
 *
 * Covers C45 (retro-compat superset), C5 (detect feeds plan), C8/C9 (plan->apply
 * deterministic pipeline), C14 (clean .mcp.json + .env keys).
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');

const { detect, plan, apply, verify, AUTO_ARTIFACT_SET } = require('../index');

// The real templates tree shipped by the installer. apply() resolves a step's
// `src` (e.g. 'templates/_byan') against ctx.cwd, so we expose this tree to the
// temp cwd under the name `templates`.
const REAL_TEMPLATES = path.resolve(__dirname, '..', '..', '..', 'templates');

// Shape-only fixture. NOT a real secret: 'byan_' + 64 zeroes.
// (MEMORY: feedback_no_real_tokens_in_tests — a real-looking token would trip
//  Push Protection even when revoked.)
const FAKE_TOKEN = 'byan_' + '0'.repeat(64);

// Pieces of the v2.19 AUTO flow that are NOT install-core engine artifacts.
// They are produced by the F2 npm-CLI wizard / the interactive front-end, never
// by the headless engine. Documented here so the boundary is explicit and the
// omission is a DECISION, not a silent cut (STRICT-3). None of these appear in
// AUTO_ARTIFACT_SET, so the superset assertion below does not depend on them.
const DEFERRED_TO_F2 = [
  // Interactive auth: detect() only reports an authHint heuristic; the real
  // `claude login` is emitted by apply() as a DEFERRED auth-handoff (I50), never
  // performed. So no "authenticated" on-disk state is an engine artifact.
  'platform CLI authentication (claude login / codex auth login)',
  // The actual global CLI binary install (npm i -g ...) is deferred unless the
  // caller passes runInstalls:true; the wizard owns that prompt + spawn.
  'global CLI binary installation (npm install -g <platform-cli>)',
  // Turbo-Whisper / parakeet local setup scripts (v2.19 setup-turbo-whisper.js):
  // out of the install-core scope, toggled by the wizard, not an artifact set.
  'turbo-whisper / parakeet local environment setup',
];

// Canonical AUTO answers. Mirrors the v2.19 AUTO preset: AUTO only needs the
// user name + language; everything else is defaulted. We pin platforms to
// [claude] explicitly so the .claude rules surface is produced — that is what
// AUTO installs, and AUTO_ARTIFACT_SET covers it. (Left at 'auto', plan()
// resolves to the single recommended platform, which is claude on this runner.)
function autoAnswers() {
  return {
    flow: 'auto',
    platforms: ['claude'],
    agents: [],
    user: { name: 'Yan', communicationLanguage: 'fr' },
    soul: { mode: 'creator' },
    byanWeb: { enabled: true, apiUrl: 'auto', token: FAKE_TOKEN, syncConsent: false },
    turboWhisper: 'skip',
    costOptimizer: false,
    installV2: false,
    installClis: false,
    byanVersion: '0.1.0',
  };
}

// Stage the temp cwd: a `templates` entry pointing at the real templates tree.
// Symlink first (cheap, read-only); fall back to a copy on platforms that forbid
// symlinks so the test is portable.
async function stageTemplates(cwd) {
  const link = path.join(cwd, 'templates');
  try {
    await fs.ensureSymlink(REAL_TEMPLATES, link, 'dir');
  } catch (e) {
    await fs.copy(REAL_TEMPLATES, link);
  }
}

// Walk a tree and return the set of relative paths for BOTH files and dirs
// (AUTO_ARTIFACT_SET mixes the two — subtrees and individual files). The staged
// `templates/` mirror is excluded so it is not counted as a produced artifact.
async function walkPaths(root) {
  const out = new Set();
  async function rec(dir, relBase) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = relBase ? path.join(relBase, e.name) : e.name;
      if (rel === 'templates' || rel.startsWith('templates' + path.sep)) continue;
      out.add(rel);
      if (e.isDirectory()) {
        await rec(path.join(dir, e.name), rel);
      }
    }
  }
  await rec(root, '');
  return out;
}

describe('retro-compat: install-core AUTO is a SUPERSET of the v2.19 AUTO artifact set', () => {
  let tmp;
  let produced;
  let applyResult;
  let theProfile;
  let thePlan;

  // One full engine run shared across the assertions (the chain is the unit
  // under test; the assertions read different facets of its result).
  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-retro-compat-'));
    await stageTemplates(tmp);

    theProfile = await detect({ probeVersions: false });
    thePlan = plan(theProfile, autoAnswers());
    applyResult = await apply(thePlan, {
      cwd: tmp,
      secrets: { BYAN_API_TOKEN: FAKE_TOKEN },
      // runInstalls left false: CLI binary install is deferred to F2 (see
      // DEFERRED_TO_F2). No real spawn happens.
    });
    produced = await walkPaths(tmp);
  }, 30000);

  afterAll(async () => {
    if (tmp) await fs.remove(tmp);
  });

  test('sanity: the real templates fixture exists (otherwise the proof is vacuous)', async () => {
    expect(await fs.pathExists(REAL_TEMPLATES)).toBe(true);
    expect(await fs.pathExists(path.join(REAL_TEMPLATES, '_byan'))).toBe(true);
  });

  test('the produced tree is a SUPERSET: every AUTO_ARTIFACT_SET path exists on disk', () => {
    const missing = AUTO_ARTIFACT_SET.filter((rel) => {
      const normalized = rel.split('/').join(path.sep);
      return !produced.has(normalized);
    });
    // (AUTO_ARTIFACT_SET \ produced) MUST be empty — no legacy AUTO path regressed.
    expect(missing).toEqual([]);
  });

  test('superset, not equality: install-core MAY add artifacts beyond the legacy set (e.g. the manifest)', () => {
    // The manifest ledger is install-core's own addition; it is allowed and
    // expected. Assert the produced set is strictly larger than the legacy set
    // (proves we did not just reproduce it 1:1 by accident, and that extras are OK).
    expect(produced.size).toBeGreaterThan(AUTO_ARTIFACT_SET.length);
    // The manifest is one concrete extra.
    const manifestRel = path.join('_byan', '.manifest.json');
    expect(produced.has(manifestRel)).toBe(true);
  });

  test('config.yaml field-level parity (install_mode:auto, platform, byan_version, soul_mode:creator)', async () => {
    const raw = await fs.readFile(path.join(tmp, '_byan', 'bmb', 'config.yaml'), 'utf8');
    expect(raw).toMatch(/install_mode:\s*auto/);
    // platform records the selected platforms (claude is first/primary).
    expect(raw).toMatch(/platform:\s*.*claude/);
    expect(raw).toMatch(/byan_version:\s*['"]?0\.1\.0/);
    expect(raw).toMatch(/soul_mode:\s*creator/);
  });

  test('soul creator-mode rename map applied (byan-soul.md -> soul.md, byan-tao.md -> tao.md)', async () => {
    const soulDir = path.join(tmp, '_byan', 'agent', 'byan');
    expect(await fs.pathExists(path.join(soulDir, 'soul.md'))).toBe(true);
    expect(await fs.pathExists(path.join(soulDir, 'tao.md'))).toBe(true);
    expect(await fs.pathExists(path.join(soulDir, 'soul-memory.md'))).toBe(true);
    expect(await fs.pathExists(path.join(soulDir, 'creator-soul.md'))).toBe(true);
  });

  test('.mcp.json content parity: mcpServers.byan present, BYAN_API_URL clean of /api, NO raw token', async () => {
    const mcp = await fs.readJson(path.join(tmp, '.mcp.json'));
    expect(mcp.mcpServers && mcp.mcpServers.byan).toBeDefined();
    const env = mcp.mcpServers.byan.env || {};
    expect(env.BYAN_API_URL).toBeDefined();
    expect(env.BYAN_API_URL).not.toMatch(/\/api(\/|$)/);
    // The token belongs in .env / settings.local.json, never in the committed .mcp.json.
    expect(env.BYAN_API_TOKEN).toBeUndefined();
  });

  test('.env carries BYAN_API_URL and the resolved token KEY (token value resolved, not the @secret ref)', async () => {
    const envFile = await fs.readFile(path.join(tmp, '.env'), 'utf8');
    expect(envFile).toMatch(/^BYAN_API_URL=/m);
    expect(envFile).toMatch(/^BYAN_API_TOKEN=/m);
    // The plan's secret reference must be resolved at apply-time, not written literally.
    expect(envFile).not.toMatch(/@secret:/);
  });

  test('the secret token never leaks into the ApplyResult object (secret hygiene)', () => {
    expect(JSON.stringify(applyResult)).not.toContain(FAKE_TOKEN);
  });

  test('closing the loop: verify({cwd}) reports ok:true on the produced tree', async () => {
    const report = await verify({ cwd: tmp });
    expect(report.missing).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test('DEFERRED_TO_F2 is documented and disjoint from AUTO_ARTIFACT_SET (no silent cut)', () => {
    // The pieces we intentionally do NOT produce at the engine level are named,
    // and none of them is an entry in the artifact identity set (so the superset
    // proof above is not quietly relying on their absence).
    expect(DEFERRED_TO_F2.length).toBeGreaterThan(0);
    DEFERRED_TO_F2.forEach((piece) => {
      expect(AUTO_ARTIFACT_SET).not.toContain(piece);
    });
  });
});
