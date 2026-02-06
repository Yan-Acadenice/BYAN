#!/usr/bin/env node

/**
 * BYAN v2 - Copilot CLI Wrapper
 * Bridges GitHub Copilot CLI with BYAN v2 Node.js implementation
 */

const path = require('path');
const ByanV2 = require(path.join(__dirname, '../src/byan-v2'));

class ByanCLI {
  constructor() {
    this.byan = new ByanV2();
    this.currentQuestion = null;
  }

  async handleCommand(command, args) {
    try {
      switch (command) {
        case 'create':
        case 'start':
          return await this.startInterview();
        
        case 'status':
          return await this.showStatus();
        
        case 'validate':
          return await this.validateAgent(args[0]);
        
        case 'help':
        default:
          return this.showHelp();
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  async startInterview() {
    console.log('BYAN v2.0 - Starting intelligent interview\n');
    console.log('Format: 4 phases x 3 questions = 12 questions total');
    console.log('Duration: ~15 minutes\n');
    
    await this.byan.startSession();
    
    console.log('Session started');
    console.log('Current state:', this.byan.stateMachine.currentState);
    console.log('\nUse Copilot CLI conversation to answer questions');
    console.log('Example: @byan-v2 <your answer>');
    
    return await this.getNextQuestion();
  }

  async getNextQuestion() {
    try {
      this.currentQuestion = await this.byan.getNextQuestion();
      
      const state = this.byan.sessionState;
      const progress = `${state.userResponses.length}/12`;
      
      console.log(`\n${'='.repeat(50)}`);
      console.log(`PHASE: ${state.currentPhase} | Progress: ${progress}`);
      console.log('='.repeat(50) + '\n');
      console.log(`Q: ${this.currentQuestion}\n`);
      
      return this.currentQuestion;
    } catch (error) {
      if (error.message.includes('complete')) {
        return await this.completeInterview();
      }
      throw error;
    }
  }

  async submitAnswer(answer) {
    if (!this.currentQuestion) {
      throw new Error('No active question. Start interview first with: @byan-v2 start');
    }
    
    await this.byan.submitResponse(answer);
    console.log('Answer recorded\n');
    
    return await this.getNextQuestion();
  }

  async completeInterview() {
    console.log('\nInterview complete! Generating agent profile...\n');
    
    const profile = await this.byan.generateProfile();
    
    console.log('Agent profile generated!');
    console.log('Location:', profile.filePath || 'N/A');
    console.log('Name:', profile.name || 'agent');
    console.log('Quality score:', profile.qualityScore || 'N/A');
    console.log('\nYour agent is ready to use!');
    
    return profile;
  }

  async showStatus() {
    const state = this.byan.sessionState;
    const currentState = this.byan.stateMachine.currentState;
    
    console.log('\nBYAN v2 Status\n');
    console.log('State:', currentState);
    console.log('Phase:', state.currentPhase || 'N/A');
    console.log('Progress:', `${state.userResponses.length}/12 questions`);
    console.log('Session ID:', state.sessionId);
    
    if (state.analysisResults) {
      console.log('\nAnalysis complete');
    }
    
    if (state.generatedProfile) {
      console.log('Profile generated');
    }
    
    return state;
  }

  async validateAgent(filePath) {
    if (!filePath) {
      console.error('Usage: @byan-v2 validate <agent-file.md>');
      return;
    }
    
    console.log(`Validating agent: ${filePath}\n`);
    
    const AgentProfileValidator = require(path.join(__dirname, '../src/byan-v2/generation/agent-profile-validator'));
    const validator = new AgentProfileValidator();
    const fs = require('fs');
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = validator.validateProfile(content);
    
    console.log('Validation result:', result.isValid ? 'VALID' : 'INVALID');
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }
    
    console.log('\nQuality score:', result.qualityScore);
    
    return result;
  }

  showHelp() {
    console.log(`
BYAN v2.0 - Builder of YAN

USAGE:
  @byan-v2 <command> [args]

COMMANDS:
  create, start          Start intelligent interview (12 questions)
  status                 Show current session status
  validate <file>        Validate existing agent profile
  help                   Show this help

INTERVIEW PHASES:
  1. CONTEXT (3Q)        Project goals & tech stack
  2. BUSINESS (3Q)       Domain knowledge & constraints
  3. AGENT_NEEDS (3Q)    Capabilities & communication style
  4. VALIDATION (3Q)     Confirmation & refinement

EXAMPLES:
  @byan-v2 create agent
  @byan-v2 status
  @byan-v2 validate .github/copilot/agents/my-agent.md

ARCHITECTURE:
  src/byan-v2/
  ├── context/           SessionState, CopilotContext
  ├── orchestrator/      StateMachine, InterviewState
  ├── generation/        ProfileTemplate, Validator
  └── observability/     Logger, Metrics, ErrorTracker

Full docs: README-BYAN-V2.md
Tests: 881/881 passing (100%)
`);
  }
}

// CLI Entry Point
if (require.main === module) {
  const cli = new ByanCLI();
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const commandArgs = args.slice(1);
  
  cli.handleCommand(command, commandArgs)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = ByanCLI;
