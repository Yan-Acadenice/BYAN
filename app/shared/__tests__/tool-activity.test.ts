// Pinned against payloads CAPTURED from the real CLIs, not written from memory.
// The claude tool_use and codex command_execution objects below are verbatim
// copies of frames observed on claude 2.1.220 and codex-cli 0.145.0.

import { describe, expect, it } from 'vitest';
import {
  claudeToolActivity,
  codexItemActivity,
  shortenToolName,
  stripShellWrapper,
  truncateDetail,
} from '../tool-activity';

describe('claudeToolActivity', () => {
  it('reads the captured Bash frame: the command wins over the model paraphrase', () => {
    // Verbatim from /tmp probe: both fields present, and `command` is the fact.
    const activity = claudeToolActivity({
      type: 'tool_use',
      id: 'toolu_018WtHBQRwsdZ9C3ffwtzkxk',
      name: 'Bash',
      input: { command: 'ls', description: 'Liste les fichiers du dossier courant' },
      caller: { type: 'direct' },
    });
    expect(activity).toEqual({ name: 'Bash', detail: 'ls', phase: 'start' });
  });

  it('names the file for a read', () => {
    expect(claudeToolActivity({ name: 'Read', input: { file_path: '/home/yan/x.ts' } }))
      .toEqual({ name: 'Read', detail: '/home/yan/x.ts', phase: 'start' });
  });

  it('names the pattern for a search', () => {
    expect(claudeToolActivity({ name: 'Grep', input: { pattern: 'TODO' } }))
      .toEqual({ name: 'Grep', detail: 'TODO', phase: 'start' });
  });

  it('keeps the tool even when no field is recognised', () => {
    // Better a bare name than a dropped frame: the user still learns work happened.
    expect(claudeToolActivity({ name: 'SomeFutureTool', input: { weird: 1 } }))
      .toEqual({ name: 'SomeFutureTool', detail: undefined, phase: 'start' });
  });

  it('rejects a payload with no tool name', () => {
    expect(claudeToolActivity({ input: { command: 'ls' } })).toBeNull();
    expect(claudeToolActivity(null)).toBeNull();
    expect(claudeToolActivity('Bash')).toBeNull();
    expect(claudeToolActivity({ name: '   ' })).toBeNull();
  });

  it('flattens a multi-line command onto one line', () => {
    const a = claudeToolActivity({ name: 'Bash', input: { command: 'ls \\\n  -la' } });
    expect(a?.detail).toBe('ls \\ -la');
  });
});

describe('shortenToolName', () => {
  it('strips the MCP transport prefix', () => {
    expect(shortenToolName('mcp__byan__byan_ping')).toBe('byan.byan_ping');
  });

  it('handles a server name that itself contains an underscore', () => {
    expect(shortenToolName('mcp__byan_loadbalancer__lb_status')).toBe('byan_loadbalancer.lb_status');
  });

  it('leaves a plain tool name alone', () => {
    expect(shortenToolName('Bash')).toBe('Bash');
    expect(shortenToolName('Read')).toBe('Read');
  });
});

describe('stripShellWrapper', () => {
  it('removes the login-shell wrapper codex actually emits', () => {
    expect(stripShellWrapper('/usr/bin/zsh -lc ls')).toBe('ls');
  });

  it('handles the other shells and flag spellings', () => {
    expect(stripShellWrapper('/bin/bash -lc "npm test"')).toBe('"npm test"');
    expect(stripShellWrapper('/bin/sh -c echo ok')).toBe('echo ok');
  });

  it('leaves a bare command untouched', () => {
    expect(stripShellWrapper('npm run build')).toBe('npm run build');
  });
});

describe('codexItemActivity', () => {
  it('reads the captured in-progress command frame', () => {
    // Verbatim from the item.started probe — the frame the engine used to ignore,
    // which is why a long codex command showed nothing until it finished.
    const activity = codexItemActivity({
      id: 'item_1',
      type: 'command_execution',
      command: '/usr/bin/zsh -lc ls',
      aggregated_output: '',
      exit_code: null,
      status: 'in_progress',
    }, 'start');
    expect(activity).toEqual({ name: 'commande', detail: 'ls', phase: 'start' });
  });

  it('carries the end phase through for the completed frame', () => {
    const activity = codexItemActivity({ type: 'command_execution', command: '/usr/bin/zsh -lc ls' }, 'end');
    expect(activity?.phase).toBe('end');
  });

  it('labels an MCP call from the fields that are present', () => {
    expect(codexItemActivity({ type: 'mcp_tool_call', server: 'byan', tool: 'byan_ping' }, 'start'))
      .toMatchObject({ name: 'byan.byan_ping', phase: 'start' });
  });

  it('falls back to a truthful label when the MCP fields are absent', () => {
    // These field names were not captured live; a guess dressed as fact would be
    // worse than a vague label.
    expect(codexItemActivity({ type: 'mcp_tool_call' }, 'start'))
      .toMatchObject({ name: 'outil MCP' });
  });

  it('labels a web search with its query', () => {
    expect(codexItemActivity({ type: 'web_search', query: 'electron ipc' }, 'start'))
      .toEqual({ name: 'recherche web', detail: 'electron ipc', phase: 'start' });
  });

  it('labels a file change with its path', () => {
    expect(codexItemActivity({ type: 'file_change', path: 'src/a.ts' }, 'end'))
      .toEqual({ name: 'modification de fichier', detail: 'src/a.ts', phase: 'end' });
  });

  it('reports an item type a future codex adds instead of dropping it', () => {
    expect(codexItemActivity({ type: 'some_new_thing' }, 'start'))
      .toEqual({ name: 'some new thing', phase: 'start' });
  });

  it('rejects a payload with no type', () => {
    expect(codexItemActivity({ command: 'ls' }, 'start')).toBeNull();
    expect(codexItemActivity(null, 'start')).toBeNull();
  });
});

describe('truncateDetail', () => {
  it('keeps a short value verbatim', () => {
    expect(truncateDetail('ls')).toBe('ls');
  });

  it('cuts a long value and marks the cut', () => {
    const out = truncateDetail('x'.repeat(200));
    expect(out).toHaveLength(80);
    expect(out.endsWith('…')).toBe(true);
  });
});
