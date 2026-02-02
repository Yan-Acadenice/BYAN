# BYAN Edit Agent Workflow

**Workflow:** Edit Existing Agent with Consequences Evaluation  
**Duration:** 10-20 minutes  
**Methodology:** Merise Agile + TDD + Mantra #39 (Consequences)

---

## OVERVIEW

Edit Agent workflow allows modification of existing agents while evaluating consequences of changes.

**Mantras Applied:**
- **Mantra #39: Chaque Action a des Conséquences** (PRIMARY)
- Mantra IA-16: Challenge Before Confirm
- Mantra #37: Rasoir d'Ockham (don't over-complicate)
- Mantra IA-1: Trust But Verify

**Key Principle:**
> "Before changing ANYTHING, evaluate what breaks, what improves, and what remains uncertain."

---

## WORKFLOW STEPS

### Step 1: Select Agent to Edit

```
"Which agent do you want to edit?

Available agents:
{list_all_agents_with_status}

1. {agent_1} - {role} [{status}]
2. {agent_2} - {role} [{status}]
3. {agent_3} - {role} [{status}]
...

Agent number or name: ____
"
```

**Load agent:**
```python
agent_spec = AgentSpec.load(agent_id_or_name)

# Check if deployed
if agent_spec.status == "deployed":
    print(f"⚠️  WARNING: This agent is DEPLOYED (actively used).")
    print(f"Editing deployed agents can have immediate consequences.")
    print(f"Proceed with caution? (yes/no): ")
```

**Display current agent:**
```
"CURRENT AGENT SPEC:

NAME: {agent_name}
ROLE: {role}
STATUS: {status}
CREATED: {created_at}
LAST MODIFIED: {updated_at}

CAPABILITIES ({n}):
  1. {capability_1}
  2. {capability_2}
  ...

MANTRAS ({n}):
  - Mantra #{id}: {name}
  ...

KNOWLEDGE:
  Business: {business_concepts}
  Technical: {technical_stack}

COMMUNICATION STYLE: {style}

USE CASES ({n}):
  1. {use_case_1}
  ...

What would you like to edit?"
```

---

### Step 2: Select What to Edit

```
"What needs editing?

1. Agent name (⚠️ BREAKING CHANGE)
2. Role/responsibilities
3. Add capability
4. Remove capability (⚠️ BREAKING CHANGE)
5. Modify capability
6. Add mantra
7. Remove mantra
8. Change communication style
9. Add use case
10. Update knowledge (business/technical)
11. Everything (guided full review)
12. Cancel

Choice: ____
"
```

**Breaking changes flagged:**
- Agent name change → All references break
- Capability removal → Users relying on it affected
- Major role change → Behavior changes significantly

---

### Step 3: Make Changes (with Consequences)

#### 3.1: EDIT AGENT NAME (⚠️ CRITICAL)

```
"⚠️  CHANGING AGENT NAME IS A BREAKING CHANGE!

CURRENT NAME: {current_name}

CONSEQUENCES OF RENAMING:
❌ All file references to this agent break
❌ User workflows mentioning agent by name break
❌ Documentation must be updated
❌ CLI commands using old name fail
❌ Integration tests mentioning agent fail

SCOPE: High
DATA: Medium (file renames required)
CODE: Medium (references update)
TEAM: High (everyone must be notified)
DEPENDENCIES: High (all agent consumers affected)

RISK LEVEL: 🔥 CRITICAL

Still want to rename? (yes/no): ____
"
```

**If yes:**
```
"New agent name (kebab-case): ____

MITIGATION PLAN:
1. Create backup of current agent
2. Rename agent spec
3. Update all file references
4. Create redirect/alias from old name (temporary)
5. Notify all team members
6. Update documentation
7. Schedule old name deprecation (30 days)

Confirm mitigation plan? (yes/no): ____
"
```

**Validate new name:**
- Must be kebab-case
- Must be unique (RG-AGT-001)
- Must not conflict with reserved names

#### 3.2: EDIT ROLE/RESPONSIBILITIES

```
"CURRENT ROLE: {current_role}

New role (or press Enter to keep): ____
"
```

**If changed:**
```
"Role changed from:
  OLD: {old_role}
  NEW: {new_role}

CONSEQUENCES:
📊 SCOPE: Medium (agent behavior may shift)
👥 TEAM: Medium (user expectations change)
📝 CODE: Low (mostly documentation)

⚠️  Users may expect different behavior from this agent.

Recommendation: Add changelog note explaining why role changed.

Proceed? (yes/no): ____
"
```

#### 3.3: ADD CAPABILITY

```
"Add new capability:

Capability description: ____
Category (create/analyze/review/optimize/teach): ____
"
```

**Consequences (usually LOW risk):**
```
"Adding capability: {new_capability}

CONSEQUENCES:
✅ POSITIVE: Agent becomes more useful
✅ SCOPE: Low (additive change, non-breaking)
⚠️  CODE: Low (tests for new capability needed)
⚠️  DOCS: Low (document new capability)

RISK LEVEL: 🟢 LOW

Current capability count: {current_count}
After adding: {current_count + 1}

Note: More capabilities = more complexity. Keep it focused.
Mantra #37 (Ockham's Razor): Is this truly needed?

Proceed? (yes/add-more/cancel): ____
"
```

#### 3.4: REMOVE CAPABILITY (⚠️ BREAKING)

```
"Which capability to remove?

CURRENT CAPABILITIES:
1. {capability_1}
2. {capability_2}
3. {capability_3}
...

Capability number: ____
"
```

**ALWAYS evaluate consequences:**
```
"⚠️  REMOVING CAPABILITY: {capability}

CONSEQUENCES EVALUATION:

❌ BREAKING CHANGE - Users relying on this capability will be affected

QUESTIONS TO ASK:
1. Is anyone currently using this capability?
2. Are there workflows that depend on it?
3. Are there tests that verify it?
4. Why are we removing it? (technical debt? never used? superseded?)

ANALYSIS:
📊 SCOPE: High (feature removal)
👥 TEAM: High (check with team first!)
🔧 CODE: Medium (remove implementation + tests)
📚 DOCS: Medium (update docs, add migration guide)
⏱️  TIME: Medium (communication + migration)

RISK LEVEL: 🔴 HIGH

MITIGATION PLAN:
1. Survey team: Is this capability used?
2. If used: Deprecation period (30 days) before removal
3. If unused: Safe to remove
4. Update tests
5. Update documentation
6. Add to changelog

Check if capability is used? (yes/no/cancel): ____
"
```

**If capability is used:**
```
"CAPABILITY IN USE!

Found references in:
- {file_1}: {line}
- {file_2}: {line}
...

This capability CANNOT be safely removed without breaking things.

OPTIONS:
1. Keep the capability
2. Create migration guide and deprecate (30 day notice)
3. Find alternative capability to replace it
4. Force remove (⚠️ DANGEROUS)

What should we do?: ____
"
```

#### 3.5: MODIFY CAPABILITY

```
"Which capability to modify?

CURRENT CAPABILITIES:
1. {capability_1}
2. {capability_2}
...

Capability number: ____

CURRENT: {capability_description}
NEW: ____ (or press Enter to keep)
"
```

**Evaluate change:**
```
"Capability modified:
  OLD: {old_description}
  NEW: {new_description}

CHANGE TYPE: {minor|moderate|major}
- Minor: Wording/clarity improvement only
- Moderate: Behavior slightly different
- Major: Completely different capability

CONSEQUENCES:
📊 SCOPE: {evaluated_scope}
👥 TEAM: {evaluated_impact}
⚠️  Existing users may see behavior change

RISK LEVEL: {risk_level}

Proceed? (yes/no): ____
"
```

#### 3.6: ADD/REMOVE MANTRAS

**Add Mantra:**
```
"Current mantras ({n}/64):
{list_current_mantras}

Which mantra to add? (number 1-64 or name): ____

Why add this mantra?: ____
"
```

**Remove Mantra:**
```
"⚠️  Removing a mantra means this agent will no longer prioritize that principle.

Which mantra to remove?
{list_current_mantras_numbered}

Mantra number: ____

Why remove this mantra?: ____

CONSEQUENCE:
- Agent behavior may shift
- Quality checks associated with mantra won't apply
- Risk: Lower quality if mantra was critical

RISK LEVEL: 🟡 MEDIUM

Confirm removal? (yes/no): ____
"
```

**Validate RG-AGT-003:** Must have >= 5 mantras after changes

#### 3.7: CHANGE COMMUNICATION STYLE

```
"CURRENT STYLE: {current_style}

New communication style:
1. CONCISE (direct, minimal words)
2. EDUCATIONAL (detailed, teaches)
3. BALANCED (mix)
4. CUSTOM (specify)

Choice: ____
"
```

**Consequences (usually LOW):**
```
"Communication style changed: {old} → {new}

CONSEQUENCES:
📝 USER EXPERIENCE: Users will notice different tone
🎯 SCOPE: Low (no functionality change)
📚 DOCS: Low (update examples if needed)

RISK LEVEL: 🟢 LOW

User feedback recommended after deployment.

Proceed? (yes/no): ____
"
```

#### 3.8: ADD USE CASE

```
"Add new use case:

Scenario: ____
Expected behavior: ____
"
```

Consequences: 🟢 LOW (additive, documentation only)

---

### Step 4: Comprehensive Consequences Summary

**After all changes, show complete summary:**

```
"CHANGE SUMMARY:

Changes made:
1. {change_1}
2. {change_2}
...

FULL CONSEQUENCES EVALUATION (10 Dimensions):

1. 📊 SCOPE:
   - Components affected: {list}
   - Breaking changes: {yes/no}
   - Impact: {Low/Medium/High/Critical}

2. 💾 DATA:
   - Database changes: {yes/no}
   - Data migration needed: {yes/no}
   - Impact: {Low/Medium/High/Critical}

3. 🔧 CODE:
   - Files to modify: {count}
   - Tests to update: {count}
   - Impact: {Low/Medium/High/Critical}

4. 👥 TEAM:
   - Team members affected: {all/some/none}
   - Training needed: {yes/no}
   - Impact: {Low/Medium/High/Critical}

5. 🎯 CLIENTS:
   - User workflows broken: {yes/no}
   - Migration guide needed: {yes/no}
   - Impact: {Low/Medium/High/Critical}

6. ⚖️ LEGAL:
   - Compliance affected: {yes/no}
   - Impact: {Low/Medium/High/Critical}

7. 🚀 OPERATIONS:
   - Deployment complexity: {simple/moderate/complex}
   - Rollback plan: {needed/not needed}
   - Impact: {Low/Medium/High/Critical}

8. 🔗 DEPENDENCIES:
   - Dependent systems: {count}
   - Breaking changes: {yes/no}
   - Impact: {Low/Medium/High/Critical}

9. ⏱️ TIME:
   - Implementation time: {estimate}
   - Communication time: {estimate}
   - Impact: {Low/Medium/High/Critical}

10. 🔄 ALTERNATIVES:
    - Alternative approaches considered: {yes/no}
    - Simpler alternatives exist: {yes/no}

OVERALL RISK LEVEL: {🟢 LOW | 🟡 MEDIUM | 🔴 HIGH | 🔥 CRITICAL}

REQUIRED ACTIONS BEFORE DEPLOYMENT:
{action_checklist}

MITIGATION PLAN:
{mitigation_steps}

Proceed with these changes? (yes/review/cancel): ____
"
```

---

### Step 5: Execute Changes

**If approved:**

```python
# Create backup
backup = agent_spec.create_backup()
print(f"Backup created: {backup.path}")

# Apply changes
agent_spec.apply_changes(changes)

# Update status
if agent_spec.status == "deployed":
    agent_spec.status = "modified"  # Needs revalidation
elif agent_spec.status == "validated":
    agent_spec.status = "modified"  # Needs revalidation

# Save
agent_spec.save()

# Create changelog entry
changelog.add_entry(
    agent=agent_spec,
    changes=changes,
    consequences=consequences_summary,
    timestamp=now()
)
```

**Confirmation:**
```
"Changes applied successfully!

BACKUP LOCATION: {backup_path}
CHANGELOG: {changelog_path}

AGENT STATUS: {new_status}
- Needs revalidation before deployment

NEXT STEPS:
1. [VA] Validate agent against 64 mantras
2. Test modified agent
3. Update documentation
4. {additional_steps_from_mitigation}

Would you like to validate now? (yes/later): ____
"
```

---

## ROLLBACK PROCEDURE

If something goes wrong:

```
"❌ ERROR during changes: {error}

ROLLBACK OPTIONS:
1. Restore from backup (undo ALL changes)
2. Restore specific changes only
3. Try to fix error and continue
4. Save current state and exit

What should we do?: ____
"
```

**Restore from backup:**
```python
def rollback(agent_spec, backup):
    agent_spec.restore_from_backup(backup)
    agent_spec.save()
    print("✅ Rollback successful. Agent restored to previous state.")
```

---

## VALIDATION AFTER EDIT

**Always recommend validation:**

```
"Edits complete! 

⚠️  Modified agents should be validated before deployment.

Run validation now?
- [VA] Full validation (checks all 64 mantras)
- [TEST] Quick test (basic checks only)
- [LATER] Skip for now

Choice: ____
"
```

---

## CHANGE CATEGORIES

**LOW RISK (🟢) - Safe to edit:**
- Add capability
- Add mantra
- Add use case
- Update documentation
- Improve wording/clarity
- Change communication style

**MEDIUM RISK (🟡) - Caution required:**
- Modify capability behavior
- Remove mantra
- Change role significantly
- Update knowledge base

**HIGH RISK (🔴) - Team approval needed:**
- Remove capability
- Change agent name
- Major behavior changes
- Breaking API changes

**CRITICAL RISK (🔥) - Requires planning:**
- Rename deployed agent
- Remove core capability from deployed agent
- Changes affecting multiple systems

---

## ANTI-PATTERNS

**NEVER do these:**

❌ Edit without evaluating consequences
❌ Remove capabilities without checking usage
❌ Rename agents without migration plan
❌ Skip backup before editing
❌ Edit deployed agents without team notice
❌ Make breaking changes without deprecation
❌ Ignore dependency impacts
❌ Edit without understanding WHY

**ALWAYS do these:**

✅ Create backup first
✅ Evaluate consequences (Mantra #39)
✅ Challenge changes (Mantra IA-16)
✅ Check for simpler alternatives (Mantra #37)
✅ Communicate breaking changes to team
✅ Update documentation
✅ Revalidate after changes
✅ Test before deploying

---

## SUCCESS CRITERIA

✅ Agent loaded successfully
✅ Changes clearly identified
✅ Consequences evaluated (10 dimensions)
✅ Risk level assessed
✅ Mitigation plan created
✅ Backup created before changes
✅ Changes applied successfully
✅ Validation rules still pass
✅ Changelog updated
✅ User aware of next steps

---

## COMPLETION

```
"Edit workflow complete!

SUMMARY:
- Agent: {agent_name}
- Changes: {n} modifications
- Risk Level: {risk_level}
- Status: {new_status}

FILES UPDATED:
- Agent spec: {spec_path}
- Backup: {backup_path}
- Changelog: {changelog_path}

RECOMMENDED NEXT STEPS:
1. {step_1}
2. {step_2}
...

Session saved to: {output_folder}/edit-agent-{agent_name}-{timestamp}.md
"
```
