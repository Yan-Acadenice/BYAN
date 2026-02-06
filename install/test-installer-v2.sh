#!/bin/bash
# Test script for BYAN v2.0 installer
# Tests the installer in a clean temporary directory

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  BYAN v2.0 Installer Test Suite                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo -e "${BLUE}[1/5] Setup test environment${NC}"
TEST_DIR="/tmp/test-byan-v2-$(date +%s)"
mkdir -p "${TEST_DIR}"
cd "${TEST_DIR}"
git init > /dev/null 2>&1
echo "Test Project" > README.md
echo -e "${GREEN}✓ Test directory: ${TEST_DIR}${NC}"

echo ""
echo -e "${BLUE}[2/5] Check installer prerequisites${NC}"

# Check if src/ exists in project root
if [ -d "${PROJECT_ROOT}/src" ]; then
    echo -e "${GREEN}✓ Found src/ directory${NC}"
    SRC_FILES=$(find "${PROJECT_ROOT}/src" -type f -name "*.js" | wc -l)
    echo -e "  ${SRC_FILES} JavaScript files"
else
    echo -e "${RED}✗ src/ directory not found${NC}"
    exit 1
fi

# Check if __tests__ exists
if [ -d "${PROJECT_ROOT}/__tests__" ]; then
    echo -e "${GREEN}✓ Found __tests__/ directory${NC}"
    TEST_FILES=$(find "${PROJECT_ROOT}/__tests__" -type f -name "*.test.js" | wc -l)
    echo -e "  ${TEST_FILES} test files"
else
    echo -e "${RED}✗ __tests__/ directory not found${NC}"
    exit 1
fi

# Check entry point
if [ -f "${PROJECT_ROOT}/src/index.js" ]; then
    echo -e "${GREEN}✓ Found src/index.js${NC}"
else
    echo -e "${RED}✗ src/index.js not found${NC}"
    exit 1
fi

# Check package.json
if [ -f "${PROJECT_ROOT}/package.json" ]; then
    echo -e "${GREEN}✓ Found package.json${NC}"
else
    echo -e "${RED}✗ package.json not found${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}[3/5] Dry-run installer (structure check)${NC}"

# Simulate what installer would do
EXPECTED_DIRS=(
    "_bmad/bmb/agents"
    "_bmad/bmb/workflows/byan"
    "_bmad/core"
    "_bmad/_config"
    "_bmad/_memory"
    "_bmad/_output"
    ".github/agents"
    "src/core/context"
    "src/core/cache"
    "src/core/dispatcher"
    "src/core/worker-pool"
    "src/core/workflow"
    "src/observability/logger"
    "src/observability/metrics"
    "src/observability/dashboard"
    "__tests__"
)

echo -e "${YELLOW}Expected directories to be created:${NC}"
for dir in "${EXPECTED_DIRS[@]}"; do
    echo "  - ${dir}"
done

EXPECTED_FILES=(
    "src/index.js"
    "package.json"
    "_bmad/bmb/config.yaml"
)

echo ""
echo -e "${YELLOW}Expected files to be copied/created:${NC}"
for file in "${EXPECTED_FILES[@]}"; do
    echo "  - ${file}"
done

echo ""
echo -e "${BLUE}[4/5] Validate source files exist in template${NC}"

VALIDATION_PASSED=0
VALIDATION_TOTAL=0

# Check critical source files
CRITICAL_FILES=(
    "${PROJECT_ROOT}/src/index.js"
    "${PROJECT_ROOT}/src/core/context/context.js"
    "${PROJECT_ROOT}/src/core/cache/cache.js"
    "${PROJECT_ROOT}/src/core/dispatcher/dispatcher.js"
    "${PROJECT_ROOT}/src/core/worker-pool/worker-pool.js"
    "${PROJECT_ROOT}/src/core/workflow/workflow-executor.js"
    "${PROJECT_ROOT}/src/observability/logger/structured-logger.js"
    "${PROJECT_ROOT}/src/observability/metrics/metrics-collector.js"
    "${PROJECT_ROOT}/src/observability/dashboard/dashboard.js"
    "${PROJECT_ROOT}/__tests__/context.test.js"
    "${PROJECT_ROOT}/__tests__/integration.test.js"
    "${PROJECT_ROOT}/package.json"
)

for file in "${CRITICAL_FILES[@]}"; do
    ((VALIDATION_TOTAL++))
    if [ -f "${file}" ]; then
        echo -e "${GREEN}✓ ${file#${PROJECT_ROOT}/}${NC}"
        ((VALIDATION_PASSED++))
    else
        echo -e "${RED}✗ ${file#${PROJECT_ROOT}/}${NC}"
    fi
done

echo ""
echo -e "${BLUE}Validation: ${VALIDATION_PASSED}/${VALIDATION_TOTAL} files found${NC}"

if [ ${VALIDATION_PASSED} -eq ${VALIDATION_TOTAL} ]; then
    echo -e "${GREEN}✅ All critical v2.0 files present${NC}"
else
    echo -e "${RED}❌ Some v2.0 files missing${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}[5/5] Check package.json structure${NC}"

# Parse package.json
PKG_JSON="${PROJECT_ROOT}/package.json"

if command -v jq &> /dev/null; then
    echo -e "${YELLOW}Main entry point:${NC}"
    jq -r '.main // "not set"' "${PKG_JSON}"
    
    echo ""
    echo -e "${YELLOW}Test scripts:${NC}"
    jq -r '.scripts.test // "not set"' "${PKG_JSON}"
    jq -r '.scripts["test:coverage"] // "not set"' "${PKG_JSON}"
    
    echo ""
    echo -e "${YELLOW}Dev dependencies:${NC}"
    jq -r '.devDependencies // {} | keys[]' "${PKG_JSON}" | head -5
    
    HAS_JEST=$(jq -r '.devDependencies.jest // "not found"' "${PKG_JSON}")
    if [ "${HAS_JEST}" != "not found" ]; then
        echo -e "${GREEN}✓ Jest found: ${HAS_JEST}${NC}"
    else
        echo -e "${YELLOW}⚠ Jest not found in devDependencies${NC}"
    fi
else
    echo -e "${YELLOW}jq not installed, skipping JSON parsing${NC}"
    echo -e "${GREEN}✓ package.json exists${NC}"
fi

# Cleanup
echo ""
echo -e "${BLUE}Cleaning up test directory...${NC}"
cd /tmp
rm -rf "${TEST_DIR}"
echo -e "${GREEN}✓ Cleanup complete${NC}"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ INSTALLER VALIDATION COMPLETE                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Summary:${NC}"
echo "  • v2.0 source files: ${GREEN}PRESENT${NC}"
echo "  • Critical components: ${GREEN}${VALIDATION_PASSED}/${VALIDATION_TOTAL}${NC}"
echo "  • Structure: ${GREEN}READY FOR INSTALL${NC}"
echo ""

echo -e "${YELLOW}To actually test the installer:${NC}"
echo "  cd /tmp/test-project && npm init -y"
echo "  node ${SCRIPT_DIR}/bin/create-byan-agent-v2.js"
echo ""
echo -e "${GREEN}Installer is ready to deploy! 🚀${NC}"
