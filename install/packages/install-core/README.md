# byan-install-core

The headless install **engine** for BYAN. It is LLM-free and prompt-free: no
interview, no styling, no network in the hot path. Two front-ends bind to this
single stable surface — the npm CLI wizard (F2) and the Electron app (F5) — and
both drive it with the same machine-built answers object.

## The four-verb lifecycle

The install is a pipeline of four functions. `detect` and `plan` are pure with
respect to the target project (no write, no state-changing spawn); `apply` is
the only side-effecting step; `verify` is read-only. These purity boundaries are
asserted by the test suite.

| Verb | Signature | Purity |
|------|-----------|--------|
| `detect` | `detect(opts) -> Promise<MachineProfile>` | Pure w.r.t. the target (read-only probes; one optional read-only `--version` spawn) |
| `plan` | `plan(profile, answers) -> InstallPlan` | Pure, deterministic — same `(profile, answers)` yields a byte-identical plan |
| `apply` | `apply(plan, opts) -> Promise<ApplyResult>` | The only mutator. Idempotent (re-running converges) |
| `verify` | `verify(planOrTarget, opts) -> Promise<VerifyReport>` | Read-only (asserted: no write, no spawn) |

```js
const { detect, plan, apply, verify } = require('byan-install-core');

const profile = await detect();                 // inspect the machine
const installPlan = plan(profile, answers);      // deterministic step list
const result = await apply(installPlan, {        // the only mutation
  cwd: targetDir,
  secrets: { BYAN_API_TOKEN: process.env.BYAN_API_TOKEN },
});
const report = await verify(installPlan, { cwd: targetDir }); // proof
// report.ok === true when every declared artifact exists and matches
```

### Boundaries the engine holds

- **Auth is not performed by the engine.** `detect` reports an `authHint`
  heuristic only; `apply` emits interactive login (`claude login`,
  `codex auth login`) as a `deferred` **auth-handoff** carrying the command the
  human runs. It is not spawned and not faked (I50) — the test suite asserts no
  login is spawned.
- **CLI installs are deferred by default.** A `cli-install` step is emitted as
  `deferred` with the exact per-user `npm install -g ...` command (no `sudo`,
  I47). It is spawned only when the caller passes `runInstalls: true`.
- **Secrets are carried by reference.** The plan does not serialize a raw token;
  it carries the `@secret:KEY` reference and `apply` resolves it from
  `opts.secrets[KEY]` at write-time. The token is written to `.env` /
  `.claude/settings.local.json`, is kept out of the committed `.mcp.json`, and
  is absent from the returned result (asserted).

## The answers contract (I9)

`plan()` consumes a fully non-interactive answers object — the wizard (F2) and
Electron (F5) are thin builders of this one shape. No prompts live inside
install-core.

```js
{
  flow: 'auto' | 'custom' | 'manual',          // the only carry-over of the legacy modes
  platforms: ['claude'|'codex'|'copilot'] | 'auto', // 'auto' => recommender pick
  agents: string[],                            // required non-empty IFF flow === 'manual'
  user: { name, communicationLanguage, documentLanguage? },
  soul: { mode: 'creator'|'blank'|'import'|'skip', importPath? }, // importPath iff 'import'
  byanWeb: { enabled, apiUrl?: string|'auto', token?, syncConsent? }, // token is a SECRET
  turboWhisper: 'skip'|'local'|'docker',
  costOptimizer: boolean,
  installV2: boolean,
  installClis: boolean,                        // emit cli-install steps for not-found platforms
  byanVersion: string                          // recorded into config.yaml
}
```

The canonical **AUTO** preset reproduces the v2.19 AUTO install and only needs
`user.name` + language; everything else defaults:

```js
{
  flow: 'auto',
  platforms: 'auto',
  agents: [],
  user: { name, communicationLanguage: 'fr' },
  soul: { mode: 'creator' },
  byanWeb: { enabled: true, apiUrl: 'auto', token: <secret>, syncConsent: false },
  turboWhisper: 'skip', costOptimizer: false, installV2: false, installClis: false,
  byanVersion: '<pkg>'
}
```

`ANSWERS_SCHEMA` is exported as a documented default shape. The flow is
collapsed (I37): AUTO/CUSTOM/MANUAL are values of `answers.flow`, not separate
code paths — one ordered builder runs for all three, only step `when`
predicates and the stub-copy breadth differ.

## Recommender (data, not code)

Platform recipes and the preference order live in a versioned, user-overridable
JSON table (`data/recommender.json`). UIs that want to show recipe choices use:

```js
const { loadRecipes, recommendPlatform, recipeFor, DEFAULTS } = require('byan-install-core');
```

`loadRecipes(overridePath?)` deep-merges an optional override so versions /
package names can be pinned at runtime without a code change.

## Exports

- Lifecycle: `detect`, `plan`, `apply`, `verify`
- Recommender: `loadRecipes`, `recommend`, `recommendPlatform`, `recipeFor`, `DEFAULTS`
- Primitives: `lookpath`, `lookpathSync`, `preflight`, `checkNode`, `MIN_MAJOR`, `renderMcp`, `previewMcp`, `validateApiUrl`
- Contract constants: `ANSWERS_SCHEMA`, `AUTO_ARTIFACT_SET`
- Errors: `McpUrlError`, `InstallPlanError`, `ApplyError`

## Retro-compatibility guarantee

`__tests__/retro-compat.test.js` runs the full `detect -> plan(AUTO) -> apply`
chain against a temp directory using the real `install/templates/` tree and
asserts the produced artifacts are a **superset** of the v2.19 AUTO identity set
(`AUTO_ARTIFACT_SET`): no legacy AUTO path regresses, while install-core may add
more (e.g. the manifest ledger). It closes the loop with
`verify({ cwd }).ok === true`.

## Dependencies

Runtime: `byan-platform-config` (mcp/env/url adapters) and `fs-extra` (apply
only). No `chalk`, no `inquirer` — install-core is headless. Detection uses Node
builtins only. CommonJS, `engines.node >= 18`.
