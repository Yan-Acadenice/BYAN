const ActiveListener = require('./src/byan-v2/orchestrator/active-listener');

console.log('=== ACTIVE LISTENER PERFORMANCE DEMO ===\n');

const mockState = { data: {} };
const mockLogger = { 
  info: () => {},
  warn: () => {},
  error: () => {}
};

const listener = new ActiveListener(mockState, mockLogger);

// Test 1: Basic reformulation
console.log('Test 1: Basic Reformulation');
const response1 = 'Um, like, I think we need, you know, a system that is being used by customers';
const result1 = listener.listen(response1);
console.log(`Original: "${response1}"`);
console.log(`Reformulated: "${result1.reformulated}"`);
console.log(`Clarity Score: ${result1.clarityScore.toFixed(3)}`);
console.log(`Processing Time: ${result1.processingTime}ms`);
console.log(`Performance: ${result1.processingTime < 100 ? '✓ PASS' : '✗ FAIL'} (< 100ms)\n`);

// Test 2: Complex sentence simplification
console.log('Test 2: Complex Sentence Simplification');
const response2 = 'In order to process orders due to the fact that customers need products at this point in time';
const result2 = listener.listen(response2);
console.log(`Original: "${response2}"`);
console.log(`Reformulated: "${result2.reformulated}"`);
console.log(`Processing Time: ${result2.processingTime}ms\n`);

// Test 3: Key points extraction
console.log('Test 3: Key Points Extraction');
const response3 = 'I need a system to manage customer orders. It should track inventory in real-time. The system must generate reports daily. Users need a simple interface. Performance is critical for 1000+ orders per day.';
const result3 = listener.listen(response3);
console.log(`Original: "${response3}"`);
console.log(`Key Points (${result3.keyPoints.length}):`);
result3.keyPoints.forEach((point, i) => console.log(`  ${i+1}. ${point}`));
console.log(`\nSummary: "${result3.summary}"`);
console.log(`Needs Validation: ${result3.needsValidation}\n`);

// Test 4: Validation workflow
console.log('Test 4: Validation Workflow (every 3 responses)');
console.log(`Response Count: ${listener.responseCount}`);
console.log(`Should validate on next? ${listener.needsValidation()}\n`);

// Test 5: Export session
console.log('Test 5: Session Export');
const exported = listener.export();
console.log(`Total Responses: ${exported.totalResponses}`);
console.log(`Average Clarity Score: ${exported.averageClarityScore.toFixed(3)}`);
console.log(`Validation Frequency: Every ${exported.validationFrequency} responses`);

// Performance benchmark
console.log('\n=== PERFORMANCE BENCHMARK ===');
const iterations = 100;
const times = [];
for (let i = 0; i < iterations; i++) {
  const start = Date.now();
  listener.listen(`Test response number ${i} with some complexity and details`);
  times.push(Date.now() - start);
}
const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
const maxTime = Math.max(...times);
console.log(`Iterations: ${iterations}`);
console.log(`Average Time: ${avgTime.toFixed(2)}ms`);
console.log(`Max Time: ${maxTime}ms`);
console.log(`Performance: ${avgTime < 100 && maxTime < 100 ? '✓ PASS' : '✗ FAIL'} (avg < 100ms)`);

console.log('\n=== ALL TESTS COMPLETED ===');
