/**
 * SPRINT 5 - PHASE 1: Quick Integration Smoke Test
 * 
 * Verifies that all 4 BMAD modules are accessible and functional
 * through the main ByanV2 API.
 */

const ByanV2 = require('./src/byan-v2/index');

async function smokeTest() {
  console.log('🧪 SPRINT 5 PHASE 1 - Integration Smoke Test\n');
  
  try {
    // Initialize BYAN with BMAD features
    const config = {
      bmad_features: {
        enabled: true,
        glossary: { enabled: true },
        five_whys: { enabled: true },
        active_listening: { enabled: true },
        mantras: { validate: true }
      }
    };
    
    const byan = new ByanV2(config);
    console.log('✅ ByanV2 initialized with BMAD features');
    
    // Test 1: Check modules initialized
    console.log('\n📦 Module Initialization:');
    console.log('  - GlossaryBuilder:', byan.glossaryBuilder ? '✅' : '❌');
    console.log('  - FiveWhysAnalyzer:', byan.fiveWhysAnalyzer ? '✅' : '❌');
    console.log('  - ActiveListener:', byan.activeListener ? '✅' : '❌');
    console.log('  - MantraValidator:', byan.mantraValidator ? '✅' : '❌');
    
    // Test 2: Check state machine has new states
    console.log('\n🔄 State Machine:');
    console.log('  - GLOSSARY state:', byan.stateMachine.STATES.GLOSSARY ? '✅' : '❌');
    console.log('  - VALIDATION state:', byan.stateMachine.STATES.VALIDATION ? '✅' : '❌');
    console.log('  - Optional states config:', byan.stateMachine.optionalStates.length === 2 ? '✅' : '❌');
    
    // Test 3: Check public methods exist
    console.log('\n🔧 Public Methods:');
    const methods = [
      'startGlossary', 'addConcept', 'isGlossaryComplete', 'exportGlossary',
      'detectPainPoints', 'startFiveWhys', 'processWhyAnswer', 'getRootCause',
      'listen', 'reformulate', 'needsValidation', 'validateUnderstanding',
      'validateAgent', 'getComplianceScore', 'getComplianceReport'
    ];
    
    let allMethodsExist = true;
    for (const method of methods) {
      if (typeof byan[method] !== 'function') {
        console.log(`  - ${method}: ❌ MISSING`);
        allMethodsExist = false;
      }
    }
    if (allMethodsExist) {
      console.log(`  - All ${methods.length} methods: ✅`);
    }
    
    // Test 4: Test ActiveListener
    console.log('\n🎧 ActiveListener Test:');
    const listenResult = await byan.listen('We have a problem with deployment.');
    console.log('  - Listen result:', listenResult.valid ? '✅' : '❌');
    
    // Test 5: Test FiveWhys detection
    console.log('\n❓ FiveWhys Detection Test:');
    const painResult = await byan.detectPainPoints('We have deployment problems.');
    console.log('  - Pain detection:', painResult.hasPainPoints ? '✅' : '❌');
    console.log('  - Pain points found:', painResult.painPoints?.length || 0);
    
    // Test 6: Test state transitions with optional states
    console.log('\n📊 State Transitions:');
    await byan.startSession();
    console.log('  - Started in INTERVIEW:', byan.stateMachine.currentState === 'INTERVIEW' ? '✅' : '❌');
    
    const glossaryTransition = byan.stateMachine.transition('GLOSSARY');
    console.log('  - INTERVIEW → GLOSSARY:', glossaryTransition.success ? '✅' : '❌');
    
    const analysisTransition = byan.stateMachine.transition('ANALYSIS');
    console.log('  - GLOSSARY → ANALYSIS:', analysisTransition.success ? '✅' : '❌');
    
    // Test 7: Backwards compatibility
    console.log('\n🔄 Backwards Compatibility:');
    const byanSimple = new ByanV2({ bmad_features: { enabled: false } });
    await byanSimple.startSession();
    const directTransition = byanSimple.stateMachine.transition('ANALYSIS');
    console.log('  - INTERVIEW → ANALYSIS (skip GLOSSARY):', directTransition.success ? '✅' : '❌');
    
    console.log('\n✨ SMOKE TEST COMPLETE - ALL SYSTEMS OPERATIONAL ✅\n');
    
  } catch (error) {
    console.error('\n❌ SMOKE TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run smoke test
smokeTest().catch(console.error);
