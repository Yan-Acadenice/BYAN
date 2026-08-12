// Pinned against payloads CAPTURED from the real CLIs, not written from memory.
// The claude tool_use / tool_result objects and the codex command_execution
// object below are verbatim copies of frames observed on claude 2.1.220 and
// codex-cli 0.146.0 (probes of 2026-07-27 and 2026-07-31).

import { describe, expect, it } from 'vitest';
import {
  buildActivityTimeline,
  claudeToolActivity,
  claudeToolResultActivity,
  codexItemActivity,
  parseFrameInstant,
  shortenToolName,
  stripShellWrapper,
  truncateDetail,
  type LocalChatActivity,
} from '../tool-activity';

// A fixed instant so every assertion on time is exact rather than approximate.
const T0 = Date.parse('2026-07-31T09:41:16.116Z');

function act(over: Partial<LocalChatActivity> & { phase: 'start' | 'end'; at: number }): LocalChatActivity {
  return { name: 'Bash', ...over };
}

describe('claudeToolActivity', () => {
  it('reads the captured Bash frame: the command wins over the model paraphrase', () => {
    // Verbatim from the probe: both fields present, and `command` is the fact.
    const activity = claudeToolActivity({
      type: 'tool_use',
      id: 'toolu_018WtHBQRwsdZ9C3ffwtzkxk',
      name: 'Bash',
      input: { command: 'ls', description: 'Liste les fichiers du dossier courant' },
      caller: { type: 'direct' },
    }, T0);
    expect(activity).toEqual({
      name: 'Bash',
      detail: 'ls',
      phase: 'start',
      id: 'toolu_018WtHBQRwsdZ9C3ffwtzkxk',
      at: T0,
    });
  });

  it('names the file for a read', () => {
    expect(claudeToolActivity({ name: 'Read', input: { file_path: '/home/yan/x.ts' } }, T0))
      .toMatchObject({ name: 'Read', detail: '/home/yan/x.ts', phase: 'start', at: T0 });
  });

  it('names the pattern for a search', () => {
    expect(claudeToolActivity({ name: 'Grep', input: { pattern: 'TODO' } }, T0))
      .toMatchObject({ name: 'Grep', detail: 'TODO', phase: 'start' });
  });

  it('keeps the tool even when no field is recognised', () => {
    // Better a bare name than a dropped frame: the user still learns work happened.
    expect(claudeToolActivity({ name: 'SomeFutureTool', input: { weird: 1 } }, T0))
      .toEqual({ name: 'SomeFutureTool', detail: undefined, phase: 'start', id: undefined, at: T0 });
  });

  it('leaves the id ABSENT rather than empty when the frame carries none', () => {
    // Two empty-string ids would pair two unrelated calls with each other.
    expect(claudeToolActivity({ name: 'Read', id: '   ' }, T0)?.id).toBeUndefined();
    expect(claudeToolActivity({ name: 'Read' }, T0)?.id).toBeUndefined();
  });

  it('rejects a payload with no tool name', () => {
    expect(claudeToolActivity({ input: { command: 'ls' } }, T0)).toBeNull();
    expect(claudeToolActivity(null, T0)).toBeNull();
    expect(claudeToolActivity('Bash', T0)).toBeNull();
    expect(claudeToolActivity({ name: '   ' }, T0)).toBeNull();
  });

  it('flattens a multi-line command onto one line', () => {
    const a = claudeToolActivity({ name: 'Bash', input: { command: 'ls \\\n  -la' } }, T0);
    expect(a?.detail).toBe('ls \\ -la');
  });
});

describe('claudeToolResultActivity', () => {
  // The frame the engine used to drop. Verbatim from the 2026-07-31 probe: the
  // tool_use_id is byte-for-byte the id of the tool_use that preceded it.
  const RESULT = {
    type: 'tool_result',
    tool_use_id: 'toolu_014EfRMVkQAPt7UPB79ggMXh',
    is_error: false,
    content: 'total 4\n',
  };

  it('closes the call with the same id, and borrows the name from its start', () => {
    const activity = claudeToolResultActivity(RESULT, {
      at: T0 + 7004,
      lookup: (id) => (id === RESULT.tool_use_id ? { name: 'Bash', detail: 'ls' } : undefined),
    });
    expect(activity).toEqual({
      name: 'Bash',
      detail: 'ls',
      phase: 'end',
      id: 'toolu_014EfRMVkQAPt7UPB79ggMXh',
      at: T0 + 7004,
      ok: true,
    });
  });

  it('reads is_error:true as a step that did not go through', () => {
    expect(claudeToolResultActivity({ ...RESULT, is_error: true }, { at: T0 })?.ok).toBe(false);
  });

  it('leaves the verdict UNKNOWN when the field is absent', () => {
    // Measured: a Bash result carried is_error:false, a Read result carried no
    // such field at all. Absent is not "it went fine".
    const activity = claudeToolResultActivity({ type: 'tool_result', tool_use_id: 'toolu_x' }, { at: T0 });
    expect(activity?.ok).toBeUndefined();
    expect(activity && 'ok' in activity).toBe(true);
  });

  it('names it vaguely rather than inventing, when the start was never seen', () => {
    expect(claudeToolResultActivity(RESULT, { at: T0 }))
      .toMatchObject({ name: 'outil', detail: undefined, phase: 'end' });
  });

  it('ignores anything that is not a tool_result, including our own echoed turn', () => {
    expect(claudeToolResultActivity({ type: 'text', text: 'salut' }, { at: T0 })).toBeNull();
    expect(claudeToolResultActivity('salut', { at: T0 })).toBeNull();
    expect(claudeToolResultActivity(null, { at: T0 })).toBeNull();
  });

  it('drops a result with no id: it would close nothing', () => {
    expect(claudeToolResultActivity({ type: 'tool_result', is_error: false }, { at: T0 })).toBeNull();
  });
});

describe('parseFrameInstant', () => {
  it('reads the ISO stamp claude puts on its frames', () => {
    // Verbatim from the probe.
    expect(parseFrameInstant('2026-07-31T09:41:16.116Z')).toBe(T0);
  });

  it('accepts a raw epoch number', () => {
    expect(parseFrameInstant(1770000000000)).toBe(1770000000000);
  });

  it('yields nothing on anything unparseable — never 0, which would mean 1970', () => {
    expect(parseFrameInstant(undefined)).toBeUndefined();
    expect(parseFrameInstant('')).toBeUndefined();
    expect(parseFrameInstant('pas une date')).toBeUndefined();
    expect(parseFrameInstant(Number.NaN)).toBeUndefined();
    expect(parseFrameInstant({})).toBeUndefined();
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
    }, { phase: 'start', at: T0 });
    expect(activity).toEqual({
      name: 'commande',
      detail: 'ls',
      phase: 'start',
      id: 'item_1',
      at: T0,
      ok: undefined,
    });
  });

  it('namespaces the id per turn, because codex restarts them at item_0', () => {
    // Measured: a fresh turn and its `exec resume` follow-up BOTH emit item_1.
    // Without the prefix those two unrelated steps would be paired together.
    const t1 = codexItemActivity({ id: 'item_1', type: 'command_execution' }, { phase: 'start', at: T0, idPrefix: 't1' });
    const t2 = codexItemActivity({ id: 'item_1', type: 'command_execution' }, { phase: 'start', at: T0, idPrefix: 't2' });
    expect(t1?.id).toBe('t1:item_1');
    expect(t2?.id).toBe('t2:item_1');
    expect(t1?.id).not.toBe(t2?.id);
  });

  it('carries the end phase through, with the exit code as the verdict', () => {
    const ok = codexItemActivity({ id: 'item_1', type: 'command_execution', command: '/usr/bin/zsh -lc ls', exit_code: 0 }, { phase: 'end', at: T0 });
    expect(ok).toMatchObject({ phase: 'end', ok: true });
    const ko = codexItemActivity({ id: 'item_1', type: 'command_execution', exit_code: 1 }, { phase: 'end', at: T0 });
    expect(ko?.ok).toBe(false);
  });

  it('gives no verdict on a start, nor when no exit code was reported', () => {
    expect(codexItemActivity({ type: 'command_execution', exit_code: 0 }, { phase: 'start', at: T0 })?.ok).toBeUndefined();
    expect(codexItemActivity({ type: 'file_change', path: 'a.ts' }, { phase: 'end', at: T0 })?.ok).toBeUndefined();
  });

  it('labels an MCP call from the fields that are present', () => {
    expect(codexItemActivity({ type: 'mcp_tool_call', server: 'byan', tool: 'byan_ping' }, { phase: 'start', at: T0 }))
      .toMatchObject({ name: 'byan.byan_ping', phase: 'start' });
  });

  it('falls back to a truthful label when the MCP fields are absent', () => {
    // These field names were not captured live; a guess dressed as fact would be
    // worse than a vague label.
    expect(codexItemActivity({ type: 'mcp_tool_call' }, { phase: 'start', at: T0 }))
      .toMatchObject({ name: 'outil MCP' });
  });

  it('labels a web search with its query', () => {
    expect(codexItemActivity({ type: 'web_search', query: 'electron ipc' }, { phase: 'start', at: T0 }))
      .toMatchObject({ name: 'recherche web', detail: 'electron ipc', phase: 'start' });
  });

  it('labels a file change with its path', () => {
    expect(codexItemActivity({ type: 'file_change', path: 'src/a.ts' }, { phase: 'end', at: T0 }))
      .toMatchObject({ name: 'modification de fichier', detail: 'src/a.ts', phase: 'end' });
  });

  it('reports an item type a future codex adds instead of dropping it', () => {
    expect(codexItemActivity({ type: 'some_new_thing' }, { phase: 'start', at: T0 }))
      .toMatchObject({ name: 'some new thing', phase: 'start' });
  });

  it('rejects a payload with no type', () => {
    expect(codexItemActivity({ command: 'ls' }, { phase: 'start', at: T0 })).toBeNull();
    expect(codexItemActivity(null, { phase: 'start', at: T0 })).toBeNull();
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

describe('buildActivityTimeline — a step that opens and closes', () => {
  it('gives it both bounds and the duration between them', () => {
    const t = buildActivityTimeline([
      act({ name: 'Bash', detail: 'ls', phase: 'start', id: 'toolu_a', at: T0 }),
      act({ name: 'Bash', phase: 'end', id: 'toolu_a', at: T0 + 7004, ok: true }),
    ]);
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0]).toMatchObject({
      key: 'toolu_a',
      id: 'toolu_a',
      name: 'Bash',
      detail: 'ls',
      startedAt: T0,
      endedAt: T0 + 7004,
      durationMs: 7004,
      open: false,
      ok: true,
    });
    expect(t.openCount).toBe(0);
    expect(t.firstAt).toBe(T0);
    expect(t.lastAt).toBe(T0 + 7004);
  });

  it('keeps the label of the start, which is the only frame that carries one', () => {
    const t = buildActivityTimeline([
      act({ name: 'Read', detail: '/home/yan/x.ts', phase: 'start', id: 'toolu_a', at: T0 }),
      act({ name: 'outil', phase: 'end', id: 'toolu_a', at: T0 + 10 }),
    ]);
    expect(t.steps[0].name).toBe('Read');
    expect(t.steps[0].detail).toBe('/home/yan/x.ts');
  });
});

describe('buildActivityTimeline — a step whose end never arrives', () => {
  it('stays OPEN, with no end and no duration', () => {
    const t = buildActivityTimeline([
      act({ name: 'Bash', detail: 'npm run build', phase: 'start', id: 'toolu_a', at: T0 }),
    ]);
    const [step] = t.steps;
    expect(step.open).toBe(true);
    expect(step.endedAt).toBeUndefined();
    // A dash is not a zero: the duration is absent, not 0.
    expect(step.durationMs).toBeUndefined();
    expect(step.durationMs).not.toBe(0);
    expect(t.openCount).toBe(1);
  });

  it('is not closed by the end of a DIFFERENT call', () => {
    const t = buildActivityTimeline([
      act({ name: 'Bash', phase: 'start', id: 'toolu_a', at: T0 }),
      act({ name: 'Read', phase: 'start', id: 'toolu_b', at: T0 + 5 }),
      act({ name: 'Read', phase: 'end', id: 'toolu_b', at: T0 + 9 }),
    ]);
    expect(t.steps.find((s) => s.id === 'toolu_a')?.open).toBe(true);
    expect(t.steps.find((s) => s.id === 'toolu_b')?.open).toBe(false);
    expect(t.openCount).toBe(1);
  });
});

describe('buildActivityTimeline — steps that overlap', () => {
  it('names, on each step, the ones running at the same time', () => {
    const t = buildActivityTimeline([
      act({ name: 'Bash', phase: 'start', id: 'a', at: T0 }),
      act({ name: 'Read', phase: 'start', id: 'b', at: T0 + 100 }),
      act({ name: 'Read', phase: 'end', id: 'b', at: T0 + 200 }),
      act({ name: 'Bash', phase: 'end', id: 'a', at: T0 + 300 }),
    ]);
    expect(t.concurrent).toBe(true);
    expect(t.steps.find((s) => s.key === 'a')?.overlapKeys).toEqual(['b']);
    expect(t.steps.find((s) => s.key === 'b')?.overlapKeys).toEqual(['a']);
  });

  it('sees no overlap between two steps that merely follow each other', () => {
    const t = buildActivityTimeline([
      act({ phase: 'start', id: 'a', at: T0 }),
      act({ phase: 'end', id: 'a', at: T0 + 100 }),
      act({ phase: 'start', id: 'b', at: T0 + 100 }),
      act({ phase: 'end', id: 'b', at: T0 + 200 }),
    ]);
    expect(t.concurrent).toBe(false);
    expect(t.steps.every((s) => s.overlapKeys.length === 0)).toBe(true);
  });

  it('counts two still-open steps as concurrent — neither was seen stopping', () => {
    const t = buildActivityTimeline([
      act({ phase: 'start', id: 'a', at: T0 }),
      act({ phase: 'start', id: 'b', at: T0 + 50 }),
    ]);
    expect(t.concurrent).toBe(true);
    expect(t.steps[0].overlapKeys).toEqual(['b']);
  });
});

describe('buildActivityTimeline — an end with no matching start', () => {
  it('keeps the instant it has and leaves the beginning unknown', () => {
    const t = buildActivityTimeline([
      act({ name: 'outil', phase: 'end', id: 'toolu_orphan', at: T0 + 400, ok: false }),
    ]);
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0]).toMatchObject({ id: 'toolu_orphan', endedAt: T0 + 400, open: false, ok: false });
    expect(t.steps[0].startedAt).toBeUndefined();
    expect(t.steps[0].durationMs).toBeUndefined();
    expect(t.openCount).toBe(0);
  });

  it('does not reopen a step already closed by the same id', () => {
    const t = buildActivityTimeline([
      act({ phase: 'start', id: 'a', at: T0 }),
      act({ phase: 'end', id: 'a', at: T0 + 10 }),
      act({ phase: 'end', id: 'a', at: T0 + 20 }),
    ]);
    expect(t.steps).toHaveLength(2);
    expect(t.steps[0]).toMatchObject({ key: 'a', durationMs: 10 });
    expect(t.steps[1]).toMatchObject({ key: 'a#2', endedAt: T0 + 20 });
    expect(t.steps[1].startedAt).toBeUndefined();
  });
});

describe('buildActivityTimeline — frames the engine could not identify', () => {
  it('never merges two anonymous steps into one', () => {
    const t = buildActivityTimeline([
      act({ name: 'commande', phase: 'start', at: T0 }),
      act({ name: 'recherche web', phase: 'start', at: T0 + 5 }),
    ]);
    expect(t.steps).toHaveLength(2);
    expect(t.steps[0].key).not.toBe(t.steps[1].key);
    expect(t.steps.every((s) => s.open)).toBe(true);
  });

  it('gives a second live start on the same id its own step', () => {
    const t = buildActivityTimeline([
      act({ phase: 'start', id: 'a', at: T0 }),
      act({ phase: 'start', id: 'a', at: T0 + 5 }),
    ]);
    expect(t.steps.map((s) => s.key)).toEqual(['a', 'a#2']);
  });

  it('refuses a negative duration rather than reporting one', () => {
    // Two instants from clocks that disagree. Nothing is a better answer than
    // "this step lasted minus twelve milliseconds".
    const t = buildActivityTimeline([
      act({ phase: 'start', id: 'a', at: T0 }),
      act({ phase: 'end', id: 'a', at: T0 - 12 }),
    ]);
    expect(t.steps[0].endedAt).toBe(T0 - 12);
    expect(t.steps[0].durationMs).toBeUndefined();
  });

  it('reports an empty timeline without inventing a window', () => {
    const t = buildActivityTimeline([]);
    expect(t).toEqual({ steps: [], firstAt: undefined, lastAt: undefined, concurrent: false, openCount: 0 });
  });
});
