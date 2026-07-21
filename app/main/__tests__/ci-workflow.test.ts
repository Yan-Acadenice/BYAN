// Regression tests for the Electron Build CI workflow definition.
//
// We do not exercise GitHub Actions itself — instead we parse
// .github/workflows/electron-build.yml and assert the structural
// invariants F11 promised:
//
//   - matrix covers ubuntu-latest + windows-latest
//   - core steps present in order (checkout, setup-node, deps, typecheck,
//     lint, test, build, electron-builder package)
//   - signing secrets (CSC_LINK / CSC_KEY_PASSWORD) appear ONLY on the
//     Windows package step (no leak to Linux, no hardcoding)
//   - GITHUB_TOKEN is wired to the release job
//   - tag-driven release is gated on refs/tags/desktop-v* (v* = npm versions)
//
// js-yaml is available transitively (vitest -> @vitest/* depends on it).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error - js-yaml is a transitive dep, no @types installed
import yaml from 'js-yaml';

const WORKFLOW_PATH = resolve(__dirname, '../../../.github/workflows/electron-build.yml');

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  name?: string;
  'runs-on'?: string;
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  strategy?: { matrix?: Record<string, unknown>; 'fail-fast'?: boolean };
  steps: WorkflowStep[];
}

interface WorkflowFile {
  name: string;
  on: Record<string, unknown>;
  jobs: Record<string, WorkflowJob>;
}

function loadWorkflow(): WorkflowFile {
  const raw = readFileSync(WORKFLOW_PATH, 'utf8');
  return yaml.load(raw) as WorkflowFile;
}

describe('electron-build.yml', () => {
  const wf = loadWorkflow();

  it('parses as valid YAML with name + jobs', () => {
    expect(wf.name).toBe('Electron Build');
    expect(wf.jobs).toBeTypeOf('object');
    expect(Object.keys(wf.jobs)).toContain('build');
    expect(Object.keys(wf.jobs)).toContain('release');
  });

  it('runs on push to main, tags desktop-v*, PRs, and workflow_dispatch', () => {
    // js-yaml interprets the YAML key `on` as boolean `true` (YAML 1.1 spec)
    // unless quoted, so we accept either key.
    const triggers = (wf.on ?? (wf as unknown as { true: unknown }).true) as Record<string, unknown>;
    expect(triggers).toBeTypeOf('object');
    expect(triggers.push).toBeDefined();
    expect(triggers.pull_request).toBeDefined();
    expect(triggers.workflow_dispatch).toBeDefined();

    const push = triggers.push as { branches: string[]; tags: string[] };
    expect(push.branches).toContain('main');
    // desktop-v*, NOT v*: the repo's v* tags carry the npm package versions
    // (2.x) — reusing them would cut a Desktop release on every npm publish.
    expect(push.tags).toContain('desktop-v*');
    expect(push.tags).not.toContain('v*');
  });

  describe('build job', () => {
    const job = wf.jobs.build;

    it('uses a matrix with ubuntu-latest + windows-latest', () => {
      const osList = job.strategy?.matrix?.os as string[] | undefined;
      expect(osList).toBeDefined();
      expect(osList).toContain('ubuntu-latest');
      expect(osList).toContain('windows-latest');
    });

    it('disables fail-fast so one OS failure does not cancel the other', () => {
      expect(job.strategy?.['fail-fast']).toBe(false);
    });

    it('runs on the matrix OS', () => {
      expect(job['runs-on']).toBe('${{ matrix.os }}');
    });

    it('has the required steps in order', () => {
      const stepNames = job.steps
        .map((s) => s.name ?? s.uses ?? s.run ?? '')
        .map((s) => s.toLowerCase());

      // helper: assert a substring appears, and capture its index
      const findIndex = (needle: string): number => {
        const idx = stepNames.findIndex((n) => n.includes(needle.toLowerCase()));
        expect(idx, `step "${needle}" missing`).toBeGreaterThanOrEqual(0);
        return idx;
      };

      const checkoutIdx = findIndex('checkout');
      const setupNodeIdx = findIndex('setup node');
      const installIdx = findIndex('install dependencies');
      const typecheckIdx = findIndex('typescript check');
      const lintIdx = findIndex('lint');
      const testIdx = findIndex('run tests');
      const buildIdx = findIndex('build (compile');
      const linuxPkgIdx = findIndex('package linux');
      const winPkgIdx = findIndex('package windows');
      const uploadIdx = findIndex('upload artifacts');

      expect(checkoutIdx).toBeLessThan(setupNodeIdx);
      expect(setupNodeIdx).toBeLessThan(installIdx);
      expect(installIdx).toBeLessThan(typecheckIdx);
      expect(typecheckIdx).toBeLessThan(lintIdx);
      expect(lintIdx).toBeLessThan(testIdx);
      expect(testIdx).toBeLessThan(buildIdx);
      expect(buildIdx).toBeLessThan(linuxPkgIdx);
      expect(buildIdx).toBeLessThan(winPkgIdx);
      expect(linuxPkgIdx).toBeLessThan(uploadIdx);
      expect(winPkgIdx).toBeLessThan(uploadIdx);
    });

    it('uses stable action versions (no @main / @master)', () => {
      const usesSteps = job.steps.filter((s) => s.uses);
      for (const s of usesSteps) {
        expect(s.uses, `step "${s.name}" uses floating ref`).not.toMatch(/@(main|master)$/);
        // require either @vN or @sha
        expect(s.uses).toMatch(/@(v\d+|[0-9a-f]{40})$/);
      }
    });

    it('caches npm via setup-node', () => {
      const setupNode = job.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
      expect(setupNode).toBeDefined();
      expect(setupNode?.with?.cache).toBe('npm');
      expect(setupNode?.with?.['cache-dependency-path']).toBe('app/package-lock.json');
    });

    it('installs libsecret-1-dev only on Linux', () => {
      const aptStep = job.steps.find((s) =>
        (s.run ?? '').includes('libsecret-1-dev')
      );
      expect(aptStep).toBeDefined();
      expect(aptStep?.if).toBe("runner.os == 'Linux'");
    });

    it('packages Linux without signing secrets', () => {
      const linuxPkg = job.steps.find((s) => s.name === 'Package Linux');
      expect(linuxPkg).toBeDefined();
      expect(linuxPkg?.if).toBe("runner.os == 'Linux'");
      expect(linuxPkg?.run).toContain('--linux');
      expect(linuxPkg?.run).toContain('--publish never');

      const env = linuxPkg?.env ?? {};
      expect(env.CSC_LINK, 'CSC_LINK must NOT leak to Linux step').toBeUndefined();
      expect(env.CSC_KEY_PASSWORD, 'CSC_KEY_PASSWORD must NOT leak to Linux step').toBeUndefined();
      expect(env.GH_TOKEN).toBeDefined();
    });

    it('packages Windows with optional CSC_LINK / CSC_KEY_PASSWORD', () => {
      const winPkg = job.steps.find((s) => s.name === 'Package Windows');
      expect(winPkg).toBeDefined();
      expect(winPkg?.if).toBe("runner.os == 'Windows'");
      expect(winPkg?.run).toContain('--win');
      expect(winPkg?.run).toContain('--publish never');

      const env = winPkg?.env ?? {};
      expect(env.CSC_LINK).toBe('${{ secrets.CSC_LINK }}');
      expect(env.CSC_KEY_PASSWORD).toBe('${{ secrets.CSC_KEY_PASSWORD }}');
      expect(env.GH_TOKEN).toBeDefined();
    });

    it('uploads artifacts with retention and ignores missing files', () => {
      const upload = job.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@'));
      expect(upload).toBeDefined();
      expect(upload?.with?.['retention-days']).toBe(14);
      expect(upload?.with?.['if-no-files-found']).toBe('ignore');
    });

    it('does not contain hardcoded secret values', () => {
      const raw = readFileSync(WORKFLOW_PATH, 'utf8');
      // Walk every CSC_LINK / CSC_KEY_PASSWORD assignment and assert the value
      // is a `${{ secrets.* }}` expression — never an inline literal.
      const cscLinkValues = [...raw.matchAll(/CSC_LINK\s*:\s*([^\n]+)/g)].map((m) => m[1].trim());
      const cscPwdValues = [...raw.matchAll(/CSC_KEY_PASSWORD\s*:\s*([^\n]+)/g)].map((m) => m[1].trim());

      expect(cscLinkValues.length).toBeGreaterThan(0);
      expect(cscPwdValues.length).toBeGreaterThan(0);

      for (const v of cscLinkValues) {
        expect(v, `CSC_LINK must reference secrets, got: ${v}`).toMatch(/^\$\{\{\s*secrets\./);
      }
      for (const v of cscPwdValues) {
        expect(v, `CSC_KEY_PASSWORD must reference secrets, got: ${v}`).toMatch(/^\$\{\{\s*secrets\./);
      }
    });

    it('does not contain emojis (mantra IA-23)', () => {
      const raw = readFileSync(WORKFLOW_PATH, 'utf8');
      // strip ASCII; what remains must be plain whitespace / latin-1 control chars only.
      // Emoji codepoints live above U+1F000.
      const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u;
      expect(raw).not.toMatch(emojiRegex);
    });
  });

  describe('release job', () => {
    const job = wf.jobs.release;

    it('depends on the build job', () => {
      expect(job.needs).toBe('build');
    });

    it('runs only on tag desktop-v*', () => {
      expect(job.if).toBe("startsWith(github.ref, 'refs/tags/desktop-v')");
    });

    it('grants contents:write to publish releases', () => {
      expect(job.permissions?.contents).toBe('write');
    });

    it('creates a draft release with auto-generated notes', () => {
      const ghRelease = job.steps.find((s) =>
        s.uses?.startsWith('softprops/action-gh-release@')
      );
      expect(ghRelease).toBeDefined();
      expect(ghRelease?.with?.draft).toBe(true);
      expect(ghRelease?.with?.generate_release_notes).toBe(true);
    });

    it('forwards GITHUB_TOKEN to the release step', () => {
      const ghRelease = job.steps.find((s) =>
        s.uses?.startsWith('softprops/action-gh-release@')
      );
      expect(ghRelease?.env?.GITHUB_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
    });
  });
});
