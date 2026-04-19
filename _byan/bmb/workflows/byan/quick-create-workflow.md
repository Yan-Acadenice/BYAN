# BYAN Quick Create Workflow

**Workflow:** Quick Agent Creation (Minimal Questions)  
**Duration:** 10 minutes  
**Methodology:** Merise Agile + TDD (with sensible defaults)

---

## OVERVIEW

Quick Create is for experienced users who want to create agents fast with minimal interview.

**Key Differences from Full Interview:**
- Uses existing ProjectContext (no Phase 1 or 2)
- Assumes sensible defaults
- Only asks essential questions
- 10 min vs 30-45 min

**When to Use:**
- You've already done a full interview for the project
- You want to create multiple agents quickly
- You're comfortable with BMAD agent structure
- You know exactly what you need

**When NOT to Use:**
- First agent for a new project → Use full interview
- Complex or critical agent → Use full interview
- Uncertain about requirements → Use full interview

---

## PREREQUISITES

**Required:**
- ProjectContext must exist for this project
- User must know agent role and capabilities

**Validate before starting:**
```
"Quick Create requires an existing project context.

Available projects:
[List all ProjectContext with project_name]

Which project is this agent for? (or type 'new' for full interview)"
```

If no ProjectContext exists:
```
"No project context found. Quick Create requires project context.

You have two options:
1. [INT] Start full interview (30-45 min) to create project context
2. [EXIT] Exit and come back later

Which do you prefer?"
```

---

## QUICK CREATE FLOW

### Step 1: Load Project Context

```
"Loading project context for: {project_name}

PROJECT: {project_description}
DOMAIN: {domain}
GLOSSARY: {n} concepts
TECH STACK: {stack}

Ready to create a new agent for this project.
"
```

### Step 2: Agent Name & Role

**Q1: Agent Name (kebab-case)**
```
"What's the agent name? (kebab-case, e.g., 'backend-expert', 'test-specialist')

Name: _____
"
```

Validate:
- Must be kebab-case: ^[a-z0-9]+(-[a-z0-9]+)*$
- Must be unique (RG-AGT-001)
- Suggest if name is too generic:
  ```
  "The name 'helper' is very generic. More specific names are better.
  Suggestions based on your domain:
  - {domain}-backend-expert
  - {domain}-api-specialist
  - {domain}-test-engineer
  
  Use 'helper' anyway? (yes/no)"
  ```

**Q2: Role (one sentence)**
```
"What's this agent's role? (one sentence, like a job title)

Example: 'Backend API specialist who ensures RESTful best practices'

Role: _____
"
```

### Step 3: Capabilities (Minimum 3)

```
"What are the 3 most critical capabilities? (minimum 3, can add more)

Think in terms of CREATE, ANALYZE, REVIEW, OPTIMIZE, TEACH.

Examples:
- 'Generate API endpoints with OpenAPI specs'
- 'Review database queries for N+1 problems'
- 'Create integration tests with realistic fixtures'

Capability 1: _____
Capability 2: _____
Capability 3: _____
More? (press Enter to skip)
"
```

Validate RG-AGT-002: >= 3 capabilities

**Auto-categorize capabilities:**
```python
capability_categories = {
    "generate|create|build|scaffold": "create",
    "analyze|review|audit|check": "analyze",
    "optimize|improve|refactor": "optimize",
    "teach|explain|guide": "teach"
}
```

### Step 4: Mantras (Auto-suggest + Custom)

```
"Which mantras should this agent prioritize?

I'll suggest 5 based on your role and capabilities. 
You can accept these or customize.

SUGGESTED MANTRAS:
[Auto-suggest based on role/capabilities]
1. Mantra #{id}: {name} - {why relevant}
2. Mantra #{id}: {name} - {why relevant}
3. Mantra #{id}: {name} - {why relevant}
4. Mantra #{id}: {name} - {why relevant}
5. Mantra #{id}: {name} - {why relevant}

Accept these suggestions? (yes/no/show-all)
"
```

**Auto-suggestion logic:**
```python
def suggest_mantras(role, capabilities):
    suggestions = []
    
    # Always include
    suggestions.append(37)  # Ockham's Razor
    suggestions.append(39)  # Consequences
    
    # Role-based
    if "backend" in role.lower():
        suggestions.append(4)   # Fail Fast
        suggestions.append(20)  # Performance
        suggestions.append(18)  # TDD
    elif "test" in role.lower():
        suggestions.append(18)  # TDD
        suggestions.append(19)  # Test Behavior
        suggestions.append(16)  # Challenge Before Confirm (IA)
    elif "frontend" in role.lower():
        suggestions.append(12)  # UX is Priority
        suggestions.append(20)  # Performance
        suggestions.append(7)   # KISS
    
    # Capability-based
    for cap in capabilities:
        if "security" in cap.lower():
            suggestions.append(21)  # Security by Design
        if "optimize" in cap.lower():
            suggestions.append(20)  # Performance
        if "review" in cap.lower():
            suggestions.append(16)  # Challenge Before Confirm (IA)
    
    # Dedupe and take first 5
    return list(set(suggestions))[:5]
```

If user says "show-all":
```
"Full list of 64 mantras available in {project-root}/_byan-output/guide-reference-rapide-merise-agile-tdd.md

Or I can list them here by category:
1. Show Conception Mantras (39)
2. Show AI Agent Mantras (25)
3. Keep suggestions

What would you like?"
```

### Step 5: Communication Style (Quick)

```
"Communication style for this agent? Pick one:

1. CONCISE - Direct, minimal words, assumes expertise
2. EDUCATIONAL - Detailed explanations, examples, teaches as it works
3. BALANCED - Mix of both, adapts to context

Your choice (1/2/3): ___
"
```

### Step 6: Quick Validation

```
"Let me confirm what we're creating:

AGENT: {agent_name}
ROLE: {role}
CAPABILITIES: {n} capabilities
  - {capability_1}
  - {capability_2}
  - {capability_3}
  ...
MANTRAS: {n} mantras
  - Mantra #{id}: {name}
  ...
STYLE: {communication_style}
PROJECT: {project_name}

This will take ~30 seconds to generate.

Proceed? (yes/no/edit)"
```

If "edit":
```
"What needs adjustment?
1. Agent name
2. Role
3. Capabilities
4. Mantras
5. Communication style
6. Cancel

Choice: ___"
```

---

## GENERATION

### Create AgentSpec

```python
agent_spec = AgentSpec.create(
    context_id=context.id,
    agent_name=answers['agent_name'],
    role=answers['role'],
    responsibilities=[],  # Auto-derive from capabilities
    knowledge_business=context.glossaire.keys(),  # Inherit from context
    knowledge_technical=context.stack_tech,  # Inherit from context
    capabilities=answers['capabilities'],
    mantras_applied=answers['mantras'],
    communication_style=answers['communication_style'],
    use_cases=[],  # Will be empty for quick create
    status="draft"
)

# Validate
agent_spec.validate()  # RG-AGT-001, 002, 003 checked

# Save
agent_spec.save()
```

**Handle validation failures:**
```
"Validation failed:
- {error_1}
- {error_2}

Quick fixes:
{suggested_fixes}

Try again? (yes/no)"
```

---

## COMPLETION

### Success Message

```
"Agent created successfully!

AGENT: {agent_name}
STATUS: Validated and ready for file generation
LOCATION: _byan/{module}/agents/{agent_name}.md (pending generation)

NEXT STEPS:
1. Generate agent file for platform
2. Test the agent
3. Iterate based on usage

Generate files now for which platform(s)?
- copilot (GitHub Copilot CLI)
- vscode (VSCode extension)
- claude (Claude Code)
- codex (Codex)
- all (all platforms)
- later (exit, generate later)

Platform: ____
"
```

### If "later":

```
"Agent spec saved! You can generate files anytime with:

[BYAN Menu] > Generate Files

Or via CLI:
  byan generate {agent_name} --platform=copilot

Session summary saved to:
{output_folder}/quick-create-{agent_name}-{timestamp}.md
"
```

---

## DEFAULTS APPLIED

Quick Create uses these defaults:

**Responsibilities:** Auto-derived from capabilities
```python
def derive_responsibilities(capabilities):
    return [cap['description'] for cap in capabilities]
```

**Use Cases:** Left empty (can be added later)

**Knowledge:** Inherited from ProjectContext
- Business: All glossary concepts
- Technical: Full tech stack

**Menu Structure:** Standard BMAD menu
```
[MH] Menu Help
[CH] Chat
[TASK] Execute primary task
[EXIT] Dismiss
```

**Persona Template:** Based on role + communication style

**Anti-patterns:** Standard set from 64 mantras

---

## ERROR HANDLING

**No ProjectContext:**
```
"ERROR: No project context found.

Quick Create requires existing context. Please:
1. Run full interview first: [INT]
2. Or import existing context

Cannot proceed with Quick Create."
```

**Duplicate Agent Name:**
```
"ERROR: Agent '{agent_name}' already exists.

Existing agents in this project:
- {agent_1}
- {agent_2}
...

Choose a different name or edit existing agent."
```

**Insufficient Capabilities:**
```
"ERROR: Need at least 3 capabilities (you provided {n}).

Please provide {3-n} more capabilities."
```

---

## COMPARISON: Full Interview vs Quick Create

| Aspect | Full Interview | Quick Create |
|--------|----------------|--------------|
| Duration | 30-45 min | 10 min |
| Project Context | Created | Reused |
| Business Glossary | Interactive creation | Inherited |
| Capabilities | Deep exploration | Quick list |
| Mantras | Justified selection | Auto-suggested |
| Use Cases | Minimum 3 required | Optional |
| Validation | Extensive | Basic |
| Suitable for | First agent, critical agents | Additional agents |

---

## SUCCESS CRITERIA

✅ ProjectContext exists
✅ Agent name unique and valid format
✅ RG-AGT-002: >= 3 capabilities
✅ RG-AGT-003: >= 5 mantras
✅ AgentSpec validated
✅ User confirmed creation
✅ Completed in < 15 minutes

---

## NEXT WORKFLOW

After Quick Create, automatically offer:
```
"Agent created! 

Want to enhance it?
- [VA] Validate against all 64 mantras
- [EA] Edit to add use cases or refine
- Generate files now
- Exit

What would you like to do?"
```
