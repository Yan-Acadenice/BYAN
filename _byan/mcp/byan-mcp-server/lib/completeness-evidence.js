// BYAN completeness-evidence (F2).
//
// Strict mode already forces >= 3 self-verify passes whose verdict is the
// agent's word. This module adds an EVIDENCE layer on top: for each locked
// acceptance criterion it classifies the criterion (code-shaped vs prose) and
// collects whatever objective proof is available — a captured test-runner exit,
// a `git diff --stat` constrained to the allowedPaths, or the existence of a
// named file. The result is { perCriterion, missing }.
//
// It ships DISARMED. The strict complete() ATTACHES this report (so the agent
// and the audit trail see it) but only HARD-REJECTS when
// delivery-default.json completenessGate.armed === true (default false). With
// armed=false the report is pure observation: complete() behaves exactly as
// before. This is the same disarmed-net posture as the autobench Stop guard.
//
// The risky-but-pure half (classification, the report shape, the missing list)
// takes no I/O. The I/O half (running git, reading files) is injected via an
// `io` object so the unit tests pin behaviour without touching the real
// filesystem or spawning git — the same shape strict-sync / suitability-store use.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// A criterion is "code-shaped" when it names a testable/file/command artifact:
// a path, an extension, a test/spec word, a backticked token, or a runner. Else
// it is prose (a human-judged outcome with no mechanical proof). Pure.
const CODE_SHAPED_PATTERNS = [
  /`[^`]+`/, // a backticked token (file, command, symbol)
  /\b[\w./-]+\.(js|ts|mjs|cjs|json|yaml|yml|md|py|rs|go|sh)\b/i, // a filename with a known ext
  /\b(test|tests|spec|coverage|passe?s?|green|exit\s*0)\b/i, // test/run vocabulary
  /\b(npm|node|jest|git|curl|build|lint)\b/i, // a runner / command
  /\//, // a path separator
];

export function classifyCriterion(criterion) {
  const text = String(criterion || '');
  const isCode = CODE_SHAPED_PATTERNS.some((re) => re.test(text));
  return isCode ? 'code' : 'prose';
}

// Default I/O surface. Overridable for tests.
function defaultIo(projectRoot) {
  const root = projectRoot || process.cwd();
  return {
    existsSync: (p) => fs.existsSync(path.isAbsolute(p) ? p : path.join(root, p)),
    // git diff --stat constrained to the given paths, run at the project root.
    gitDiffStat: (paths) => {
      const argPaths = Array.isArray(paths) && paths.length ? ['--', ...paths] : [];
      try {
        const out = execFileSync('git', ['diff', '--stat', ...argPaths], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        return out.trim();
      } catch {
        return '';
      }
    },
  };
}

// Pull the candidate file tokens out of a code-shaped criterion: backticked
// tokens and bare filenames-with-extension. Pure (string-only).
export function fileTokens(criterion) {
  const text = String(criterion || '');
  const tokens = new Set();
  const backtick = /`([^`]+)`/g;
  let m;
  while ((m = backtick.exec(text))) {
    const inner = m[1].trim();
    // Only treat a backticked token as a file when it LOOKS like a path/file
    // (has a separator or an extension); a backticked `npm test` is a command.
    if (/[./]/.test(inner) && !/\s/.test(inner)) tokens.add(inner);
  }
  const bare = /\b[\w./-]+\.(?:js|ts|mjs|cjs|json|yaml|yml|md|py|rs|go|sh)\b/gi;
  while ((m = bare.exec(text))) tokens.add(m[0]);
  return [...tokens];
}

// Build the evidence report for a set of criteria.
//
//   criteria      : array of acceptance-criterion strings (the locked scope)
//   allowedPaths  : the locked allowed paths (scopes the git diff)
//   context       : { testRun } where testRun is an optional captured run
//                   { ran:bool, exitCode:number, summary?:string } — the agent
//                   passes what it observed; we never re-run the suite here.
//   io            : injected I/O (existsSync, gitDiffStat). Defaults to real fs/git.
//
// Returns { perCriterion:[{criterion, kind, hasEvidence, evidence}], missing:[...] }.
// A code criterion HAS evidence when a named file exists OR a constrained git
// diff is non-empty OR a green test run was captured. A prose criterion never
// claims mechanical evidence (it is human-judged) and is reported as such — it
// is NOT counted as missing, because prose criteria have no mechanical proof by
// nature; only code criteria without any evidence land in `missing`.
export function buildEvidence({
  criteria = [],
  allowedPaths = [],
  context = {},
  projectRoot,
  io,
} = {}) {
  const surface = io || defaultIo(projectRoot);
  const testRun = context && context.testRun;
  const diffStat =
    typeof surface.gitDiffStat === 'function' ? surface.gitDiffStat(allowedPaths) : '';
  const hasDiff = Boolean(diffStat && diffStat.length);
  const greenTest = Boolean(testRun && testRun.ran && Number(testRun.exitCode) === 0);

  const perCriterion = [];
  const missing = [];

  for (const c of Array.isArray(criteria) ? criteria : []) {
    const kind = classifyCriterion(c);
    if (kind === 'prose') {
      perCriterion.push({
        criterion: c,
        kind,
        hasEvidence: false,
        evidence: { type: 'prose', note: 'human-judged outcome — no mechanical proof expected' },
      });
      continue;
    }

    const tokens = fileTokens(c);
    const existing = tokens.filter((t) => {
      try {
        return surface.existsSync(t);
      } catch {
        return false;
      }
    });

    let hasEvidence = false;
    let evidence = null;
    if (existing.length) {
      hasEvidence = true;
      evidence = { type: 'file', files: existing };
    } else if (greenTest) {
      hasEvidence = true;
      evidence = {
        type: 'test',
        exitCode: 0,
        summary: testRun.summary || 'test run captured green',
      };
    } else if (hasDiff) {
      hasEvidence = true;
      evidence = { type: 'diff', stat: diffStat };
    } else {
      evidence = { type: 'none', note: 'no file, no green test run, no diff in allowedPaths' };
    }

    perCriterion.push({ criterion: c, kind, hasEvidence, evidence });
    if (!hasEvidence) missing.push(c);
  }

  return { perCriterion, missing };
}
