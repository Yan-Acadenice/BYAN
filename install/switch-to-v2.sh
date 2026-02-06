#!/bin/bash
# Switch BYAN Installer to v2.0
# This script updates package.json to use the new v2.0 installer

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Switch to BYAN v2.0 Installer                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "${SCRIPT_DIR}"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ package.json not found in ${SCRIPT_DIR}${NC}"
    exit 1
fi

# Backup original
echo -e "${YELLOW}[1/4] Creating backup...${NC}"
cp package.json package.json.backup
echo -e "${GREEN}✓ Backup created: package.json.backup${NC}"

# Show current version
echo ""
echo -e "${YELLOW}[2/4] Current configuration:${NC}"
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
CURRENT_BIN=$(grep '"create-byan-agent"' package.json | head -1 | cut -d'"' -f4)
echo "  Version: ${CURRENT_VERSION}"
echo "  Binary:  ${CURRENT_BIN}"

# Update package.json
echo ""
echo -e "${YELLOW}[3/4] Updating to v2.0...${NC}"

# Use Node.js to safely update JSON
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Update version
pkg.version = '2.0.0-alpha.1';

// Update description
pkg.description = 'NPX installer for BYAN v2.0 - Agent creators with v2.0 runtime support';

// Update bin
pkg.bin['create-byan-agent'] = 'bin/create-byan-agent-v2.js';

// Write back
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('✓ package.json updated');
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ package.json updated successfully${NC}"
else
    echo -e "${RED}✗ Failed to update package.json${NC}"
    echo -e "${YELLOW}Restoring backup...${NC}"
    mv package.json.backup package.json
    exit 1
fi

# Verify changes
echo ""
echo -e "${YELLOW}[4/4] Verifying changes...${NC}"
NEW_VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
NEW_BIN=$(grep '"create-byan-agent"' package.json | head -1 | cut -d'"' -f4)
echo "  New Version: ${NEW_VERSION}"
echo "  New Binary:  ${NEW_BIN}"

# Check if v2 installer exists
if [ -f "bin/create-byan-agent-v2.js" ]; then
    echo -e "${GREEN}✓ v2.0 installer found${NC}"
else
    echo -e "${RED}✗ v2.0 installer not found: bin/create-byan-agent-v2.js${NC}"
    exit 1
fi

# Set executable permissions
chmod +x bin/create-byan-agent-v2.js
echo -e "${GREEN}✓ Executable permissions set${NC}"

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Successfully switched to v2.0 installer                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Changes made:${NC}"
echo "  • Version: ${CURRENT_VERSION} → ${NEW_VERSION}"
echo "  • Binary:  ${CURRENT_BIN} → ${NEW_BIN}"
echo "  • Backup:  package.json.backup (preserved)"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Test the installer locally:"
echo "     ${BLUE}cd /tmp && mkdir test-project && cd test-project && git init${NC}"
echo "     ${BLUE}node ${SCRIPT_DIR}/bin/create-byan-agent-v2.js${NC}"
echo ""
echo "  2. Commit the changes:"
echo "     ${BLUE}git add package.json${NC}"
echo "     ${BLUE}git commit -m 'feat: upgrade to BYAN v2.0 installer'${NC}"
echo ""
echo "  3. Publish to npm (alpha):"
echo "     ${BLUE}npm publish --tag alpha${NC}"
echo ""
echo "  4. Test installation:"
echo "     ${BLUE}npx create-byan-agent@alpha${NC}"
echo ""

echo -e "${YELLOW}To rollback:${NC}"
echo "  ${BLUE}cp package.json.backup package.json${NC}"
echo ""

echo -e "${GREEN}Ready to deploy! 🚀${NC}"
