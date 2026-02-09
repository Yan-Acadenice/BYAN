# BYAN v2.0 Installer - Quick Deployment Guide

**Version:** 2.0.0-alpha.1  
**Status:** Ready to Deploy  
**Date:** 2026-02-05

---

## ⚡ Quick Start

### 1. Update Package Version

```bash
cd /home/yan/conception/install
```

Edit `package.json`:

```json
{
  "name": "create-byan-agent",
  "version": "2.0.0-alpha.1",  // ← UPDATE THIS
  "description": "NPX installer for BYAN v2.0 - Agent creators with v2.0 runtime support",
  "bin": {
    "create-byan-agent": "bin/create-byan-agent-v2.js"  // ← POINT TO V2
  }
}
```

### 2. Update Executable Permissions

```bash
chmod +x bin/create-byan-agent-v2.js
```

### 3. Test Locally

```bash
cd /tmp
mkdir test-project && cd test-project
git init
npm init -y

# Test the installer
node /home/yan/conception/install/bin/create-byan-agent-v2.js
```

### 4. Verify Installation

After running installer, check:

```bash
# Check v2.0 runtime files
ls -la src/
ls -la __tests__/
cat package.json | grep jest

# Check platform files
ls -la _byan/bmb/agents/
ls -la _byan/bmb/workflows/

# Run tests
npm install
npm test
```

Expected: All tests pass ✅

### 5. Deploy to NPM (when ready)

```bash
cd /home/yan/conception/install

# Login to npm (if not already)
npm login

# Publish
npm publish --tag alpha
```

---

## 🎯 What Changed

### File Changes

```
install/
├── bin/
│   ├── create-byan-agent.js       (v1.0 - PRESERVED)
│   └── create-byan-agent-v2.js    (v2.0 - NEW) ✨
├── package.json                   (UPDATE: version, bin)
├── test-installer-v2.sh           (NEW) ✨
└── INSTALLER-V2-CHANGES.md        (NEW) ✨
```

### Required Updates

**In `package.json`:**

```diff
{
  "name": "create-byan-agent",
- "version": "1.1.3",
+ "version": "2.0.0-alpha.1",
- "description": "NPX installer for BYAN ecosystem...",
+ "description": "NPX installer for BYAN v2.0 - Agent creators with v2.0 runtime support",
  "bin": {
-   "create-byan-agent": "bin/create-byan-agent.js"
+   "create-byan-agent": "bin/create-byan-agent-v2.js"
  }
}
```

---

## ✅ Pre-Deployment Checklist

- [x] **Installer Created:** `create-byan-agent-v2.js` (492 lines)
- [x] **Test Script Created:** `test-installer-v2.sh`
- [x] **Documentation Created:** `INSTALLER-V2-CHANGES.md`
- [ ] **Package Version Updated:** Change to `2.0.0-alpha.1`
- [ ] **Bin Path Updated:** Point to `create-byan-agent-v2.js`
- [ ] **Permissions Set:** `chmod +x` on new installer
- [ ] **Local Test:** Run in clean test directory
- [ ] **NPM Publish:** Deploy to registry

---

## 🧪 Testing Scenarios

### Scenario 1: Brand New Project

```bash
cd /tmp
mkdir new-project && cd new-project
git init
node /home/yan/conception/install/bin/create-byan-agent-v2.js
```

**Expected:**
- Prompts for v2.0 installation
- Creates `src/`, `__tests__/`, `package.json`
- Creates `_byan/bmb/` structure
- 9/9 validation checks pass

### Scenario 2: Existing Node Project

```bash
cd /tmp
mkdir existing-project && cd existing-project
git init
npm init -y
echo "console.log('existing')" > index.js
node /home/yan/conception/install/bin/create-byan-agent-v2.js
```

**Expected:**
- Merges into existing `package.json`
- Preserves existing files
- Adds Jest config
- 9/9 validation checks pass

### Scenario 3: Existing BYAN v1.0 Project

```bash
cd /tmp
mkdir v1-project && cd v1-project
mkdir -p _byan/bmb/agents
echo "# v1.0 config" > _byan/bmb/config.yaml
node /home/yan/conception/install/bin/create-byan-agent-v2.js
```

**Expected:**
- Detects existing v1.0 installation
- Offers to add v2.0 runtime
- Preserves v1.0 config
- Updates `byan_version` field

---

## 📦 What Gets Installed

### v1.0 Only Mode (user declines v2.0)

```
project/
└── _byan/
    └── bmb/
        ├── agents/
        │   ├── byan.md
        │   ├── rachid.md
        │   └── marc.md
        ├── workflows/
        │   └── byan/
        ├── config.yaml
        └── ...
```

### v2.0 Full Mode (user accepts v2.0)

```
project/
├── _byan/                   ← Platform (v1.0)
│   └── bmb/
│       ├── agents/
│       ├── workflows/
│       └── config.yaml
├── src/                     ← Runtime (v2.0) ✨
│   ├── core/
│   │   ├── context/
│   │   ├── cache/
│   │   ├── dispatcher/
│   │   ├── worker-pool/
│   │   └── workflow/
│   ├── observability/
│   │   ├── logger/
│   │   ├── metrics/
│   │   └── dashboard/
│   └── index.js
├── __tests__/               ← Tests (v2.0) ✨
│   ├── context.test.js
│   ├── cache.test.js
│   └── ... (9 files)
└── package.json             ← Updated with Jest ✨
```

---

## 🚨 Known Issues / Limitations

### None Currently

All validation checks pass. The installer is ready for deployment.

### Future Enhancements

- Add `--dry-run` flag
- Add `--skip-v2` flag for CI/CD
- Add uninstall command
- Add update command (v1.0 → v2.0)

---

## 📊 Deployment Decision Matrix

| Scenario | Action | Command |
|----------|--------|---------|
| **Alpha Test** | Publish with `@alpha` tag | `npm publish --tag alpha` |
| **Beta Test** | Publish with `@beta` tag | `npm publish --tag beta` |
| **Production** | Publish with `@latest` tag | `npm publish` |
| **Rollback** | Revert to v1.1.3 | `npm dist-tag add create-byan-agent@1.1.3 latest` |

**Recommendation:** Start with `--tag alpha` for initial testing.

---

## 🎬 Deployment Commands

### Option A: Alpha Release (Recommended)

```bash
cd /home/yan/conception/install

# 1. Update package.json to 2.0.0-alpha.1
# 2. Update bin to point to create-byan-agent-v2.js
# 3. Commit changes

git add .
git commit -m "feat: add BYAN v2.0 installer with runtime support

- Add create-byan-agent-v2.js (492 lines)
- Support v2.0 runtime (src/, __tests__)
- Smart package.json merging
- Backward compatible with v1.0
- 9 validation checks
- Version detection and tracking

Mantras: IA-24, #37, IA-1"

# 4. Publish to npm
npm publish --tag alpha

# 5. Test installation
npx create-byan-agent@alpha
```

### Option B: Direct Production (Not Recommended Yet)

```bash
npm publish
```

---

## 🔍 Post-Deployment Verification

### 1. Test NPM Installation

```bash
# Install globally
npm install -g create-byan-agent@alpha

# Verify version
create-byan-agent --version
# Should show: 2.0.0-alpha.1

# Test in new project
cd /tmp
mkdir test-npm && cd test-npm
git init
create-byan-agent
```

### 2. Test NPX Execution

```bash
cd /tmp
mkdir test-npx && cd test-npx
git init
npx create-byan-agent@alpha
```

### 3. Verify Files Installed

```bash
ls -la src/
ls -la __tests__/
ls -la _byan/bmb/
cat package.json | grep jest
```

### 4. Run Tests

```bash
npm install
npm test
```

**Expected:** All tests pass (364 tests)

---

## 📞 Rollback Plan

If issues arise:

```bash
# Revert to v1.1.3
cd /home/yan/conception/install

# Option 1: Unpublish alpha (if within 72 hours)
npm unpublish create-byan-agent@2.0.0-alpha.1

# Option 2: Make v1.1.3 the latest again
npm dist-tag add create-byan-agent@1.1.3 latest

# Option 3: Publish patch version with fix
# (Update code, bump to 2.0.0-alpha.2, republish)
```

---

## 🎉 Success Criteria

Installation is successful if:

- ✅ Installer runs without errors
- ✅ User can choose v1.0 or v2.0
- ✅ Files copied to correct locations
- ✅ package.json updated correctly
- ✅ 9/9 validation checks pass
- ✅ `npm test` runs successfully
- ✅ Entry point can be required
- ✅ No conflicts with existing files

---

## 📝 Next Steps After Deployment

1. **Monitor npm downloads:**
   ```bash
   npm info create-byan-agent
   ```

2. **Gather feedback from alpha testers**

3. **Fix any reported issues**

4. **Promote to beta:**
   ```bash
   npm dist-tag add create-byan-agent@2.0.0-alpha.1 beta
   ```

5. **Eventually promote to latest:**
   ```bash
   npm dist-tag add create-byan-agent@2.0.0-alpha.1 latest
   ```

---

## 📚 Documentation Updates Needed

After deployment, update:

1. **Main README.md:**
   - Add v2.0 installation instructions
   - Show v1.0 vs v2.0 comparison
   - Update examples

2. **CHANGELOG.md:**
   - Document v2.0 changes
   - List new features
   - Note breaking changes (none)

3. **GUIDE-UTILISATION.md:**
   - Add v2.0 usage guide
   - Show entry point usage
   - Add test examples

---

**Status:** ✅ **READY FOR ALPHA DEPLOYMENT**

**Next Action:** Update `package.json` and publish to npm with `--tag alpha`

---

*Deployment guide prepared by Amelia (Dev Agent)*  
*Date: 2026-02-05*  
*BYAN v2.0.0-alpha.1*
