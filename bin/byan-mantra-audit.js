#!/usr/bin/env node
//
// byan-mantra-audit — semantic embodiment audit for BYAN personas (Option C, N2).
//
// The pre-commit mantra gate is a fast, deterministic anti-stub FLOOR : it asks
// "does this persona contain the vocabulary of its domain mantras". That catches
// empty/zombie files but does NOT measure whether the agent genuinely EMBODIES a
// mantra. This tool is the deeper, out-of-band layer : it prepares a judgment
// packet (the applicable mantras + the persona + a rubric) for an LLM judge, then
// turns the judge's verdicts into an embodiment score. It is deliberately NOT in
// the commit path : the judgment is semantic (an LLM call), so it runs on demand
// or in CI, never blocking a commit with a non-deterministic check.
//
// Usage :
//   byan-mantra-audit prepare <agentFile> [--json]   # emit the judgment prompt (or packet)
//   byan-mantra-audit score   <agentFile> <verdicts.json>   # embodiment score from verdicts
//
// verdicts.json : { "<mantraId>": "embodied" | "partial" | "absent", ... }

const fs = require('fs');
const path = require('path');
const MantraValidator = require('../src/byan-v2/generation/mantra-validator');
const resolver = require('../src/byan-v2/generation/scope-resolver');

const VERDICT_WEIGHT = { embodied: 1, partial: 0.5, absent: 0 };

function buildPacket(agentFile) {
  const content = fs.readFileSync(agentFile, 'utf8');
  const name = path.basename(agentFile).replace(/\.md$/, '');
  const scopes = resolver.resolveAgentScopes({ name, content });
  const applicable = new MantraValidator().applicableMantras(scopes);
  return {
    agent: name,
    file: agentFile,
    scopes,
    mantras: applicable.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      scope: m.scope || 'universal',
      priority: m.priority,
    })),
    persona: content,
  };
}

function buildPrompt(packet) {
  const lines = [];
  lines.push('You are auditing whether a BYAN agent persona EMBODIES its applicable mantras.');
  lines.push('Judge embodiment, not vocabulary : a mantra is embodied when the persona\'s role,');
  lines.push('instructions, and red-lines actually enact the principle, even if the exact keyword');
  lines.push('is absent. For each mantra return one verdict : embodied | partial | absent.');
  lines.push('');
  lines.push(`Agent : ${packet.agent}    Scopes : ${packet.scopes.join(', ')}`);
  lines.push('');
  lines.push('Applicable mantras :');
  for (const m of packet.mantras) {
    lines.push(`- ${m.id} (${m.scope}, ${m.priority}) : ${m.title} -- ${m.description}`);
  }
  lines.push('');
  lines.push('Persona under audit :');
  lines.push('"""');
  lines.push(packet.persona.trim());
  lines.push('"""');
  lines.push('');
  lines.push('Return strict JSON mapping every mantra id to its verdict, e.g.');
  lines.push('{ "IA-16": "embodied", "M37": "partial", "IA-2": "absent" }');
  return lines.join('\n');
}

function scoreVerdicts(packet, verdicts) {
  const ids = packet.mantras.map(m => m.id);
  let sum = 0;
  const buckets = { embodied: [], partial: [], absent: [], unjudged: [] };
  for (const id of ids) {
    const v = verdicts[id];
    if (v && Object.prototype.hasOwnProperty.call(VERDICT_WEIGHT, v)) {
      sum += VERDICT_WEIGHT[v];
      buckets[v].push(id);
    } else {
      buckets.unjudged.push(id);
    }
  }
  const total = ids.length;
  const embodimentScore = total > 0 ? Math.round((sum / total) * 100) : 0;
  return {
    agent: packet.agent,
    scopes: packet.scopes,
    total,
    embodimentScore,
    embodied: buckets.embodied,
    partial: buckets.partial,
    absent: buckets.absent,
    unjudged: buckets.unjudged,
  };
}

function main(argv) {
  const [cmd, agentFile, arg3] = argv;

  if (!cmd || !agentFile || ['-h', '--help'].includes(cmd)) {
    process.stdout.write(
      'Usage :\n' +
      '  byan-mantra-audit prepare <agentFile> [--json]\n' +
      '  byan-mantra-audit score   <agentFile> <verdicts.json>\n'
    );
    return cmd ? 0 : 1;
  }

  if (!fs.existsSync(agentFile)) {
    process.stderr.write(`Agent file not found : ${agentFile}\n`);
    return 1;
  }

  const packet = buildPacket(agentFile);

  if (cmd === 'prepare') {
    if (arg3 === '--json') {
      process.stdout.write(JSON.stringify(packet, null, 2) + '\n');
    } else {
      process.stdout.write(buildPrompt(packet) + '\n');
    }
    return 0;
  }

  if (cmd === 'score') {
    if (!arg3 || !fs.existsSync(arg3)) {
      process.stderr.write('A verdicts JSON file is required : byan-mantra-audit score <agentFile> <verdicts.json>\n');
      return 1;
    }
    const verdicts = JSON.parse(fs.readFileSync(arg3, 'utf8'));
    const result = scoreVerdicts(packet, verdicts);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  process.stderr.write(`Unknown command : ${cmd}\n`);
  return 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { buildPacket, buildPrompt, scoreVerdicts, VERDICT_WEIGHT };
