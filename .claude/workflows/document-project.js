export const meta = {
  name: 'document-project',
  description: 'Faithful native port of the BYAN document-project full-scan pipeline: scan a brownfield codebase and emit comprehensive reference docs (overview, tech stack, source tree, conditional analysis, per-part architecture, master index) for AI-assisted development. Mirrors full-scan-instructions.md steps 1-12. Human gates (scan-level choice, classification confirmation, review iteration) stay OUT of the script and surface as a verdict.',
  phases: [
    { title: 'CLASSIFY' },
    { title: 'EXISTING_DOCS' },
    { title: 'TECH_STACK' },
    { title: 'CONDITIONAL_ANALYSIS' },
    { title: 'SOURCE_TREE' },
    { title: 'DEV_OPS' },
    { title: 'INTEGRATION' },
    { title: 'ARCHITECTURE' },
    { title: 'SUPPORTING_DOCS' },
    { title: 'MASTER_INDEX' },
    { title: 'VALIDATE' },
    { title: 'FINALIZE' }
  ]
}

// FD/STRICT CONTRACT (re-asserted): this script returns data only. It NEVER imports
// or writes lib/fd-state.js / fd-state.json, and records no platform/strict state.
// The orchestrating skill records FD/strict state via MCP at the human gate. The
// script also uses no wall-clock and no randomness (both break Workflow resume);
// any timestamp/id is passed in via args. The byan-lint-workflows linter forbids
// fd-state coupling here.

// Inputs (passed by the orchestrating skill; no fs / no clock / no RNG here).
const projectRoot = (args && args.projectRoot) || process.cwd()
const outputFolder = (args && args.outputFolder) || '_byan-output/project-documentation'
// scan_level mirrors the source human gate (quick | deep | exhaustive). The script
// does NOT prompt for it; it threads the choice through. Default = quick (source default).
const scanLevel = (args && args.scanLevel) || 'quick'
// workflow_mode mirrors the source router: initial_scan | full_rescan. deep_dive is a
// separate sub-workflow and is intentionally out of this full-scan port's scope.
const workflowMode = (args && args.workflowMode) || 'initial_scan'
const runDate = (args && args.date) || 'unspecified'

const reqCsv = projectRoot + '/_byan/workflow/simple/document-project/documentation-requirements.csv'

log('document-project full-scan port — mode=' + workflowMode + ' scan_level=' + scanLevel)
log('project_root=' + projectRoot + ' output=' + outputFolder)

// STEP 1 — Detect project structure and classify project type.
phase('CLASSIFY')
const classification = await agent(
  'You are documenting the brownfield project rooted at "' + projectRoot + '". ' +
  'STEP 1 (document-project full-scan): detect repository structure and classify project type(s). ' +
  'Scan the root for directory markers (client/ server/ api/ src/ app/ packages/) and key manifest files ' +
  '(package.json, go.mod, requirements.txt, Cargo.toml, pom.xml, etc.). ' +
  'Decide repository_type: monolith | monorepo | multi-part. For each distinct part, identify its root path and ' +
  'match detected tech/file patterns against key_file_patterns in the documentation-requirements CSV at "' + reqCsv + '" ' +
  '(12 project types: web, mobile, backend, cli, library, desktop, game, data, extension, infra, embedded, and a fallback). ' +
  'Assign a project_type_id and display_name to each part. ' +
  'Do NOT confirm with the user — record the classification so the orchestrating skill can confirm it at the human gate.',
  {
    label: 'classify-project',
    phase: 'CLASSIFY',
    schema: {
      type: 'object',
      required: ['repositoryType', 'parts'],
      properties: {
        repositoryType: { type: 'string', enum: ['monolith', 'monorepo', 'multi-part'] },
        primaryLanguage: { type: 'string' },
        parts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['partId', 'rootPath', 'projectTypeId'],
            properties: {
              partId: { type: 'string' },
              rootPath: { type: 'string' },
              projectTypeId: { type: 'string' },
              displayName: { type: 'string' }
            }
          }
        },
        classificationSummary: { type: 'string' }
      }
    }
  }
)

const parts = (classification && classification.parts) || []
const isMultiPart = classification.repositoryType !== 'monolith' && parts.length > 1
log('classified as ' + classification.repositoryType + ' with ' + parts.length + ' part(s)')

// STEP 2 — Discover existing documentation and gather user context.
phase('EXISTING_DOCS')
const existingDocs = await agent(
  'STEP 2 (document-project): for each part of this ' + classification.repositoryType + ' project, ' +
  'inventory existing documentation. Scan for README.*, CONTRIBUTING.*, ARCHITECTURE.*, DEPLOYMENT.*/DEPLOY.*, ' +
  'API.*, and anything under docs/, documentation/, .github/. ' +
  'For each doc record: file path, doc type (readme | architecture | api | deployment | contributing | other), ' +
  'and the owning part id when multi-part. ' +
  'Do NOT ask the user for extra focus areas — that is a human gate; just return the inventory.',
  {
    label: 'scan-existing-docs',
    model: 'haiku',
    phase: 'EXISTING_DOCS',
    schema: {
      type: 'object',
      required: ['docs'],
      properties: {
        docs: {
          type: 'array',
          items: {
            type: 'object',
            required: ['path', 'docType'],
            properties: {
              path: { type: 'string' },
              docType: { type: 'string' },
              partId: { type: 'string' }
            }
          }
        },
        count: { type: 'number' }
      }
    }
  }
)
log('found ' + ((existingDocs && existingDocs.docs && existingDocs.docs.length) || 0) + ' existing doc(s)')

// STEP 3 — Analyze technology stack for each part.
phase('TECH_STACK')
const techStack = await agent(
  'STEP 3 (document-project): analyze the technology stack for each part. ' +
  'Parse manifest files (package.json, go.mod, requirements.txt, Cargo.toml, etc.) per part to extract ' +
  'framework, language, version, database, and key dependencies. Build a technology table ' +
  '(Category, Technology, Version, Justification). Determine the architecture pattern per part, driven by its ' +
  'project_type_id and framework (e.g. web -> layered/component-based, backend -> service/API-centric, ' +
  'React -> component hierarchy, Express -> middleware pipeline). ' +
  'Parts to cover: ' + JSON.stringify(parts.map(p => p.partId)) + '.',
  {
    label: 'tech-stack',
    phase: 'TECH_STACK',
    schema: {
      type: 'object',
      required: ['perPart'],
      properties: {
        perPart: {
          type: 'array',
          items: {
            type: 'object',
            required: ['partId', 'framework', 'language'],
            properties: {
              partId: { type: 'string' },
              framework: { type: 'string' },
              language: { type: 'string' },
              database: { type: 'string' },
              architecturePattern: { type: 'string' },
              dependencies: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    }
  }
)

// STEP 4 — Conditional analysis driven by documentation_requirements boolean flags.
// scan_level gates depth: quick = pattern/glob only (no source reading); deep = read
// critical_directories; exhaustive = read all source (excl node_modules/.git/dist/build/coverage).
phase('CONDITIONAL_ANALYSIS')
const conditional = await agent(
  'STEP 4 (document-project): perform conditional analysis per part, honoring scan_level="' + scanLevel + '". ' +
  'For scan_level=quick use glob/grep and config/filename patterns ONLY — do NOT open source files. ' +
  'For scan_level=deep read files in the critical_directories for each part type. ' +
  'For scan_level=exhaustive read all source files (exclude node_modules, .git, dist, build, coverage), ' +
  'processing one subfolder at a time. ' +
  'For each part, consult its documentation_requirements row (from "' + reqCsv + '") and run the scans whose flag is true: ' +
  'requires_api_scan -> catalog API routes/endpoints (controllers/ routes/ api/ handlers/), write api-contracts-{part}.md; ' +
  'requires_data_models -> catalog schemas/entities/migrations (models/ schemas/ prisma/), write data-models-{part}.md; ' +
  'requires_state_management -> identify stores/reducers/actions; ' +
  'requires_ui_components -> inventory components/ ui/ widgets/ views/; ' +
  'requires_hardware_docs -> note hardware/pinout/schematic references; ' +
  'requires_asset_inventory -> catalog images/audio/models/sprites/textures. ' +
  'Also scan supplementary patterns: config, auth/security, entry points, shared code, async/events, ci/cd, localization. ' +
  'Return counts and the artifact filenames you would write.',
  {
    label: 'conditional-analysis',
    phase: 'CONDITIONAL_ANALYSIS',
    schema: {
      type: 'object',
      required: ['perPart'],
      properties: {
        perPart: {
          type: 'array',
          items: {
            type: 'object',
            required: ['partId'],
            properties: {
              partId: { type: 'string' },
              apiEndpointCount: { type: 'number' },
              dataModelCount: { type: 'number' },
              uiComponentCount: { type: 'number' },
              hasStateManagement: { type: 'boolean' },
              hasAssets: { type: 'boolean' },
              filesGenerated: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    }
  }
)

// STEP 5 — Source tree analysis with annotations.
phase('SOURCE_TREE')
const sourceTree = await agent(
  'STEP 5 (document-project): generate an annotated source tree per part using each part\'s critical_directories. ' +
  'Annotate the purpose of each critical directory, mark entry points, highlight key file locations, and ' +
  '(for multi-part projects) note integration/interface points between parts. ' +
  'Produce the content for source-tree-analysis.md.',
  {
    label: 'source-tree',
    model: 'haiku',
    phase: 'SOURCE_TREE',
    schema: {
      type: 'object',
      required: ['outputFile'],
      properties: {
        outputFile: { type: 'string' },
        criticalFolderCount: { type: 'number' },
        treeMarkdown: { type: 'string' }
      }
    }
  }
)

// STEP 6 — Extract development and operational information.
phase('DEV_OPS')
const devOps = await agent(
  'STEP 6 (document-project): extract development and operational info. ' +
  'From manifests, configs, and existing docs determine: prerequisites (runtime versions), install steps, ' +
  'environment setup (.env/config), build commands, run commands, and test commands (using test_file_patterns). ' +
  'Detect deployment config via ci/cd patterns: Dockerfile, docker-compose.yml, k8s/, helm/, .github/workflows/, ' +
  '.gitlab-ci.yml, deployment scripts, terraform/, pulumi/. ' +
  'If a CONTRIBUTING file exists, extract code style, PR process, commit conventions, testing requirements. ' +
  'Report which of dev-setup / deployment / contribution were found.',
  {
    label: 'dev-ops',
    phase: 'DEV_OPS',
    schema: {
      type: 'object',
      required: ['devSetupDocumented'],
      properties: {
        devSetupDocumented: { type: 'boolean' },
        deploymentFound: { type: 'boolean' },
        contributionFound: { type: 'boolean' },
        notes: { type: 'string' }
      }
    }
  }
)

// STEP 7 — Multi-part integration architecture (only when project has multiple parts).
phase('INTEGRATION')
let integration = { applicable: false, integrationPoints: [] }
if (isMultiPart) {
  integration = await agent(
    'STEP 7 (document-project): this is a multi-part project. Analyze how parts communicate ' +
    '(REST, GraphQL, gRPC, message queues, shared databases) via integration_scan_patterns. ' +
    'Build an integration_points list of { from, to, type, details } and produce integration-architecture.md content.',
    {
      label: 'integration-architecture',
      phase: 'INTEGRATION',
      schema: {
        type: 'object',
        required: ['integrationPoints'],
        properties: {
          integrationPoints: {
            type: 'array',
            items: {
              type: 'object',
              required: ['from', 'to', 'type'],
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                type: { type: 'string' },
                details: { type: 'string' }
              }
            }
          },
          outputFile: { type: 'string' }
        }
      }
    }
  )
  integration.applicable = true
} else {
  log('single-part project — integration architecture step skipped (mirrors source if-guard)')
}

// STEP 8 — Generate architecture documentation for each part.
phase('ARCHITECTURE')
const architecture = await agent(
  'STEP 8 (document-project): generate architecture documentation per part. For each part fill: ' +
  'Executive Summary, Technology Stack (Step 3), Architecture Pattern, Data Architecture (Step 4 data models), ' +
  'API Design (Step 4 APIs if applicable), Component Overview (Step 4 components if applicable), Source Tree (Step 5), ' +
  'Development Workflow + Deployment Architecture (Step 6), Testing Strategy. ' +
  'For a single-part project write architecture.md; for multi-part write architecture-{part}.md per part. ' +
  'No placeholder sections — every section must be filled from discovered data. Report the files you would write.',
  {
    label: 'architecture-docs',
    phase: 'ARCHITECTURE',
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)

// STEP 9 — Generate supporting documentation files.
phase('SUPPORTING_DOCS')
const supporting = await agent(
  'STEP 9 (document-project): generate the supporting docs from the discovered data. Always: ' +
  'project-overview.md (name, purpose, exec summary, tech stack table, architecture type, repo structure, links) ' +
  'and source-tree-analysis.md. Conditionally: component-inventory(-{part}).md if UI components exist; ' +
  'development-guide(-{part}).md; deployment-guide.md if deployment config found; contribution-guide.md if guidelines found; ' +
  'api-contracts(-{part}).md if APIs documented; data-models(-{part}).md if data models found; ' +
  'and for multi-part: integration-architecture.md + project-parts.json metadata. ' +
  'Use the (To be generated) marker exactly for any doc that should exist but cannot be produced. ' +
  'Return the full list of files written.',
  {
    label: 'supporting-docs',
    phase: 'SUPPORTING_DOCS',
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: { type: 'array', items: { type: 'string' } },
        toBeGeneratedMarkers: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)

// STEP 10 — Generate master index as the primary AI retrieval source.
phase('MASTER_INDEX')
const masterIndex = await agent(
  'STEP 10 (document-project): write index.md — the master entry point for AI-assisted development. ' +
  'Include: Project Overview (type/repository_type, primary language, architecture), Quick Reference ' +
  '(single-part: tech stack/entry point/pattern; multi-part: per-part block), Generated Documentation links, ' +
  'Existing Documentation links, and a Getting Started section. ' +
  'Before linking each generated doc, check whether the file actually exists; if a doc was expected but missing, ' +
  'append the EXACT marker "(To be generated)" to its link so Step 11 can detect it. ' +
  'Return the missing-doc list captured from those markers.',
  {
    label: 'master-index',
    phase: 'MASTER_INDEX',
    schema: {
      type: 'object',
      required: ['outputFile'],
      properties: {
        outputFile: { type: 'string' },
        missingDocs: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)

// STEP 11 — Validate against checklist + detect incomplete-documentation markers.
// The source loops here at a HUMAN gate (generate-incomplete / review / finalize). The
// script does NOT loop or prompt: it runs the validation + marker scan once and returns a
// verdict; the orchestrating skill drives the iteration at the gate.
phase('VALIDATE')
const validation = await agent(
  'STEP 11 (document-project): validate the generated documentation set against the checklist ' +
  '(checklist.md): write-as-you-go coverage, classification accuracy, tech-stack completeness, file completeness, ' +
  'index navigation, brownfield-PRD readiness. ' +
  'Then scan index.md for incomplete-documentation markers: PRIMARY exact "(To be generated)", FALLBACK fuzzy ' +
  '"(TBD)" "(TODO)" "(Coming soon)" "(Not yet generated)" "(Pending)". ' +
  'For each marker capture { title, filePath, docType, partId, fuzzyMatch }. ' +
  'Do NOT prompt the user to generate/review/finalize — return a verdict the orchestrating skill presents at the gate.',
  {
    label: 'validate-docs',
    phase: 'VALIDATE',
    schema: {
      type: 'object',
      required: ['checklistPassed', 'incompleteDocs'],
      properties: {
        checklistPassed: { type: 'boolean' },
        criticalIssues: { type: 'array', items: { type: 'string' } },
        incompleteDocs: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'docType'],
            properties: {
              title: { type: 'string' },
              filePath: { type: 'string' },
              docType: { type: 'string' },
              partId: { type: 'string' },
              fuzzyMatch: { type: 'boolean' }
            }
          }
        }
      }
    }
  }
)

// STEP 12 — Finalize and compile the summary report.
phase('FINALIZE')
const finalize = await agent(
  'STEP 12 (document-project): compile the final summary. List every generated file under "' + outputFolder + '" ' +
  'with the master index (index.md) flagged as the primary entry point. Compile the verification recap: ' +
  'verificationSummary (concrete tests/extractions executed, or "none run"), openRisks (remaining risks/TODOs, or "none"), ' +
  'nextChecks (recommended actions before a brownfield PRD / PR, or "none"). ' +
  'Run date provided by orchestrator: ' + runDate + '.',
  {
    label: 'finalize',
    phase: 'FINALIZE',
    schema: {
      type: 'object',
      required: ['generatedFiles'],
      properties: {
        generatedFiles: { type: 'array', items: { type: 'string' } },
        verificationSummary: { type: 'string' },
        openRisks: { type: 'string' },
        nextChecks: { type: 'string' }
      }
    }
  }
)

const incompleteCount = (validation && validation.incompleteDocs && validation.incompleteDocs.length) || 0

// The human decision (review-iteration loop / finalize) lives OUTSIDE the script.
// We return a structured verdict; needsHumanGate is true so the orchestrating skill can
// present classification confirmation + the incomplete-docs menu and record FD/strict state.
return {
  workflow: 'document-project',
  summary: 'Documented ' + classification.repositoryType + ' project (' + parts.length +
    ' part(s)) at scan_level=' + scanLevel + '; ' + incompleteCount + ' incomplete-doc marker(s) detected.',
  steps: 12,
  mode: workflowMode,
  scanLevel: scanLevel,
  needsHumanGate: true,
  classification: classification,
  result: {
    existingDocs: existingDocs,
    techStack: techStack,
    conditionalAnalysis: conditional,
    sourceTree: sourceTree,
    devOps: devOps,
    integration: integration,
    architecture: architecture,
    supportingDocs: supporting,
    masterIndex: masterIndex,
    validation: validation,
    finalize: finalize
  }
}
