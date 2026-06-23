#!/usr/bin/env node

/**
 * BYAN v2.0 Demo Script
 * 
 * Demonstrates complete workflow:
 * 1. Start session
 * 2. Answer 12 interview questions
 * 3. Generate agent profile
 * 4. Save to .github/copilot/agents/
 */

const ByanV2 = require('./src/byan-v2');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('BYAN v2.0 - Demo: Creating Code Review Agent');
console.log('='.repeat(60));
console.log();

async function runDemo() {
  const startTime = Date.now();
  
  // Create BYAN instance
  console.log('1. Initializing BYAN v2...');
  const byan = new ByanV2({
    outputDir: '.github/copilot/agents'
  });
  
  // Start session
  console.log('2. Starting interview session...');
  const sessionId = await byan.startSession();
  console.log(`   Session ID: ${sessionId}`);
  console.log();
  
  // Pre-defined responses for code review agent
  const responses = [
    // CONTEXT Phase (1-3)
    'code-review-assistant',
    'An intelligent code review agent that analyzes code for bugs, security issues, and best practices',
    'JavaScript, TypeScript, Node.js, React',
    
    // BUSINESS Phase (4-6)
    'Software Quality Assurance',
    'Developers, Tech Leads, QA Engineers',
    'Review pull requests, identify code smells, suggest improvements, check for security vulnerabilities',
    
    // AGENT_NEEDS Phase (7-9)
    'Senior Code Reviewer and Quality Expert',
    'Static analysis, security scanning, best practices enforcement, performance optimization',
    'Professional, constructive, detail-oriented, focuses on teaching not just correcting',
    
    // VALIDATION Phase (10-12)
    'Yes, this covers our code review needs',
    'Large pull requests with 500+ lines of changes, legacy code without tests',
    'Confirmed - ready to generate the agent'
  ];
  
  console.log('3. Answering interview questions...');
  console.log();
  
  // Simulate interview
  for (let i = 0; i < responses.length; i++) {
    // In real implementation, getNextQuestion() would be called
    // For demo, we just show the response
    const phase = i < 3 ? 'CONTEXT' : i < 6 ? 'BUSINESS' : i < 9 ? 'AGENT_NEEDS' : 'VALIDATION';
    
    console.log(`   [${phase}] Question ${i + 1}/12`);
    console.log(`   Response: "${responses[i].substring(0, 60)}${responses[i].length > 60 ? '...' : ''}"`);
    
    await byan.submitResponse(responses[i]);
    
    // Small delay to simulate user typing
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log();
  console.log('4. Interview complete! Generating agent profile...');
  console.log();
  
  // Generate profile
  const profile = await byan.generateProfile();
  
  // Save profile
  const outputDir = '.github/copilot/agents';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const profilePath = path.join(outputDir, 'code-review-assistant.md');
  fs.writeFileSync(profilePath, profile);
  
  console.log(`✓ Agent profile generated successfully!`);
  console.log(`   Saved to: ${profilePath}`);
  console.log(`   Size: ${(Buffer.byteLength(profile) / 1024).toFixed(2)} KB`);
  console.log();
  
  // Get metrics
  const metrics = byan.getMetricsSummary();
  const duration = Date.now() - startTime;
  
  console.log('5. Session Summary:');
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`   Questions asked: ${metrics.questionsAsked || 12}`);
  console.log(`   Profiles generated: ${metrics.profilesGenerated}`);
  console.log();
  
  // Display profile preview
  console.log('6. Profile Preview:');
  console.log('-'.repeat(60));
  const lines = profile.split('\n').slice(0, 15);
  console.log(lines.join('\n'));
  console.log('   ...');
  console.log('-'.repeat(60));
  console.log();
  
  console.log('='.repeat(60));
  console.log('Demo Complete!');
  console.log();
  console.log('Next steps:');
  console.log('  1. Review the generated profile: .github/copilot/agents/code-review-assistant.md');
  console.log('  2. Test the agent with: gh copilot agent code-review-assistant');
  console.log('  3. Create your own agent: node demo-byan-v2.js');
  console.log('='.repeat(60));
  
  await byan.endSession();
}

// Run demo
runDemo().catch(error => {
  console.error('Demo failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
