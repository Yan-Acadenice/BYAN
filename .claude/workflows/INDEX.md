# BYAN Native Workflows

> Registre des workflows portables vers l'outil Workflow natif de Claude Code.
> Genere automatiquement — ne pas editer a la main. Source : `_byan/_config/workflow-manifest.csv`.
> Regenerer : `node _byan/mcp/byan-mcp-server/bin/byan-build-workflows.js`.
>
> Resolution dual-path : le skill prefere `.claude/workflows/<name>.js` s'il existe,
> sinon il retombe sur le workflow markdown du manifest. Les workflows gated (a gate
> humain par etape) restent markdown interprete — ils ne sont pas portables.

## autonomous (11)

- `create-story` — native — source `_byan/workflow/simple/4-implementation/create-story/workflow.yaml`
- `dev-story` — native — source `_byan/workflow/simple/4-implementation/dev-story/workflow.yaml`
- `qa-automate` — native — source `_byan/workflow/simple/qa/automate/workflow.yaml`
- `testarch-atdd` — native — source `_byan/workflow/simple/testarch/atdd/workflow.yaml`
- `testarch-automate` — native — source `_byan/workflow/simple/testarch/automate/workflow.yaml`
- `testarch-ci` — native — source `_byan/workflow/simple/testarch/ci/workflow.yaml`
- `testarch-framework` — native — source `_byan/workflow/simple/testarch/framework/workflow.yaml`
- `testarch-nfr` — native — source `_byan/workflow/simple/testarch/nfr-assess/workflow.yaml`
- `testarch-test-design` — native — source `_byan/workflow/simple/testarch/test-design/workflow.yaml`
- `testarch-test-review` — native — source `_byan/workflow/simple/testarch/test-review/workflow.yaml`
- `testarch-trace` — native — source `_byan/workflow/simple/testarch/trace/workflow.yaml`

## pipeline (10)

- `byan-benchmark` — native — source `_byan/workflow/simple/bmb/byan-benchmark/workflow.md`
- `check-implementation-readiness` — native — source `_byan/workflow/simple/3-solutioning/check-implementation-readiness/workflow.md`
- `code-review` — native — source `_byan/workflow/simple/4-implementation/code-review/workflow.yaml`
- `create-excalidraw-dataflow` — native — source `_byan/workflow/simple/excalidraw-diagrams/create-dataflow/workflow.yaml`
- `create-excalidraw-diagram` — native — source `_byan/workflow/simple/excalidraw-diagrams/create-diagram/workflow.yaml`
- `create-excalidraw-flowchart` — native — source `_byan/workflow/simple/excalidraw-diagrams/create-flowchart/workflow.yaml`
- `create-excalidraw-wireframe` — native — source `_byan/workflow/simple/excalidraw-diagrams/create-wireframe/workflow.yaml`
- `document-project` — native — source `_byan/workflow/simple/document-project/workflow.yaml`
- `quick-dev` — native — source `_byan/workflow/simple/bmad-quick-flow/quick-dev/workflow.md`
- `sprint-planning` — native — source `_byan/workflow/simple/4-implementation/sprint-planning/workflow.yaml`
