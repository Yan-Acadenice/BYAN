import { spawn } from 'node:child_process';
import path from 'node:path';

const CLI_REL_PATH = 'bin/byan-v2-cli.js';
const DEFAULT_TIMEOUT_MS = 10_000;

export function parseCliOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return { raw: '' };

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const firstBracket = trimmed.search(/[\[{]/);
  if (firstBracket >= 0) {
    const candidate = trimmed.slice(firstBracket);
    try {
      return JSON.parse(candidate);
    } catch {
      // still not valid JSON
    }
  }

  return { raw: trimmed };
}

function resolveProjectRoot(envRoot) {
  return envRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function runByanCli(args, options = {}) {
  const root = resolveProjectRoot(options.projectRoot);
  const script = path.join(root, CLI_REL_PATH);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn('node', [script, ...args], {
      cwd: root,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`byan-v2-cli timed out after ${timeoutMs}ms: ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(
          `byan-v2-cli exited ${code}: ${stderr.trim() || stdout.trim()}`
        );
        err.code = code;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
        return;
      }
      resolve(parseCliOutput(stdout));
    });
  });
}

export async function eloSummary(opts) {
  return runByanCli(['elo', 'summary'], opts);
}

export async function eloContext({ domain, ...opts }) {
  if (!domain) throw new Error('domain is required');
  return runByanCli(['elo', 'context', domain], opts);
}

export async function eloDashboard({ domain, ...opts }) {
  return runByanCli(domain ? ['elo', 'dashboard', domain] : ['elo', 'dashboard'], opts);
}

export async function eloRecord({ domain, result, reason, ...opts }) {
  if (!domain) throw new Error('domain is required');
  if (!['VALIDATED', 'BLOCKED', 'PARTIAL'].includes(result)) {
    throw new Error(`result must be VALIDATED|BLOCKED|PARTIAL, got: ${result}`);
  }
  const args = ['elo', 'record', domain, result];
  if (reason) args.push(reason);
  return runByanCli(args, opts);
}

export async function fcCheck({ text, ...opts }) {
  if (!text || typeof text !== 'string') throw new Error('text is required');
  return runByanCli(['fc', 'check', text], opts);
}

export async function fcParse({ text, ...opts }) {
  if (!text || typeof text !== 'string') throw new Error('text is required');
  return runByanCli(['fc', 'parse', text], opts);
}
