import fs from 'node:fs';
import path from 'node:path';

// BYAN's soul/tao/soul-memory files. The Gen3 layout moves them under the
// agent's own folder (_byan/agent/byan/<file>); the legacy Gen2 layout keeps
// them at the _byan/ root. This module is the read-side authority for the MCP
// server (an ESM package shipped standalone, so it carries its own small
// resolver rather than importing the root CJS layout-resolver). The ordering
// mirrors that resolver: existing file wins; for a write to a not-yet-existing
// file, prefer Gen3 when its directory is present, else default to Gen2.

const SOUL_FILES = {
  soul: 'soul.md',
  tao: 'tao.md',
  'soul-memory': 'soul-memory.md',
};
const BYAN_AGENT = 'byan';

export function resolveProjectRoot(envRoot) {
  return envRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// Resolve one soul file Gen3-first, Gen2 fallback. Returns { rel, abs, exists }.
export function resolveSoulFile(which, root) {
  const file = SOUL_FILES[which];
  if (!file) return null;
  const gen3rel = `_byan/agent/${BYAN_AGENT}/${file}`;
  const gen2rel = `_byan/${file}`;
  const g3 = path.join(root, gen3rel);
  const g2 = path.join(root, gen2rel);
  if (fs.existsSync(g3)) return { rel: gen3rel, abs: g3, exists: true };
  if (fs.existsSync(g2)) return { rel: gen2rel, abs: g2, exists: true };
  if (fs.existsSync(path.dirname(g3))) return { rel: gen3rel, abs: g3, exists: false };
  return { rel: gen2rel, abs: g2, exists: false };
}

export function readSoul({ which = 'all', projectRoot }) {
  const root = resolveProjectRoot(projectRoot);
  const targets =
    which === 'all'
      ? Object.keys(SOUL_FILES)
      : [which].filter((k) => SOUL_FILES[k]);

  if (targets.length === 0) {
    throw new Error(
      `Unknown soul target: "${which}". Valid: ${Object.keys(SOUL_FILES).join(', ')} or "all".`
    );
  }

  const result = {};
  for (const key of targets) {
    const r = resolveSoulFile(key, root);
    if (r.exists) {
      result[key] = { path: r.rel, content: fs.readFileSync(r.abs, 'utf8') };
    } else {
      result[key] = { path: r.rel, content: null, missing: true };
    }
  }
  return result;
}

export function appendSoulMemory({ entry, projectRoot, validated = false, now = new Date() }) {
  if (!entry || typeof entry !== 'string' || entry.trim().length === 0) {
    throw new Error('entry must be a non-empty string');
  }
  if (!validated) {
    throw new Error(
      'validated=true is required. Per BYAN rule, soul-memory entries must be confirmed by the user before append.'
    );
  }

  const root = resolveProjectRoot(projectRoot);
  const r = resolveSoulFile('soul-memory', root);
  const stamp = now.toISOString().slice(0, 10);
  const block = `\n\n---\n\n## Entree ${stamp}\n\n${entry.trim()}\n`;

  const dir = path.dirname(r.abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const existing = fs.existsSync(r.abs) ? fs.readFileSync(r.abs, 'utf8') : '# Soul-Memory — Journal vivant BYAN\n';
  fs.writeFileSync(r.abs, existing + block);

  return { path: r.rel, appended_chars: block.length };
}
