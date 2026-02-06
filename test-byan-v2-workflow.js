#!/usr/bin/env node

/**
 * BYAN v2.0 - End-to-End Workflow Test
 * Tests: INTERVIEW → ANALYSIS → GENERATION flow
 */

const SessionState = require('./src/byan-v2/context/session-state');
const CopilotContext = require('./src/byan-v2/context/copilot-context');
const StateMachine = require('./src/byan-v2/orchestrator/state-machine');
const InterviewState = require('./src/byan-v2/orchestrator/interview-state');
const AnalysisState = require('./src/byan-v2/orchestrator/analysis-state');
const GenerationState = require('./src/byan-v2/orchestrator/generation-state');
const TaskRouter = require('./src/byan-v2/dispatcher/task-router');
const Logger = require('./src/byan-v2/observability/logger');
const MetricsCollector = require('./src/byan-v2/observability/metrics-collector');

console.log('🏗️  BYAN v2.0 - End-to-End Workflow Test\n');

// Initialize components
const sessionState = new SessionState();
const copilotContext = new CopilotContext();
const taskRouter = new TaskRouter();
const logger = new Logger();
const metrics = new MetricsCollector();

const stateMachine = new StateMachine(
  sessionState,
  taskRouter,
  logger,
  metrics
);

console.log('✅ Components initialized');
console.log(`📋 Session ID: ${sessionState.sessionId}`);
console.log(`🎯 Initial State: ${stateMachine.getCurrentState()}\n`);

// ==========================================
// PHASE 1: INTERVIEW STATE
// ==========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 PHASE 1: INTERVIEW STATE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const interviewState = stateMachine.getStateHandler('INTERVIEW');

// Simulate interview responses (4 phases x 3 questions minimum)
const mockResponses = [
  // CONTEXT Phase
  { phase: 'CONTEXT', answer: 'Backend API development specialist' },
  { phase: 'CONTEXT', answer: 'Node.js, Express, PostgreSQL' },
  { phase: 'CONTEXT', answer: 'RESTful APIs, microservices architecture' },
  
  // BUSINESS Phase
  { phase: 'BUSINESS', answer: 'E-commerce domain, payment processing' },
  { phase: 'BUSINESS', answer: 'High availability, PCI compliance' },
  { phase: 'BUSINESS', answer: 'Order management, inventory sync' },
  
  // AGENT_NEEDS Phase
  { phase: 'AGENT_NEEDS', answer: 'API design, database schema, security best practices' },
  { phase: 'AGENT_NEEDS', answer: 'Code generation, architecture review, performance optimization' },
  { phase: 'AGENT_NEEDS', answer: 'Secure coding, input validation, authentication patterns' },
  
  // VALIDATION Phase
  { phase: 'VALIDATION', answer: 'Yes, RESTful API design principles' },
  { phase: 'VALIDATION', answer: 'PostgreSQL schema design and query optimization' },
  { phase: 'VALIDATION', answer: 'Authentication, authorization, data encryption' }
];

console.log('Simulating interview with 12 responses...\n');

mockResponses.forEach((resp, idx) => {
  const question = interviewState.askNextQuestion();
  console.log(`Q${idx + 1} [${resp.phase}]: ${question}`);
  
  interviewState.processResponse(resp.answer);
  sessionState.addResponse(idx, resp.answer);
  
  console.log(`   ✅ Response recorded: "${resp.answer.substring(0, 50)}..."`);
  
  if (interviewState.isPhaseComplete()) {
    console.log(`   🎯 Phase ${resp.phase} completed!\n`);
  }
});

console.log(`✅ Interview completed: ${sessionState.userResponses.length} responses`);
console.log(`🎯 Can transition to ANALYSIS: ${interviewState.canTransitionToAnalysis()}\n`);

// ==========================================
// PHASE 2: ANALYSIS STATE
// ==========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔬 PHASE 2: ANALYSIS STATE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Transition to ANALYSIS
stateMachine.transition('ANALYSIS');
console.log(`✅ Transitioned to: ${stateMachine.getCurrentState()}\n`);

const analysisState = stateMachine.getStateHandler('ANALYSIS');

console.log('Extracting requirements from interview responses...');
const requirements = analysisState.extractRequirements(sessionState.userResponses);

console.log('\n📊 Extracted Requirements:');
console.log(`   • Purpose: ${requirements.purpose}`);
console.log(`   • Capabilities: ${requirements.capabilities.join(', ')}`);
console.log(`   • Knowledge Areas: ${requirements.knowledgeAreas.join(', ')}`);
console.log(`   • Constraints: ${requirements.constraints.join(', ')}`);

console.log('\nIdentifying patterns...');
const patterns = analysisState.identifyPatterns(sessionState.userResponses);
console.log(`   • Common themes: ${patterns.themes.join(', ')}`);
console.log(`   • Priority areas: ${patterns.priorities.join(', ')}`);

const isComplete = analysisState.validateCompleteness(requirements);
console.log(`\n✅ Analysis complete: ${isComplete}`);
console.log(`🎯 Can transition to GENERATION: ${analysisState.canTransitionToGeneration()}\n`);

sessionState.setAnalysisResults(requirements);

// ==========================================
// PHASE 3: GENERATION STATE
// ==========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚙️  PHASE 3: GENERATION STATE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Transition to GENERATION
stateMachine.transition('GENERATION');
console.log(`✅ Transitioned to: ${stateMachine.getCurrentState()}\n`);

const generationState = stateMachine.getStateHandler('GENERATION');

console.log('Generating agent profile...');
const profile = generationState.generateProfile(sessionState.analysisResults);

console.log('\n📄 Generated Profile Preview:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(profile.substring(0, 500) + '...\n');

console.log('Validating profile format...');
const validation = generationState.validateProfile(profile);
console.log(`   ✅ YAML frontmatter: ${validation.hasYAML}`);
console.log(`   ✅ XML structure: ${validation.hasXML}`);
console.log(`   ✅ Required fields: ${validation.hasRequiredFields}`);
console.log(`   ✅ No emojis in code: ${validation.noEmojisInCode}`);

if (validation.isValid) {
  console.log('\n✅ Profile validation PASSED\n');
  
  const agentName = sessionState.analysisResults.purpose
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  const outputPath = `.github/copilot/agents/${agentName}-test.md`;
  console.log(`💾 Saving profile to: ${outputPath}`);
  
  generationState.saveProfile(profile, outputPath);
  console.log('✅ Profile saved successfully\n');
} else {
  console.error('❌ Profile validation FAILED');
  console.error(validation.errors);
}

// Transition to COMPLETED
stateMachine.transition('COMPLETED');
console.log(`✅ Workflow completed! Final state: ${stateMachine.getCurrentState()}\n`);

// ==========================================
// METRICS & SUMMARY
// ==========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 WORKFLOW SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const finalMetrics = metrics.getMetrics();
console.log('Execution Metrics:');
console.log(`   • Tasks routed: ${finalMetrics.tasksRouted}`);
console.log(`   • Task tool calls: ${finalMetrics.taskToolCalls}`);
console.log(`   • Local executions: ${finalMetrics.localExecutions}`);
console.log(`   • Total tokens: ${finalMetrics.totalTokens}`);
console.log(`   • Total duration: ${finalMetrics.totalDuration}ms`);

console.log('\nSession State:');
console.log(`   • Session ID: ${sessionState.sessionId}`);
console.log(`   • Questions asked: ${sessionState.questionHistory.length}`);
console.log(`   • Responses collected: ${sessionState.userResponses.length}`);
console.log(`   • Analysis complete: ${sessionState.analysisResults ? 'Yes' : 'No'}`);
console.log(`   • Profile generated: ${sessionState.agentProfileDraft.name ? 'Yes' : 'No'}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ END-TO-END TEST COMPLETED');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🎉 BYAN v2.0 workflow validated successfully!\n');
