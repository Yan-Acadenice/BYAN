# BYAN Validate Agent Workflow

**Workflow:** Comprehensive Agent Validation Against 64 Mantras  
**Duration:** 5-10 minutes  
**Methodology:** Merise Agile + TDD + Full Mantra Compliance

---

## OVERVIEW

Validate Agent checks agent specifications against:
- 64 Mantras (39 Conception + 25 AI Agents)
- BMAD compliance standards
- Merise Agile best practices
- All business rules (RG-*)

**When to Use:**
- After creating new agent (Quick Create or Full Interview)
- After editing existing agent
- Before deploying agent
- Regular quality audits
- Troubleshooting agent issues

**Output:**
- Validation report with pass/fail/warnings
- Compliance score (0-100%)
- Actionable recommendations
- Auto-fix suggestions where possible

---

## VALIDATION LEVELS

### Level 1: CRITICAL (Must Pass)
- Business rules violations (RG-*)
- BMAD format compliance
- Structural requirements
- Security issues

**Failure = Agent CANNOT be deployed**

### Level 2: IMPORTANT (Should Pass)
- Mantra compliance
- Best practices
- Documentation completeness
- Test coverage

**Failure = Agent CAN deploy but with warnings**

### Level 3: SUGGESTIONS (Nice to Have)
- Optimization opportunities
- Enhanced capabilities
- Additional use cases
- Improved documentation

**Failure = Recommendations only**

---

## WORKFLOW STEPS

### Step 1: Select Agent to Validate

```
"Which agent should I validate?

Available agents:
1. {agent_1} - [{status}] - Last validated: {date}
2. {agent_2} - [{status}] - Last validated: {date}
3. {agent_3} - [{status}] - Never validated
...

Agent number or name: ____
"
```

**Load agent:**
```python
agent_spec = AgentSpec.load(agent_id_or_name)
context = ProjectContext.load(agent_spec.context_id)
```

---

### Step 2: Run Validation Checks

**Progress indicator:**
```
"Validating agent: {agent_name}

Running validation checks:
[▓▓▓▓▓▓▓▓░░] 80% - Checking mantra compliance...

Checks completed:
✅ Business rules (RG-*)
✅ BMAD format compliance
✅ Structural requirements
⏳ Mantra compliance (39/39)
⏳ AI Agent mantras (25/25)
⏳ Best practices
⏳ Documentation
"
```

---

### Step 3: Business Rules Validation (CRITICAL)

#### RG-AGT-001: Unique Agent Name

```python
def validate_RG_AGT_001(agent_spec):
    existing = AgentSpec.find_by_name(agent_spec.agent_name)
    if existing and existing.id != agent_spec.id:
        return ValidationError(
            rule="RG-AGT-001",
            level="CRITICAL",
            message=f"Agent name '{agent_spec.agent_name}' already exists",
            fix="Choose a unique name"
        )
    
    # Validate kebab-case
    if not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', agent_spec.agent_name):
        return ValidationError(
            rule="RG-AGT-001",
            level="CRITICAL",
            message=f"Agent name must be kebab-case",
            current=agent_spec.agent_name,
            fix="Convert to kebab-case, e.g., 'backend-expert'"
        )
    
    return ValidationSuccess()
```

#### RG-AGT-002: Minimum 3 Capabilities

```python
def validate_RG_AGT_002(agent_spec):
    cap_count = len(agent_spec.capabilities)
    if cap_count < 3:
        return ValidationError(
            rule="RG-AGT-002",
            level="CRITICAL",
            message=f"Agent has only {cap_count} capabilities, minimum is 3",
            fix=f"Add {3 - cap_count} more capabilities"
        )
    return ValidationSuccess()
```

#### RG-AGT-003: Minimum 5 Mantras

```python
def validate_RG_AGT_003(agent_spec):
    mantra_count = len(agent_spec.mantras_applied)
    if mantra_count < 5:
        return ValidationWarning(
            rule="RG-AGT-003",
            level="IMPORTANT",
            message=f"Agent applies only {mantra_count} mantras, recommended minimum is 5",
            fix="Add more relevant mantras",
            suggestions=suggest_mantras(agent_spec)
        )
    return ValidationSuccess()
```

#### RG-AGT-004: Minimum 3 Use Cases

```python
def validate_RG_AGT_004(agent_spec):
    use_case_count = len(agent_spec.use_cases)
    if use_case_count < 3:
        return ValidationWarning(
            rule="RG-AGT-004",
            level="IMPORTANT",
            message=f"Agent has only {use_case_count} use cases, recommended minimum is 3",
            fix="Document more use cases to clarify agent value"
        )
    return ValidationSuccess()
```

#### RG-AGT-005: Valid Status Workflow

```python
def validate_RG_AGT_005(agent_spec):
    valid_statuses = ["draft", "validated", "deployed", "deprecated"]
    if agent_spec.status not in valid_statuses:
        return ValidationError(
            rule="RG-AGT-005",
            level="CRITICAL",
            message=f"Invalid status: {agent_spec.status}",
            valid_values=valid_statuses,
            fix="Set to valid status"
        )
    return ValidationSuccess()
```

---

### Step 4: Mantra Compliance Validation

**For each of 64 mantras, check if applied correctly:**

#### Conception Mantras (39)

**Mantra #1: Le Modèle Sert le Métier**
```python
def validate_mantra_01(agent_spec, context):
    # Check if agent knowledge includes business concepts
    business_concepts = context.glossaire.keys()
    agent_business = agent_spec.knowledge_business
    
    overlap = set(business_concepts) & set(agent_business)
    coverage = len(overlap) / len(business_concepts) if business_concepts else 0
    
    if coverage < 0.3:  # Less than 30% coverage
        return ValidationWarning(
            mantra=1,
            message="Agent has weak connection to business domain",
            coverage=f"{coverage*100:.0f}%",
            recommendation="Add more business concepts to knowledge_business"
        )
    return ValidationSuccess()
```

**Mantra #4: Fail Fast, Fail Visible**
```python
def validate_mantra_04(agent_spec):
    # Check if agent has error handling capabilities
    capabilities = [c['description'].lower() for c in agent_spec.capabilities]
    
    error_keywords = ['error', 'fail', 'exception', 'validate', 'check']
    has_error_handling = any(kw in cap for cap in capabilities for kw in error_keywords)
    
    if not has_error_handling and 4 in agent_spec.mantras_applied:
        return ValidationWarning(
            mantra=4,
            message="Agent claims Mantra #4 but has no error handling capabilities",
            recommendation="Add capability for error detection/handling"
        )
    return ValidationSuccess()
```

**Mantra #7: KISS (Keep It Simple)**
```python
def validate_mantra_07(agent_spec):
    # Check if agent is over-complicated
    cap_count = len(agent_spec.capabilities)
    
    if cap_count > 10:
        return ValidationWarning(
            mantra=7,
            message=f"Agent has {cap_count} capabilities - may violate KISS principle",
            recommendation="Consider splitting into multiple focused agents"
        )
    
    # Check role clarity
    role_words = len(agent_spec.role.split())
    if role_words > 20:
        return ValidationWarning(
            mantra=7,
            message="Agent role description is too complex",
            recommendation="Simplify role to one clear sentence"
        )
    
    return ValidationSuccess()
```

**Mantra #18: TDD is Not Optional**
```python
def validate_mantra_18(agent_spec):
    if 18 in agent_spec.mantras_applied:
        # Check if agent has test-related capabilities
        capabilities = [c['description'].lower() for c in agent_spec.capabilities]
        test_keywords = ['test', 'tdd', 'coverage', 'assertion']
        
        has_test_cap = any(kw in cap for cap in capabilities for kw in test_keywords)
        
        if not has_test_cap:
            return ValidationWarning(
                mantra=18,
                message="Agent claims TDD mantra but has no testing capabilities",
                recommendation="Add test generation or verification capability"
            )
    return ValidationSuccess()
```

**Mantra #37: Rasoir d'Ockham**
```python
def validate_mantra_37(agent_spec):
    # Always check for simplicity
    issues = []
    
    # Check capabilities count
    if len(agent_spec.capabilities) > 7:
        issues.append("Too many capabilities (>7) - prefer focused agent")
    
    # Check for overlapping capabilities
    caps = [c['description'] for c in agent_spec.capabilities]
    similar_pairs = find_similar_capabilities(caps)
    if similar_pairs:
        issues.append(f"Overlapping capabilities detected: {similar_pairs}")
    
    # Check for unnecessary complexity
    if len(agent_spec.mantras_applied) > 15:
        issues.append("Too many mantras (>15) - focus on most critical ones")
    
    if issues:
        return ValidationWarning(
            mantra=37,
            message="Agent violates Ockham's Razor (simplicity principle)",
            issues=issues,
            recommendation="Simplify agent by removing non-essential elements"
        )
    
    return ValidationSuccess()
```

**Mantra #39: Évaluation des Conséquences**
```python
def validate_mantra_39(agent_spec):
    # Check if agent is deployed without consequence evaluation
    if agent_spec.status == "deployed":
        if not agent_spec.consequences_evaluated:
            return ValidationError(
                mantra=39,
                level="CRITICAL",
                message="Agent deployed without consequences evaluation",
                fix="Run Edit Agent workflow to evaluate consequences"
            )
    return ValidationSuccess()
```

#### AI Agent Mantras (25)

**Mantra IA-1: Trust But Verify**
```python
def validate_mantra_IA_01(agent_spec):
    if 'IA-1' in agent_spec.mantras_applied:
        # Check if agent has validation capabilities
        capabilities = [c['description'].lower() for c in agent_spec.capabilities]
        validation_keywords = ['verify', 'validate', 'check', 'review', 'audit']
        
        has_validation = any(kw in cap for cap in capabilities for kw in validation_keywords)
        
        if not has_validation:
            return ValidationWarning(
                mantra='IA-1',
                message="Agent claims Trust But Verify but lacks validation capabilities",
                recommendation="Add verification/validation capability"
            )
    return ValidationSuccess()
```

**Mantra IA-16: Challenge Before Confirm**
```python
def validate_mantra_IA_16(agent_spec):
    if 'IA-16' in agent_spec.mantras_applied:
        # Check persona for challenging behavior
        persona_text = agent_spec.persona.lower()
        challenge_keywords = ['challenge', 'question', 'verify', 'validate', 'devil\'s advocate']
        
        has_challenge_behavior = any(kw in persona_text for kw in challenge_keywords)
        
        if not has_challenge_behavior:
            return ValidationWarning(
                mantra='IA-16',
                message="Agent claims Challenge Before Confirm but persona doesn't reflect challenging behavior",
                recommendation="Update persona to include questioning/challenging approach"
            )
    return ValidationSuccess()
```

**Mantra IA-23: No Emoji Pollution**
```python
def validate_mantra_IA_23(agent_spec):
    # Check for emojis in technical content
    emoji_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"  # emoticons
        u"\U0001F300-\U0001F5FF"  # symbols & pictographs
        u"\U0001F680-\U0001F6FF"  # transport & map symbols
        "]+", flags=re.UNICODE)
    
    issues = []
    
    # Check capabilities
    for cap in agent_spec.capabilities:
        if emoji_pattern.search(cap['description']):
            issues.append(f"Emoji in capability: {cap['description']}")
    
    # Check use cases
    for uc in agent_spec.use_cases:
        if emoji_pattern.search(uc['scenario']):
            issues.append(f"Emoji in use case: {uc['scenario']}")
    
    # Check persona (emojis allowed in communication, NOT in code examples)
    # This would require parsing persona for code blocks
    
    if issues:
        return ValidationError(
            mantra='IA-23',
            level="CRITICAL",
            message="Emoji pollution detected",
            violations=issues,
            fix="Remove all emojis from technical content"
        )
    
    return ValidationSuccess()
```

**Mantra IA-24: Clean Code = No Useless Comments**
```python
def validate_mantra_IA_24(agent_spec):
    # Check if agent generates clean code
    if 'IA-24' in agent_spec.mantras_applied:
        capabilities = [c['description'].lower() for c in agent_spec.capabilities]
        code_gen_keywords = ['generate', 'create', 'write', 'scaffold']
        
        generates_code = any(kw in cap and 'code' in cap 
                            for cap in capabilities 
                            for kw in code_gen_keywords)
        
        if generates_code:
            # Check if persona mentions clean code principles
            persona_text = agent_spec.persona.lower()
            if 'self-document' not in persona_text and 'clean code' not in persona_text:
                return ValidationWarning(
                    mantra='IA-24',
                    message="Agent generates code but doesn't emphasize clean code principles",
                    recommendation="Add clean code guidance to persona"
                )
    
    return ValidationSuccess()
```

---

### Step 5: BMAD Format Compliance

```python
def validate_byan_format(agent_spec):
    issues = []
    
    # Check required sections
    required_sections = [
        'agent',
        'activation',
        'persona',
        'menu'
    ]
    
    for section in required_sections:
        if not has_section(agent_spec.file_content, section):
            issues.append(f"Missing required section: {section}")
    
    # Check XML structure
    if not is_valid_xml_structure(agent_spec.file_content):
        issues.append("Invalid XML structure in agent definition")
    
    # Check menu format
    menu = extract_menu(agent_spec.file_content)
    if len(menu.items) < 3:
        issues.append("Menu must have at least 3 items (MH, CH, EXIT minimum)")
    
    # Check activation steps
    activation = extract_activation(agent_spec.file_content)
    if not activation.has_config_load:
        issues.append("Activation missing config load step (critical)")
    
    if issues:
        return ValidationError(
            category="BMAD Format",
            level="CRITICAL",
            message="BMAD format violations detected",
            violations=issues,
            fix="Review BMAD format standards"
        )
    
    return ValidationSuccess()
```

---

### Step 6: Generate Validation Report

```
"════════════════════════════════════════════════════
VALIDATION REPORT: {agent_name}
════════════════════════════════════════════════════

Agent: {agent_name}
Role: {role}
Status: {status}
Validation Date: {timestamp}

────────────────────────────────────────────────────
OVERALL SCORE: {score}/100 [{grade}]
────────────────────────────────────────────────────

Grade Legend:
A+ (95-100): Exemplary - No issues
A  (90-94):  Excellent - Minor suggestions only
B  (80-89):  Good - Few warnings
C  (70-79):  Acceptable - Multiple warnings
D  (60-69):  Needs improvement - Some errors
F  (<60):    Failing - Critical errors

────────────────────────────────────────────────────
CRITICAL ISSUES: {critical_count}
────────────────────────────────────────────────────
{list_critical_issues_with_fixes}

────────────────────────────────────────────────────
IMPORTANT WARNINGS: {warning_count}
────────────────────────────────────────────────────
{list_warnings_with_recommendations}

────────────────────────────────────────────────────
SUGGESTIONS: {suggestion_count}
────────────────────────────────────────────────────
{list_suggestions}

────────────────────────────────────────────────────
MANTRA COMPLIANCE: {mantra_score}%
────────────────────────────────────────────────────

Mantras Applied: {mantras_applied_count}
Mantras Validated: ✅ {pass_count} | ⚠️ {warning_count} | ❌ {fail_count}

Failed Mantras:
{list_failed_mantras_with_details}

────────────────────────────────────────────────────
BUSINESS RULES: {rules_status}
────────────────────────────────────────────────────

✅ RG-AGT-001: Agent name unique and valid
✅ RG-AGT-002: Capabilities count >= 3
⚠️  RG-AGT-003: Mantras count = 4 (recommend >= 5)
✅ RG-AGT-004: Use cases >= 3
✅ RG-AGT-005: Valid status workflow

────────────────────────────────────────────────────
RECOMMENDATIONS:
────────────────────────────────────────────────────

Priority 1 (Must Fix):
{must_fix_list}

Priority 2 (Should Fix):
{should_fix_list}

Priority 3 (Nice to Have):
{nice_to_have_list}

────────────────────────────────────────────────────
AUTO-FIX AVAILABLE: {autofix_available}
────────────────────────────────────────────────────

The following issues can be auto-fixed:
{list_autofix_candidates}

Run auto-fix? (yes/no): ____

════════════════════════════════════════════════════
"
```

---

### Step 7: Auto-Fix (Optional)

```
"Auto-fixing issues...

[▓▓▓▓░░░░░░] 40% - Fixing RG-AGT-003 (adding recommended mantras)...

Auto-fixes applied:
✅ Added 1 mantra to reach minimum (RG-AGT-003)
✅ Fixed agent name casing (RG-AGT-001)
✅ Removed emoji from capability description (IA-23)
✅ Added missing use case (RG-AGT-004)

Unable to auto-fix (manual review needed):
⚠️  Capability overlap detected - requires human decision
⚠️  Persona missing challenging behavior - requires rewrite

Re-running validation...
"
```

---

### Step 8: Export Validation Report

```
"Validation report saved to:
{output_folder}/validation-{agent_name}-{timestamp}.md

Would you like to:
1. Fix issues now (guided)
2. Deploy anyway (if no critical issues)
3. Export report and fix later
4. Return to menu

Choice: ____
"
```

---

## VALIDATION SCORING

```python
def calculate_score(validation_results):
    score = 100
    
    # Critical issues: -20 points each
    score -= len(validation_results.critical) * 20
    
    # Warnings: -5 points each
    score -= len(validation_results.warnings) * 5
    
    # Suggestions: -1 point each
    score -= len(validation_results.suggestions) * 1
    
    # Bonus for excellent compliance
    if validation_results.mantra_compliance >= 90:
        score += 5
    
    # Cap at 0-100
    return max(0, min(100, score))
```

**Grading:**
- A+ (95-100): Exemplary
- A (90-94): Excellent
- B (80-89): Good
- C (70-79): Acceptable
- D (60-69): Needs improvement
- F (<60): Failing

---

## SUCCESS CRITERIA

✅ All critical issues resolved
✅ Score >= 70% (Grade C or better)
✅ All business rules pass
✅ BMAD format valid
✅ No emoji pollution
✅ Validation report generated
✅ User aware of remaining issues

**For deployment:** Score >= 80% recommended (Grade B or better)

---

## COMPLETION

```
"Validation complete!

FINAL SCORE: {score}/100 [{grade}]
STATUS: {PASS/FAIL}

{if PASS:}
  Agent is ready for deployment.
  Generate files now? (yes/later): ____

{if FAIL:}
  Agent has critical issues and CANNOT be deployed.
  Fix issues with [EA] Edit Agent workflow.

Report saved to: {report_path}
"
```
