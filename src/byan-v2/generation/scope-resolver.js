const fs = require('fs');
const path = require('path');

// Domain-aware scope resolution for the mantra validator.
//
// The validator itself stays pure (it scores against a scope set it is given).
// This module owns the impure part : turning a persona FILE into its scope set,
// by reading a centralized map and, where present, an explicit frontmatter
// override. Callers (the pre-commit gate, the Stop hook, the FD VALIDATE step)
// resolve scopes here, then pass them to validator.validate(content, { scope }).

const VALID_SCOPES = ['universal', 'sdlc-process', 'sdlc-code', 'sdlc-ops', 'sdlc-modeling', 'sdlc-test', 'creative'];
const KNOWN_MODULES = ['bmm', 'cis', 'tea', 'bmb', 'core'];

function loadScopeMap(mapPath) {
  const p = mapPath || path.join(__dirname, '../data/agent-scopes.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// An explicit `mantra_scopes: [a, b]` in the persona (frontmatter or body) wins
// over every derived default. Returns the listed scopes, or null when absent.
function parseFrontmatterScopes(content) {
  if (typeof content !== 'string') return null;
  const m = content.match(/mantra_scopes\s*:\s*\[([^\]]*)\]/);
  if (!m) return null;
  const list = m[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return list.length ? list : null;
}

// A Gen3 agent loads exactly one _byan/<module>/config.yaml during activation,
// so the module is derivable from the persona content. Returns null if none.
function deriveModule(content) {
  if (typeof content !== 'string') return null;
  const m = content.match(/_byan\/(bmm|cis|tea|bmb|core)\/config\.yaml/);
  return m ? m[1] : null;
}

// The agent slug from a persona file path (basename without extension).
function agentNameFromPath(filePath) {
  if (!filePath) return null;
  return path.basename(filePath).replace(/\.md$/, '');
}

// Force-union 'universal' and keep only known scope names, order-stable.
function normalizeScopes(scopes) {
  const seen = new Set();
  const out = [];
  for (const s of ['universal', ...scopes]) {
    if (VALID_SCOPES.includes(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

// Resolve the scope set for a persona. Precedence :
//   1. explicit frontmatter mantra_scopes
//   2. agentScopes[name] in the map
//   3. moduleScopes[module] derived from the content
//   4. fallback ['universal']
// 'universal' is always present in the result.
function resolveAgentScopes({ name = null, content = null, map = null } = {}) {
  const scopeMap = map || loadScopeMap();

  const explicit = parseFrontmatterScopes(content);
  if (explicit) return normalizeScopes(explicit);

  if (name && scopeMap.agentScopes && scopeMap.agentScopes[name]) {
    return normalizeScopes(scopeMap.agentScopes[name]);
  }

  const mod = deriveModule(content);
  if (mod && scopeMap.moduleScopes && scopeMap.moduleScopes[mod]) {
    return normalizeScopes(scopeMap.moduleScopes[mod]);
  }

  return ['universal'];
}

// Convenience for file-based callers (the gate, the hooks) : read a persona
// file from disk and resolve its scopes in one call.
function resolveScopesForFile(filePath, map = null) {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = agentNameFromPath(filePath);
  return resolveAgentScopes({ name, content, map });
}

module.exports = {
  VALID_SCOPES,
  KNOWN_MODULES,
  loadScopeMap,
  parseFrontmatterScopes,
  deriveModule,
  agentNameFromPath,
  normalizeScopes,
  resolveAgentScopes,
  resolveScopesForFile,
};
