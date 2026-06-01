---
name: 'step-01-load-context'
description: 'Load requirements, knowledge base, and related artifacts'
nextStepFile: './step-02-discover-tests.md'
knowledgeIndex: '{project-root}/_byan/connaissance/testarch/tea-index.csv'
---

# Step 1: Load Context & Knowledge Base

## STEP GOAL

Gather acceptance criteria, priorities, and supporting artifacts for traceability.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Prerequisites

- Acceptance criteria available (story or provided inline)
- Tests exist OR gaps explicitly acknowledged

If acceptance criteria are missing, **HALT** and request them.

---

## 2. Load Knowledge Base

From `{knowledgeIndex}` load:

- `test-priorities-matrix.md`
- `risk-governance.md`
- `probability-impact.md`
- `test-quality.md`
- `selective-testing.md`

---

## 3. Load Artifacts

If available:

- Story file and acceptance criteria
- Test design doc (priorities)
- Tech spec / PRD

Summarize what was found.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
