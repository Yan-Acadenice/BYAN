# BYAN Native Workflows

> Registre des workflows portables vers l'outil Workflow natif de Claude Code.
> Genere automatiquement — ne pas editer a la main. Source : `_byan/_config/workflow-manifest.csv`.
> Regenerer : `node _byan/mcp/byan-mcp-server/bin/byan-build-workflows.js`.
>
> Resolution dual-path : le skill prefere `.claude/workflows/<name>.js` s'il existe,
> sinon il retombe sur le workflow markdown du manifest. Les workflows gated (a gate
> humain par etape) restent markdown interprete — ils ne sont pas portables.

## autonomous (11)

- `create-story` — markdown — source `_byan/workflow/simple/4-implementation/create-story/workflow.yaml`
- `dev-story` — markdown — source `_byan/workflow/simple/4-implementation/dev-story/workflow.yaml`
- `qa-automate` — markdown — source `_byan/workflow/simple/qa/automate/workflow.yaml`
- `testarch-atdd` — markdown — source `_byan/workflow/simple/testarch/atdd/workflow.yaml`
- `testarch-automate` — markdown — source `_byan/workflow/simple/testarch/automate/workflow.yaml`
- `testarch-ci` — markdown — source `_byan/workflow/simple/testarch/ci/workflow.yaml`
- `testarch-framework` — markdown — source `_byan/workflow/simple/testarch/framework/workflow.yaml`
- `testarch-nfr` — markdown — source `_byan/workflow/simple/testarch/nfr-assess/workflow.yaml`
- `testarch-test-design` — markdown — source `_byan/workflow/simple/testarch/test-design/workflow.yaml`
- `testarch-test-review` — markdown — source `_byan/workflow/simple/testarch/test-review/workflow.yaml`
- `testarch-trace` — markdown — source `_byan/workflow/simple/testarch/trace/workflow.yaml`

## pipeline (9)

- `check-implementation-readiness` — markdown — source `_byan/workflow/simple/3-solutioning/check-implementation-readiness/workflow.md`
- `code-review` — markdown — source `_byan/workflow/simple/4-implementation/code-review/workflow.yaml`
- `create-excalidraw-dataflow` — markdown — source `_byan/workflow/simple/excalidraw-diagrams/create-dataflow/workflow.yaml`
- `create-excalidraw-diagram` — markdown — source `_byan/workflow/simple/excalidraw-diagrams/create-diagram/workflow.yaml`
- `create-excalidraw-flowchart` — markdown — source `_byan/workflow/simple/excalidraw-diagrams/create-flowchart/workflow.yaml`
- `create-excalidraw-wireframe` — markdown — source `_byan/workflow/simple/excalidraw-diagrams/create-wireframe/workflow.yaml`
- `document-project` — markdown — source `_byan/workflow/simple/document-project/workflow.yaml`
- `quick-dev` — markdown — source `_byan/workflow/simple/bmad-quick-flow/quick-dev/workflow.md`
- `sprint-planning` — markdown — source `_byan/workflow/simple/4-implementation/sprint-planning/workflow.yaml`
