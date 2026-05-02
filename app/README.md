# BYAN Electron App

Electron desktop shell for BYAN. Linux + Windows in P1, macOS deferred to F21.

## Structure

```
app/
  main/        Main process (Node) — TypeScript, compiled to dist/main/
  preload/     Preload bridge (contextBridge) — TypeScript, compiled to dist/preload/
  renderer/    Renderer SPA (React 18 + Vite) — bundled to dist/renderer/
  dist/        Build output (gitignored)
```

`app/` is a standalone npm package, NOT an npm workspace of the repo root. Reason: the
repo root publishes `create-byan-agent` and depends on `file:./install/packages/platform-config`;
activating workspaces would break that publishing pipeline.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Build main+preload once, then run renderer Vite + tsc watchers + electron concurrently |
| `npm run build` | Production build of main, preload, renderer into `dist/` |
| `npm run typecheck` | Typecheck main, preload, renderer (no emit) |
| `npm start` | Run electron against the current `dist/` (after `npm run build`) |

## Renderer link

The renderer reuses the existing `api/webui/src/` SPA via the Vite alias `@webui` and
the matching `tsconfig.renderer.json` `paths` entry. No symlink (Windows-fragile).
F3 will switch `renderer/main.tsx` from the placeholder to `import App from '@webui/App'`.

## Dev runtime

- Main process expects `BYAN_DEV=1` to load the Vite dev server (`http://localhost:5173`),
  otherwise it loads `dist/renderer/index.html` via `file://`.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — the preload
  bridge is the only path between renderer and Node.
