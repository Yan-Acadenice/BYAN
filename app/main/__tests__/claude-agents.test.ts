// claude-agents — which slugs `claude --agent` honours, and how a user's word
// maps onto one.
//
// These tests exist because an invalid slug is a SILENT no-op at the CLI
// boundary (measured: exit 0, agent simply omitted), so nothing downstream can
// catch the mistake. The guard has to hold here or not at all.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { availableClaudeAgents, resolveClaudeAgent, suggestClaudeAgents } from '../claude-agents';

let projectRoot: string;
let fakeHome: string;
const realHome = process.env.HOME;

function writeAgent(root: string, slug: string): void {
  const dir = path.join(root, '.claude', 'agents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}.md`), `# ${slug}\n`, 'utf8');
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-agents-'));
  // The reader also consults the USER-level ~/.claude/agents, which really does
  // hold dozens of agents on a working machine. Point HOME at an empty tmp dir
  // so these assertions describe the code, not the developer's setup.
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-home-'));
  process.env.HOME = fakeHome;
});

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  for (const d of [projectRoot, fakeHome]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('availableClaudeAgents', () => {
  it('lists the project agents by basename, sorted', () => {
    writeAgent(projectRoot, 'bmad-byan');
    writeAgent(projectRoot, 'bmad-bmm-dev');
    const found = availableClaudeAgents(projectRoot);
    expect(found).toContain('bmad-byan');
    expect(found).toContain('bmad-bmm-dev');
    expect(found).toEqual([...found].sort());
  });

  it('ignores non-markdown entries and directories', () => {
    writeAgent(projectRoot, 'bmad-byan');
    const dir = path.join(projectRoot, '.claude', 'agents');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x', 'utf8');
    fs.mkdirSync(path.join(dir, 'subdir'), { recursive: true });
    expect(availableClaudeAgents(projectRoot)).toEqual(['bmad-byan']);
  });

  it('merges the user-level agents, with the project winning on a clash', () => {
    writeAgent(projectRoot, 'shared');
    const userDir = path.join(fakeHome, '.claude', 'agents');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'shared.md'), '# user\n', 'utf8');
    fs.writeFileSync(path.join(userDir, 'user-only.md'), '# user\n', 'utf8');

    const found = availableClaudeAgents(projectRoot);
    expect(found).toEqual(['shared', 'user-only']);
    expect(found.filter((a) => a === 'shared')).toHaveLength(1);
  });

  it('returns an empty list when nothing is declared anywhere', () => {
    expect(availableClaudeAgents(projectRoot)).toEqual([]);
  });

  it('does not throw on a missing or relative project root', () => {
    expect(() => availableClaudeAgents(null)).not.toThrow();
    expect(() => availableClaudeAgents('relative/path')).not.toThrow();
  });
});

describe('resolveClaudeAgent', () => {
  const available = ['bmad-bmm-dev', 'bmad-byan', 'bmad-byan-v2', 'claude', 'general-purpose'];

  it('takes an exact match', () => {
    expect(resolveClaudeAgent('bmad-byan', available)).toBe('bmad-byan');
    expect(resolveClaudeAgent('claude', available)).toBe('claude');
  });

  it('maps a bare name onto the declared slug that ends with it', () => {
    // 'byan' -> 'bmad-byan', not 'bmad-byan-v2': the shortest suffix match wins,
    // so the plain name resolves to the plain agent.
    expect(resolveClaudeAgent('byan', available)).toBe('bmad-byan');
    expect(resolveClaudeAgent('dev', available)).toBe('bmad-bmm-dev');
  });

  it('is case-insensitive on what the user typed', () => {
    expect(resolveClaudeAgent('BYAN', available)).toBe('bmad-byan');
  });

  it('returns null for an unknown or empty name rather than guessing', () => {
    // The whole point: an unresolvable slug must NOT reach the CLI, which would
    // accept it and silently ignore it.
    expect(resolveClaudeAgent('architecte-en-chef', available)).toBeNull();
    expect(resolveClaudeAgent('', available)).toBeNull();
    expect(resolveClaudeAgent('   ', available)).toBeNull();
  });

  it('returns null when nothing is declared at all', () => {
    expect(resolveClaudeAgent('byan', [])).toBeNull();
  });
});

describe('suggestClaudeAgents', () => {
  const available = ['bmad-byan', 'bmad-byan-v2', 'bmad-bmm-dev', 'claude'];

  it('proposes the slugs containing what was typed', () => {
    expect(suggestClaudeAgents('byan', available)).toEqual(['bmad-byan', 'bmad-byan-v2']);
  });

  it('falls back to the head of the list when nothing matches', () => {
    expect(suggestClaudeAgents('zzz', available)).toEqual([]);
    expect(suggestClaudeAgents('', available, 2)).toEqual(['bmad-byan', 'bmad-byan-v2']);
  });

  it('honours the limit', () => {
    expect(suggestClaudeAgents('bmad', available, 1)).toEqual(['bmad-byan']);
  });
});
