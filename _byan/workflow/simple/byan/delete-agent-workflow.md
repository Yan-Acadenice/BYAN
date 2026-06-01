# BYAN Delete Agent Workflow

**Workflow:** Safe Agent Deletion with Backup & Consequences Warning  
**Duration:** 5 minutes  
**Methodology:** Mantra #39 (Consequences) + Safety First

---

## OVERVIEW

Delete Agent workflow safely removes agents with:
- **Mandatory backup** before deletion
- **Consequences evaluation** (Mantra #39)
- **Explicit confirmation** required
- **Dependency checking**
- **Rollback capability**

**Key Principle:**
> "Deletion is permanent. Evaluate consequences, backup everything, confirm explicitly."

**Mantras Applied:**
- Mantra #39: Évaluation des Conséquences (PRIMARY)
- Mantra IA-1: Trust But Verify
- RG-DEL-001: Confirmation explicite
- RG-DEL-002: Backup obligatoire

---

## SAFETY LEVELS

### 🟢 LOW RISK
- Agent status: draft
- Never deployed
- No dependencies
- No usage history

→ Simple deletion with backup

### 🟡 MEDIUM RISK
- Agent status: validated
- Not deployed but tested
- Some documentation references

→ Requires confirmation + backup

### 🔴 HIGH RISK
- Agent status: deployed
- Actively used in workflows
- Referenced by other agents
- Has usage history

→ Requires deprecation period, not immediate deletion

### 🔥 CRITICAL RISK
- Agent status: deployed
- Core/critical agent
- Multiple dependencies
- High usage frequency

→ **CANNOT DELETE** - Deprecation and migration required

---

## WORKFLOW STEPS

### Step 1: Select Agent to Delete

```
"⚠️  AGENT DELETION - PERMANENT ACTION

Which agent do you want to delete?

Available agents:
1. {agent_1} - [{status}] - {usage_info}
2. {agent_2} - [{status}] - {usage_info}
3. {agent_3} - [{status}] - {usage_info}
...

Agent number or name (or 'cancel' to exit): ____
"
```

**Load agent and analyze:**
```python
agent_spec = AgentSpec.load(agent_id_or_name)
context = ProjectContext.load(agent_spec.context_id)

# Analyze risk
risk_level = analyze_deletion_risk(agent_spec)
dependencies = find_dependencies(agent_spec)
usage_stats = get_usage_stats(agent_spec)
```

---

### Step 2: Display Agent Info & Risk Assessment

```
"════════════════════════════════════════════════════
AGENT DELETION ANALYSIS
════════════════════════════════════════════════════

AGENT INFORMATION:
  Name: {agent_name}
  Role: {role}
  Status: {status}
  Created: {created_at}
  Last Modified: {updated_at}
  Last Used: {last_used}

USAGE STATISTICS:
  Total Invocations: {invocation_count}
  Active Users: {user_count}
  Referenced In: {reference_count} files
  Dependencies: {dependency_count}

RISK ASSESSMENT: {risk_level}

{if LOW RISK 🟢:}
  This agent can be safely deleted.
  - Status: draft
  - No active usage
  - No dependencies detected

{if MEDIUM RISK 🟡:}
  This agent has some references.
  - Status: validated
  - Referenced in {n} places
  - Deletion will break: {list_affected}

{if HIGH RISK 🔴:}
  This agent is actively used!
  - Status: deployed
  - {n} active users
  - {n} dependencies
  - Immediate deletion NOT RECOMMENDED

{if CRITICAL RISK 🔥:}
  ⛔ DELETION BLOCKED - This is a critical agent!
  - Core system component
  - {n} critical dependencies
  - Cannot delete without migration plan

════════════════════════════════════════════════════
"
```

---

### Step 3: Consequences Evaluation (Mantra #39)

```
"CONSEQUENCES OF DELETING '{agent_name}':

1. 📊 SCOPE:
   - Agent will be completely removed
   - All configurations lost
   - History lost (unless backed up)
   Impact: {High/Medium/Low}

2. 💾 DATA:
   - AgentSpec record deleted
   - AgentFile(s) deleted
   - Database entries removed
   Impact: {High/Medium/Low}

3. 🔧 CODE:
   - References to this agent will break
   - Files affected: {list}
   Impact: {High/Medium/Low}

4. 👥 TEAM:
   - Users actively using this agent: {count}
   - Team members to notify: {list}
   Impact: {High/Medium/Low}

5. 🎯 CLIENTS:
   - User workflows affected: {workflows}
   - Breaking change: {yes/no}
   Impact: {High/Medium/Low}

6. ⚖️ LEGAL:
   - Compliance impact: {none/review required}
   Impact: {High/Medium/Low}

7. 🚀 OPERATIONS:
   - Active processes using agent: {count}
   - Immediate impact: {yes/no}
   Impact: {High/Medium/Low}

8. 🔗 DEPENDENCIES:
   - Agents depending on this one: {list}
   - External systems affected: {list}
   Impact: {High/Medium/Low}

9. ⏱️ TIME:
   - Deletion time: Immediate
   - Recovery time if mistake: {estimate}
   - Team notification time: {estimate}
   Impact: {High/Medium/Low}

10. 🔄 ALTERNATIVES:
    - Deprecate instead of delete: {recommended/not needed}
    - Archive and keep backup: {always}
    - Migrate to replacement agent: {needed/not needed}

OVERALL RISK: {risk_level}

════════════════════════════════════════════════════
"
```

---

### Step 4: Dependencies Check

```
"DEPENDENCY ANALYSIS:

{if no dependencies:}
  ✅ No dependencies found. Safe to delete.

{if dependencies exist:}
  ⚠️  Dependencies detected:

  FILES REFERENCING THIS AGENT:
  1. {file_1}:{line} - {context}
  2. {file_2}:{line} - {context}
  ...

  AGENTS DEPENDING ON THIS ONE:
  - {dependent_agent_1}: {reason}
  - {dependent_agent_2}: {reason}

  WORKFLOWS USING THIS AGENT:
  - {workflow_1}
  - {workflow_2}

  BREAKING IMPACT:
  - {impact_summary}

  RECOMMENDATION:
  {if HIGH/CRITICAL:}
    🛑 DO NOT DELETE immediately.
    1. Create replacement agent first
    2. Migrate all dependencies
    3. Deprecate this agent (30 day notice)
    4. Delete after migration complete

  {if MEDIUM:}
    ⚠️  Fix dependencies before deleting:
    1. Update all referencing files
    2. Notify users
    3. Then proceed with deletion

  {if LOW:}
    ✅ Safe to delete with backup
"
```

---

### Step 5: Backup Creation (MANDATORY - RG-DEL-002)

```
"Creating backup before deletion...

BACKUP STRATEGY:
1. Export AgentSpec to YAML
2. Save agent files to archive
3. Capture full history/metadata
4. Store in safe location

[▓▓▓▓▓▓▓▓▓▓] 100% - Backup complete

BACKUP CREATED:
  Location: {backup_path}
  Format: .tar.gz (compressed)
  Size: {size}
  Contains:
    - agent-spec.yaml
    - agent-files/
    - metadata.json
    - usage-history.log

Backup validated: ✅

To restore this agent later:
  byan restore {backup_path}

════════════════════════════════════════════════════
"
```

**Backup structure:**
```
backup-{agent_name}-{timestamp}.tar.gz
├── agent-spec.yaml          # Full AgentSpec export
├── agent-files/
│   ├── copilot.md          # Generated files
│   ├── vscode.md
│   └── claude.md
├── metadata.json           # Timestamps, user, reason
├── usage-history.log       # Usage statistics
└── dependencies.json       # Captured dependencies
```

---

### Step 6: Final Confirmation (RG-DEL-001)

```
"════════════════════════════════════════════════════
⚠️  FINAL CONFIRMATION REQUIRED
════════════════════════════════════════════════════

You are about to PERMANENTLY DELETE:
  Agent: {agent_name}
  Role: {role}
  Status: {status}

This action:
  ❌ CANNOT be undone (except from backup)
  ❌ Will break {n} references
  ❌ Will affect {n} users
  ✅ Backup created at: {backup_path}

RISK LEVEL: {risk_level}

To confirm deletion, type the agent name exactly: '{agent_name}'

Confirmation: ____

(or type 'cancel' to abort)
════════════════════════════════════════════════════
"
```

**Validation:**
```python
def confirm_deletion(user_input, agent_name):
    if user_input.lower() == 'cancel':
        return "CANCELLED"
    
    if user_input == agent_name:  # Exact match required
        return "CONFIRMED"
    
    return "INVALID"  # Must retype
```

**If confirmation fails:**
```
"❌ Confirmation failed. Agent name must match exactly.

Expected: '{agent_name}'
You typed: '{user_input}'

Try again or type 'cancel': ____
"
```

---

### Step 7: Execute Deletion

**If confirmed:**
```python
def delete_agent(agent_spec, backup):
    try:
        # 1. Delete agent files
        agent_files = AgentFile.find_by_agent(agent_spec.id)
        for file in agent_files:
            file.delete()
            log_deletion(file, backup)
        
        # 2. Delete AgentSpec
        agent_spec.delete()
        log_deletion(agent_spec, backup)
        
        # 3. Update project context (remove agent reference)
        context = ProjectContext.load(agent_spec.context_id)
        context.remove_agent_reference(agent_spec.id)
        context.save()
        
        # 4. Create deletion record (audit trail)
        DeletionRecord.create(
            agent_name=agent_spec.agent_name,
            deleted_by=current_user,
            deleted_at=now(),
            backup_location=backup.path,
            reason=deletion_reason,
            consequences=consequences_evaluated
        )
        
        return DeleteSuccess(backup=backup)
    
    except Exception as e:
        # Rollback if anything fails
        rollback_deletion(backup)
        return DeleteFailed(error=e)
```

**Progress:**
```
"Deleting agent...

[▓▓▓░░░░░░░] 30% - Removing agent files...
[▓▓▓▓▓▓░░░░] 60% - Deleting AgentSpec...
[▓▓▓▓▓▓▓▓░░] 80% - Updating project context...
[▓▓▓▓▓▓▓▓▓▓] 100% - Creating audit record...

✅ Deletion complete.
"
```

---

### Step 8: Post-Deletion Summary

```
"════════════════════════════════════════════════════
DELETION COMPLETE
════════════════════════════════════════════════════

Agent '{agent_name}' has been permanently deleted.

WHAT WAS DELETED:
  ❌ AgentSpec record
  ❌ {n} agent file(s)
  ❌ Agent configurations
  ❌ Menu references

WHAT WAS PRESERVED:
  ✅ Full backup: {backup_path}
  ✅ Deletion audit record
  ✅ Usage history (in backup)

NEXT STEPS:

{if dependencies existed:}
  ⚠️  ACTION REQUIRED:
  1. Fix broken references:
     {list_files_to_fix}
  2. Notify affected users:
     {list_users}
  3. Update documentation

{if no dependencies:}
  ✅ No further action needed.

RESTORATION:
  To restore this agent from backup:
    byan restore {backup_path}

  Backup will be kept for {retention_period} days.

AUDIT TRAIL:
  Deletion recorded in: {audit_log_path}
  Deleted by: {user}
  Timestamp: {timestamp}
  Reason: {reason}

════════════════════════════════════════════════════
"
```

---

## ALTERNATIVE: DEPRECATION (Recommended for Deployed Agents)

**If agent is HIGH or CRITICAL risk:**

```
"🛑 DELETION NOT RECOMMENDED

This agent is actively used. Instead of deleting immediately,
I recommend DEPRECATION:

DEPRECATION WORKFLOW:
1. Mark agent as 'deprecated' (status change)
2. Add deprecation notice (30-60 day warning)
3. Notify all users
4. Provide migration path to replacement
5. Monitor usage decline
6. Delete after usage reaches zero

Start deprecation workflow? (yes/cancel): ____
"
```

**Deprecation process:**
```python
def deprecate_agent(agent_spec, replacement=None):
    # 1. Change status
    agent_spec.status = "deprecated"
    agent_spec.deprecation_date = now()
    agent_spec.deprecation_deadline = now() + timedelta(days=30)
    
    if replacement:
        agent_spec.replacement_agent = replacement.id
    
    # 2. Add deprecation warning to agent
    agent_spec.add_deprecation_notice(
        message=f"This agent is deprecated and will be removed on {deadline}",
        replacement=replacement.agent_name if replacement else None,
        migration_guide=generate_migration_guide(agent_spec, replacement)
    )
    
    # 3. Notify users
    notify_users(
        agent=agent_spec,
        message="Agent deprecated - action required",
        deadline=agent_spec.deprecation_deadline
    )
    
    agent_spec.save()
```

---

## RESTORE FROM BACKUP

**If user made a mistake:**

```
"Restore agent from backup:

  byan restore {backup_path}

This will:
  ✅ Recreate AgentSpec
  ✅ Restore all agent files
  ✅ Restore configurations
  ✅ Preserve original timestamps

Note: Any changes made after backup will be lost.
"
```

```python
def restore_agent(backup_path):
    backup = Backup.load(backup_path)
    
    # 1. Validate backup integrity
    if not backup.is_valid():
        raise BackupCorruptedError()
    
    # 2. Check if agent name conflicts
    if AgentSpec.exists(backup.agent_name):
        raise AgentAlreadyExistsError()
    
    # 3. Restore AgentSpec
    agent_spec = AgentSpec.from_backup(backup)
    agent_spec.save()
    
    # 4. Restore agent files
    for file_data in backup.files:
        agent_file = AgentFile.from_backup(file_data)
        agent_file.save()
    
    # 5. Update project context
    context = ProjectContext.load(agent_spec.context_id)
    context.add_agent_reference(agent_spec.id)
    context.save()
    
    return RestoreSuccess(agent_spec)
```

---

## ANTI-PATTERNS

**NEVER do these:**

❌ Delete without backup
❌ Delete deployed agents immediately
❌ Delete without checking dependencies
❌ Delete without team notification
❌ Delete without explicit confirmation
❌ Delete without consequence evaluation
❌ Delete without audit trail

**ALWAYS do these:**

✅ Create backup first (RG-DEL-002)
✅ Evaluate consequences (Mantra #39)
✅ Check dependencies thoroughly
✅ Require explicit confirmation (RG-DEL-001)
✅ Notify affected users
✅ Prefer deprecation for deployed agents
✅ Keep audit trail
✅ Test restore procedure

---

## CANCELLATION

**At any point, user can cancel:**

```
"Deletion cancelled.

No changes were made. Agent '{agent_name}' is still active.

{if backup was created:}
  Note: Backup was created but not used.
  Location: {backup_path}
  You can delete this backup manually if not needed.

Return to menu? (yes): ____
"
```

---

## SUCCESS CRITERIA

✅ Risk level assessed
✅ Dependencies checked
✅ Consequences evaluated (10 dimensions)
✅ Backup created and validated (RG-DEL-002)
✅ Explicit confirmation obtained (RG-DEL-001)
✅ Agent deleted successfully
✅ Audit trail created
✅ User notified of next steps
✅ Restore instructions provided

**For HIGH/CRITICAL risk agents:**
✅ Deprecation recommended instead of deletion
✅ Migration path provided
✅ Users notified of deprecation

---

## COMPLETION

```
"Delete Agent workflow complete.

RESULT: {SUCCESS / CANCELLED / FAILED}

{if SUCCESS:}
  Agent '{agent_name}' has been deleted.
  Backup: {backup_path}
  Audit: {audit_path}

{if CANCELLED:}
  No changes made.

{if FAILED:}
  Error: {error_message}
  Agent NOT deleted.
  Rollback successful.

Session summary: {output_folder}/delete-agent-{agent_name}-{timestamp}.md
"
```
