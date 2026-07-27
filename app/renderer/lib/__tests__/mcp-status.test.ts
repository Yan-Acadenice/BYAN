// Expectations are written as literals on purpose: re-deriving them from the
// helper's own mapping would keep passing after the mapping is deleted.

import { describe, it, expect } from 'vitest';
import { mcpStatusBadge } from '../mcp-status';

describe('mcpStatusBadge', () => {
  it('badges a running server with the live dot', () => {
    expect(mcpStatusBadge({ state: 'running', since: '2026-07-27T10:00:00Z', pid: 4242 }))
      .toEqual({ labelKey: 'mcp.state.running', dotClass: 'dot-on' });
  });

  it('badges a stopped server with the idle dot', () => {
    expect(mcpStatusBadge({ state: 'stopped' }))
      .toEqual({ labelKey: 'mcp.state.stopped', dotClass: 'dot-off' });
  });

  it('badges an errored server red', () => {
    expect(mcpStatusBadge({ state: 'error', message: 'ENOENT' }))
      .toEqual({ labelKey: 'mcp.state.error', dotClass: 'bg-red' });
  });

  it('labels a starting server distinctly while keeping the idle dot', () => {
    expect(mcpStatusBadge({ state: 'starting', since: '2026-07-27T10:00:00Z' }))
      .toEqual({ labelKey: 'mcp.state.starting', dotClass: 'dot-off' });
  });

  it('never reports a starting server as running', () => {
    const starting = mcpStatusBadge({ state: 'starting', since: '2026-07-27T10:00:00Z' });
    expect(starting.dotClass).not.toBe('dot-on');
    expect(starting.labelKey).not.toBe('mcp.state.running');
  });
});
