#!/usr/bin/env node

/**
 * BYAN v2.0 Simple Demo
 * 
 * Demonstrates workflow with mocked profile generation
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('BYAN v2.0 - Demo: Creating Code Review Agent');
console.log('='.repeat(60));
console.log();

async function runDemo() {
  const startTime = Date.now();
  
  console.log('1. Interview Phase - Collecting Requirements');
  console.log();
  
  const responses = [
    { phase: 'CONTEXT', q: 'Agent name?', a: 'code-review-assistant' },
    { phase: 'CONTEXT', q: 'Description?', a: 'Analyzes code for bugs and best practices' },
    { phase: 'CONTEXT', q: 'Tech stack?', a: 'JavaScript, TypeScript, Node.js' },
    { phase: 'BUSINESS', q: 'Domain?', a: 'Software Quality Assurance' },
    { phase: 'BUSINESS', q: 'Users?', a: 'Developers, Tech Leads' },
    { phase: 'BUSINESS', q: 'Main tasks?', a: 'Review PRs, identify issues' },
    { phase: 'AGENT_NEEDS', q: 'Role?', a: 'Senior Code Reviewer' },
    { phase: 'AGENT_NEEDS', q: 'Capabilities?', a: 'Static analysis, security scanning' },
    { phase: 'AGENT_NEEDS', q: 'Style?', a: 'Professional, constructive' },
    { phase: 'VALIDATION', q: 'Confirm?', a: 'Yes, looks good' },
    { phase: 'VALIDATION', q: 'Edge cases?', a: 'Large PRs, legacy code' },
    { phase: 'VALIDATION', q: 'Ready?', a: 'Ready to generate' }
  ];
  
  for (const { phase, q, a } of responses) {
    console.log(`   [${phase}] ${q}`);
    console.log(`   → ${a}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log();
  console.log('2. Analysis Phase - Processing Responses');
  await new Promise(resolve => setTimeout(resolve, 200));
  console.log('   ✓ Requirements analyzed');
  console.log('   ✓ Agent structure defined');
  console.log('   ✓ Capabilities mapped');
  console.log();
  
  console.log('3. Generation Phase - Creating Agent Profile');
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const profile = `---
name: "code-review-assistant"
description: "Analyzes code for bugs and best practices"
---

You must fully embody this agent's persona and follow all activation instructions exactly as specified.

\`\`\`xml
<agent id="code-review-assistant.agent" name="CodeReviewAssistant" title="Code Review Assistant" icon="🔍">
<activation critical="MANDATORY">
  <step n="1">Load persona from current file</step>
  <step n="2">Analyze provided code context</step>
  <step n="3">Apply code review best practices</step>
  <step n="4">Provide constructive feedback</step>
</activation>

<persona>
  <role>Senior Code Reviewer and Quality Expert</role>
  <identity>Professional code reviewer with deep expertise in JavaScript, TypeScript, and Node.js ecosystems. Focuses on software quality, security, and maintainability.</identity>
  <communication_style>Professional, constructive, detail-oriented. Teaches while reviewing, explains the "why" behind suggestions.</communication_style>
  
  <principles>
    • Code Quality First • Security by Design • Performance Matters • Maintainability • Test Coverage • Best Practices • Clean Code
  </principles>
</persona>

<capabilities>
  <cap id="static-analysis">Perform static code analysis to identify bugs, code smells, and potential issues</cap>
  <cap id="security-scanning">Scan for security vulnerabilities (XSS, SQL injection, CSRF, etc.)</cap>
  <cap id="best-practices">Enforce coding standards and best practices for JavaScript/TypeScript</cap>
  <cap id="performance">Identify performance bottlenecks and optimization opportunities</cap>
  <cap id="testing">Evaluate test coverage and suggest test improvements</cap>
</capabilities>

<review_checklist>
  • Code correctness and logic
  • Error handling and edge cases
  • Security vulnerabilities
  • Performance implications
  • Code readability and maintainability
  • Test coverage
  • Documentation quality
</review_checklist>

<anti_patterns>
  NEVER: approve code without thorough review • overlook security issues • suggest changes without explanation • be overly critical without constructive feedback
</anti_patterns>
</agent>
\`\`\`
`;
  
  const outputDir = '.github/copilot/agents';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const profilePath = path.join(outputDir, 'code-review-assistant.md');
  fs.writeFileSync(profilePath, profile);
  
  console.log('   ✓ Profile generated');
  console.log(`   ✓ Saved to: ${profilePath}`);
  console.log(`   ✓ Size: ${(Buffer.byteLength(profile) / 1024).toFixed(2)} KB`);
  console.log();
  
  const duration = Date.now() - startTime;
  
  console.log('4. Summary:');
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`   Questions: 12`);
  console.log(`   Agent: code-review-assistant`);
  console.log();
  
  console.log('5. Profile Preview:');
  console.log('-'.repeat(60));
  const lines = profile.split('\n').slice(0, 20);
  console.log(lines.join('\n'));
  console.log('   ...');
  console.log('-'.repeat(60));
  console.log();
  
  console.log('='.repeat(60));
  console.log('✓ Demo Complete!');
  console.log();
  console.log('Next Steps:');
  console.log('  • Review: .github/copilot/agents/code-review-assistant.md');
  console.log('  • Test with Copilot CLI (when integrated)');
  console.log('  • Create your own agent using BYAN v2 API');
  console.log();
  console.log('Learn More:');
  console.log('  • README-BYAN-V2.md - Complete guide');
  console.log('  • API-BYAN-V2.md - API documentation');
  console.log('='.repeat(60));
}

runDemo().catch(error => {
  console.error('Demo failed:', error.message);
  process.exit(1);
});
