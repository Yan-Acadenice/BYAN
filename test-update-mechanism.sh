#!/bin/bash
# Test Integration Update Mechanism
# Validates that all update commands work correctly

set -e

echo "=========================================="
echo "BYAN Update Mechanism - Integration Test"
echo "=========================================="
echo ""

PROJECT_ROOT="/home/yan/BYAN"
cd "$PROJECT_ROOT"

# Test 1: Check command
echo "Test 1: Verification de version..."
node install/bin/create-byan-agent-v2.js check
echo "✓ Test 1 passed"
echo ""

# Test 2: Analyzer module
echo "Test 2: Module Analyzer..."
node -e "
const Analyzer = require('./update-byan-agent/lib/analyzer.js');
const analyzer = new Analyzer('.');

// Semver tests
const test1 = analyzer.compare('2.6.0', '2.6.1');
const test2 = analyzer.compare('2.6.1', '2.6.1');
const test3 = analyzer.compare('2.7.0', '2.6.1');

if (test1 !== -1) throw new Error('Semver test 1 failed');
if (test2 !== 0) throw new Error('Semver test 2 failed');
if (test3 !== 1) throw new Error('Semver test 3 failed');

console.log('  ✓ Semver comparison OK');
"
echo "✓ Test 2 passed"
echo ""

# Test 3: Backup module
echo "Test 3: Module Backup..."
node -e "
const Backup = require('./update-byan-agent/lib/backup.js');
const backup = new Backup('.');

backup.listBackups().then(backups => {
  console.log('  ✓ List backups OK (' + backups.length + ' found)');
}).catch(err => {
  throw new Error('Backup test failed: ' + err.message);
});
"
sleep 2
echo "✓ Test 3 passed"
echo ""

# Test 4: CustomizationDetector module
echo "Test 4: Module CustomizationDetector..."
node -e "
const CustomizationDetector = require('./update-byan-agent/lib/customization-detector.js');
const detector = new CustomizationDetector('.');

detector.detectCustomizations().then(customs => {
  console.log('  ✓ Detect customizations OK (' + customs.length + ' found)');
  customs.forEach(c => {
    console.log('    - ' + c.type + ': ' + c.path);
  });
}).catch(err => {
  throw new Error('Detector test failed: ' + err.message);
});
"
sleep 2
echo "✓ Test 4 passed"
echo ""

# Test 5: Update dry-run
echo "Test 5: Update dry-run..."
echo "Skipped (requires user interaction confirmation)"
echo "✓ Test 5 skipped"
echo ""

# Test 6: Syntax validation
echo "Test 6: Validation syntaxe JavaScript..."
node --check update-byan-agent/lib/analyzer.js
echo "  ✓ analyzer.js"
node --check update-byan-agent/lib/backup.js
echo "  ✓ backup.js"
node --check update-byan-agent/lib/customization-detector.js
echo "  ✓ customization-detector.js"
node --check update-byan-agent/bin/update-byan-agent.js
echo "  ✓ update-byan-agent.js"
node --check install/bin/create-byan-agent-v2.js
echo "  ✓ create-byan-agent-v2.js"
echo "✓ Test 6 passed"
echo ""

# Test 7: Package.json binaries
echo "Test 7: Verification binaires package.json..."
if grep -q "update-byan-agent" package.json; then
  echo "  ✓ update-byan-agent binary present"
else
  echo "  ✗ update-byan-agent binary missing"
  exit 1
fi
echo "✓ Test 7 passed"
echo ""

echo "=========================================="
echo "ALL TESTS PASSED"
echo "=========================================="
echo ""
echo "Ready for:"
echo "  1. npm version patch (2.6.1 -> 2.6.2)"
echo "  2. npm publish"
echo "  3. Test in production: npx create-byan-agent@latest"
echo ""
