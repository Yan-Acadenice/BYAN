# E2E Testing Guide - YANSTALLER

## Overview

The E2E (End-to-End) test suite validates the complete YANSTALLER installation flow automatically. This prevents critical bugs from reaching npm production.

## What It Tests

### Installation Flow (7 Steps)
1. ✅ **Detection** - Platform & project analysis
2. ✅ **Recommendations** - Agent recommendations based on stack
3. ✅ **Interview** - User preference collection (silent mode)
4. ✅ **Backup** - Optional backup creation (skipped in silent)
5. ✅ **Installation** - Full BMAD structure creation
6. ✅ **Validation** - 10 automated checks
7. ✅ **Wizard** - Post-install guidance (skipped in silent)

### Validation Checks
- ✅ `_bmad/` directory structure created
- ✅ Core directories exist (bmb, core, _config, _memory)
- ✅ Agent files installed correctly
- ✅ Configuration files generated with required fields
- ✅ Platform stubs created (.github/agents, .codex/prompts)
- ✅ All modules load without errors (smoke test)

## Usage

### Run E2E Test
```bash
npm run test:e2e
```

### Run Before Publish (Automatic)
```bash
npm publish
# Automatically runs test:e2e via prepublishOnly hook
```

### Run Manually
```bash
node test-e2e.js
```

## Test Environment

The E2E test:
1. Creates a **temporary directory** in OS temp folder
2. Initializes a **mock Node.js project** with package.json
3. Adds **Express + React** dependencies (triggers recommendations)
4. Runs **YANSTALLER in silent mode** (--silent --mode=minimal)
5. Validates **installation results**
6. **Cleans up** temporary directory

**No modification** to your actual project files.

## Exit Codes

- `0` - All tests passed ✅
- `1` - One or more tests failed ❌

## Output Example

```
🧪 YANSTALLER E2E TEST SUITE
Testing complete installation flow...

[============================================================]
STEP 1: Setup - Creating temporary test directory
[============================================================]

✓ Created temp dir: /tmp/yanstaller-e2e-test-1738615200000

[============================================================]
STEP 2: Setup - Initializing mock Node.js project
[============================================================]

✓ Created package.json (Express + React)

[============================================================]
STEP 3: Test - Running YANSTALLER installation
[============================================================]

Starting installation with --silent --mode=minimal...
✓ Installation completed without crash

[============================================================]
STEP 4: Test - Validating installation results
[============================================================]

✓ _bmad/ directory created
✓ Directory exists: _bmad/bmb/
✓ Directory exists: _bmad/core/
✓ Directory exists: _bmad/_config/
✓ Directory exists: _bmad/_memory/
✓ Agent installed: byan.md
✓ Agent installed: rachid.md
✓ Agent installed: dev.md
✓ Agent installed: tech-writer.md
✓ Config file created: bmb/config.yaml
✓ Config file has required fields
✓ Platform stub directory: .github/agents/
  └─ 4 stub file(s) created
⚠ Platform stub MISSING: .codex/prompts/ (may be expected)

[============================================================]
STEP 5: Test - Module smoke tests
[============================================================]

✓ Module loads: detector.js
✓ Module loads: recommender.js
✓ Module loads: installer.js
✓ Module loads: validator.js
✓ Module loads: troubleshooter.js
✓ Module loads: backuper.js
✓ Module loads: interviewer.js
✓ Module loads: wizard.js

[============================================================]
STEP 6: Cleanup - Removing temporary directory
[============================================================]

✓ Removed: /tmp/yanstaller-e2e-test-1738615200000

======================================================================
E2E TEST SUMMARY
======================================================================

Tests passed: 28
Tests failed: 0
Duration: 5.42s

✅ ALL E2E TESTS PASSED!
YANSTALLER is ready for npm publish.
```

## When Tests Fail

If E2E tests fail:

1. **Read the error output** - Shows exactly which test failed
2. **Check the stack trace** - Identifies the failing module/line
3. **Fix the bug** - Update the relevant module
4. **Re-run tests** - `npm run test:e2e`
5. **Only publish when tests pass** ✅

## Integration with npm publish

The `prepublishOnly` hook in package.json automatically runs E2E tests before every `npm publish`:

```json
{
  "scripts": {
    "prepublishOnly": "npm run test:e2e"
  }
}
```

**This prevents broken versions from reaching npm.**

## Adding New Tests

To add new test cases, edit `test-e2e.js`:

```javascript
// Test 4.X: Your new test
const yourTestPath = path.join(bmadDir, 'some', 'file.txt');
if (await fs.pathExists(yourTestPath)) {
  logSuccess('Your test passed');
  testsPassed++;
} else {
  logError('Your test failed');
  testsFailed++;
}
```

## Bugs Prevented

This E2E suite would have caught the v1.2.2 critical bugs:

- ❌ **Bug #1**: Recommender crash on `undefined.some()` → **Caught in STEP 3**
- ❌ **Bug #2**: Backup crash on wrong parameter → **Caught in STEP 3**
- ❌ **Bug #3**: Installation crash on undefined properties → **Caught in STEP 3/4**

**Result**: Zero broken releases on npm.

## Methodology

Built with **Merise Agile + TDD** principles:
- **Mantra IA-1**: Trust But Verify - Automated verification before release
- **Mantra #39**: Consequences Awareness - Test prevents production bugs
- **Test-Driven**: Write tests first, then code

## Maintenance

Run E2E tests:
- ✅ Before every `npm publish` (automatic)
- ✅ After fixing critical bugs
- ✅ When adding new YANSTALLER modules
- ✅ During major refactoring

**Keep tests updated** when adding new features or changing APIs.

---

**Made by Yan de Acadenice** | https://acadenice.fr/  
**Based on BMAD** | https://github.com/yanb94/byan
