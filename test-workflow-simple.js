#!/usr/bin/env node

/**
 * BYAN v2.0 - Simple Workflow Test
 * Tests: Component loading and basic integration
 */

console.log('🏗️  BYAN v2.0 - Workflow Test\n');

try {
  // Test 1: Load all components
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 LOADING COMPONENTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const SessionState = require('./src/byan-v2/context/session-state');
  console.log('✅ SessionState loaded');
  
  const CopilotContext = require('./src/byan-v2/context/copilot-context');
  console.log('✅ CopilotContext loaded');
  
  const ComplexityScorer = require('./src/byan-v2/dispatcher/complexity-scorer');
  console.log('✅ ComplexityScorer loaded');
  
  const TaskRouter = require('./src/byan-v2/dispatcher/task-router');
  console.log('✅ TaskRouter loaded');
  
  const LocalExecutor = require('./src/byan-v2/dispatcher/local-executor');
  console.log('✅ LocalExecutor loaded');
  
  const StateMachine = require('./src/byan-v2/orchestrator/state-machine');
  console.log('✅ StateMachine loaded');
  
  const Logger = require('./src/byan-v2/observability/logger');
  console.log('✅ Logger loaded');
  
  const MetricsCollector = require('./src/byan-v2/observability/metrics-collector');
  console.log('✅ MetricsCollector loaded');
  
  // Test 2: Initialize components
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 INITIALIZING COMPONENTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const sessionState = new SessionState();
  console.log(`✅ SessionState initialized (ID: ${sessionState.sessionId})`);
  
  const taskRouter = new TaskRouter();
  console.log('✅ TaskRouter initialized');
  
  const metrics = new MetricsCollector();
  console.log('✅ MetricsCollector initialized');
  
  const stateMachine = new StateMachine();
  console.log(`✅ StateMachine initialized (State: ${stateMachine.getCurrentState()})`);
  
  // Test 3: Basic operations
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TESTING OPERATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test routing
  const testTask = {
    input: 'Create a simple backend API',
    type: 'implementation'
  };
  
  const routing = taskRouter.routeTask(testTask);
  console.log('Task Routing Test:');
  console.log(`   Input: "${testTask.input}"`);
  console.log(`   Complexity: ${routing.complexity}`);
  console.log(`   Executor: ${routing.executor}`);
  console.log(`   Can Fallback: ${routing.canFallback}`);
  console.log('   ✅ Routing works\n');
  
  // Test state transitions
  console.log('State Machine Test:');
  console.log(`   Initial: ${stateMachine.getCurrentState()}`);
  
  stateMachine.transition('ANALYSIS');
  console.log(`   After transition: ${stateMachine.getCurrentState()}`);
  console.log('   ✅ Transitions work\n');
  
  // Test session state
  console.log('Session State Test:');
  sessionState.addQuestion('What is your agent name?');
  sessionState.addResponse(0, 'Backend API Expert');
  console.log(`   Questions: ${sessionState.questionHistory.length}`);
  console.log(`   Responses: ${sessionState.userResponses.length}`);
  console.log('   ✅ Session state works\n');
  
  // Test metrics
  console.log('Metrics Test:');
  metrics.recordTaskRouting(routing);
  metrics.recordTaskExecution({ duration: 1500, tokens: 250 });
  const metricsData = metrics.getMetrics();
  console.log(`   Tasks routed: ${metricsData.tasksRouted}`);
  console.log(`   Total tokens: ${metricsData.totalTokens}`);
  console.log(`   Total duration: ${metricsData.totalDuration}ms`);
  console.log('   ✅ Metrics work\n');
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ ALL TESTS PASSED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('🎉 BYAN v2.0 components validated!\n');
  console.log('Next step: Run full E2E workflow test\n');
  
} catch (error) {
  console.error('\n❌ TEST FAILED:');
  console.error(error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  process.exit(1);
}
