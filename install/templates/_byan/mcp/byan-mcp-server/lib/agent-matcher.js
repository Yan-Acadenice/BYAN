// F1 — the agent SUITABILITY matcher: the pre-filter Hermes+BYAN present at the
// entry gate. Given a task description and the agent roster, it ranks the
// candidates and returns a verdict {fit | no-fit}. It NEVER decides alone — it
// PROPOSES; the user validates (double validation IA + human). A no-fit verdict
// is the signal to run the interview -> web-research -> create-agent path instead
// of a workflow.
//
// Pure core (matchAgents) has no I/O so it is fully unit-testable. The loader
// (loadRoster) reads the roster from _byan/_config/agent-manifest.csv, isolated
// from the scoring.
//
// Scoring = curated Hermes trigger words (strong signal) layered on top of a
// plain text overlap with each agent's title+role. Deterministic: same input,
// same ranking.

import fs from 'node:fs';

// Fit verdict floor. A best score at/above this = at least one solid signal that
// an existing agent covers the need; below it, no agent fits -> interview.
export const FIT_THRESHOLD = 3;

// Curated Hermes routing signal: trigger word (deburred) -> agent name. This is
// the strong layer (weighted x3 in the score) because these are the hand-picked
// dispatch cues, not incidental text. Kept in sync in spirit with
// .claude/rules/hermes-dispatcher.md.
export const DOMAIN_KEYWORDS = Object.freeze({
  analyst: ['analyse', 'analyser', 'requirement', 'requirements', 'brief', 'etude', 'marche', 'concurrent', 'besoin'],
  architect: ['architecture', 'architect', 'conception', 'concois', 'systeme', 'stack', 'scalab', 'infrastructure', 'api'],
  dev: ['code', 'coder', 'implemente', 'implementer', 'implement', 'developpe', 'dev', 'feature', 'refactor', 'bug', 'debug', 'fix', 'script', 'module', 'fonction', 'endpoint'],
  quinn: ['test', 'tester', 'qa', 'coverage', 'couverture', 'assurance qualite'],
  'tea-tea': ['atdd', 'nfr', 'test architect', 'ci/cd', 'automation de test'],
  sm: ['sprint', 'backlog', 'scrum', 'planifier', 'planification', 'story', 'epic'],
  'tech-writer': ['documente', 'documenter', 'documentation', 'guide', 'readme', 'redige'],
  'ux-designer': ['ux', 'ui', 'mockup', 'maquette', 'interface', 'wireframe', 'design ux'],
  pm: ['prd', 'produit', 'roadmap', 'product', 'vision produit'],
  byan: ['creer un agent', 'nouvel agent', 'workflow byan', 'nouveau module'],
  'brainstorming-coach': ['brainstorm', 'idee', 'ideation', 'innovation', 'remue-meninge'],
  carmack: ['optimiser', 'optimisation', 'token', 'performance', 'perf'],
});

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'pour', 'avec',
  'sur', 'dans', 'que', 'qui', 'ce', 'cette', 'mon', 'ma', 'mes', 'ton', 'son',
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'with', 'on', 'in', 'is',
  'fait', 'faire', 'veux', 'peux', 'ajoute', 'cree', 'creer', 'besoin', 'agent',
]);

// deburr: lowercase + strip French diacritics so "marché" matches "marche".
export function deburr(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip combining diacritics
}

function tokenize(text) {
  return deburr(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

// scoreAgent — pure per-agent score. keyword hits (x3) + title/role text overlap.
export function scoreAgent(taskText, agent) {
  const task = deburr(taskText);
  const taskTokens = new Set(tokenize(taskText));
  let keywordScore = 0;
  const hits = [];
  const kws = DOMAIN_KEYWORDS[agent.name] || [];
  for (const kw of kws) {
    if (task.includes(deburr(kw))) { keywordScore += 1; hits.push(kw); }
  }
  const agentTokens = tokenize(`${agent.title || ''} ${agent.role || ''}`);
  let textScore = 0;
  for (const t of agentTokens) if (taskTokens.has(t)) textScore += 1;
  return { score: keywordScore * 3 + textScore, keywordScore, textScore, hits };
}

// matchAgents(taskText, roster) -> {
//   fit, needsInterview, best, candidates: [{ name, title, score, why }]
// }
// candidates are ranked desc and limited to those with a non-zero score.
export function matchAgents(taskText, roster, { threshold = FIT_THRESHOLD, limit = 3 } = {}) {
  const scored = (Array.isArray(roster) ? roster : [])
    .map((agent) => {
      const s = scoreAgent(taskText, agent);
      return {
        name: agent.name,
        title: agent.title || agent.displayName || agent.name,
        score: s.score,
        why: s.hits.length ? `mots-cles: ${s.hits.join(', ')}` : (s.textScore ? 'recoupement titre/role' : ''),
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const candidates = scored.slice(0, limit);
  const best = candidates[0] || null;
  const fit = Boolean(best && best.score >= threshold);
  return {
    fit,
    needsInterview: !fit,
    best,
    candidates,
    recommendation: fit
      ? `Un agent adapte existe : @${best.name} (${best.why}). A valider.`
      : "Aucun agent adapte trouve. Proposer une interview pour en creer un sur mesure.",
  };
}

// --- loader (I/O isolated) ------------------------------------------------

// Minimal RFC-4180-ish CSV parser: handles double-quoted fields with embedded
// commas and escaped quotes (""). Enough for agent-manifest.csv; not a general
// CSV engine.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text == null ? '' : text);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// rosterFromCsv(text) -> [{ name, displayName, title, role }]. Pure (no fs).
export function rosterFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (col) => header.indexOf(col);
  const iName = idx('name'), iDisplay = idx('displayName'), iTitle = idx('title'), iRole = idx('role');
  return rows.slice(1)
    .filter((r) => r[iName])
    .map((r) => ({
      name: r[iName],
      displayName: iDisplay >= 0 ? r[iDisplay] : '',
      title: iTitle >= 0 ? r[iTitle] : '',
      role: iRole >= 0 ? r[iRole] : '',
    }));
}

// loadRoster(manifestPath) -> roster array, or [] if the file is unreadable.
export function loadRoster(manifestPath) {
  try {
    return rosterFromCsv(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
}
