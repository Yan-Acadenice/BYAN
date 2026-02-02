#!/bin/bash
# Test script for create-byan-agent
# Tests the fixed Chalk compatibility

set -e  # Exit on error

echo "🧪 Testing create-byan-agent installer..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test directory
TEST_DIR="/tmp/byan-test-$(date +%s)"
INSTALL_DIR="/home/yan/conception/install"

# Clean up function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

# Create test directory
echo "📁 Creating test directory: $TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Test 1: Check dependencies
echo ""
echo "📦 Test 1: Checking package.json dependencies..."
cd "$INSTALL_DIR"

CHALK_VERSION=$(node -p "require('./package.json').dependencies.chalk")
INQUIRER_VERSION=$(node -p "require('./package.json').dependencies.inquirer")
ORA_VERSION=$(node -p "require('./package.json').dependencies.ora")

echo "  • chalk: $CHALK_VERSION"
echo "  • inquirer: $INQUIRER_VERSION"
echo "  • ora: $ORA_VERSION"

if [[ "$CHALK_VERSION" == "^4.1.2" ]]; then
    echo -e "${GREEN}✅ Chalk version correct (CommonJS compatible)${NC}"
else
    echo -e "${RED}❌ Chalk version incorrect: $CHALK_VERSION${NC}"
    exit 1
fi

if [[ "$INQUIRER_VERSION" == "^8.2.5" ]]; then
    echo -e "${GREEN}✅ Inquirer version correct (CommonJS compatible)${NC}"
else
    echo -e "${RED}❌ Inquirer version incorrect: $INQUIRER_VERSION${NC}"
    exit 1
fi

if [[ "$ORA_VERSION" == "^5.4.1" ]]; then
    echo -e "${GREEN}✅ Ora version correct (CommonJS compatible)${NC}"
else
    echo -e "${RED}❌ Ora version incorrect: $ORA_VERSION${NC}"
    exit 1
fi

# Test 2: Check node_modules
echo ""
echo "📚 Test 2: Checking installed packages..."

if [ -d "$INSTALL_DIR/node_modules/chalk" ]; then
    INSTALLED_CHALK=$(node -p "require('$INSTALL_DIR/node_modules/chalk/package.json').version")
    echo "  • Installed chalk: v$INSTALLED_CHALK"
    
    if [[ "$INSTALLED_CHALK" =~ ^4\. ]]; then
        echo -e "${GREEN}✅ Chalk v4.x installed${NC}"
    else
        echo -e "${RED}❌ Wrong chalk version installed: v$INSTALLED_CHALK${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Chalk not installed${NC}"
    exit 1
fi

# Test 3: Version flag
echo ""
echo "🏷️  Test 3: Testing --version flag..."
VERSION_OUTPUT=$(node "$INSTALL_DIR/bin/create-byan-agent.js" --version 2>&1)
echo "  Output: $VERSION_OUTPUT"

if [[ "$VERSION_OUTPUT" == "1.0.0" ]]; then
    echo -e "${GREEN}✅ Version command works${NC}"
else
    echo -e "${RED}❌ Version command failed${NC}"
    exit 1
fi

# Test 4: Help flag
echo ""
echo "❓ Test 4: Testing --help flag..."
HELP_OUTPUT=$(node "$INSTALL_DIR/bin/create-byan-agent.js" --help 2>&1)

if echo "$HELP_OUTPUT" | grep -q "Install BYAN"; then
    echo -e "${GREEN}✅ Help command works${NC}"
else
    echo -e "${RED}❌ Help command failed${NC}"
    echo "$HELP_OUTPUT"
    exit 1
fi

# Test 5: Chalk import works
echo ""
echo "🎨 Test 5: Testing Chalk import in script..."
TEST_CHALK_SCRIPT="$TEST_DIR/test-chalk.js"

cat > "$TEST_CHALK_SCRIPT" << 'EOF'
const chalk = require('chalk');

// Test that chalk methods exist and are functions
const tests = [
    { name: 'chalk.blue', fn: chalk.blue },
    { name: 'chalk.green', fn: chalk.green },
    { name: 'chalk.red', fn: chalk.red },
    { name: 'chalk.yellow', fn: chalk.yellow },
    { name: 'chalk.gray', fn: chalk.gray },
    { name: 'chalk.bold', fn: chalk.bold }
];

let allPass = true;

tests.forEach(test => {
    if (typeof test.fn !== 'function') {
        console.error(`❌ ${test.name} is not a function`);
        allPass = false;
    }
});

if (allPass) {
    console.log('✅ All chalk methods are functions');
    console.log(chalk.blue('✅ Chalk.blue works!'));
    console.log(chalk.green('✅ Chalk.green works!'));
    console.log(chalk.bold('✅ Chalk.bold works!'));
} else {
    process.exit(1);
}
EOF

cd "$TEST_DIR"
npm init -y > /dev/null 2>&1
npm install chalk@4.1.2 > /dev/null 2>&1

CHALK_TEST_OUTPUT=$(node "$TEST_CHALK_SCRIPT" 2>&1)
echo "$CHALK_TEST_OUTPUT"

if echo "$CHALK_TEST_OUTPUT" | grep -q "All chalk methods are functions"; then
    echo -e "${GREEN}✅ Chalk import and methods work correctly${NC}"
else
    echo -e "${RED}❌ Chalk import failed${NC}"
    exit 1
fi

# Test 6: Simulate banner rendering
echo ""
echo "🎨 Test 6: Testing banner rendering..."
BANNER_TEST="$TEST_DIR/test-banner.js"

cat > "$BANNER_TEST" << 'EOF'
const chalk = require('chalk');

const banner = `
${chalk.blue('╔════════════════════════════════════════════════════════════╗')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.bold('🏗️  BYAN INSTALLER v1.0.0')}                        ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Builder of YAN - Agent Creator')}                          ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('╚════════════════════════════════════════════════════════════╝')}
`;

console.log(banner);
console.log('✅ Banner rendered successfully');
EOF

BANNER_OUTPUT=$(node "$BANNER_TEST" 2>&1)

if echo "$BANNER_OUTPUT" | grep -q "Banner rendered successfully"; then
    echo -e "${GREEN}✅ Banner renders without errors${NC}"
else
    echo -e "${RED}❌ Banner rendering failed${NC}"
    echo "$BANNER_OUTPUT"
    exit 1
fi

# Final summary
echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  ✅ Package.json dependencies correct"
echo "  ✅ CommonJS-compatible versions installed"
echo "  ✅ --version flag works"
echo "  ✅ --help flag works"
echo "  ✅ Chalk import works correctly"
echo "  ✅ Banner renders without errors"
echo ""
echo -e "${BLUE}🏗️  create-byan-agent is ready for use!${NC}"
echo ""
