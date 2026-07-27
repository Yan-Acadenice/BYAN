// Guard: every stdio server declared in .mcp.json must point at a file that
// exists.
//
// WHY THIS TEST EXISTS. The project was moved on disk and .mcp.json kept its old
// absolute path (/home/yan/BYAN/...). Claude Code tried to spawn a file that was
// not there, the server never connected, and the session simply had NO byan_*
// tools — no error surfaced anywhere. A whole work session ran with the
// dispatch/FD tooling silently absent before anyone asked why.
//
// A wrong path is a config typo, and a config typo should be a red test, not a
// capability that quietly disappears. This converts that class of breakage into
// an immediate failure.
//
// It also pins the expansion form: .mcp.json supports ${VAR} and ${VAR:-default}
// in command/args/env (documented). CLAUDE_PROJECT_DIR is set in the SPAWNED
// SERVER's environment, not in Claude Code's own, so referencing it in `args`
// only works with a default — which is why the entries carry an absolute
// fallback. This test resolves the same way the launcher would.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MCP_CONFIG = path.join(REPO_ROOT, '.mcp.json');

// Expand ${VAR} and ${VAR:-default} against a given environment, the way
// .mcp.json expansion is documented to behave.
function expand(value, env) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_m, name, fallback) => {
    const set = env[name];
    if (set !== undefined && set !== '') return set;
    return fallback !== undefined ? fallback : '';
  });
}

function readConfig() {
  return JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8'));
}

describe('.mcp.json', () => {
  test('is present and parses', () => {
    expect(fs.existsSync(MCP_CONFIG)).toBe(true);
    expect(() => readConfig()).not.toThrow();
    expect(typeof readConfig().mcpServers).toBe('object');
  });

  test('every stdio server points at a script that EXISTS', () => {
    const { mcpServers } = readConfig();
    const missing = [];

    for (const [id, srv] of Object.entries(mcpServers)) {
      // http servers live remotely — there is no local file to check.
      if (srv.url || srv.transport === 'http' || srv.type === 'http') continue;
      const args = Array.isArray(srv.args) ? srv.args : [];
      // The script is the first argument that looks like a path to a JS file;
      // flags and non-path arguments are skipped rather than guessed at.
      const scriptArg = args.find((a) => typeof a === 'string' && /\.(js|mjs|cjs)$/.test(a));
      if (!scriptArg) continue;

      const resolved = expand(scriptArg, process.env);
      if (!fs.existsSync(resolved)) {
        missing.push(`${id}: ${scriptArg} -> ${resolved}`);
      }
    }

    // A named list, not a bare boolean: the failure message has to say WHICH
    // server is broken and what the path expanded to, or the next person pays
    // the same diagnosis cost again.
    expect(missing).toEqual([]);
  });

  test('a project-root reference in args carries a default, or it expands to nothing', () => {
    // CLAUDE_PROJECT_DIR is absent from Claude Code's own environment, so a bare
    // ${CLAUDE_PROJECT_DIR} in args expands to the empty string and produces an
    // absolute-looking path rooted at /. The default is what makes it usable.
    const { mcpServers } = readConfig();
    const offenders = [];

    for (const [id, srv] of Object.entries(mcpServers)) {
      for (const a of Array.isArray(srv.args) ? srv.args : []) {
        if (typeof a !== 'string') continue;
        if (/\$\{CLAUDE_PROJECT_DIR\}/.test(a)) offenders.push(`${id}: ${a}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('the byan server exposes byan_dispatch — the tool the entry gate routes through', () => {
    // Reading the file rather than starting the server: this suite must stay
    // fast and offline. Spawning it is covered by the live probe documented in
    // docs/, not by a unit test.
    const { mcpServers } = readConfig();
    const byan = mcpServers.byan;
    expect(byan).toBeDefined();
    const script = expand(byan.args.find((a) => /\.js$/.test(a)), process.env);
    const source = fs.readFileSync(script, 'utf8');
    expect(source).toContain('byan_dispatch');
  });
});
