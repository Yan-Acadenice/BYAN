# byan-platform-config

Shared platform config primitives for BYAN. Single source of truth for
`.mcp.json`, `.env`, `.claude/settings.local.json`, token prompting,
byan_web reachability validation, and URL normalization.

Consumed by both `create-byan-agent` (installer) and `update-byan-agent`
(update CLI) so the two CLIs stay in sync.

## Install

```bash
npm install byan-platform-config
```

## Public API

```js
const {
  mcpConfig,
  envConfig,
  tokenPrompt,
  validate,
  urlUtils,
  credentials,
} = require('byan-platform-config');
```

### mcpConfig — `.mcp.json` management

| Function | Signature | Description |
|----------|-----------|-------------|
| `ensureMcpConfig` | `(projectRoot, { apiUrl, token }) → Promise<{ path }>` | READ-MERGE-WRITE. Strips `/api` suffix, preserves other mcpServers, preserves existing byan command/args. |
| `readMcpConfig` | `(projectRoot) → Promise<object\|null>` | Returns parsed `.mcp.json` or `null` if missing/malformed. |
| `mergeByanEntry` | `(existingConfig, { apiUrl, token }) → object` | Pure merge — no I/O. Returns a new config object. |

```js
await mcpConfig.ensureMcpConfig('/path/to/proj', {
  apiUrl: 'http://localhost:3737',
  token: 'byan_abc123',
});
```

### envConfig — `.env` and `settings.local.json`

| Function | Signature | Description |
|----------|-----------|-------------|
| `updateSettingsLocal` | `(projectRoot, envVars) → Promise<{ path }>` | Merges vars into `.claude/settings.local.json`, preserves unrelated keys. |
| `updateDotenv` | `(projectRoot, envVars) → Promise<{ path }>` | Appends/updates `.env`, preserves comments and blank lines. |
| `readEnvToken` | `(projectRoot) → Promise<string\|null>` | Reads `BYAN_API_TOKEN` with fallback chain : `.env` then `settings.local.json`. |

```js
await envConfig.updateDotenv('/path/to/proj', { BYAN_API_TOKEN: 'tok' });
const tok = await envConfig.readEnvToken('/path/to/proj');
```

### tokenPrompt — interactive prompt

| Symbol | Signature / Value | Description |
|--------|-------------------|-------------|
| `promptForToken` | `() → Promise<{ configured, apiUrl?, token? }>` | Inquirer prompt (confirm + URL + password). |
| `ENV_KEYS` | `['BYAN_API_TOKEN', 'BYAN_API_URL']` | Canonical env var names. |

```js
const res = await tokenPrompt.promptForToken();
if (res.configured) { /* use res.apiUrl, res.token */ }
```

### validate — reachability probe

| Function | Signature | Description |
|----------|-----------|-------------|
| `validateByanWebReachability` | `({ apiUrl, token?, timeoutMs? }) → Promise<{ reachable, status?, latencyMs?, error? }>` | GET `/api/health`. Errors surface in the result object instead of throwing. Default timeout 5000 ms. |

```js
const r = await validate.validateByanWebReachability({
  apiUrl: 'http://localhost:3737',
  token: 'byan_abc',
});
// → { reachable: true, status: 200, latencyMs: 12 }
```

### urlUtils — URL normalization

| Function | Signature | Description |
|----------|-----------|-------------|
| `stripApiSuffix` | `(url) → string` | Strips trailing `/api`, `/api/`, `/api/v1`, etc. |
| `buildAuthHeader` | `(token) → { Authorization } \| {}` | `ApiKey` scheme for `byan_*` tokens, `Bearer` otherwise. |

```js
urlUtils.stripApiSuffix('http://x:1/api');  // → 'http://x:1'
urlUtils.buildAuthHeader('byan_abc');       // → { Authorization: 'ApiKey byan_abc' }
urlUtils.buildAuthHeader('eyJ...');         // → { Authorization: 'Bearer eyJ...' }
```

### credentials — global `~/.byan/credentials.json`

The byan MCP server resolves its own config (`BYAN_API_URL`, `BYAN_API_TOKEN`,
`LEANTIME_API_URL`, `LEANTIME_API_TOKEN`) at boot. `credentials.writeCredentials`
persists those to a global, per-user, gitignored, chmod-600 file so the config
is portable across shells (zsh/fish/bash) and OSes (`os.homedir()` resolves `~`
on Unix and `%USERPROFILE%` on Windows) and reaches Claude Code AND Codex —
without depending on `.mcp.json` `${...}` expansion.

| Function | Signature | Description |
| --- | --- | --- |
| `writeCredentials` | `(values, { homedir? }) -> { path, written }` | merge-write the known keys; created at mode 0600; idempotent; ignores `${...}`/empty |
| `readCredentials` | `(homedir?) -> object` | `{}` on a missing/invalid file (does not throw) |
| `credentialsPath` | `(homedir?) -> string` | `<homedir>/.byan/credentials.json` |

**Resolution precedence (server side):** `process.env` (a real value; an
unexpanded `${...}` is treated as absent) `->` `~/.byan/credentials.json` `->`
`http://localhost:3737`. A real `BYAN_API_URL` env var therefore still wins
(prod sidecar / Docker / CI), the global file is the local-dev fallback, and the
token is kept out of `.mcp.json`.

## Test

```bash
npm test
```

## Design invariants

- READ-MERGE-WRITE on every file operation — unknown keys are preserved.
- `ensureMcpConfig` keeps `mcpServers.byan.command` and `.args` if already set; it writes NO byan config env (the server resolves its own).
- `writeCredentials` creates the file at mode 0600 (no group/other read window) and is a no-op-safe merge.
- `validateByanWebReachability` resolves instead of rejecting — errors surface in the result object.
- `stripApiSuffix` is idempotent and leaves URLs without a `/api` suffix untouched.
- `buildAuthHeader` returns `{}` (not `{ Authorization: undefined }`) when token is missing.
