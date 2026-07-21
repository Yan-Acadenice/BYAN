'use strict';

// Plain-language core — the shared, testable heart of the "parler reel" guard
// (Mantra IA-26). Two jobs, no I/O beyond the slip flag:
//
//  1. scanText: find the KNOWN repeat-offender words in an assistant reply and
//     return each with its plain-French replacement. This is the mechanical net
//     for words we already know we misuse; the generative rule (the principle in
//     .claude/rules/plain-language.md + the voice anchor) handles the long tail.
//  2. slip flag: a tiny file under _byan-output/ that the Stop hook writes when a
//     reply slipped, and the next-turn voice anchor reads + clears to remind the
//     agent. NO re-answer, NO blocking — the correction is carried FORWARD to the
//     next turn, which is the whole point (avoid the costly regen loop).

const fs = require('fs');
const path = require('path');

// Known repeat-offenders -> plain French. Deliberately conservative: only terms
// with a clean everyday equivalent and a low false-positive risk once code is
// stripped. Common technical borrowings that have no French equivalent (commit,
// cache, token) are NOT here — the rule keeps them, explained once.
const OFFENDERS = Object.freeze([
  { term: 'inline', good: 'directement (je le fais moi-meme)' },
  { term: 'cutoff', good: "l'action reelle (ex: redemarrer, couper)" },
  { term: 'housekeeping', good: 'rangement / menage du code' },
  { term: 'downgrade', good: 'retrograder / baisser en gamme' },
  { term: 'advisory', good: 'signalement non bloquant' },
  { term: 'wrapper', good: 'enveloppe / surcouche' },
  { term: 'fallback', good: 'repli / solution de secours' },
  { term: 'throughput', good: 'debit' },
  { term: 'overhead', good: 'surcout' },
  { term: 'gate', good: 'point de controle / porte' },
  { term: 'leaf', good: 'etape / tache' },
  { term: 'tier', good: 'niveau / gamme' },
  { term: 'nudge', good: 'rappel / conseil injecte' },
  { term: 'up-tier', good: 'monter en gamme' },
  { term: 'ladder', good: 'echelle' },
  { term: 'rung', good: 'palier' },
  { term: 'runtime', good: "moteur d'execution" },
]);

// A metaphor misuse, not a single word: "forger" applied to a token/jeton.
// Matched separately so the replacement can name the real verb.
const METAPHOR_OFFENDERS = Object.freeze([
  {
    id: 'forger-token',
    re: /forg\w*\s+(?:un |une |des |le |les |la )?(?:token|jeton)/i,
    label: 'forger un token',
    good: 'generer / creer un token',
  },
  {
    // Anthropomorphism applied to a tool: an MCP/serveur/hook is not "vivant" or
    // "mort" — the precise statement is the observed fact ("byan_ping a repondu",
    // "le serveur ne repond pas, timeout 8s"). The predicate must be COPULA-bound
    // to the tool word ("le serveur est mort", "l'API semble morte") : bare
    // proximity would misfire on fixed French idioms near a tool word ("point
    // mort", "angle mort", "temps mort", "nature morte", "communaute vivante"),
    // which carry no anthropomorphism at all.
    id: 'outil-vivant-mort',
    re: /\b(?:mcp|serveur|outil|hook|api|tool)s?\b[^.!?\n]{0,40}\b(?:est|sont|etait|était|etaient|étaient|semble|semblent|parait|paraît|paraissent|reste|restent)\s+(?:bien\s+|encore\s+|toujours\s+|deja\s+|déjà\s+)?(?:vivante?s?|morte?s?)\b/i,
    label: 'outil "vivant/mort"',
    good: 'le fait observe : "repond" / "ne repond pas" + le resultat exact',
  },
  {
    // BYAN in-house doctrine shorthand dropped raw in prose (field complaint,
    // 2026-07-21). "le rail" means the byan-auto-dispatch workflow; a reader
    // without the internal doctrine cannot decode it — same offence as raw
    // English jargon (IA-26). The article-bound match spares ordinary French
    // ("un rail de guidage", "rail ferroviaire").
    id: 'jargon-doctrine-rail',
    re: /\b(?:le|ce|du)\s+rail\b(?!\s+(?:de|d'|ferroviaire))/i,
    label: '"le rail" (jargon doctrine)',
    good: 'dis-le en clair : le workflow automatique de dispatch (byan-auto-dispatch)',
  },
  {
    // "voie/option armee" means: option enabled AND Codex linked. Say the fact.
    // The noun-bound match spares the ordinary word ("l'armee").
    id: 'jargon-doctrine-armee',
    re: /\b(?:voie|option|lane)\s+(?:est\s+|n'est\s+pas\s+)?arm[ée]e?s?\b/i,
    label: 'voie/option "armee" (jargon doctrine)',
    good: 'dis le fait : option activee ET Codex connecte (ou pas)',
  },
]);

// A word boundary that treats accented letters as part of a word, so \btier\b
// style matching does NOT fire inside "metier", "chantier", "quartier"... The
// native \b is wrong here because JS \w excludes accented chars, splitting French
// words. This lookbehind/lookahead pair is the correct French-aware boundary.
const LEFT = '(?<![A-Za-zÀ-ÿ0-9_])';
const RIGHT = '(?![A-Za-zÀ-ÿ0-9_])';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termRegExp(term) {
  return new RegExp(LEFT + escapeRegExp(term) + RIGHT, 'i');
}

// Remove fenced code blocks and inline `code` spans before scanning, so quoting a
// file, flag, or function literally named "tier" / "gate" does not trip the net.
// Prose is what we police; quoted code is not prose.
function stripCode(text) {
  if (typeof text !== 'string' || !text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ');
}

// Find every distinct offender present in the prose. Returns [{ bad, good }].
function scanText(text) {
  const prose = stripCode(text);
  if (!prose) return [];
  const hits = [];
  const seen = new Set();
  for (const { term, good } of OFFENDERS) {
    if (termRegExp(term).test(prose) && !seen.has(term)) {
      seen.add(term);
      hits.push({ bad: term, good });
    }
  }
  for (const m of METAPHOR_OFFENDERS) {
    if (m.re.test(prose) && !seen.has(m.id)) {
      seen.add(m.id);
      hits.push({ bad: m.label, good: m.good });
    }
  }
  return hits;
}

// A short French reminder, for injection at the NEXT turn. Bounded to a few
// offenders so the note stays tiny even if a reply slipped many times.
function formatReminder(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return '';
  const shown = hits.slice(0, 6)
    .map((h) => `"${h.bad}" -> ${h.good}`)
    .join(' ; ');
  return [
    'Rappel langage (IA-26) : au dernier tour tu as glisse du jargon ou de',
    `l'anglais gratuit -> ${shown}. Reformule en francais reel et coherent ce`,
    'tour-ci, sans refaire la reponse precedente.',
  ].join(' ');
}

// The slip flag lives under _byan-output/ (gitignored), same family as the other
// hook sidecars. It is a transient one-turn signal, never source of truth.
function slipPath(projectDir) {
  return path.join(projectDir, '_byan-output', '.jargon-slip.json');
}

function writeSlip(projectDir, hits) {
  try {
    const p = slipPath(projectDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ hits }));
    return true;
  } catch {
    return false; // best-effort: a write failure must never block a turn
  }
}

function readSlip(projectDir) {
  try {
    const raw = fs.readFileSync(slipPath(projectDir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.hits) ? parsed.hits : [];
  } catch {
    return null; // no flag (or unreadable) -> nothing to remind
  }
}

function clearSlip(projectDir) {
  try {
    fs.rmSync(slipPath(projectDir), { force: true });
  } catch {
    // never block
  }
}

module.exports = {
  OFFENDERS,
  METAPHOR_OFFENDERS,
  escapeRegExp,
  termRegExp,
  stripCode,
  scanText,
  formatReminder,
  slipPath,
  writeSlip,
  readSlip,
  clearSlip,
};
