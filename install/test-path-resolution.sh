#!/bin/bash
# Test script for BYAN installer bugfix validation
# Tests that all paths resolve correctly after the fix

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🧪 BYAN INSTALLER - PATH RESOLUTION TEST                ║"
echo "║      Validation des corrections de chemins               ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_path() {
  local name="$1"
  local path="$2"
  
  if [ -e "$path" ]; then
    echo -e "${GREEN}✓${NC} $name"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC} $name: NOT FOUND - $path"
    ((TESTS_FAILED++))
    return 1
  fi
}

# Base directory
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="$BASE_DIR/templates"

echo -e "${BLUE}Base directory:${NC} $BASE_DIR"
echo -e "${BLUE}Template directory:${NC} $TEMPLATE_DIR"
echo ""

# Test 1: Template directory exists
echo -e "${YELLOW}[TEST 1]${NC} Template Directory Structure"
test_path "templates/" "$TEMPLATE_DIR"
test_path "templates/_byan/" "$TEMPLATE_DIR/_bmad"
test_path "templates/_byan/bmb/" "$TEMPLATE_DIR/_byan/bmb"
test_path "templates/.github/" "$TEMPLATE_DIR/.github"
echo ""

# Test 2: Agent files exist
echo -e "${YELLOW}[TEST 2]${NC} Agent Files (_bmad/bmb/agents/)"
test_path "byan.md" "$TEMPLATE_DIR/_byan/bmb/agents/byan.md"
test_path "rachid.md" "$TEMPLATE_DIR/_byan/bmb/agents/rachid.md"
test_path "marc.md" "$TEMPLATE_DIR/_byan/bmb/agents/marc.md"
test_path "patnote.md" "$TEMPLATE_DIR/_byan/bmb/agents/patnote.md"
test_path "agent-builder.md" "$TEMPLATE_DIR/_byan/bmb/agents/agent-builder.md"
echo ""

# Test 3: Workflow files exist
echo -e "${YELLOW}[TEST 3]${NC} Workflow Files (_bmad/bmb/workflows/byan/)"
WORKFLOW_DIR="$TEMPLATE_DIR/_byan/bmb/workflows/byan"
test_path "workflows/byan/" "$WORKFLOW_DIR"
test_path "workflows/byan/data/" "$WORKFLOW_DIR/data"
test_path "workflows/byan/steps/" "$WORKFLOW_DIR/steps"
test_path "workflows/byan/templates/" "$WORKFLOW_DIR/templates"

# Count workflow files
if [ -d "$WORKFLOW_DIR" ]; then
  WORKFLOW_COUNT=$(find "$WORKFLOW_DIR" -type f -name "*.md" | wc -l)
  echo -e "${GREEN}✓${NC} Found $WORKFLOW_COUNT workflow files"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Workflow directory not found"
  ((TESTS_FAILED++))
fi
echo ""

# Test 4: GitHub agent stubs exist
echo -e "${YELLOW}[TEST 4]${NC} GitHub Agent Stubs (.github/agents/)"
GITHUB_AGENTS_DIR="$TEMPLATE_DIR/.github/agents"
test_path ".github/agents/" "$GITHUB_AGENTS_DIR"
test_path "bmad-agent-byan.md" "$GITHUB_AGENTS_DIR/bmad-agent-byan.md"
test_path "bmad-agent-rachid.md" "$GITHUB_AGENTS_DIR/bmad-agent-rachid.md"
test_path "bmad-agent-marc.md" "$GITHUB_AGENTS_DIR/bmad-agent-marc.md"

# Count stub files
if [ -d "$GITHUB_AGENTS_DIR" ]; then
  STUB_COUNT=$(find "$GITHUB_AGENTS_DIR" -type f -name "*.md" | wc -l)
  echo -e "${GREEN}✓${NC} Found $STUB_COUNT agent stub files"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} GitHub agents directory not found"
  ((TESTS_FAILED++))
fi
echo ""

# Test 5: Verify old paths DON'T exist (they were wrong)
echo -e "${YELLOW}[TEST 5]${NC} Verify Old (Incorrect) Paths Are Absent"
OLD_PATH_1="$TEMPLATE_DIR/bmb/agents"
OLD_PATH_2="$BASE_DIR/../.github/agents"

if [ ! -e "$OLD_PATH_1" ]; then
  echo -e "${GREEN}✓${NC} Old path NOT found (expected): templates/bmb/agents"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Old path still exists: $OLD_PATH_1"
  ((TESTS_FAILED++))
fi

if [ ! -e "$OLD_PATH_2" ]; then
  echo -e "${GREEN}✓${NC} Old path NOT found (expected): ../.github/agents"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Old path still exists: $OLD_PATH_2"
  ((TESTS_FAILED++))
fi
echo ""

# Test 6: Node.js path resolution simulation
echo -e "${YELLOW}[TEST 6]${NC} Node.js Path Resolution Simulation"
node -e "
const path = require('path');
const fs = require('fs');

const binDir = path.join('$BASE_DIR', 'bin');
const templateDir = path.join(binDir, '..', 'templates');
const agentsPath = path.join(templateDir, '_bmad', 'bmb', 'agents');
const workflowsPath = path.join(templateDir, '_bmad', 'bmb', 'workflows', 'byan');
const githubPath = path.join(templateDir, '.github', 'agents');

console.log('Simulated __dirname:', binDir);
console.log('Resolved templateDir:', path.resolve(templateDir));
console.log('');

const checks = [
  { name: 'Template dir', path: templateDir },
  { name: 'Agents path', path: agentsPath },
  { name: 'Workflows path', path: workflowsPath },
  { name: 'GitHub agents path', path: githubPath }
];

let passed = 0;
checks.forEach(check => {
  const exists = fs.existsSync(check.path);
  const symbol = exists ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m';
  console.log(symbol, check.name + ':', exists ? 'OK' : 'NOT FOUND');
  if (exists) passed++;
});

console.log('');
console.log('Node.js resolution:', passed + '/' + checks.length, 'paths valid');
process.exit(passed === checks.length ? 0 : 1);
"
NODE_TEST_RESULT=$?
if [ $NODE_TEST_RESULT -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Node.js path resolution test passed"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Node.js path resolution test failed"
  ((TESTS_FAILED++))
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     TEST SUMMARY                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Tests Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Tests Failed:${NC} $TESTS_FAILED"
echo ""

TOTAL=$((TESTS_PASSED + TESTS_FAILED))
PERCENT=$((TESTS_PASSED * 100 / TOTAL))

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                                                            ║${NC}"
  echo -e "${GREEN}║   ✅ ALL TESTS PASSED! ($PERCENT%)                              ║${NC}"
  echo -e "${GREEN}║      Path resolution is CORRECT                           ║${NC}"
  echo -e "${GREEN}║                                                            ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║                                                            ║${NC}"
  echo -e "${RED}║   ❌ TESTS FAILED ($PERCENT%)                                      ║${NC}"
  echo -e "${RED}║      Some paths are incorrect                             ║${NC}"
  echo -e "${RED}║                                                            ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 1
fi
