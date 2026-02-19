#!/usr/bin/env node
/**
 * fact-check-ci.js — CI gate for BYAN fact-check
 *
 * Loads the knowledge graph, audits all facts for expiration,
 * outputs a Markdown report, and exits with code 1 if any
 * strict-domain fact (security, compliance) has expired.
 *
 * Usage: node scripts/fact-check-ci.js [--report-only]
 */

const FactChecker = require('../src/byan-v2/fact-check/index');
const KnowledgeGraph = require('../src/byan-v2/fact-check/knowledge-graph');

const STRICT_DOMAINS = ['security', 'compliance'];
const reportOnly = process.argv.includes('--report-only');

const checker = new FactChecker({ output_fact_sheet: false });
const graph = new KnowledgeGraph();

const { expired, expiringSoon, healthy } = graph.audit(checker);
const { total, byDomain, byStatus } = graph.stats();

const lines = [
  '# Fact-Check CI Report',
  `**Date :** ${new Date().toISOString().slice(0, 10)}`,
  `**Total facts in graph :** ${total}`,
  '',
  '## Summary',
  `| Status | Count |`,
  `|--------|-------|`,
  `| Healthy | ${healthy.length} |`,
  `| Expiring soon (<30 days) | ${expiringSoon.length} |`,
  `| Expired | ${expired.length} |`,
  ''
];

if (expired.length > 0) {
  lines.push('## Expired Facts (action required)');
  for (const f of expired) {
    lines.push(`- **[${f.domain.toUpperCase()}]** ${f.claim}`);
    lines.push(`  - Created: ${f.created_at} — ${f._check.warning}`);
  }
  lines.push('');
}

if (expiringSoon.length > 0) {
  lines.push('## Expiring Soon (review recommended)');
  for (const f of expiringSoon) {
    lines.push(`- **[${f.domain.toUpperCase()}]** ${f.claim} — ${f._check.warning}`);
  }
  lines.push('');
}

if (Object.keys(byDomain).length > 0) {
  lines.push('## Facts by Domain');
  for (const [domain, count] of Object.entries(byDomain)) {
    lines.push(`- ${domain}: ${count}`);
  }
  lines.push('');
}

const report = lines.join('\n');
process.stdout.write(report + '\n');

const strictExpired = expired.filter(f => STRICT_DOMAINS.includes(f.domain));

if (strictExpired.length > 0 && !reportOnly) {
  process.stderr.write(
    `\n[FACT-CHECK CI] FAIL: ${strictExpired.length} expired fact(s) in strict domains (${STRICT_DOMAINS.join(', ')}).\n` +
    'Re-verify or remove these facts before merging.\n'
  );
  process.exit(1);
}

if (expired.length > 0 || expiringSoon.length > 0) {
  process.stderr.write(
    `\n[FACT-CHECK CI] WARNING: ${expired.length} expired, ${expiringSoon.length} expiring soon.\n`
  );
}

process.exit(0);
