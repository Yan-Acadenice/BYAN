// ESLint flat config (ESLint 9+) for the BYAN Electron app.
//
// Two security-critical rules drive this file:
//   1. The renderer's RUNTIME code (everything that ships to the browser) must
//      NEVER import a Node core module. The renderer runs with sandbox: true
//      and nodeIntegration: false; even if a misuse type-checks via tsconfig,
//      we want a hard lint failure surfaced in CI.
//   2. The renderer must use `window.byanApi` with its real types — no
//      `(window as any).byanApi` escape hatch (defeats the IPC contract).
//
// Build-time files inside renderer/ (vite.config.ts) are explicitly exempt
// from the Node-import ban because they run in Node, not in the browser.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Node core modules — both bare and `node:` prefixed forms are blocked.
const NODE_CORE_MODULES = [
  'fs', 'fs/promises', 'path', 'os', 'child_process', 'crypto', 'stream',
  'http', 'https', 'net', 'tls', 'dns', 'url', 'querystring', 'util',
  'zlib', 'buffer', 'process', 'worker_threads', 'cluster', 'readline',
  'repl', 'tty', 'v8', 'vm', 'assert', 'inspector', 'perf_hooks', 'events',
  'module', 'string_decoder', 'timers', 'punycode', 'dgram', 'async_hooks',
  'electron'
];
const BLOCKED_RENDERER_IMPORTS = [
  ...NODE_CORE_MODULES,
  ...NODE_CORE_MODULES.map((m) => `node:${m}`)
];

export default [
  {
    // Project-wide ignore patterns.
    // release/ and build/ contain Electron packaged output (CommonJS JS, not TS source).
    // playwright-report/ + test-results/ are E2E run artifacts (F18).
    ignores: [
      'dist/**',
      'node_modules/**',
      'release/**',
      'build/**',
      '**/*.d.ts',
      'playwright-report/**',
      'test-results/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Renderer-specific lockdown — applies to the SPA runtime only.
    // Excludes build-time Node configs (vite, postcss, tailwind).
    files: ['renderer/**/*.{ts,tsx,js,jsx}'],
    ignores: [
      'renderer/vite.config.ts',
      'renderer/postcss.config.js',
      'renderer/tailwind.config.js'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: BLOCKED_RENDERER_IMPORTS.map((name) => ({
            name,
            message: `"${name}" is a Node module — the renderer runs sandboxed and must call main via window.byanApi instead.`
          }))
        }
      ],
      // Forbid (window as any).byanApi style escape hatches in renderer code.
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword'] > Identifier[name='window']",
          message: 'Do not cast window to any. Use the typed window.byanApi (see renderer/global.d.ts).'
        },
        {
          selector: "MemberExpression[object.type='TSAsExpression'][object.typeAnnotation.type='TSAnyKeyword']",
          message: 'Do not access properties through an `as any` cast.'
        }
      ]
    }
  },
  {
    // main + preload + shared: full Node access is fine.
    files: ['main/**/*.ts', 'preload/**/*.ts', 'shared/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // Tests can use any pattern — they exercise edge cases.
    files: ['main/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  {
    // E2E tests (F18) — Playwright + Node fixtures. Same relaxations as the
    // main test tree, plus playwright.config.ts which lives at the app root.
    files: ['__tests__/e2e/**/*.ts', 'playwright.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
];
