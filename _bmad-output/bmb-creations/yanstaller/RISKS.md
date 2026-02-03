# YANSTALLER - Risk Analysis & Mitigation

**Generated**: 2026-02-03  
**Architect**: Winston

---

## Risk Matrix

| Risk ID | Description | Probability | Impact | Severity | Mitigation |
|---------|-------------|-------------|--------|----------|------------|
| R-001 | Timeline optimistic (240h = 6 weeks) | 60% | High | **HIGH** | Add 20% buffer, parallelize tasks |
| R-002 | Multi-OS bugs (Windows path issues) | 40% | Medium | **MEDIUM** | Automated CI tests on 3 OS |
| R-003 | Platform APIs change (Copilot CLI) | 15% | Medium | **LOW** | Abstraction layer, version locking |
| R-004 | npm dependencies break | 10% | Low | **LOW** | Lock exact versions, test in CI |
| R-005 | Permission errors (sudo required) | 30% | Medium | **MEDIUM** | Detect early, guide user, fallback |
| R-006 | User confusion (complex UX) | 25% | High | **MEDIUM** | Extensive testing with beginners |
| R-007 | Data loss (overwrite without backup) | 5% | Critical | **MEDIUM** | Mandatory backup before overwrite |
| R-008 | Node version fragmentation | 20% | Low | **LOW** | Support Node 18+, fail fast |

---

## Detailed Risks & Mitigation

### R-001: Timeline Optimistic (240h)

**Description**: 240h (6 weeks for 2 devs) might be optimistic for 8 modules + tests.

**Probability**: 60% (MODERATE)

**Impact**: Delays release, unhappy users

**Mitigation**:
1. ✅ **Buffer time**: Add 20% contingency (240h → 288h = 7.2 weeks)
2. ✅ **Parallelize**: Phase 2-3 and 5-6 can run in parallel
3. ✅ **MVP first**: Launch with Minimal mode only (5 agents), add Full/Custom later
4. ✅ **Risk-based prioritization**: Core features (detect, install, validate) = Phase 0-4 (168h), rest = Phase 5-8 (72h) can be v1.1

**Fallback**: Ship MVP in 4 weeks (only detection + installation + validation)

---

### R-002: Multi-OS Bugs (Windows)

**Description**: Path handling, permissions, shell commands differ across OS.

**Probability**: 40% (MODERATE)

**Impact**: Installation fails on Windows or macOS

**Mitigation**:
1. ✅ **Use path.join()**: No string concatenation for paths
2. ✅ **fs-extra**: Handles OS differences automatically
3. ✅ **CI/CD matrix**: Test on Windows, Linux, macOS for every PR
4. ✅ **Early testing**: Test on all 3 OS from Day 1
5. ✅ **OS-specific utils**: Centralize OS detection in `os-detector.js`

**Fallback**: Release Linux/macOS first, Windows support in v1.1

---

### R-003: Platform APIs Change

**Description**: GitHub Copilot CLI or Claude Code change agent format.

**Probability**: 15% (LOW)

**Impact**: Installation breaks for that platform

**Mitigation**:
1. ✅ **Abstraction layer**: `lib/platforms/*.js` isolates platform logic
2. ✅ **Version locking**: Document supported versions
3. ✅ **Backward compatibility**: Keep old format support for 2 versions
4. ✅ **Community monitoring**: Watch GitHub issues, Discord for platform changes

**Fallback**: Disable broken platform temporarily, fix in patch release

---

### R-004: npm Dependencies Break

**Description**: Dependency update breaks YANSTALLER.

**Probability**: 10% (LOW)

**Impact**: Installation fails

**Mitigation**:
1. ✅ **Exact versions**: Use exact versions in package.json (no ^)
2. ✅ **Lockfile**: Commit package-lock.json
3. ✅ **Dependabot**: Auto-PR for security updates
4. ✅ **CI tests**: Run tests before merging any dependency update

**Fallback**: Revert to previous version immediately

---

### R-005: Permission Errors

**Description**: User lacks write permissions for .github/ or _bmad/.

**Probability**: 30% (MODERATE)

**Impact**: Installation fails with cryptic error

**Mitigation**:
1. ✅ **Early detection**: Check write permissions before starting (Fail Fast)
2. ✅ **Clear error messages**: "Permission denied. Run with sudo? (y/n)"
3. ✅ **Guided fix**: Show OS-specific instructions (chmod, icacls)
4. ✅ **Fallback paths**: Offer alternative location if default fails

**Fallback**: Prompt user to run with elevated permissions

---

### R-006: User Confusion (UX)

**Description**: Beginners don't understand prompts, installation fails silently.

**Probability**: 25% (MODERATE)

**Impact**: Frustrated users, bad reviews

**Mitigation**:
1. ✅ **Clear prompts**: Simple language, examples
2. ✅ **Progress indicators**: Spinners + percentage
3. ✅ **Success/failure messages**: Explicit outcomes
4. ✅ **Troubleshooting guide**: Built-in help
5. ✅ **Beta testing**: Test with 10 beginners before release

**Fallback**: Create video tutorial, improve docs based on feedback

---

### R-007: Data Loss (Overwrite)

**Description**: User has custom _bmad/, YANSTALLER overwrites without backup.

**Probability**: 5% (LOW)

**Impact**: **CRITICAL** - User loses work

**Mitigation**:
1. ✅ **Mandatory backup**: ALWAYS backup before overwrite (RG-YAN-003)
2. ✅ **Confirmation prompt**: "Overwrite existing _bmad/? (Backup will be created)"
3. ✅ **Rollback capability**: Keep backup for 7 days, offer restore
4. ✅ **Diff preview**: Show what will change

**Fallback**: If backup fails, abort installation (no exceptions)

---

### R-008: Node Version Fragmentation

**Description**: Users have Node 14 or 16, installation fails.

**Probability**: 20% (LOW-MODERATE)

**Impact**: Installation blocked

**Mitigation**:
1. ✅ **Fail fast**: Check Node version FIRST (Mantra #4)
2. ✅ **Clear error message**: "Node 18+ required. You have 16.20. Upgrade instructions: [link]"
3. ✅ **OS-specific upgrade guide**: Windows (nvm-windows), macOS (nvm), Linux (nvm)
4. ✅ **Graceful exit**: Exit code 1 with actionable message

**Fallback**: None - Node 18+ is hard requirement (LTS since 2022)

---

## Risk Timeline

```
Week 1-2: [HIGH RISK] - Setup + Architecture
  Risks: R-002 (multi-OS), R-008 (Node version)
  
Week 3-4: [MEDIUM RISK] - Detection + Installation
  Risks: R-002 (multi-OS), R-005 (permissions)
  
Week 5-6: [LOW RISK] - Validation + Polish
  Risks: R-006 (UX), R-001 (timeline)
```

---

## Critical Path Analysis

**Longest dependencies chain**: 
Setup → Detection → Recommendation → Installation → Validation → QA

**Cannot parallelize**: These 6 phases must be sequential.

**Can parallelize**:
- Phase 2 (Recommender) + Phase 6 (Backuper) - Independent
- Phase 5 (Troubleshooter) + Phase 7 (Wizard) - Independent
- Tests can start as soon as modules are stubbed

---

## Contingency Plans

### Plan A: FULL v1.0 (240h, 6 weeks)
- All 8 capabilities
- 3 modes (Full/Minimal/Custom)
- 4 platforms
- Multi-OS

### Plan B: CORE MVP (168h, 4.2 weeks)
- 5 capabilities: Detect, Recommend, Install, Validate, Troubleshoot
- 1 mode: Minimal only (5 agents)
- 2 platforms: Copilot CLI + VSCode
- Multi-OS

### Plan C: EMERGENCY MVP (120h, 3 weeks)
- 3 capabilities: Detect, Install, Validate
- 1 mode: Minimal only
- 1 platform: Copilot CLI only
- Linux/macOS only (Windows = v1.1)

**Decision trigger**: 
- If Week 4 progress < 60% → Switch to Plan B
- If Week 5 progress < 40% → Switch to Plan C

---

## Lessons from Similar Projects

### create-react-app
- **Lesson**: Over-engineered, too many options
- **Apply**: Keep YANSTALLER simple, Minimal mode default

### vue-cli
- **Lesson**: Great UX with prompts and spinners
- **Apply**: Use inquirer + ora for polish

### degit (Rich Harris)
- **Lesson**: Ultra-simple, just works
- **Apply**: Ockham's Razor (#37) - No features "just in case"

---

## Monitoring & Metrics

Post-launch metrics to track risks:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Installation success rate | > 95% | < 90% |
| Average installation time | < 10 min | > 15 min |
| Multi-OS success rate | > 90% each | < 80% any OS |
| Permission errors | < 5% | > 10% |
| User satisfaction (survey) | > 4/5 | < 3.5/5 |

---

## Conclusion

**Overall Risk Level**: **MEDIUM** (manageable with mitigations)

**Highest Risks**:
1. R-001: Timeline (60% prob) - Mitigated with buffer + MVP fallback
2. R-002: Multi-OS (40% prob) - Mitigated with CI + early testing
3. R-005: Permissions (30% prob) - Mitigated with early detection + guidance

**Confidence Level**: 75% for on-time delivery of FULL v1.0

**Recommendation**: Proceed with Plan A (FULL v1.0), but have Plan B ready if week 4 progress < 60%.

---

**Mantras Applied**:
- #39: Consequences evaluation → This document
- #4: Fail Fast → Node version check, permission check
- IA-1: Trust But Verify → CI tests on 3 OS, beta testing
