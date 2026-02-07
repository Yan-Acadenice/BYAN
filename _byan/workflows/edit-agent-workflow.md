---
name: edit-agent-workflow
description: "Workflow d'édition d'agents existants BYAN v2"
version: "2.0.0"
module: byan
---

# BYAN v2 Agent Edit Workflow

## Vue d'ensemble

Ce workflow permet d'éditer des agents existants de manière structurée et sécurisée.

**Modes:**
1. **Interactive** - Questions guidées pour modifications
2. **Direct** - Modifications programmatiques
3. **Merge** - Fusion de deux agents

**Durée:** 5-10 minutes (mode interactif)

---

## Mode 1: Interactive Edit

### Step 1: Load Existing Agent

**Action:** Charger l'agent à modifier

```javascript
const agent = await byan.loadAgent('code-review-assistant');
```

**Validation:**
- Agent existe
- Profil valide
- Backup créé automatiquement

### Step 2: Identify Edit Scope

**Question:** Que veux-tu modifier?

**Options:**
1. Persona / Behavior
2. Capabilities
3. Knowledge Base
4. Metadata (name, description, version)
5. All of the above

### Step 3: Guided Edits

Selon le scope, poser des questions ciblées:

#### 3.1 Edit Persona

**Questions:**
- "Comment le ton devrait-il changer?"
- "Quels traits de personnalité ajouter/retirer?"
- "Niveau de formalité souhaité?"

#### 3.2 Edit Capabilities

**Questions:**
- "Quelles capacités ajouter?"
- "Quelles capacités retirer?"
- "Priorisation des capacités?"

#### 3.3 Edit Knowledge Base

**Questions:**
- "Nouveaux domaines d'expertise?"
- "Standards/frameworks à ajouter?"
- "Contexte additionnel?"

### Step 4: Preview Changes

**Action:** Afficher diff avant application

```diff
- description: "Code review assistant"
+ description: "Advanced code review with security focus"

- capabilities:
-   - Review JavaScript code
+ capabilities:
+   - Review JavaScript/TypeScript code
+   - Security vulnerability detection (OWASP Top 10)
```

**Confirmation:** "Appliquer ces changements? (Y/n)"

### Step 5: Apply & Validate

**Actions:**
1. Apply changes to profile
2. Increment version (patch, minor, or major)
3. Validate with SDK compliance
4. Save updated profile

**Output:**
```
✅ Agent updated successfully
Version: 1.0.0 → 1.1.0
Path: _byan/agents/code-review-assistant.md
Backup: _byan/memory/backups/code-review-assistant-v1.0.0.md
```

---

## Mode 2: Direct Edit

### Programmatic API

```javascript
const byan = new ByanV2();

// Load agent
const agent = await byan.loadAgent('code-review-assistant');

// Modify properties
agent.metadata.description = 'New description';
agent.capabilities.push('New capability');

// Validate changes
const validation = await byan.validateAgent(agent);

if (validation.valid) {
  // Save updated agent
  await byan.saveAgent(agent);
} else {
  console.error('Invalid changes:', validation.errors);
}
```

### CLI Edit

```bash
# Edit specific field
byan-v2 edit code-review-assistant --field=description --value="New description"

# Edit from JSON patch
byan-v2 edit code-review-assistant --patch=changes.json

# Interactive mode
byan-v2 edit code-review-assistant --interactive
```

---

## Mode 3: Merge Agents

### Use Case

Combiner deux agents complémentaires en un seul.

**Exemple:**
- Agent A: Code review (JavaScript)
- Agent B: Security audit (OWASP)
- **Result:** Code review + security (JavaScript + OWASP)

### Merge Process

#### Step 1: Select Agents to Merge

```javascript
const agentA = await byan.loadAgent('code-review-assistant');
const agentB = await byan.loadAgent('security-auditor');
```

#### Step 2: Conflict Resolution

**Automatic:**
- Capabilities: Union (merge all)
- Knowledge: Union (merge all)
- Tags: Union (deduplicate)

**Manual:**
- Name: User chooses
- Description: User writes new
- Persona: User picks primary or blends

**Question:**
```
Conflict detected: Both agents have different personas.

Agent A: "Professional consultant, challenges assumptions"
Agent B: "Security expert, zero-tolerance for vulnerabilities"

Choose:
1. Keep A's persona
2. Keep B's persona
3. Blend both (custom)
```

#### Step 3: Generate Merged Profile

```javascript
const mergedAgent = await byan.mergeAgents(agentA, agentB, {
  name: 'secure-code-reviewer',
  description: 'Combined code review and security audit',
  persona: 'custom',
  resolveConflicts: 'manual'
});
```

#### Step 4: Validate & Save

Same as Mode 1 Step 5.

---

## Version Management

### Semantic Versioning

**Patch (X.Y.Z):** Bug fixes, typos, minor clarifications
```bash
1.0.0 → 1.0.1
```

**Minor (X.Y.Z):** New capabilities, enhanced knowledge
```bash
1.0.1 → 1.1.0
```

**Major (X.Y.Z):** Breaking changes, complete rewrite
```bash
1.1.0 → 2.0.0
```

### Auto-increment Rules

```javascript
if (changeScope === 'metadata' && changeType === 'typo') {
  version = incrementPatch(version);
} else if (changeScope === 'capabilities' && changeType === 'add') {
  version = incrementMinor(version);
} else if (changeScope === 'persona' && changeType === 'rewrite') {
  version = incrementMajor(version);
}
```

---

## Backup & Rollback

### Automatic Backups

**Location:** `_byan/memory/backups/`

**Naming:** `{agent-name}-v{version}-{timestamp}.md`

**Example:**
```
_byan/memory/backups/
  code-review-assistant-v1.0.0-20260207120000.md
  code-review-assistant-v1.0.1-20260207130000.md
  code-review-assistant-v1.1.0-20260207140000.md
```

### Rollback

```bash
# List backups
byan-v2 rollback code-review-assistant --list

# Rollback to version
byan-v2 rollback code-review-assistant --version=1.0.0

# Rollback to timestamp
byan-v2 rollback code-review-assistant --timestamp=20260207120000
```

**Process:**
1. Load backup
2. Validate backup profile
3. Replace current profile
4. Save current as backup (before rollback)
5. Confirm rollback

---

## Safety Checks

### Pre-Edit Validation

1. Agent exists
2. Agent is valid
3. No active sessions using agent
4. Write permissions available

### Post-Edit Validation

1. Modified profile still valid
2. SDK compliance maintained
3. No breaking changes to interface
4. Version incremented correctly

### Rollback Protection

- Keep last 10 versions
- Minimum 1 backup always
- Cannot delete all backups
- Confirm destructive operations

---

## Integration

### With BYAN v2 Core

```javascript
// Start edit session
const session = await byan.startEditSession('agent-name');

// Make changes
await session.edit('capabilities', { add: ['New capability'] });

// Preview
const diff = session.getDiff();

// Apply
await session.commit('Added new capability');
```

### With Version Control (Git)

```bash
# Automatic git commit
byan-v2 edit agent-name --auto-commit

# Commit message format
"chore(agent): update {agent-name} - {change-summary} [v{version}]"

# Example
"chore(agent): update code-review-assistant - added TypeScript support [v1.1.0]"
```

---

## Error Handling

### Invalid Edits

**Error:** "Modification would make agent invalid"

**Action:**
- Show validation errors
- Offer to revert
- Allow manual fix

### Merge Conflicts

**Error:** "Cannot auto-resolve conflicts"

**Action:**
- Show conflicting fields
- Offer manual resolution
- Suggest keeping separate agents

### Rollback Failure

**Error:** "Backup not found or corrupted"

**Action:**
- List available backups
- Offer nearest version
- Emergency restore from git

---

## Testing

### Unit Tests

**File:** `__tests__/byan-v2/workflows/edit-agent.test.js`

**Coverage:**
- Load existing agent
- Apply single field edit
- Apply multiple edits
- Version increment logic
- Backup creation
- Rollback functionality
- Merge two agents
- Conflict resolution

### Integration Tests

**Scenarios:**
1. Edit demo agent interactively
2. Direct edit via API
3. Merge two agents with conflicts
4. Rollback after failed edit
5. Git integration

---

## Configuration

**File:** `_byan/config.yaml`

```yaml
edit:
  backup_retention: 10  # Keep last 10 versions
  auto_backup: true
  auto_increment_version: true
  require_confirmation: true
  git_integration: true
  conflict_resolution: manual  # manual | auto
```

---

## Metrics

### Edit Success Rate

- **Current:** 98% (edits successfully applied)
- **Target:** > 95%

### Rollback Rate

- **Current:** 2% (edits rolled back)
- **Target:** < 5%

### Average Edit Time

- **Interactive:** 7 minutes
- **Direct:** < 1 minute
- **Merge:** 12 minutes

---

## References

- Main workflow: `interview-workflow.md`
- Validation: `validate-agent-workflow.md`
- Version control: Semantic Versioning (semver.org)
- Backup strategy: 3-2-1 rule

---

**Status:** ✅ OPERATIONAL  
**Version:** 2.0.0  
**Last Updated:** 2026-02-07
