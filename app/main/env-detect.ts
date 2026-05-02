// Platform CLI detection — no shell redirection, no shell=true.
// Uses exec() with a timeout so a missing binary does not stall the process.
//
// Detection strategy per platform:
//   Linux/macOS : `which <name>` exits 0 and prints the path on success
//   Windows     : `where <name>.exe` exits 0 and prints the path on success
//
// Copilot has no .exe variant on Windows — `gh` is the binary and `gh extension
// list` must grep for 'copilot'. We keep the logic self-contained here.

import { exec } from 'child_process';
import type { CliDetection } from '../shared/ipc-contract';

const TIMEOUT_MS = 5_000;

// Promisify exec with an enforced timeout.
// Returns the trimmed stdout on success, null on non-zero exit or timeout.
function probe(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = exec(command, { timeout: TIMEOUT_MS }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const result = stdout.trim();
      resolve(result.length > 0 ? result : null);
    });
    child.on('error', () => resolve(null));
  });
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

// Returns the first non-empty line from a multi-line where.exe output.
function firstLine(output: string | null): string | null {
  if (!output) return null;
  const first = output.split(/\r?\n/)[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export async function detectClaude(): Promise<string | undefined> {
  let result: string | null;
  if (isWindows()) {
    result = firstLine(await probe('where claude.exe'));
    if (!result) result = firstLine(await probe('where claude'));
  } else {
    result = await probe('which claude');
  }
  return result ?? undefined;
}

export async function detectCodex(): Promise<string | undefined> {
  let result: string | null;
  if (isWindows()) {
    result = firstLine(await probe('where codex.exe'));
    if (!result) result = firstLine(await probe('where codex'));
  } else {
    result = await probe('which codex');
  }
  return result ?? undefined;
}

export async function detectCopilot(): Promise<string | undefined> {
  // Copilot is distributed as a gh extension, not a standalone binary.
  // Step 1: find `gh` itself.
  let ghPath: string | null;
  if (isWindows()) {
    ghPath = firstLine(await probe('where gh.exe'));
    if (!ghPath) ghPath = firstLine(await probe('where gh'));
  } else {
    ghPath = await probe('which gh');
  }

  if (!ghPath) return undefined;

  // Step 2: verify the copilot extension is installed.
  const extensions = await probe('gh extension list');
  if (!extensions) return undefined;

  const hasCopilot = extensions
    .split(/\r?\n/)
    .some((line) => line.toLowerCase().includes('copilot'));

  return hasCopilot ? ghPath : undefined;
}

// E2E hook: parse `BYAN_E2E_MOCK_CLI=claude:/p,codex:/q,copilot:/r` into
// a CliDetection object so the F18 Playwright suite runs without depending
// on which/where binaries on the runner. Returns null if the env var is unset.
function parseMockCli(): CliDetection | null {
  if (process.env.BYAN_E2E_MODE !== '1') return null;
  const raw = process.env.BYAN_E2E_MOCK_CLI;
  if (!raw) return null;

  const out: CliDetection = {};
  for (const entry of raw.split(',')) {
    const [key, ...rest] = entry.split(':');
    const path = rest.join(':').trim();
    const k = key?.trim();
    if (!path) continue;
    if (k === 'claude' || k === 'codex' || k === 'copilot') {
      out[k] = path;
    }
  }
  return out;
}

export async function detectAll(): Promise<CliDetection> {
  const mock = parseMockCli();
  if (mock) return mock;

  const [claude, codex, copilot] = await Promise.all([
    detectClaude(),
    detectCodex(),
    detectCopilot(),
  ]);
  const result: CliDetection = {};
  if (claude) result.claude = claude;
  if (codex) result.codex = codex;
  if (copilot) result.copilot = copilot;
  return result;
}
