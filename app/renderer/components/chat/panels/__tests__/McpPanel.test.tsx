// F10 — the /mcp modal. Two things are load-bearing here and both are pinned:
// the badge mapping is shared with the full-screen page (no drift), and the
// page behaves inside a bounded viewport instead of stretching its host.
//
// Expected classes and labels are literals. Deriving them from mcpStatusBadge
// would make the assertions survive the deletion of the mapping they guard.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import McpPanel from '../McpPanel';
import McpServers from '../../../../pages/McpServers';
import type { McpServer } from '../../../../../shared/ipc-contract';

const RUNNING: McpServer = {
  id: 'byan-mcp', name: 'byan-mcp', transport: 'stdio',
  command: 'node', args: ['_byan/mcp/server.js'], enabled: true,
  status: { state: 'running', since: '2026-07-27T10:00:00Z', pid: 4242 },
};

const STOPPED: McpServer = {
  id: 'leantime', name: 'leantime', transport: 'stdio',
  command: 'node', args: [], enabled: true,
  status: { state: 'stopped' },
};

const ERRORED: McpServer = {
  id: 'broken-one', name: 'broken-one', transport: 'stdio',
  command: 'nope', args: [], enabled: true,
  status: { state: 'error', message: 'spawn nope ENOENT' },
};

type EventListener = (payload: unknown) => void;
let listeners: Map<string, EventListener[]>;

function mountApi(list: () => Promise<McpServer[]>, projectRoot: string | null = '/home/yan/monprojet') {
  Object.defineProperty(window, 'byanApi', {
    value: {
      mcp: {
        list: vi.fn(list),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        status: vi.fn(),
        add: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      // The page reads this key to know WHICH .mcp.json was read, and whether
      // "Add" can succeed at all (mcp.add throws UNAVAILABLE without a root).
      store: { get: vi.fn().mockResolvedValue(projectRoot), set: vi.fn() },
    },
    writable: true,
    configurable: true,
  });

  listeners = new Map();
  Object.defineProperty(window, 'byanEvents', {
    value: {
      on: (channel: string, cb: EventListener) => {
        const current = listeners.get(channel) ?? [];
        current.push(cb);
        listeners.set(channel, current);
        return () => listeners.set(channel, (listeners.get(channel) ?? []).filter((f) => f !== cb));
      },
    },
    writable: true,
    configurable: true,
  });
}

function emit(channel: string, payload: unknown) {
  act(() => {
    for (const cb of listeners.get(channel) ?? []) cb(payload);
  });
}

beforeEach(() => {
  mountApi(async () => [RUNNING, STOPPED]);
});

afterEach(() => {
  document.body.style.overflow = '';
});

describe('McpPanel — listing', () => {
  it('lists the servers returned by byanApi.mcp.list', async () => {
    render(<McpPanel open onClose={vi.fn()} />);

    expect(await screen.findByText('byan-mcp')).toBeTruthy();
    expect(screen.getByText('leantime')).toBeTruthy();
    expect(window.byanApi.mcp.list).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    const { container } = render(<McpPanel open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(window.byanApi.mcp.list).not.toHaveBeenCalled();
  });

  it('updates a row when a status-change event arrives', async () => {
    render(<McpPanel open onClose={vi.fn()} />);
    await screen.findByText('leantime');
    expect(screen.getByText('Arrêté')).toBeTruthy();

    emit('byan:mcp:statusChange', {
      id: 'leantime',
      status: { state: 'running', since: '2026-07-27T11:00:00Z', pid: 77 },
    });

    await waitFor(() => expect(screen.getAllByText('Actif')).toHaveLength(2));
    expect(screen.queryByText('Arrêté')).toBeNull();
  });
});

describe('McpPanel — badge parity with the page', () => {
  // Both surfaces are rendered in the same test so a mapping that drifts on one
  // of them cannot hide behind a green run of the other.
  it('renders identical dot classes and labels on the page and in the panel', async () => {
    mountApi(async () => [RUNNING, STOPPED, ERRORED]);

    const page = render(<McpServers />).container;
    const panel = render(<McpPanel open onClose={vi.fn()} />).container;

    for (const surface of [page, panel]) {
      await waitFor(() => expect(within(surface).getByText('byan-mcp')).toBeTruthy());

      expect(surface.querySelectorAll('.dot-on')).toHaveLength(1);
      expect(surface.querySelectorAll('.dot-off')).toHaveLength(1);
      expect(surface.querySelectorAll('.bg-red')).toHaveLength(1);

      expect(within(surface).getByText('Actif')).toBeTruthy();
      expect(within(surface).getByText('Arrêté')).toBeTruthy();
      expect(within(surface).getByText('Erreur')).toBeTruthy();
    }
  });
});

describe('McpPanel — dismissal', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<McpPanel open onClose={onClose} />);
    await screen.findByText('byan-mcp');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click but not on a click inside the dialog', async () => {
    const onClose = vi.fn();
    render(<McpPanel open onClose={onClose} />);
    await screen.findByText('byan-mcp');

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('mcp-panel-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape alone while the add/edit form is open', async () => {
    const onClose = vi.fn();
    render(<McpPanel open onClose={onClose} />);
    await screen.findByText('byan-mcp');

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un serveur MCP' }));
    await waitFor(() => expect(document.querySelector('[data-mcp-form-modal]')).toBeTruthy());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores keys other than Escape', async () => {
    const onClose = vi.fn();
    render(<McpPanel open onClose={onClose} />);
    await screen.findByText('byan-mcp');

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('McpPanel — constrained viewport', () => {
  it('scrolls the page inside a bounded shell instead of growing its host', async () => {
    const host = document.createElement('div');
    host.style.height = '300px';
    host.style.overflow = 'hidden';
    document.body.appendChild(host);

    render(<McpPanel open onClose={vi.fn()} />, { container: host });
    await waitFor(() => expect(within(host).getByText('byan-mcp')).toBeTruthy());

    const scroll = within(host).getByTestId('mcp-panel-scroll');
    const shell = within(host).getByTestId('mcp-panel-shell');
    const backdrop = within(host).getByTestId('mcp-panel-backdrop');

    // The page content must live INSIDE the scrolling region, otherwise the
    // shell grows with the list instead of clipping it.
    expect(scroll.contains(within(host).getByText('byan-mcp'))).toBe(true);
    expect(scroll.contains(within(host).getByRole('button', { name: 'Ajouter un serveur MCP' }))).toBe(true);

    expect(getComputedStyle(scroll).overflowY).toBe('auto');
    expect(getComputedStyle(shell).maxHeight).toBe('80vh');
    // jsdom runs no layout, so the growth guarantee is asserted structurally:
    // a fixed overlay is out of the host's flow whatever the list length.
    expect(getComputedStyle(backdrop).position).toBe('fixed');
  });

  it('does NOT touch the body overflow — that lock would be a no-op in this app', async () => {
    // html, body and #root are all h-full (renderer/index.css) and every
    // scrollable region is an inner container, so body does not scroll. An
    // earlier version set body.overflow='hidden' and a test asserted it, which
    // dressed a no-op as a safeguard. The bounded shell plus its own scroll
    // container is the real containment, pinned by the test above.
    document.body.style.overflow = 'scroll';

    const { unmount } = render(<McpPanel open onClose={vi.fn()} />);
    await screen.findByText('byan-mcp');
    expect(document.body.style.overflow).toBe('scroll');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });
});

describe('McpPanel — failing list', () => {
  it('shows an error with a retry instead of an empty panel', async () => {
    mountApi(async () => { throw new Error('ENOENT: .mcp.json missing'); });
    render(<McpPanel open onClose={vi.fn()} />);

    expect(await screen.findByText('Impossible de lire les serveurs MCP')).toBeTruthy();
    expect(screen.getByText(/ENOENT: \.mcp\.json missing/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByText('Aucun serveur MCP dans ce projet')).toBeNull();
  });

  it('recovers on retry so the failure is not a dead end', async () => {
    let shouldFail = true;
    mountApi(async () => {
      if (shouldFail) throw new Error('ENOENT: .mcp.json missing');
      return [RUNNING];
    });
    render(<McpPanel open onClose={vi.fn()} />);
    await screen.findByText('Impossible de lire les serveurs MCP');

    shouldFail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('byan-mcp')).toBeTruthy();
    expect(screen.queryByText('Impossible de lire les serveurs MCP')).toBeNull();
  });

  it('keeps the empty state for a genuinely empty config', async () => {
    mountApi(async () => []);
    render(<McpPanel open onClose={vi.fn()} />);

    expect(await screen.findByText('Aucun serveur MCP dans ce projet')).toBeTruthy();
    expect(screen.queryByText('Impossible de lire les serveurs MCP')).toBeNull();
  });
});
