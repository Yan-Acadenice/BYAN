// mcp-status — how an MCP server state is badged, in one place.
//
// The same rows are rendered by two surfaces: the /mcp page and the chat's
// /mcp modal. A label or dot colour that drifts between the two is the exact
// failure this module exists to make impossible.

import type { McpStatus } from '../../shared/ipc-contract';
import type { MessageKey } from '../i18n/locales';

export interface McpStatusBadge {
  labelKey: MessageKey;
  // Only the state-dependent class: callers keep their own geometry classes.
  dotClass: string;
}

export function mcpStatusBadge(status: McpStatus): McpStatusBadge {
  switch (status.state) {
    case 'running': return { labelKey: 'mcp.state.running', dotClass: 'dot-on' };
    case 'starting': return { labelKey: 'mcp.state.starting', dotClass: 'dot-off' };
    case 'error': return { labelKey: 'mcp.state.error', dotClass: 'bg-red' };
    case 'stopped': return { labelKey: 'mcp.state.stopped', dotClass: 'dot-off' };
  }
}
