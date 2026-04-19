# BYAN Interview Workflow

**Workflow:** Intelligent Agent Creation Interview  
**Duration:** 30-45 minutes  
**Phases:** 4 (Contexte → Métier → Agent → Validation)  
**Methodology:** Merise Agile + TDD + 64 Mantras

---

## WORKFLOW OVERVIEW

This workflow conducts a structured interview to create high-quality specialized agents with complete project context and business documentation.

**Mantras Applied:**
- Mantra IA-1: Trust But Verify
- Mantra IA-16: Challenge Before Confirm
- Mantra #37: Rasoir d'Ockham (start simple)
- Mantra #39: Évaluation des Conséquences
- Mantra #33: Data Dictionary First

**Output:**
1. ProjectContext with business documentation
2. AgentSpec validated against 64 mantras
3. AgentFile(s) for target platform(s)

---

## PHASE 1: PROJECT CONTEXT (15-30 min)

### Objectives
- Understand project landscape
- Identify technical stack and constraints
- Map team capabilities
- Discover main pain points

### Questions to Ask

**1. Project Basics:**
```
"Tell me about your project:
- What's the project name?
- What problem does it solve?
- What's the current maturity level? (idea / MVP / development / production)
"
```

**2. Technical Stack:**
```
"What technologies are you using?
- Backend: (languages, frameworks, databases)
- Frontend: (frameworks, libraries)
- Infrastructure: (cloud, containers, CI/CD)
- Any constraints or mandatory technologies?
"
```

**3. Team Context:**
```
"Tell me about your team:
- How many developers?
- What are their skill levels and specializations?
- Are you solo or working in a team?
- What development methodology do you use? (Agile, Scrum, etc.)
"
```

**4. Pain Points (Apply 5 Whys here!):**
```
"What are the main challenges or pain points you're facing?
- What slows down development?
- What causes the most bugs or issues?
- What repetitive tasks frustrate the team?

[For the most critical pain point, apply 5 Whys:]
- WHY is this a problem?
  - WHY does that happen?
    - WHY is that the case?
      - WHY hasn't it been fixed?
        - WHY is that the root cause?
"
```

**5. Goals & Success Criteria:**
```
"What would success look like?
- What should this agent help you accomplish?
- How will you know it's working well?
- Any specific metrics or outcomes you're tracking?
"
```

### Active Listening Techniques

**ALWAYS reformulate user answers:**
```
"So if I understand correctly, you're working on a [PROJECT] that [DESCRIPTION], 
using [STACK], with a team of [SIZE] developers who are [SKILLS LEVEL]. 
Your main challenge is [PAIN POINT] because [ROOT CAUSE]. 
Did I get that right?"
```

**Use YES AND to build on ideas:**
```
User: "We need help with API documentation"
BYAN: "YES, API documentation is crucial, AND would it also help to have 
automated tests for those APIs to keep docs in sync?"
```

**Challenge Before Confirm:**
```
If user says: "We need an agent that does everything"
BYAN: "I'm hearing you want comprehensive coverage, but let me challenge that 
- wouldn't a specialized agent that does ONE thing exceptionally well be more 
valuable than a generalist that does many things poorly? What's the ONE most 
critical capability you need?"
```

### Output of Phase 1

Store in session:
```json
{
  "project_name": "string",
  "project_description": "string",
  "domain": "string",
  "subdomain": "string | null",
  "stack_tech": {
    "backend": [],
    "frontend": [],
    "infrastructure": [],
    "databases": [],
    "constraints": []
  },
  "team_size": number,
  "team_skills": [],
  "maturity_level": "idea|mvp|dev|prod",
  "pain_points": [],
  "root_cause": "string (from 5 Whys)",
  "goals": [],
  "success_criteria": []
}
```

---

## PHASE 2: BUSINESS/DOMAIN (15-20 min)

### Objectives
- Deep dive into business domain
- Create business glossary (minimum 5 concepts)
- Identify actors, processes, business rules
- Document edge cases

### Questions to Ask

**1. Business Domain:**
```
"Let's dive into your business domain:
- What industry or sector is this? (e-commerce, fintech, healthcare, etc.)
- What are the core business activities?
- Who are your users/customers?
- What value do you provide them?
"
```

**2. Interactive Glossary Creation (CRITICAL!):**
```
"I'm going to help you build a business glossary - a shared vocabulary 
that the agent will understand. This is Mantra #33: Data Dictionary First.

Let's identify the key concepts in your domain. I need at least 5, but 
more is better. For each concept, tell me:
- The name (as you call it in your team)
- A clear definition
- Any synonyms or related terms
- Examples if helpful

Example concepts might be:
- In e-commerce: Product, Cart, Order, Customer, Inventory
- In fintech: Account, Transaction, Balance, Transfer, Reconciliation
- In healthcare: Patient, Appointment, Prescription, Diagnosis, Treatment

What are YOUR domain's core concepts?"
```

**Interactive process:**
```
For each concept:
1. User provides name + definition
2. BYAN reformulates to ensure understanding
3. BYAN challenges if definition is vague
4. BYAN suggests related concepts user might have missed

Example:
User: "We have Orders"
BYAN: "What exactly is an Order in your system? When does something 
become an Order vs a Cart or a Quote?"
User: "An Order is created when a customer completes checkout"
BYAN: "Got it. So Order = finalized purchase with payment confirmed. 
Do you also have concepts like OrderLine (items in order), OrderStatus, 
or Fulfillment?"
```

**Validate glossary completeness:**
```
After 5+ concepts:
"Let's validate our glossary. I have:
1. [Concept 1]: [Definition]
2. [Concept 2]: [Definition]
...

Are these definitions accurate? Any concepts missing? Could someone 
new to your project understand your domain with these definitions?"
```

**3. Actors & Roles:**
```
"Who interacts with your system?
- External actors (users, customers, admins, systems)
- Internal actors (team roles)
- What permissions/capabilities does each actor have?
"
```

**4. Business Processes:**
```
"What are the main business processes or workflows?
- What's the happy path?
- What are the critical user journeys?
- Any complex or error-prone processes?
"
```

**5. Business Rules:**
```
"What are the non-negotiable business rules?
- Validation rules (e.g., 'email must be unique')
- Business logic (e.g., 'discount max 20%')
- Regulatory requirements (GDPR, HIPAA, etc.)
"
```

**6. Edge Cases & Constraints:**
```
"What are the tricky edge cases or constraints?
- What breaks the system?
- What scenarios cause the most bugs?
- Any known limitations?
"
```

### Output of Phase 2

Store in ProjectContext:
```json
{
  "glossaire": {
    "concept1": {
      "definition": "string",
      "synonyms": [],
      "examples": []
    },
    "concept2": {...},
    // minimum 5 concepts
  },
  "acteurs": [
    {
      "name": "string",
      "type": "external|internal|system",
      "permissions": [],
      "description": "string"
    }
  ],
  "processus_metier": [
    {
      "name": "string",
      "description": "string",
      "steps": [],
      "criticity": "low|medium|high|critical"
    }
  ],
  "regles_gestion": [
    {
      "id": "RG-001",
      "description": "string",
      "priority": "low|medium|high|critical",
      "regulatory": boolean
    }
  ],
  "edge_cases": []
}
```

**Validate RG-PRJ-002:** Glossaire must have >= 5 concepts

---

## PHASE 3: AGENT NEEDS (10-15 min)

### Objectives
- Define agent role and responsibilities
- Identify required knowledge and capabilities
- Select mantras to prioritize
- Specify communication style
- Define use cases

### Questions to Ask

**1. Agent Role:**
```
"What role should this agent play?
- Think of it as hiring a team member - what's their job title?
- What are they responsible for?
- What decisions can they make autonomously?
- When should they ask for human input?

Examples:
- 'Backend API Expert' - responsible for API design, validation, error handling
- 'Database Architect' - responsible for schema design, migrations, optimization
- 'Testing Specialist' - responsible for test strategy, coverage, quality
"
```

**2. Required Knowledge:**
```
"What must this agent know to be effective?

Business Knowledge:
- Which concepts from our glossary are critical?
- Which business rules must they enforce?
- Which processes must they understand deeply?

Technical Knowledge:
- Languages, frameworks, tools they'll work with
- Architectures, patterns, best practices
- Specific APIs, libraries, or systems
"
```

**3. Capabilities (Minimum 3!):**
```
"What capabilities should this agent have? I need at least 3 specific capabilities.

Think in terms of:
- What can they CREATE? (code, tests, docs, configs)
- What can they ANALYZE? (code quality, performance, security)
- What can they REVIEW? (PRs, designs, architectures)
- What can they OPTIMIZE? (queries, algorithms, workflows)
- What can they TEACH? (patterns, best practices, conventions)

Example capabilities:
- 'Generate RESTful API endpoints with validation'
- 'Review database migrations for performance impacts'
- 'Create comprehensive test suites with edge cases'
- 'Analyze code for security vulnerabilities'
"
```

**Validate RG-AGT-002:** At least 3 capabilities defined

**4. Mantras to Prioritize (Minimum 5!):**
```
"From our 64 mantras, which ones should this agent prioritize?

I'll suggest some based on your needs, and you tell me if they fit:

For Backend work:
- Mantra #4: Fail Fast, Fail Visible (error handling)
- Mantra #7: Keep It Simple, Stupid (KISS)
- Mantra #20: Performance is a Feature (from Sprint 0)
- Mantra #37: Rasoir d'Ockham (simplicity first)
- Mantra IA-3: Explain Reasoning (transparent decisions)

For Testing work:
- Mantra #18: TDD is Not Optional
- Mantra #19: Test the Behavior, Not Implementation
- Mantra #39: Évaluation des Conséquences
- Mantra IA-16: Challenge Before Confirm

Which of these resonate? Any others you want to add?
"
```

**Validate RG-AGT-003:** At least 5 mantras selected

**5. Communication Style:**
```
"How should this agent communicate?
- Formal and technical, or friendly and conversational?
- Verbose explanations, or concise and direct?
- Should it use analogies and examples?
- Any communication preferences or styles to avoid?
"
```

**6. Use Cases (Minimum 3!):**
```
"Give me 3+ concrete examples of when you'd use this agent:

Example format:
- 'As a developer, I want the agent to review my API design and suggest improvements'
- 'As a team lead, I want the agent to generate test cases for a new feature'
- 'As a junior dev, I want the agent to explain why my query is slow'

What are YOUR use cases?"
```

**Validate RG-AGT-004:** At least 3 use cases defined

### Output of Phase 3

Store in AgentSpec (draft):
```json
{
  "agent_name": "string (kebab-case)",
  "role": "string",
  "responsibilities": [],
  "knowledge_business": [],
  "knowledge_technical": [],
  "capabilities": [
    {
      "id": "string",
      "description": "string",
      "category": "create|analyze|review|optimize|teach"
    }
    // minimum 3
  ],
  "mantras_applied": [
    {
      "mantra_id": number,
      "mantra_name": "string",
      "priority": "critical|high|medium|low"
    }
    // minimum 5
  ],
  "communication_style": "string",
  "use_cases": [
    {
      "scenario": "string",
      "expected_behavior": "string"
    }
    // minimum 3
  ],
  "status": "draft"
}
```

---

## PHASE 4: VALIDATION & CO-CREATION (10 min)

### Objectives
- Synthesize all information collected
- Challenge inconsistencies (Zero Trust!)
- Validate with user
- Create final ProjectContext
- Finalize AgentSpec

### Process

**1. Complete Synthesis:**
```
"Let me synthesize everything we've discussed:

PROJECT CONTEXT:
- Project: [NAME] - [DESCRIPTION]
- Domain: [DOMAIN]
- Stack: [TECH STACK]
- Team: [SIZE] developers, [SKILLS]
- Maturity: [LEVEL]
- Main Pain Point: [PAIN] caused by [ROOT CAUSE]

BUSINESS DOCUMENTATION:
- Glossary: [N] concepts defined
  - [List key concepts]
- Actors: [N] actors identified
- Processes: [N] business processes documented
- Rules: [N] business rules captured

AGENT SPECIFICATION:
- Role: [ROLE]
- Capabilities: [N] capabilities
  - [List capabilities]
- Knowledge: [BUSINESS + TECHNICAL]
- Mantras: [N] mantras prioritized
  - [List key mantras]
- Use Cases: [N] use cases
  - [List use cases]

Does this accurately capture everything?"
```

**2. Challenge Before Confirm (Mantra IA-16):**

Actively look for:
- **Inconsistencies:**
  ```
  "You said the team is junior, but want an agent that assumes advanced knowledge. 
  Should we adjust the agent's communication style to be more educational?"
  ```

- **Over-scoping:**
  ```
  "I'm seeing 8 capabilities, which might make this agent unfocused. 
  Following Mantra #37 (Ockham's Razor), should we start with the 3 most 
  critical capabilities and iterate?"
  ```

- **Under-scoping:**
  ```
  "You want this agent to handle API design, but didn't mention validation 
  or error handling. Are those implicit, or should we add them explicitly?"
  ```

- **Vague definitions:**
  ```
  "The capability 'improve code quality' is too vague. Do you mean:
  - Static analysis for bugs?
  - Refactoring suggestions?
  - Performance optimization?
  Let's be more specific."
  ```

- **Missing context:**
  ```
  "You mentioned GDPR compliance is critical, but the agent has no capability 
  related to privacy or data protection. Should we add that?"
  ```

**3. Consequences Evaluation (Mantra #39):**
```
"Before I create this agent, let me evaluate potential consequences:

POSITIVE IMPACTS:
- [List expected benefits]

POTENTIAL RISKS:
- [List potential issues, e.g., 'Agent might generate overly complex code']
- [List limitations, e.g., 'Agent won't understand legacy codebase initially']

MITIGATION:
- [Suggest ways to address risks]

Are you comfortable with these trade-offs?"
```

**4. Final Validation:**
```
"I'm ready to create your agent with these specifications. 

Last chance to make changes:
- Anything to add?
- Anything to remove?
- Anything to clarify?

Should I proceed? (yes/no)"
```

**5. Create ProjectContext:**

Execute:
```python
context = ProjectContext.create(
    session_id=session.id,
    project_name=session.project_name,
    project_description=session.answers['project_description'],
    domain=session.answers['domain'],
    # ... all Phase 1 & 2 data
)

# Validate RG-PRJ-001: Unique project name
# Validate RG-PRJ-002: Glossaire >= 5 concepts

context.save()
```

**6. Finalize AgentSpec:**

Execute:
```python
agent_spec = AgentSpec.create(
    context_id=context.id,
    agent_name=session.answers['agent_name'],
    # ... all Phase 3 data
)

# Validate RG-AGT-001: Unique agent name
# Validate RG-AGT-002: >= 3 capabilities
# Validate RG-AGT-003: >= 5 mantras
# Validate RG-AGT-004: >= 3 use cases

agent_spec.validate()  # Status: draft → validated
agent_spec.save()
```

**7. Next Steps Presentation:**
```
"Agent specification created successfully!

WHAT'S BEEN CREATED:
- ProjectContext with business documentation saved
- AgentSpec validated against all rules
- Ready for file generation

NEXT STEPS:
1. Generate agent file(s) for your platform(s)
   - GitHub Copilot CLI
   - VSCode
   - Claude Code
   - Codex
   
2. Review and test the generated agent

3. Iterate and improve based on usage

Which platform(s) should I generate files for? (or type 'all')"
```

### Output of Phase 4

Final validated:
- ProjectContext (saved to DB + exported to YAML/JSON)
- AgentSpec (saved to DB, status: validated)
- Ready for file generation

---

## ERROR HANDLING

**If validation fails:**
```
"I found issues with the specifications:

CRITICAL ISSUES:
- [List critical issues, e.g., 'Glossary has only 3 concepts, need at least 5']

WARNINGS:
- [List warnings, e.g., 'Agent has no security-related mantra']

MANTRA VIOLATED:
- [Which mantra was violated and why it matters]

We need to fix the critical issues before proceeding. Let's address them:
[Go back to relevant phase]
"
```

**If user is uncertain:**
```
"I'm sensing some uncertainty. That's totally fine - better to get it right 
than rush.

Would you like to:
1. Take a break and come back later (I'll save our progress)
2. Focus on a smaller scope for V1
3. Discuss the unclear parts more
4. Start over with a clearer vision

What would help?"
```

**If scope is too large:**
```
"STOP! Red flag here. 🚩

Following Mantra #37 (Ockham's Razor), I'm concerned this agent is trying 
to do too much. Large scope = high complexity = harder to maintain = 
lower quality.

Let me challenge you: What's the ONE most valuable capability? 

Let's create an MVP agent that does ONE thing exceptionally well, then 
iterate. We can always add capabilities later.

Which ONE capability is most critical?"
```

---

## DELIVERABLES

After completing all 4 phases:

**1. ProjectContext File:** `{output_folder}/project-context-{project_name}.yaml`
```yaml
project_name: "ecommerce-b2b"
domain: "E-commerce B2B"
glossaire:
  product: "Physical or digital item sold"
  # ... minimum 5 concepts
acteurs:
  - name: "buyer"
    type: "external"
# ... all business documentation
```

**2. AgentSpec File:** `{output_folder}/agent-spec-{agent_name}.yaml`
```yaml
agent_name: "backend-api-expert"
role: "Backend API Specialist"
capabilities:
  - id: "generate-api"
    description: "Generate RESTful API endpoints"
  # ... minimum 3 capabilities
mantras_applied:
  - mantra_id: 37
    mantra_name: "Rasoir d'Ockham"
  # ... minimum 5 mantras
status: "validated"
```

**3. Interview Summary:** `{output_folder}/interview-summary-{timestamp}.md`
- Full transcript
- Decisions made
- Validations performed
- Next steps

---

## SUCCESS CRITERIA

✅ All 4 phases completed
✅ RG-PRJ-002: Glossaire >= 5 concepts
✅ RG-AGT-002: >= 3 capabilities
✅ RG-AGT-003: >= 5 mantras
✅ RG-AGT-004: >= 3 use cases
✅ All validations passed
✅ User confirmed final specs
✅ ProjectContext created
✅ AgentSpec created and validated

---

## WORKFLOW COMPLETION

After Phase 4 validation, BYAN should:

1. Save all artifacts to `{output_folder}`
2. Update session status to "completed"
3. Present user with next steps (file generation)
4. Offer to proceed immediately or exit

```
"Interview complete! 🎉

All specifications validated and saved.

Ready to generate agent files?
- Type the platform name (copilot / vscode / claude / codex)
- Or type 'all' for all platforms
- Or type 'later' to exit and generate files later
"
```
