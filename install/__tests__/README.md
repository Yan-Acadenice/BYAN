# YANSTALLER Test Suite

Complete test coverage for the YANSTALLER intelligent installer.

## Test Structure

```
__tests__/
├── recommender.test.js      # Unit tests for recommendation engine
├── installer.test.js        # Unit tests for installation module
├── platforms.test.js        # Unit tests for platform adapters
├── validator.test.js        # Unit tests for validation checks
├── integration.test.js      # Integration tests for module interactions
└── e2e.test.js              # End-to-end scenario tests
```

## Test Categories

### Unit Tests (75 tests)

**Recommender (18 tests)**
- `analyzePackageJson()` - Dependency analysis
- `detectProjectType()` - Frontend/Backend/Fullstack classification
- `detectFramework()` - Framework identification
- `getRecommendedAgents()` - Agent selection logic
- `generateRationale()` - Explanation generation

**Installer (13 tests)**
- `createBmadStructure()` - Directory creation
- `copyAgentFile()` - Agent template copying
- `generatePlatformStubs()` - Platform delegation
- `createModuleConfig()` - YAML config generation
- `install()` - Full orchestration

**Platforms (20 tests)**
- Copilot CLI stub generation
- VSCode integration
- Codex prompt creation
- Claude Code MCP server config
- Multi-platform consistency

**Validator (24 tests)**
- 10 validation checks (structure, agents, stubs, configs, etc.)
- Error vs warning classification
- Integration with installer

### Integration Tests (27 tests)

**Full Flow Testing**
- Detect → Recommend → Install → Validate pipeline
- Platform-aware recommendations
- Error propagation across modules
- Performance benchmarks

**Module Interactions**
- Detect → Recommend (platform detection used in recommendations)
- Recommend → Install (agent list installation)
- Install → Validate (error detection)

### E2E Tests (16 tests)

**Real-World Scenarios**
- Scenario 1: React frontend project
- Scenario 2: Express backend API
- Scenario 3: Next.js fullstack app
- Scenario 4: Corrupted installation detection
- Scenario 5: Multi-platform setup
- Scenario 6: Upgrade/repair workflows
- Scenario 7: Large agent set performance
- Scenario 8: Minimal vs Full installation modes

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suite
```bash
npm test recommender
npm test installer
npm test integration
npm test e2e
```

### Watch Mode
```bash
npm test -- --watch
```

### Coverage Report
```bash
npm test -- --coverage
```

## Test Conventions

### File Naming
- Unit tests: `{module}.test.js`
- Integration: `integration.test.js`
- E2E: `e2e.test.js`

### Test Structure
```javascript
describe('Module Name', () => {
  describe('functionName', () => {
    test('does something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Mocking
- File system operations use `fs-extra` in temp directories
- Platform detection may be mocked for deterministic tests
- External commands (Git, Node) use Jest mocks when needed

## Performance Benchmarks

| Operation | Expected Time | Test Timeout |
|-----------|---------------|--------------|
| Full flow | < 10 seconds | 30 seconds |
| 10 agents install | < 5 seconds | 15 seconds |
| Single validation | < 1 second | 5 seconds |
| Recommendation | < 500ms | 5 seconds |

## Test Coverage Goals

- **Unit Tests:** 90%+ line coverage
- **Integration Tests:** All module boundaries
- **E2E Tests:** All user workflows

## Known Limitations

1. **Platform Detection:** May vary by environment
   - Copilot CLI detection requires installation
   - Solution: Mock detection in tests

2. **Template Files:** Tests may fail if templates/ missing
   - Solution: Mock file system or skip template-dependent tests

3. **PowerShell Environment:** Jest execution requires PowerShell 6+
   - Workaround: Manual validation or use bash/cmd

## Adding New Tests

### For New Module
1. Create `__tests__/{module}.test.js`
2. Add unit tests for all exported functions
3. Add integration tests for interactions with other modules
4. Update this README

### For New Feature
1. Add unit tests in appropriate module test file
2. Add integration test if feature spans modules
3. Add E2E test if feature is user-facing
4. Update performance benchmarks if needed

## Debugging Tests

### View Detailed Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- -t "test name"
```

### Inspect Temp Files
Add this to your test:
```javascript
console.log('Temp dir:', tempDir);
await new Promise(r => setTimeout(r, 60000)); // Pause 1 min
```

## Mantras Applied

- **IA-24 Clean Code:** Self-documenting test names
- **#37 Ockham's Razor:** Simple, focused test cases
- **IA-1 Trust But Verify:** Tests validate all assumptions
- **#39 Consequences:** Edge cases and error paths covered

---

**Total Tests:** 118  
**Coverage:** Unit (75) + Integration (27) + E2E (16)  
**Status:** ✅ All modules tested
