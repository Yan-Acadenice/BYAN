# LoadBalancer — Multi-Pool Subscription Arbitrage

> Reduce the 5-hour-window pain without denaturing BYAN. The load-balancer routes
> DELEGABLE work to a second subscription pool (OpenAI Codex) as the primary pool
> (Claude) heats up, and holds BYAN's judgment/identity work on the primary
> whatever the pressure.

## The two hard truths (stated up front)

1. **It is an ESTIMATE.** Neither Claude nor Codex exposes a machine-readable
   5h-window quota (OpenAI issue #10233). The subscription-window tracker
   estimates burn from observed token usage. Without a configured budget it
   reports raw burn + velocity and a `null` proximity — not a fabricated
   percentage. Reconcile against `/usage`.
2. **It DOUBLES the ceiling, it does not remove it.** Codex has its own rolling
   5h + weekly window. Load-balancing gives you a second pool to spend from; when
   both are spent, work queues. There is no infinite capacity.

## The pieces (src/loadbalancer/)

| Piece | File | Role |
|-------|------|------|
| Codex pool | `providers/codex-provider.js` | wraps the `codex exec --json` system CLI (not an npm SDK); degrades to disabled if the binary is absent; two auth pools (CODEX_API_KEY per-token, else ChatGPT-subscription `~/.codex/auth.json`); normalizes the model to the entitled family per pool (see below) |
| Provider registry | `providers/factory.js` | `buildProviders(config)` — one line per pool |
| Window tracker | `subscription-window.js` | per-pool rolling-5h + weekly burn, `window-proximity` + ETA (the signal `pressure-score` lacked) |
| Red line | `switch-tolerance.js` | which task natures may cross to a secondary pool |
| Ladder | `degradation-ladder.js` | the 4-rung switch policy driven by the window tracker |
| Live shell | `mcp-server.js` (`LoadBalancerLive`) | wires it all; `lb_*` MCP tools |

## Entitled model per auth pool (the `-codex` trap)

The Codex CLI/companion default is a `-codex`-suffixed model
(`gpt-5-codex`, `gpt-5.x-codex`). Live-verified on codex-cli 0.101: the OpenAI
backend **rejects every `-codex` model on a ChatGPT-subscription account**
("The '<model>' model is not supported when using Codex with a ChatGPT account")
— those ids are API-key only. The plain `gpt-5.x` family (e.g. `gpt-5.4`) is the
entitled one on a subscription.

So `codex-provider.js` defaults to `gpt-5.4` and exports the pure
`resolveCodexModel({ requested, authPool })`: under `subscription` auth it
remaps any `-codex` request to the entitled default `gpt-5.4` (only what is known
to be rejected is remapped, and only to the one id verified to work — no guessed
stripped variants); under `api-key` auth, or for an already-plain id, the request
passes through untouched. This is why a bare `codex exec -m gpt-5-codex` used to
fail on the subscription while the pool now works.

## The red line — what may cross to Codex

`switch-tolerance.js` is the single source of this line:

- **Delegable → may run on Codex** : `exploration` (read/scan), `mechanical`
  (machine-verifiable output), `implementation` (tests are the objective,
  provider-independent arbiter).
- **Primary-only → stays on Claude under any pressure** : `verification`
  (adversarial / semantic review), `analysis` (design / risk / judgment), and
  `soul` / `identity` / `review` / `gate`. Under pressure this work rides the
  primary while it can, then **queues** — it does not denature by crossing pools.
- Unknown nature is conservative: primary-only (not delegated on a guess).

## The 4-rung ladder (`degradation-ladder.js`)

Driven by the window proximity, NOT by 429s — it switches before the wall:

| Rung | Trigger | Delegable work | Primary-only work |
|------|---------|----------------|-------------------|
| HEALTHY | primary cool | primary | primary |
| PRIMARY_HOT | primary proximity ≥ 0.5 or caution | → secondary (Codex) | primary |
| PRIMARY_EXHAUSTED | primary proximity ≥ 0.8 / switch_now / blocked | → secondary | primary if it still accepts, else queue |
| ALL_EXHAUSTED | primary spent + no usable secondary | queue + backoff | queue |

`LoadBalancerLive.planRoute(nature)` returns the decision (advisory, side-effect
free); the real `send()` still verifies provider availability before calling.

## The dashboard

`lb_budget` (MCP tool) / `LoadBalancerLive.getBudget()` — per-pool rolling-5h +
weekly burn, proximity (null without a configured budget), ETA, and the current
rung. Configure a pool budget in `loadbalancer.default.yaml` (or the user
override) with `window_token_budget` / `weekly_token_budget` to turn the estimate
into a proximity percentage.

## Where model tier vs provider live (two axes, two homes)

- **Model tier** (haiku / sonnet / session) — `native-tiers.js`, surfaced by
  `byan_dispatch`. "Which model."
- **Provider** (Claude / Codex) — `switch-tolerance.js` + the ladder, in the
  load-balancer. "Which pool." Kept OUT of `byan_dispatch` so the byan MCP server
  stays decoupled from the load-balancer module.

## Shipping status (honest)

`src/` ships in the npm package (`files` includes `src/`), so the load-balancer
code travels. BUT the repo `.mcp.json` registers the lb MCP server with an
absolute dev path (`/home/yan/BYAN/src/loadbalancer/mcp-server.js`); a fresh
install's lb registration (relative/resolved path, enabling the pool by default)
is a known follow-up, not wired by this feature. The provider degrades cleanly
when the `codex` binary or auth is absent, so a fresh install without Codex loses
nothing — it simply runs single-pool as before.
