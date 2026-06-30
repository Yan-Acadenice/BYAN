// Pure helpers for the BYAN delivery-default contract (F1).
//
// The user asked for something complete. This contract makes prod-grade +
// maximal scope the DEFAULT the agent assumes every turn, instead of quietly
// drifting toward an MVP / a short deliverable / a "split so the heavy part
// does not block". It is the proactive twin of strict mode: strict locks a
// scope on demand; this anchor sets the BASELINE posture before a scope is
// even named.
//
// F1 ships LIVE (unlike the two blockers F2/F3): it is pure injected context,
// it blocks nothing, so a false positive costs at most a few tokens — never a
// trapped turn or a blocked commit. The only escape is an explicit opt-out word
// the user types THIS message (mvp, quick, brouillon, ...), read from
// _byan/_config/delivery-default.json so the wordlist is one source of truth.
//
// Every function here is pure (no clock, no fs beyond the one config read in
// loadConfig) so the decision is unit-testable without a hook harness.

'use strict';

const fs = require('fs');
const path = require('path');

// Fallback wordlist used only if the config file is missing/unreadable. Keeping
// it here means the anchor still has a closed opt-out set on a broken install,
// rather than treating every message as opt-out (fail-safe toward PROD).
const DEFAULT_OPT_OUT_WORDS = [
  'mvp',
  'quick',
  'brouillon',
  'jette',
  'prototype',
  'vite fait',
  'pas besoin que ce soit parfait',
  'poc',
  'draft',
];

function configPath(projectRoot) {
  const root = projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(root, '_byan', '_config', 'delivery-default.json');
}

function loadConfig(projectRoot) {
  try {
    const p = configPath(projectRoot);
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (cfg && typeof cfg === 'object') return cfg;
    }
  } catch {
    // Fall through to defaults — a broken config must not silence the anchor.
  }
  return {};
}

function optOutWords(config) {
  const words = config && Array.isArray(config.optOutWords) ? config.optOutWords : null;
  return words && words.length ? words : DEFAULT_OPT_OUT_WORDS;
}

// The full delivery contract. PROD + MAXIMAL + the AI-2026 cost yardstick +
// the explicit ban on proposing an MVP/short-deliverable/dont-block-the-heavy
// split. Kept as one builder so the hook and the tests render identical text.
function buildAnchor() {
  return [
    'CONTRAT DE LIVRAISON (defaut): grade=PROD. scope=MAXIMAL -- livre le maximum',
    'coherent, INTERDIT de proposer un MVP/livrable-court/decoupage-pour-ne-pas-bloquer-le-lourd',
    'sauf si l\'utilisateur a tape un mot opt-out CE message. Etalon de cout=AI-2026:',
    'estime en temps-agent (x10), jamais en temps-humain-a-la-main. Tu es un fou',
    'd\'optimisation: maximum a chaque demande, pas minimum.',
  ].join(' ');
}

// Opt-out detection is BIASED TOWARD PROD. A false opt-out (silencing the prod
// anchor when the user did not ask to) is the one failure that matters, so when
// in doubt we stay PROD. A single opt-out word counts only when it reads as a
// directive for THIS task -- the message is short enough to be a directive, OR
// a "go-cheap" cue sits just before the word -- and it is dropped when negated
// ("pas de mvp"). A word merely MENTIONED (a long meta message about MVPs, a
// system notification, an "anti-mvp" discussion) leaves the anchor armed.
// Curated multi-word phrases ("vite fait", "pas besoin que ce soit parfait")
// are unambiguous and match as-is.
const OPT_OUT_NEGATORS = new Set(['pas', 'sans', 'aucun', 'aucune', 'ni', 'no', 'not', 'non']);
const OPT_OUT_CUES = new Set([
  'juste', 'just', 'seulement', 'only', 'mode', 'reste', 'simplement',
  'rapidement', 'vite', 'fais', 'make', 'leave', 'give', 'garde',
]);
const OPT_OUT_SHORT_WORDS = 30; // a message this short reads as a directive, not meta
const OPT_OUT_WINDOW = 3; // tokens before the word inspected for a negator / cue

function tokenizeWords(s) {
  return s.toLowerCase().match(/[a-z0-9']+/g) || [];
}

function parseOptOut(userMsg, config) {
  if (!userMsg || typeof userMsg !== 'string') return false;
  const lower = userMsg.toLowerCase();
  const words = optOutWords(config)
    .map((w) => String(w).toLowerCase().trim())
    .filter(Boolean);

  // 1) Curated multi-word phrases: unambiguous opt-out intent, substring match.
  if (words.some((w) => w.includes(' ') && lower.includes(w))) return true;

  // 2) Single words: honoured only in a directive context, dropped when negated.
  const singles = new Set(words.filter((w) => /^[a-z]+$/.test(w)));
  if (singles.size === 0) return false;
  const tokens = tokenizeWords(userMsg);
  const directiveShort = tokens.length <= OPT_OUT_SHORT_WORDS;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!singles.has(tokens[i])) continue;
    const before = tokens.slice(Math.max(0, i - OPT_OUT_WINDOW), i);
    if (before.some((t) => OPT_OUT_NEGATORS.has(t))) continue; // "pas de mvp" -> stays PROD
    if (directiveShort || before.some((t) => OPT_OUT_CUES.has(t))) return true;
  }
  return false;
}

// The per-turn decision. With an opt-out word present this turn, emit a single
// line authorizing descope; otherwise emit the full anchor. Pure: the caller
// supplies the message and (optionally) the loaded config.
function decideContext({ userMsg, config } = {}) {
  const cfg = config || {};
  const optOut = parseOptOut(userMsg, cfg);
  if (optOut) {
    return {
      optOut: true,
      text: 'CONTRAT DE LIVRAISON: OPT-OUT detecte ce message -- descope autorise (grade/scope libres pour cette demande).',
    };
  }
  return { optOut: false, text: buildAnchor() };
}

module.exports = {
  DEFAULT_OPT_OUT_WORDS,
  configPath,
  loadConfig,
  optOutWords,
  buildAnchor,
  parseOptOut,
  decideContext,
};
