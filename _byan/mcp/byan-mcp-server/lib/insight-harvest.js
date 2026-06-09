// Session insight harvester — read native Claude Code outcome trails and
// aggregate them into a GATED improvement digest for BYAN.
//
// Philosophy (the whole point): OBSERVE and PROPOSE, never silently self-modify.
// BYAN already has advisory learning surfaces (ELO trust, the suitability
// ledger) the agent updates by hand; the native hooks already leave outcome
// trails on disk. This module closes the loop by READING those trails and
// surfacing a digest with GATED proposals. It writes nothing back to a behavior
// surface (routing / personas / mantras): applying any change stays a human
// decision. An agent that rewrote its own routing on a heuristic would be the
// exact silent-downgrade BYAN exists to prevent.
//
// The aggregation is PURE (no I/O) so it is exhaustively unit-testable; the I/O
// entry takes an injected reader, mirroring template-sync.js / stub-sync.js.
//
// Trails consumed (shapes verified against the live repo):
//   _byan-output/tool-log.jsonl   post line {phase:'post', tool, ok, est_output_tokens?}
//   .byan-strict/audit.log        {event:'self_verify', verdict:'gap', findings:[]}
//   _byan-output/suitability-ledger.json  { "model::leaf": {model, leafId, successes, failures} }
//   _byan/memoire/elo-profile.json        { domains: { <domain>: {rating, blocked_streak, ...} } }

import fs from 'node:fs';
import path from 'node:path';

// Parse a JSONL blob into an array of objects, skipping malformed lines.
export function parseJsonl(text) {
  if (!text) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Tool health from tool-log.jsonl post lines: call count, failure rate, the top
// failing tools, and an output-token cost proxy. est_output_tokens is absent on
// older lines (added later by the hook), so it defaults to 0.
export function harvestToolHealth(toolLogEntries) {
  const post = (toolLogEntries || []).filter((e) => e && e.phase === 'post');
  const failures = post.filter((e) => e.ok === false);
  const byTool = {};
  for (const f of failures) byTool[f.tool || 'unknown'] = (byTool[f.tool || 'unknown'] || 0) + 1;
  const topFailing = Object.entries(byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool, count]) => ({ tool, count }));
  const estOutputTokens = post.reduce((s, e) => s + (e.est_output_tokens || 0), 0);
  return {
    calls: post.length,
    failures: failures.length,
    failureRate: post.length ? +(failures.length / post.length).toFixed(3) : 0,
    topFailing,
    estOutputTokens,
  };
}

// Coarse theme key for a strict gap finding. The categories mirror the recurring
// gap types BYAN actually hits; anything unmatched is 'other' (never silently
// dropped — it still counts under 'other').
function normalizeGap(finding) {
  const s = String(finding).toLowerCase();
  if (/\btest|coverage|spec\b/.test(s)) return 'tests/coverage';
  if (/error|edge|exception|fail|throw/.test(s)) return 'error/edge handling';
  if (/doc|comment|changelog|readme/.test(s)) return 'documentation';
  if (/template|fidelity|sync|twin/.test(s)) return 'template fidelity';
  if (/emoji/.test(s)) return 'emoji';
  if (/scope|downgrade|cut|stub|mvp/.test(s)) return 'scope/downgrade';
  return 'other';
}

// Recurring strict-gap clustering (L3): mine self_verify gap findings from the
// audit log and group them into themes. A theme is "recurring" at count >= 2.
export function harvestStrictGaps(auditEntries) {
  const findings = [];
  for (const e of auditEntries || []) {
    if (e && e.event === 'self_verify' && e.verdict === 'gap' && Array.isArray(e.findings)) {
      findings.push(...e.findings);
    }
  }
  const themes = {};
  for (const f of findings) {
    const key = normalizeGap(f);
    if (!themes[key]) themes[key] = { theme: key, count: 0, samples: [] };
    themes[key].count++;
    if (themes[key].samples.length < 2) themes[key].samples.push(String(f).slice(0, 100));
  }
  const recurring = Object.values(themes)
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count);
  return { totalGapFindings: findings.length, recurring };
}

// Routing outcomes (L1): surface the suitability ledger as per (cheap-model x
// leaf) keep-rate rows, busiest first. keepRate = successes / (successes+failures).
export function harvestRouting(ledger) {
  const rows = [];
  const entries = ledger && typeof ledger === 'object' ? Object.entries(ledger) : [];
  for (const [key, v] of entries) {
    if (!v || typeof v !== 'object') continue;
    const successes = Number(v.successes || 0);
    const failures = Number(v.failures || 0);
    const n = successes + failures;
    if (!n) continue;
    const model = v.model || key.split('::')[0];
    const leaf = v.leafId || key.split('::')[1] || key;
    rows.push({ model, leaf, successes, failures, n, keepRate: +(successes / n).toFixed(2) });
  }
  return rows.sort((a, b) => b.n - a.n);
}

// Domain trust trends from the ELO profile: rating + blocked streak per domain.
export function harvestEloTrends(eloProfile) {
  const domains = (eloProfile && eloProfile.domains) || {};
  const rows = [];
  for (const [domain, d] of Object.entries(domains)) {
    if (!d || typeof d !== 'object' || typeof d.rating !== 'number') continue;
    rows.push({ domain, rating: d.rating, blockedStreak: d.blocked_streak || 0 });
  }
  return rows.sort((a, b) => b.rating - a.rating);
}

// Assemble the digest and derive GATED proposals. Every proposal is a suggestion
// for the human to ratify (gated:true) — none is auto-applied. The thresholds
// are deliberately conservative so noise does not generate proposals.
export function buildDigest({ toolHealth, gaps, routing, elo } = {}) {
  const proposals = [];

  if (toolHealth && toolHealth.failureRate > 0.1 && toolHealth.topFailing.length) {
    const t = toolHealth.topFailing[0];
    proposals.push({
      kind: 'tool-reliability',
      gated: true,
      suggestion: `Tool failure rate ${toolHealth.failureRate}; top offender ${t.tool} (${t.count}). Investigate before relying on it.`,
    });
  }
  for (const g of (gaps && gaps.recurring) || []) {
    if (g.count >= 3) {
      proposals.push({
        kind: 'recurring-gap',
        gated: true,
        suggestion: `Recurring self-verify gap "${g.theme}" (${g.count}x). Consider a pre-build checklist item.`,
      });
    }
  }
  for (const r of routing || []) {
    if (r.n >= 5 && r.keepRate < 0.5) {
      proposals.push({
        kind: 'routing',
        gated: true,
        suggestion: `Cheap model ${r.model} underperforms on "${r.leaf}" (keepRate ${r.keepRate}, n=${r.n}). Consider keeping that leaf deep.`,
      });
    }
  }

  return {
    toolHealth: toolHealth || null,
    recurringGaps: gaps || { totalGapFindings: 0, recurring: [] },
    routingOutcomes: routing || [],
    eloTrends: elo || [],
    proposals,
  };
}

// Human-readable render of a digest (for the CLI and the skill).
export function renderDigest(d) {
  const lines = ['BYAN session insight digest', ''];
  if (d.toolHealth) {
    lines.push(
      `Tool health: ${d.toolHealth.calls} calls, ${d.toolHealth.failures} failures (rate ${d.toolHealth.failureRate}), ~${d.toolHealth.estOutputTokens} output tokens.`
    );
    if (d.toolHealth.topFailing.length) {
      lines.push(`  Top failing: ${d.toolHealth.topFailing.map((t) => `${t.tool}(${t.count})`).join(', ')}`);
    }
  }
  lines.push(`Recurring gaps: ${d.recurringGaps.recurring.map((g) => `${g.theme}(${g.count})`).join(', ') || 'none'}`);
  if (d.routingOutcomes.length) {
    lines.push('Routing outcomes (cheap-model keep-rate):');
    for (const r of d.routingOutcomes.slice(0, 8)) {
      lines.push(`  ${r.model}::${r.leaf} -> keep ${r.keepRate} (n=${r.n})`);
    }
  }
  if (d.eloTrends.length) {
    lines.push(`ELO trends: ${d.eloTrends.slice(0, 6).map((e) => `${e.domain}=${e.rating}`).join(', ')}`);
  }
  lines.push('', `Proposals (GATED — human ratifies, nothing auto-applied): ${d.proposals.length}`);
  for (const p of d.proposals) lines.push(`  [${p.kind}] ${p.suggestion}`);
  return lines.join('\n');
}

// I/O entry: read the trails under rootDir (missing trail -> empty, so the digest
// self-disables gracefully on a fresh checkout) and build the digest.
export function harvest({ rootDir, io = fs } = {}) {
  const readText = (rel) => {
    try {
      return io.readFileSync(path.join(rootDir, rel), 'utf8');
    } catch {
      return '';
    }
  };
  const readJson = (rel) => {
    const t = readText(rel);
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  const toolHealth = harvestToolHealth(parseJsonl(readText('_byan-output/tool-log.jsonl')));
  const gaps = harvestStrictGaps(parseJsonl(readText('.byan-strict/audit.log')));
  const routing = harvestRouting(readJson('_byan-output/suitability-ledger.json'));
  const elo = harvestEloTrends(readJson('_byan/memoire/elo-profile.json'));
  return buildDigest({ toolHealth, gaps, routing, elo });
}
