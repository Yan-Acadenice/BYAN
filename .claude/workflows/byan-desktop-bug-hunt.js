export const meta = {
  name: 'byan-desktop-bug-hunt',
  description: 'Adversarial bug hunt + refactor audit across the BYAN Electron app (7 dimensions, 2-lens verification)',
  phases: [
    { title: 'Review', detail: '7 parallel dimension reviewers' },
    { title: 'Verify', detail: '2 adversarial lenses per finding' },
  ],
}
// BYAN-TIER: reviewed — la charge est repartie par complexite : les revues
// (leaves assess-*, classe ANALYSIS) tournent sur sonnet ; la verification
// adversariale 2-lentilles reste deep (plancher STRICT-2 : elle herite du
// modele de session). L'arbitrage final des constats reste au fil principal.

const APP = '/home/yan/acadenice/interne/BYAN/app'
const CAP = 6

const KNOWN = `Known and deliberate (do NOT report these as defects):
- secure-store.ts: keytar loads but set/get may throw at runtime; the .env file fallback is decided at RUNTIME by design.
- Tests asserting POSIX paths are wrapped in describe.skipIf(process.platform === 'win32') by design (CI runs on windows-latest too).
- main/local-server.ts (forked webui server) is vestigial in native mode; its "Project root" log may show the launch cwd. Reporting it as a dead-code candidate under category 'refactor' IS welcome; reporting its log as a bug is not.
- LocalClaudeBridge.history() returns [] and list() maps disk records without message counts: known placeholder.
- claude --resume is deliberately NOT passed (a byan session record id is not claude's own uuid).
- The stdin shape {type:'user',message:{role:'user',content}} and --verbose alongside --print + stream-json are REQUIRED by the claude CLI.`

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'title', 'severity', 'category', 'claim', 'evidence', 'failure_scenario'],
        properties: {
          file: { type: 'string', description: 'path relative to the app root' },
          line: { type: 'integer' },
          title: { type: 'string', description: 'one-line label' },
          severity: { enum: ['P1', 'P2', 'P3'] },
          category: { enum: ['bug', 'refactor'] },
          claim: { type: 'string', description: 'precise statement of the defect' },
          evidence: { type: 'string', description: 'the code excerpt or wiring that proves it' },
          failure_scenario: { type: 'string', description: 'concrete inputs/state -> wrong outcome' },
          suggested_fix: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['real', 'confidence', 'reason'],
  properties: {
    real: { type: 'boolean' },
    confidence: { enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
}

const DIMENSIONS = [
  { key: 'process-lifecycle', files: 'main/index.ts, main/ipc-handlers/local-chat.ts, main/mcp-registry.ts, main/ipc-handlers/mcp.ts, main/local-server.ts, main/ipc-handlers/terminal.ts, main/auto-updater.ts', angle: 'child-process lifecycle: spawn/kill/reaping, orphaned processes, signal handling, quit paths, timers left running, races between exit handlers and session maps' },
  { key: 'ipc-security', files: 'preload/index.ts, shared/ipc-contract.ts, main/csp.ts, main/deep-links.ts, main/boot-guards.ts, main/ipc-handlers/_error.ts, plus every register() call in main/ipc-handlers/*.ts', angle: 'IPC surface: renderer-supplied values reaching spawn/fs/paths, missing argument validation, contextIsolation guarantees, event-channel handling, error wrapping that leaks internals' },
  { key: 'mode-coherence', files: 'main/ipc-handlers/byan-web.ts, main/ipc-handlers/auth.ts, main/local-data.ts, renderer/context/AuthSessionContext.tsx, renderer/components/ModeSwitcher.tsx', angle: 'local/cloud mode coherence: any divergence between isLocalMode() and getSession(), handlers not gated on isLocalMode, stale cached session, token lifecycle' },
  { key: 'renderer-state', files: 'renderer/pages/Chat.tsx, renderer/context/LocalChatContext.tsx, renderer/components/chat/ (all files), renderer/App.tsx, renderer/context/ (all files)', angle: 'React state: stale closures, missing effect deps that matter, races between async updates and unmount/navigation, event-subscription leaks, session frame-filter races' },
  { key: 'secrets-installers', files: 'main/secure-store.ts, main/ipc-handlers/onboarding.ts, main/installers/ (all files), main/mcp-config.ts, main/ipc-handlers/install-project.ts', angle: 'secret storage, file writes (paths, permissions, atomicity), installer plan correctness, config parsing edge cases' },
  { key: 'tests-ci', files: 'vitest.config.ts, vitest.renderer.config.ts, vitest.workspace.ts, main/__tests__/ and renderer __tests__ dirs, package.json scripts, electron-builder.yml, and ../.github/workflows/electron-build.yml (repo root)', angle: 'test gaps on critical paths, tests asserting the wrong thing, CI portability (win32), build config defects' },
  { key: 'refactor-simplify', files: 'the whole app tree: main/, preload/, renderer/, shared/', angle: 'duplication, dead code (e.g. the vestigial forked-server path), oversized components (Chat.tsx is ~980 lines), inconsistent error handling, simplifications with strictly NO behavior change. Use category=refactor for every finding in this dimension' },
]

function reviewPrompt(d) {
  return `You are a senior reviewer hunting REAL defects in an Electron desktop app (TypeScript strict, React 18, vitest). App root: ${APP}. Read files with your tools; paths in the list are relative to that root unless absolute.

Dimension: ${d.key} — ${d.angle}.
Files: ${d.files}.

${KNOWN}

Report at most ${CAP} findings, ONLY ones you can anchor to a precise file:line in the CURRENT code with a concrete failure scenario (inputs/state -> wrong outcome). Category 'bug' = behavior defect; 'refactor' = safe simplification opportunity. Zero findings is a valid result — do not pad. No style nits, no hypotheticals that cannot fire, no re-statements of the known list.`
}

function verifyPrompt(f, lens) {
  const angle = lens === 'code-exists'
    ? 'Re-read the cited file at the cited lines (and its callers if needed). Does the defect exist in the CURRENT code exactly as claimed? If the claim misreads the code — a guard already exists, the type forbids the input, the path is unreachable — then real=false.'
    : 'Assume the quoted code is accurate. Trace the concrete runtime path: can the failure actually fire in this app as wired (who calls it, with what inputs, on which platform, in which order)? If no realistic execution reaches the failure, real=false.'
  return `Adversarial verification of one code-review finding. App root: ${APP}. You have file tools — use them.

Finding under challenge (dimension ${f.dimension}, category ${f.category}):
- file: ${f.file}:${f.line}
- title: ${f.title}
- claim: ${f.claim}
- failure scenario: ${f.failure_scenario}
- evidence: ${f.evidence}

Lens: ${angle}

For category 'refactor', real=true means the simplification is SAFE (strictly no behavior change) and genuinely worth doing. Default to real=false when uncertain.`
}

phase('Review')
// Revues = analyse a jugement, pas frontiere -> sonnet (auto-routage ANALYSIS
// de la regle native-workflows, label assess-*). La verification reste deep.
const results = await pipeline(
  DIMENSIONS,
  (d) => agent(reviewPrompt(d), { label: `assess-${d.key}`, phase: 'Review', schema: FINDINGS, model: 'sonnet' }),
  (r, d) => {
    const all = (r && Array.isArray(r.findings)) ? r.findings : []
    if (all.length > CAP) log(`${d.key}: ${all.length - CAP} findings over cap, dropped`)
    const kept = all.slice(0, CAP).map((f) => ({ ...f, dimension: d.key }))
    log(`${d.key}: ${kept.length} finding(s) to verify`)
    return parallel(kept.map((f) => () =>
      parallel([
        () => agent(verifyPrompt(f, 'code-exists'), { label: `verify:${d.key}:${f.file}:${f.line}`, phase: 'Verify', schema: VERDICT }),
        () => agent(verifyPrompt(f, 'can-fire'), { label: `verify2:${d.key}:${f.file}:${f.line}`, phase: 'Verify', schema: VERDICT }),
      ]).then((vs) => ({ ...f, votes: vs.filter(Boolean) }))
    ))
  }
)

const flat = results.filter(Boolean).flat().filter(Boolean)
const confirmed = []
const plausible = []
for (const f of flat) {
  const votes = f.votes || []
  const real = votes.filter((v) => v && v.real === true).length
  if (votes.length >= 2 && real === votes.length) confirmed.push(f)
  else if (real >= 1) plausible.push(f)
}
log(`bilan: ${confirmed.length} confirme(s), ${plausible.length} plausible(s), ${flat.length - confirmed.length - plausible.length} refute(s)`)
return { confirmed, plausible, reviewed: flat.length }