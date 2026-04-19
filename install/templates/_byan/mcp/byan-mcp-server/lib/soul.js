import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FILES = {
  soul: '_byan/soul.md',
  tao: '_byan/tao.md',
  'soul-memory': '_byan/soul-memory.md',
};

export function resolveProjectRoot(envRoot) {
  return envRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function readSoul({ which = 'all', projectRoot }) {
  const root = resolveProjectRoot(projectRoot);
  const targets =
    which === 'all'
      ? Object.keys(DEFAULT_FILES)
      : [which].filter((k) => DEFAULT_FILES[k]);

  if (targets.length === 0) {
    throw new Error(
      `Unknown soul target: "${which}". Valid: ${Object.keys(DEFAULT_FILES).join(', ')} or "all".`
    );
  }

  const result = {};
  for (const key of targets) {
    const p = path.join(root, DEFAULT_FILES[key]);
    if (fs.existsSync(p)) {
      result[key] = {
        path: DEFAULT_FILES[key],
        content: fs.readFileSync(p, 'utf8'),
      };
    } else {
      result[key] = { path: DEFAULT_FILES[key], content: null, missing: true };
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
  const p = path.join(root, DEFAULT_FILES['soul-memory']);
  const stamp = now.toISOString().slice(0, 10);
  const block = `\n\n---\n\n## Entree ${stamp}\n\n${entry.trim()}\n`;

  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '# Soul-Memory — Journal vivant BYAN\n';
  fs.writeFileSync(p, existing + block);

  return { path: DEFAULT_FILES['soul-memory'], appended_chars: block.length };
}
