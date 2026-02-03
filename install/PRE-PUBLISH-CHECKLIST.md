# Pre-Publish Checklist - YANSTALLER

## Automated Guards

### E2E Test (Mandatory)
```bash
npm run test:e2e
```

**Automatically runs before `npm publish` via `prepublishOnly` hook.**

Tests:
- ✅ Complete installation flow (7 steps)
- ✅ Directory structure validation
- ✅ Agent file installation
- ✅ Configuration generation
- ✅ Platform stub creation
- ✅ Module smoke tests

**If tests fail, publish is blocked.** ✋

---

## Manual Checklist (Before Commit)

### 1. Version Bump ✅
```bash
# Update version in:
- package.json
- bin/create-byan-agent.js (YANSTALLER_VERSION constant)
- README.md (badge)
- README-YANSTALLER.md (badge)
- CHANGELOG.md (new section)
```

### 2. Update CHANGELOG.md ✅
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features...

### Fixed
- Bug fixes...

### Changed
- Breaking changes...
```

### 3. Test Locally ✅
```bash
# Test in current project
npm start

# Test in new directory
cd /tmp && mkdir test-install && cd test-install
npx /path/to/yanstaller
```

### 4. Run Unit Tests ✅
```bash
npm test
```

### 5. Run E2E Tests ✅
```bash
npm run test:e2e
```

### 6. Check Git Status ✅
```bash
git status
git diff
```

---

## Git Workflow

### Commit
```bash
git add .
git commit -m "type: description

- Detail 1
- Detail 2
- Detail 3"
```

**Commit types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `refactor:` - Code refactoring
- `test:` - Add/update tests
- `chore:` - Maintenance (deps, config)

### Tag
```bash
git tag vX.Y.Z
```

### Push
```bash
git push origin main
git push origin vX.Y.Z
```

---

## NPM Publish

### Final Checks
1. ✅ All tests pass (`npm run test:e2e`)
2. ✅ CHANGELOG.md updated
3. ✅ Version bumped in all files
4. ✅ Git committed & tagged
5. ✅ Git pushed to remote

### Publish
```bash
npm publish
```

**E2E tests run automatically before publish.**

### Verify
```bash
npm view create-byan-agent version
npm view create-byan-agent
```

### Test Published Version
```bash
cd /tmp
npx create-byan-agent@X.Y.Z
```

---

## Rollback (If Emergency)

### Deprecate Broken Version
```bash
npm deprecate create-byan-agent@X.Y.Z "Critical bug - use X.Y.Z+1 instead"
```

### Publish Fix ASAP
```bash
# Fix bugs
# Bump patch version
# Run tests
npm publish
```

---

## Prevention

### Before Every Publish
- ✅ **ALWAYS** run `npm run test:e2e`
- ✅ **NEVER** skip tests
- ✅ **NEVER** publish without testing locally
- ✅ **ALWAYS** update CHANGELOG.md
- ✅ **ALWAYS** verify on npm after publish

### Mantras Applied
- **Mantra IA-1**: Trust But Verify - Automated tests catch bugs
- **Mantra #39**: Consequences Awareness - Test prevents production issues
- **Mantra IA-24**: Clean Code - Self-documenting, minimal comments

---

**Made by Yan de Acadenice** | https://acadenice.fr/  
**Based on BMAD** | https://github.com/yanb94/byan
