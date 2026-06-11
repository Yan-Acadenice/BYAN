import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// Strict-mode activation detector.
//
// Reads the activation keywords from the single source of truth
// (_byan/_config/strict-mode.yaml) and reports whether a piece of text
// (a user request, a feature name) signals a production-grade deliverable
// that should be built under strict mode.
//
// This is the platform-agnostic counterpart to the strict-context-inject
// hook : Codex has no in-session hook, so it calls
// byan_strict_suggest to get the same signal.

const DEFAULT_CONFIG_REL = path.join('_byan', '_config', 'strict-mode.yaml');
const FALLBACK_KEYWORDS = [
  'prod',
  'production',
  'client',
  'contrat',
  'template officiel',
  'livrable',
  'deliverable',
  'release',
];

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function loadKeywords({ projectRoot, configPath } = {}) {
  const file = configPath || path.join(resolveRoot(projectRoot), DEFAULT_CONFIG_REL);
  try {
    if (fs.existsSync(file)) {
      const cfg = yaml.load(fs.readFileSync(file, 'utf8'));
      const kw = cfg && cfg.activation && cfg.activation.auto_keywords;
      if (Array.isArray(kw) && kw.length > 0) return kw;
    }
  } catch {
    // fall through to fallback list
  }
  return FALLBACK_KEYWORDS;
}

function matchKeyword(text, keyword) {
  const kw = String(keyword).toLowerCase();
  const lower = text.toLowerCase();
  // Single alphabetic words match on word boundary to avoid false hits
  // (e.g. "prod" should not match "reproduction").
  if (/^[a-z]+$/.test(kw)) {
    return new RegExp(`\\b${kw}\\b`).test(lower);
  }
  return lower.includes(kw);
}

export function detectActivation({ text, projectRoot, configPath } = {}) {
  if (!text || typeof text !== 'string') {
    return { suggested: false, matched: [], message: '' };
  }
  const keywords = loadKeywords({ projectRoot, configPath });
  const matched = keywords.filter((k) => matchKeyword(text, k));

  if (matched.length === 0) {
    return { suggested: false, matched: [], message: '' };
  }

  const message =
    `The request mentions ${matched.map((m) => `"${m}"`).join(', ')}, ` +
    `which signals a production-grade deliverable. Lock strict mode with ` +
    `byan_strict_lock_scope (verbatim scope + testable acceptance criteria) ` +
    `before building. Strict mode enforces self-verification and a 95% ` +
    `confidence floor on hard claims.`;

  return { suggested: true, matched, message };
}
