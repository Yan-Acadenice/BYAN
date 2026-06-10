export const meta = {
  name: 'byan-benchmark',
  description: 'DATA-only benchmark engine: given a fork (>=2 options) + weighted criteria + optional judge panel, returns a scored options-x-criteria matrix, a best-first recommendation, and the dissenting view. Reusable for ANY decision fork. The human gate + the rendered table live in the orchestrating skill.',
  phases: [
    { title: 'RECON', detail: 'parse options+criteria from args' },
    { title: 'SOURCE', detail: 'gather evidence per option (model-knowledge default; WebFetch only strict-domain/volatile)' },
    { title: 'JUDGE', detail: 'score each cell against weighted criteria via the judge panel' },
    { title: 'RECOMMEND', detail: 'rank best-first + capture dissent' },
  ],
};

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline - enforcement-bridge F3).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (strict-scope-guard, strict-stop-guard,
// fd-phase-guard, the autobench Stop hook) DO NOT fire here. This script
// therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js or the strict-mode lib
//     (enforced by byan-lint-workflows.js).
//   - returns DATA only. The orchestrating skill (.claude/skills/byan-benchmark)
//     is the human-gated conductor; IT renders the table, emits the BYAN-BENCH
//     marker, and records FD/strict state via the byan_fd_* / byan_strict_* MCP
//     tools AT the gate.
// No timestamp / id / RNG is generated in-script: ids and clock-bearing values
// arrive via the args global, keeping the script deterministic and resumable
// (the launch validator scans raw text for any wall-clock or RNG primitive).
// ---------------------------------------------------------------------------

// Strict-domain evidence floors (mirrors .claude/rules/fact-check.md). A claim in
// these domains must reach at least this proof level or it is flagged unverified.
// Encoded as data so the JUDGE leaf is told the exact floor for the domain.
const STRICT_FLOORS = { security: 'L2', performance: 'L2', compliance: 'L1' };

// The 5-level evidence rubric as WRITTEN text, passed verbatim to the JUDGE leaf
// so every cell's Niv (level) is graded against the same scale the doctrine uses.
const EVIDENCE_RUBRIC = [
  'L1 (95%): official spec - RFC, W3C, ECMAScript, POSIX, vendor canonical doc.',
  'L2 (80%): reproducible benchmark, CVE reference, official product docs.',
  'L3 (65%): peer-reviewed article, recognised technical book.',
  'L4 (50%): community consensus (e.g. StackOverflow > 1000 votes).',
  'L5 (20%): opinion or personal experience.',
].join(' ');

const RECON_SCHEMA = {
  type: 'object',
  required: ['options', 'criteria'],
  properties: {
    fork: { type: 'string', description: 'one-line restatement of the decision fork' },
    options: {
      type: 'array',
      description: 'the >=2 candidate options, normalised',
      items: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, note: { type: 'string' } },
      },
    },
    criteria: {
      type: 'array',
      description: 'the weighted criteria the options are scored against',
      items: {
        type: 'object',
        required: ['name', 'weight'],
        properties: { name: { type: 'string' }, weight: { type: 'number' } },
      },
    },
    valid: { type: 'boolean', description: 'true only if >=2 options and >=1 criterion' },
    reason: { type: 'string', description: 'when invalid, why (degenerate fork -> skip)' },
  },
};

const EVIDENCE_SCHEMA = {
  type: 'object',
  required: ['option', 'evidence'],
  properties: {
    option: { type: 'string' },
    evidence: {
      type: 'array',
      description: 'one evidence note per criterion for this option',
      items: {
        type: 'object',
        required: ['criterion', 'claim', 'unverified'],
        properties: {
          criterion: { type: 'string' },
          claim: { type: 'string', description: 'the factual basis for this option on this criterion' },
          source: { type: 'string', description: 'model-knowledge by default; a URL ONLY if WebFetch opened it THIS turn' },
          unverified: { type: 'boolean', description: 'true when no live source was opened (tag [UNVERIFIED])' },
        },
      },
    },
  },
};

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['judge', 'scores'],
  properties: {
    judge: { type: 'string' },
    scores: {
      type: 'array',
      description: 'for EACH option: a cell per criterion with score, evidence level and the weighted total',
      items: {
        type: 'object',
        required: ['option', 'cells', 'weightedTotal'],
        properties: {
          option: { type: 'string' },
          cells: {
            type: 'array',
            items: {
              type: 'object',
              required: ['criterion', 'verdict', 'level', 'score', 'unverified'],
              properties: {
                criterion: { type: 'string' },
                verdict: { type: 'string', description: 'short qualitative verdict for this cell' },
                level: { type: 'string', description: 'evidence level L1..L5 per the rubric' },
                score: { type: 'number', description: '1-10 raw score for this option on this criterion' },
                source: { type: 'string' },
                unverified: { type: 'boolean' },
              },
            },
          },
          weightedTotal: { type: 'number', description: 'sum of score*weight across criteria' },
        },
      },
    },
  },
};

const RECOMMEND_SCHEMA = {
  type: 'object',
  required: ['matrix', 'recommendation', 'dissent'],
  properties: {
    matrix: {
      type: 'array',
      description: 'consolidated one row per option, best-first',
      items: {
        type: 'object',
        required: ['option', 'cells', 'total'],
        properties: {
          option: { type: 'string' },
          cells: {
            type: 'array',
            items: {
              type: 'object',
              required: ['criterion', 'verdict', 'level', 'score'],
              properties: {
                criterion: { type: 'string' },
                verdict: { type: 'string' },
                level: { type: 'string' },
                score: { type: 'number' },
                source: { type: 'string' },
                unverified: { type: 'boolean' },
              },
            },
          },
          total: { type: 'number' },
        },
      },
    },
    recommendation: {
      type: 'object',
      required: ['best', 'line', 'confidence'],
      properties: {
        best: { type: 'string', description: 'the winning option name' },
        line: { type: 'string', description: 'one best-first recommendation line' },
        confidence: { type: 'string', enum: ['assertive', 'lean'], description: 'assertive=recommend; lean=low-confidence' },
      },
    },
    dissent: {
      type: 'object',
      required: ['option', 'why'],
      properties: {
        option: { type: 'string', description: 'the runner-up a reasonable judge would defend' },
        why: { type: 'string', description: 'the criterion on which the runner-up wins' },
      },
    },
  },
};

// ---- Args contract (read-only via the args global; deterministic fallbacks) ----
// args.question : the fork stated as a question (string)
// args.options  : array of { name, ... }  (>=2 for a real benchmark)
// args.criteria : array of { name, weight } (>=1)
// args.judges   : optional reusable panel [{ key, lens, weighting }]; default single neutral judge
// args.domain   : drives strict floors (security/performance/compliance)
// args.scope    : 'internal' | 'external' (internal -> no external links, coherence-first)
const A = (typeof args !== 'undefined' && args) || {};
const QUESTION = A.question || 'unspecified decision fork';
const RAW_OPTIONS = Array.isArray(A.options) ? A.options : [];
const RAW_CRITERIA = Array.isArray(A.criteria) ? A.criteria : [];
const DOMAIN = A.domain || 'general';
const SCOPE = A.scope === 'external' ? 'external' : 'internal';
const FLOOR = STRICT_FLOORS[DOMAIN] || null;
// Default to a single neutral judge so the engine works without a panel; a caller
// can pass an opposed-lens panel to get a multi-judge consensus instead.
const JUDGES = (Array.isArray(A.judges) && A.judges.length)
  ? A.judges
  : [{ key: 'neutral', lens: 'balanced reviewer', weighting: 'Apply each criterion weight as given; no lens bias.' }];

const optionsBlob = JSON.stringify(RAW_OPTIONS, null, 2);
const criteriaBlob = JSON.stringify(RAW_CRITERIA, null, 2);

phase('RECON');
// EXPLORATION leaf: parse + normalise the fork. Labelled 'parse-options' so the
// linter classifies it as exploration and the haiku downgrade is permitted.
const recon = await agent(
  `You are the RECON leaf of byan-benchmark. Parse and normalise this decision fork.\n` +
    `QUESTION: ${QUESTION}\n` +
    `RAW OPTIONS: ${optionsBlob}\n` +
    `RAW CRITERIA: ${criteriaBlob}\n` +
    `Normalise options to [{name, note?}] and criteria to [{name, weight}] (default weight 1 when missing). ` +
    `Set valid=true ONLY if there are >=2 distinct, non-substitutable options AND >=1 criterion; ` +
    `otherwise valid=false with a reason (a degenerate/obvious-default fork should be skipped, not tabled).`,
  { label: 'parse-options', phase: 'RECON', schema: RECON_SCHEMA, model: 'haiku' }
);

const options = (recon && Array.isArray(recon.options) && recon.options.length)
  ? recon.options
  : RAW_OPTIONS;
const criteria = (recon && Array.isArray(recon.criteria) && recon.criteria.length)
  ? recon.criteria
  : RAW_CRITERIA;
const degenerate = !(recon && recon.valid) || options.length < 2 || criteria.length < 1;

if (degenerate) {
  // Collapse the degenerate case: a fork with <2 real options or no criterion is
  // not benchmarkable. Return DATA telling the skill to emit a BYAN-BENCH:skip.
  log(`degenerate fork: ${recon && recon.reason ? recon.reason : 'fewer than 2 options or no criteria'}`);
  return {
    workflow: 'byan-benchmark',
    question: QUESTION,
    scope: SCOPE,
    domain: DOMAIN,
    options,
    criteria,
    matrix: [],
    recommendation: null,
    dissent: null,
    degenerate: true,
    skipReason: recon && recon.reason ? recon.reason : 'obvious-default',
    needsHumanGate: true,
  };
}

phase('SOURCE');
// EXPLORATION leaves: gather evidence per option. One leaf per option, run in
// parallel. Labelled 'fetch-evidence:<option>' -> exploration -> haiku allowed.
// Sourcing is routing-driven: internal scope stays on model-knowledge (no links),
// external scope may cite a source, but a URL appears ONLY if WebFetch opened it
// THIS turn - otherwise the claim is tagged unverified.
const sourcingRule = SCOPE === 'internal'
  ? 'INTERNAL scope: stay on model-knowledge, do NOT emit external links, prefer coherence with the existing stack. Tag every claim unverified=true unless it is a self-evident property of the option.'
  : `EXTERNAL scope: model-knowledge is the default. A URL may appear ONLY if you actually opened it with WebFetch THIS turn; otherwise set unverified=true and cite from model-knowledge. Strict domain "${DOMAIN}"${FLOOR ? ` requires evidence floor ${FLOOR}` : ''}.`;

const evidence = await parallel(options.map((opt) => () =>
  agent(
    `You are a SOURCE leaf of byan-benchmark for ONE option.\n` +
      `OPTION: ${JSON.stringify(opt)}\n` +
      `CRITERIA: ${criteriaBlob}\n` +
      `${sourcingRule}\n` +
      `Produce one evidence note per criterion: the factual basis for this option on that criterion. ` +
      `Be concrete and honest; do not inflate. Return the EVIDENCE schema for this single option.`,
    { label: `fetch-evidence:${opt.name}`, phase: 'SOURCE', schema: EVIDENCE_SCHEMA, model: 'haiku' }
  )
));
const evidenceClean = evidence.filter(Boolean);
log(`Sourced ${evidenceClean.length}/${options.length} options (scope=${SCOPE})`);
const evidenceBlob = JSON.stringify(evidenceClean, null, 2);

phase('JUDGE');
// ANALYSIS leaves: score every cell against the weighted criteria. One leaf per
// judge (reusable panel). Labelled 'judge-score:<judge>' -> ANALYSIS -> DEEP, so
// opts.model is OMITTED (these leaves inherit the session model, never downgrade).
const judgeResults = await parallel(JUDGES.map((j) => () =>
  agent(
    `You are JUDGE "${j.key}" (lens: ${j.lens}) of byan-benchmark. Score ALL options objectively, then apply YOUR weighting.\n` +
      `FORK: ${QUESTION}\n` +
      `OPTIONS: ${optionsBlob}\n` +
      `CRITERIA (each has a weight): ${criteriaBlob}\n` +
      `EVIDENCE gathered per option: ${evidenceBlob}\n` +
      `EVIDENCE RUBRIC (grade each cell's level against this): ${EVIDENCE_RUBRIC}\n` +
      `${FLOOR ? `STRICT FLOOR for domain "${DOMAIN}": a cell below ${FLOOR} must be flagged unverified=true.` : ''}\n` +
      `YOUR WEIGHTING: ${j.weighting}\n` +
      `For each option, produce a cell per criterion: a short verdict, an evidence level (L1..L5), a 1-10 score, ` +
      `the source (or model-knowledge), and unverified (true if no live source was opened). ` +
      `Compute weightedTotal = sum(score * weight) across criteria. Return the JUDGE schema.`,
    { label: `judge-score:${j.key}`, phase: 'JUDGE', schema: JUDGE_SCHEMA }
  )
));
const judgeClean = judgeResults.filter(Boolean);
log(`Judges scored: ${judgeClean.length}/${JUDGES.length}`);
const judgeBlob = JSON.stringify(judgeClean, null, 2);

phase('RECOMMEND');
// ANALYSIS leaf: consolidate judges, rank best-first, capture dissent. Labelled
// 'recommend-rank' -> ANALYSIS -> DEEP (opts.model OMITTED). Confidence is a VERB
// choice: assertive when the gap and evidence are solid, lean when low-confidence.
const verdict = await agent(
  `You are the RECOMMEND leaf of byan-benchmark. Consolidate the judges into ONE decision.\n` +
    `FORK: ${QUESTION}\n` +
    `OPTIONS: ${optionsBlob}\n` +
    `CRITERIA: ${criteriaBlob}\n` +
    `JUDGES' SCORECARDS: ${judgeBlob}\n` +
    `Build a consolidated matrix: one row per option (best-first by combined weightedTotal), each cell carrying ` +
    `criterion, verdict, level, score, source and unverified. ` +
    `Recommend the best option with a one-line best-first reco. Set confidence="assertive" only when the winner ` +
    `clearly leads and its key cells are not unverified; otherwise confidence="lean" (low-confidence, hedge the verb). ` +
    `Capture the dissent: the runner-up a reasonable judge would defend and the criterion on which it wins. ` +
    `Return the RECOMMEND schema.`,
  { label: 'recommend-rank', phase: 'RECOMMEND', schema: RECOMMEND_SCHEMA }
);

// Return DATA only. The skill renders the compact 1-table, emits the BYAN-BENCH
// marker, and (in BYAN) optionally enriches cells via byan_fc_check at the gate.
return {
  workflow: 'byan-benchmark',
  question: QUESTION,
  scope: SCOPE,
  domain: DOMAIN,
  options,
  criteria,
  matrix: (verdict && verdict.matrix) || [],
  recommendation: (verdict && verdict.recommendation) || null,
  dissent: (verdict && verdict.dissent) || null,
  degenerate: false,
  needsHumanGate: true,
};
