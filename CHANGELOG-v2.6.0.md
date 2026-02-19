# Changelog v2.6.0 - ELO Trust System + Fact-Check Integration

**Release Date:** February 19, 2026
**Status:** Ready for NPM

---

## Major Features

### ELO Trust System — Epistemic Calibration per Domain

BYAN now measures the reliability of user claims per technical domain
using a Glicko-2 algorithm (0-1000 scale). Challenge intensity, pedagogy
depth, and LLM model selection adapt automatically to each user's level.

**14 MVP mechanics:**

- Glicko-2 per domain (javascript, security, algorithms, compliance, performance, ...)
- K-factor by domain severity: security/compliance x1.5, performance x1.2, algorithms x0.8
- Dead zone 450-550 (Dunning-Kruger peak — maximum challenge intensity)
- First blood invariant: first claim in a virgin domain always challenged regardless of global ELO
- Tilt detector: 3 consecutive BLOCKED → pedagogical pause proposed
- ELO farming protection: low-variance claims reduce K-factor automatically
- Declared expertise (provisional ELO with deferred validation)
- Domain graph with partial transfer: cryptography → security → compliance
- Intervention mode at ELO 0: calibration pathway proposed
- Match history and trend per domain
- Adaptive pedagogy: 6 blocked-reason types, scaffold levels, growth narrative
- LLM routing (experimental): 0-200 Opus / 201-600 Sonnet / 601+ Haiku
- Curiosity K-bonus: intellectually curious claims get a small boost
- Epistemic debt: 3 unverified claims → "clarify before continuing"

**New files:**
```
src/byan-v2/elo/
  domain-config.js    K-factors, LLM routing, scaffold levels, dead zone
  glicko2.js          Glicko-2 algorithm (0-1000 scale)
  elo-store.js        Persistence to _byan/_memory/elo-profile.json
  challenge-evaluator.js  Challenge context for LLM
  pedagogy-layer.js   Tone invariant, diagnosis, growth narrative, dashboard
  llm-router.js       Opus/Sonnet/Haiku routing by ELO tier
  index.js            EloEngine public API
```

**CLI commands:**
```bash
node bin/byan-v2-cli.js elo context <domain>
node bin/byan-v2-cli.js elo record <domain> <VALIDATED|BLOCKED|PARTIAL>
node bin/byan-v2-cli.js elo dashboard [domain]
node bin/byan-v2-cli.js elo summary
node bin/byan-v2-cli.js elo declare <domain> <level>
```

**Agent integration:**
- `_byan/bmb/agents/byan.md`: step 2b ELO profile load, ELO challenge protocol rule, [ELO] menu item
- `_byan/agents/byan.md`: same updates for Copilot CLI standalone path
- `_byan/bmb/workflows/byan/elo-workflow.md`: ELO submenu workflow

**Tests:** 63 passing (14 domain-config + 16 glicko2 + 19 engine + 14 integration)

---

### Fact-Check System — Demonstrable, Quantifiable, Reproducible

BYAN now applies a scientific fact-checking protocol to every assertion.
4 assertion types, 5 proof levels, strict domains, auto-detection of
implicit claims, persistent knowledge graph across sessions.

**Principle:**
Every claim must satisfy: Demonstrable (primary source exists) +
Quantifiable (precise, not vague) + Reproducible (user can verify themselves).

**4 assertion types:**
```
[REASONING]              Logical deduction — no truth guarantee
[HYPOTHESIS]             Plausible in context — verify before acting
[CLAIM L{n}]             Sourced assertion — level 1-5
[FACT USER-VERIFIED date] Validated by user with proof artifact
```

**5 proof levels:**
```
LEVEL-1 (95%)  Official spec / RFC / Standard (ECMAScript, IETF, W3C)
LEVEL-2 (80%)  Executable benchmark / CVE reference / Official product docs
LEVEL-3 (65%)  Peer-reviewed article / Recognized technical book
LEVEL-4 (50%)  Community consensus (StackOverflow > 1000 votes)
LEVEL-5 (20%)  Opinion / Personal experience
```

**Strict domains:** security / performance / compliance → LEVEL-2 minimum or BLOCKED.

**New files:**
```
src/byan-v2/fact-check/
  index.js              FactChecker main class
  claim-parser.js       Auto-detect implicit claims with trigger patterns
  level-scorer.js       Confidence score by proof level
  fact-sheet.js         Markdown fact sheet generation
  knowledge-graph.js    Persistent fact store (_byan/_memory/fact-graph.json)
_byan/bmb/agents/fact-checker.md          Standalone dedicated agent
.github/agents/bmad-agent-fact-checker.md  Copilot CLI wrapper
install/templates/workers/fact-check-worker.js  npm-installable worker
install/templates/.claude/rules/fact-check.md   Claude Code rules
```

**CLI commands:**
```bash
node bin/byan-v2-cli.js fc check "Redis is always faster than PostgreSQL"
node bin/byan-v2-cli.js fc parse "This is obviously the best approach"
node bin/byan-v2-cli.js fc verify "<claim>" "<proof artifact>"
node bin/byan-v2-cli.js fc graph
node bin/byan-v2-cli.js fc sheet [session-id]
```

**Worker usage (npm install):**
```javascript
const FactCheckWorker = require('./_byan/workers/fact-check-worker');
const fc = new FactCheckWorker({ verbose: true });
fc.check("Redis is always faster than PostgreSQL");
// → { assertionType: 'HYPOTHESIS', level: 5, score: 20, status: 'OPINION' }
```

**Tests:** 68 passing (5 test suites)

---

## npm Install Templates Updated

Both Claude Code and Copilot CLI templates updated:

| File | Update |
|------|--------|
| `install/templates/.claude/CLAUDE.md` | ELO section + fact-check section + CLI commands |
| `install/templates/.claude/rules/elo-trust.md` | New — ELO protocol, paliers, K-factors, mechanics |
| `install/templates/.claude/rules/fact-check.md` | New — FC protocol, levels, strict domains, worker usage |
| `install/templates/.claude/rules/byan-agents.md` | fact-checker agent + elo-workflow entries |
| `install/templates/workers/fact-check-worker.js` | New — installable FactCheckWorker |

---

## Bug Fixes

- `expiresAt()` UTC arithmetic off-by-one: all date calculations now use `Date.UTC()` to avoid local timezone drift
- `fact-checker-p2.test.js`: corrected expected value (June 30 not July 1 — Jan 1 + 180 days is mathematically June 30)

---

## Test Coverage

| Suite | Tests | Status |
|-------|-------|--------|
| ELO domain-config | 14 | PASS |
| ELO glicko2 | 16 | PASS |
| ELO engine | 19 | PASS |
| ELO integration | 14 | PASS |
| Fact-check core | 68 | PASS |
| **Total new tests** | **131** | **PASS** |
| Pre-existing failures | 22 | unchanged (VoiceIntegration — not in scope) |

---

## Migration from 2.5.0

No breaking changes. ELO and FactChecker are initialized automatically in ByanV2
if not disabled in config. Profile stored in `_byan/_memory/elo-profile.json`.

To disable:
```yaml
# _byan/config.yaml
bmad_features:
  elo:
    enabled: false
  fact_check:
    enabled: false
```
