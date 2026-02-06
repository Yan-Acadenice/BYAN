#!/usr/bin/env node

/**
 * BYAN v2 - Copilot CLI Integration Test
 */

const fs = require('fs');
const path = require('path');

class IntegrationTester {
  constructor() {
    this.results = { passed: 0, failed: 0, tests: [] };
  }

  test(name, fn) {
    try {
      fn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
      console.log('PASS:', name);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
      console.error('FAIL:', name, '-', error.message);
    }
  }

  assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  run() {
    console.log('\nBYAN v2 - Copilot CLI Integration Tests\n');

    this.test('Copilot agent profile exists', () => {
      const agentPath = '.github/copilot/agents/byan-v2.md';
      this.assert(fs.existsSync(agentPath), 'Agent file not found');
      
      const content = fs.readFileSync(agentPath, 'utf-8');
      this.assert(content.includes("name: 'byan-v2'"), 'Missing agent name');
      this.assert(content.includes('12 questions'), 'Missing question count');
    });

    this.test('BMAD agent stub exists', () => {
      const stubPath = '.github/agents/bmad-agent-byan-v2.md';
      this.assert(fs.existsSync(stubPath), 'Stub not found');
    });

    this.test('CLI wrapper exists', () => {
      const cliPath = 'bin/byan-v2-cli.js';
      this.assert(fs.existsSync(cliPath), 'CLI not found');
    });

    this.test('BYAN v2 source accessible', () => {
      const srcPath = 'src/byan-v2/index.js';
      this.assert(fs.existsSync(srcPath), 'Source not found');
      
      const ByanV2 = require(path.join(process.cwd(), 'src/byan-v2'));
      this.assert(typeof ByanV2 === 'function', 'ByanV2 not a constructor');
    });

    this.test('Integration doc exists', () => {
      const docPath = 'BYAN-V2-COPILOT-CLI-INTEGRATION.md';
      this.assert(fs.existsSync(docPath), 'Doc not found');
    });

    this.test('All modules present', () => {
      const modules = [
        'src/byan-v2/context/session-state.js',
        'src/byan-v2/orchestrator/state-machine.js',
        'src/byan-v2/orchestrator/interview-state.js',
        'src/byan-v2/generation/profile-template.js'
      ];
      
      modules.forEach(mod => {
        this.assert(fs.existsSync(mod), `${mod} not found`);
      });
    });

    console.log(`\nResults: ${this.results.passed} passed, ${this.results.failed} failed\n`);
    
    if (this.results.failed === 0) {
      console.log('All integration tests passed!');
      console.log('BYAN v2 is ready for Copilot CLI usage');
      console.log('Try: @byan-v2 create agent\n');
      return 0;
    } else {
      console.log('Some tests failed\n');
      return 1;
    }
  }
}

const tester = new IntegrationTester();
const exitCode = tester.run();
process.exit(exitCode);
