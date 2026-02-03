# YANSTALLER - Dependencies Justification

**Generated**: 2026-02-03  
**Architect**: Winston

---

## Production Dependencies

### 1. **inquirer** (^9.2.0)
- **Size**: 1.2 MB
- **Weekly Downloads**: 19M
- **Purpose**: Interactive CLI prompts (questions, checkboxes, confirmations)
- **Why**: Best-in-class CLI interaction library, rich features
- **Alternatives Considered**:
  - `prompts` (200KB, lighter but fewer features) - Rejected: Missing checkbox support
  - Native `readline` - Rejected: Too low-level, would require significant boilerplate

### 2. **fs-extra** (^11.2.0)
- **Size**: 200 KB
- **Weekly Downloads**: 50M
- **Purpose**: Enhanced file system operations (copy, ensureDir, remove)
- **Why**: Promisified fs + convenience methods (copy recursive, ensureDir)
- **Alternatives Considered**:
  - Native `fs/promises` - Rejected: No copy(), no ensureDir(), lots of boilerplate
  - `fs-jetpack` - Rejected: Similar features but less popular

### 3. **chalk** (^5.3.0)
- **Size**: 50 KB
- **Weekly Downloads**: 100M
- **Purpose**: Terminal colors and styling
- **Why**: Standard for colored CLI output, cross-platform
- **Alternatives Considered**:
  - `colors` - Rejected: Less maintained, extends String.prototype (bad practice)
  - ANSI escape codes manually - Rejected: Not cross-platform, too low-level

### 4. **ora** (^7.0.0)
- **Size**: 30 KB
- **Weekly Downloads**: 10M
- **Purpose**: Elegant terminal spinners
- **Why**: Visual feedback for long operations (detection, installation)
- **Alternatives Considered**:
  - `cli-spinner` - Rejected: Less features, not as elegant
  - Manual spinners - Rejected: Reinventing the wheel

### 5. **js-yaml** (^4.1.0)
- **Size**: 80 KB
- **Weekly Downloads**: 100M
- **Purpose**: YAML parsing and dumping
- **Why**: BYAN uses YAML for all configs, need to parse/generate
- **Alternatives Considered**:
  - `yaml` - Rejected: Larger (200KB), overkill for our needs
  - JSON instead of YAML - Rejected: BYAN standard is YAML

### 6. **commander** (^11.1.0)
- **Size**: 50 KB
- **Weekly Downloads**: 50M
- **Purpose**: CLI argument parsing and subcommands
- **Why**: Clean API, industry standard
- **Alternatives Considered**:
  - `yargs` - Rejected: More complex API, similar size
  - `minimist` - Rejected: Too minimal, would need wrapper logic

---

## DevDependencies

### 7. **jest** (^29.7.0)
- **Size**: 5 MB (dev only)
- **Weekly Downloads**: 40M
- **Purpose**: Testing framework
- **Why**: Industry standard, great mocking, coverage built-in
- **Alternatives Considered**:
  - `vitest` - Rejected: Requires Vite setup, overkill
  - `ava` - Rejected: Less ecosystem support

### 8. **eslint** (^8.55.0)
- **Size**: 3 MB (dev only)
- **Weekly Downloads**: 50M
- **Purpose**: Linting JavaScript
- **Why**: Standard linter, catches common errors
- **Alternatives Considered**:
  - `standard` - Rejected: Too opinionated, no config
  - `jshint` - Rejected: Less powerful than ESLint

### 9. **prettier** (^3.1.0)
- **Size**: 2 MB (dev only)
- **Weekly Downloads**: 30M
- **Purpose**: Code formatting
- **Why**: Consistent formatting, zero config
- **Alternatives Considered**:
  - ESLint formatting rules - Rejected: Prettier is better at formatting

---

## Bundle Size Analysis

**Total Production Dependencies**: ~1.6 MB

| Dependency | Size | % of Total |
|------------|------|------------|
| inquirer | 1.2 MB | 75% |
| fs-extra | 200 KB | 12.5% |
| chalk | 50 KB | 3% |
| js-yaml | 80 KB | 5% |
| commander | 50 KB | 3% |
| ora | 30 KB | 2% |

**Largest dependency**: inquirer (75% of bundle)
- Justified: Essential for CLI UX, no lightweight alternative with same features

**Install time estimate**: 5-10 seconds (6 deps only)

---

## Multi-OS Compatibility

| Dependency | Windows | Linux | macOS | Notes |
|------------|---------|-------|-------|-------|
| inquirer | ✅ | ✅ | ✅ | Cross-platform |
| fs-extra | ✅ | ✅ | ✅ | Handles path differences |
| chalk | ✅ | ✅ | ✅ | Auto-detects terminal support |
| ora | ✅ | ✅ | ✅ | Spinner works on all OS |
| js-yaml | ✅ | ✅ | ✅ | Pure JS, no native bindings |
| commander | ✅ | ✅ | ✅ | Pure JS |

**No native bindings** = No compilation needed = Faster installs

---

## Security

All dependencies checked via:
- `npm audit` (run in CI/CD)
- Snyk monitoring
- Dependabot alerts

**Current status**: 0 known vulnerabilities (as of 2026-02-03)

---

## Future Optimization Opportunities

### Option 1: Replace inquirer with prompts
- **Savings**: ~1 MB (from 1.2 MB to 200 KB)
- **Cost**: Loss of checkbox support, need custom implementation
- **Verdict**: **NOT WORTH IT** - UX > bundle size for CLI tool

### Option 2: Replace chalk + ora with simple console
- **Savings**: ~80 KB
- **Cost**: Ugly CLI output, no visual feedback
- **Verdict**: **NOT WORTH IT** - Professionalism matters

### Option 3: Lazy-load inquirer
- **Savings**: 0 MB (still downloads), but faster startup
- **Cost**: Complexity, weird UX (delay before first question)
- **Verdict**: **MAYBE** for v2

---

## Conclusion

**Total: 6 production dependencies, 1.6 MB**

This is **extremely lean** for a CLI tool:
- webpack-cli: ~10 MB
- create-react-app: ~100 MB
- vue-cli: ~50 MB

YANSTALLER is **10x lighter** than comparable tools. ✅

Mantra #37 (Ockham's Razor) respected: Only essential dependencies, no bloat.
