// Slash-command behavior of the CLOUD chat, after its migration onto the shared
// palette primitive (lib/slash-commands + useSlashPalette + SlashCommandMenu).
//
// The page is mounted for real — no component stubs — so every assertion lands on
// what the user would actually see: the modal, the confirm dialog, the defaults
// panel, the toast text, and the stream API that must NOT be called for a slash
// input. Expected values are LITERALS on purpose: re-deriving them from the same
// expression the page uses would let the test pass with the behavior deleted.

import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Chat from '../Chat';
import { ToastProvider } from '../../components/toast/ToastContext';

// ---------- Harness ----------

const CONVERSATION = {
  id: 'c1',
  title: 'Active Conv',
  cli_provider: 'claude-code',
  owner_id: 'u1',
  project_id: null,
  agent_id: null,
  model: null,
  provider: null,
  system_prompt: null,
  created_by: 'u1',
  scope_snapshot: null,
  deleted_at: null,
  created_at: '2026-05-04T00:00:00Z',
  updated_at: '2026-05-04T00:00:00Z',
};

let storeSet: Mock;
let streamStart: Mock;
let convDelete: Mock;

function mountByanApi() {
  storeSet = vi.fn().mockResolvedValue(undefined);
  streamStart = vi.fn().mockResolvedValue({ streamId: 'sid-1' });
  convDelete = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(window, 'byanApi', {
    value: {
      store: { get: vi.fn().mockResolvedValue(null), set: storeSet },
      byanWeb: {
        projects: { list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
        customAgents: { list: vi.fn().mockResolvedValue([]) },
        chat: {
          conversations: {
            list: vi.fn().mockResolvedValue([CONVERSATION]),
            create: vi.fn(),
            delete: convDelete,
          },
          messages: { list: vi.fn().mockResolvedValue([]) },
          stream: { start: streamStart, abort: vi.fn().mockResolvedValue(undefined) },
        },
      },
    },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  mountByanApi();
});

// No AuthSessionProvider: the context default is a null session, which is the
// cloud branch of the Chat() dispatcher. A real ToastProvider IS needed — without
// one useToast degrades to no-ops and the warning assertions would be vacuous.
async function renderChat() {
  const view = render(
    <ToastProvider>
      <Chat />
    </ToastProvider>,
  );
  // The input only exists once a conversation is active (auto-selected from list()).
  const textarea = await waitFor(
    () => screen.getByPlaceholderText(/Message/i) as HTMLTextAreaElement,
  );
  return { ...view, textarea };
}

function typeInput(textarea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
}

function pressEnter(textarea: HTMLTextAreaElement, opts: { shift?: boolean } = {}) {
  fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: opts.shift ?? false });
}

// A BARE command ('/new') still matches itself, so the menu is open and the first
// Enter belongs to it (it accepts the highlighted row); the second one submits.
// That is the shared hook's contract and it is asserted on its own further down.
function submitBareCommand(textarea: HTMLTextAreaElement) {
  pressEnter(textarea);
  pressEnter(textarea);
}

// ---------- Regression: every cloud command still reaches its side effect ----------

describe('CloudChat slash dispatch', () => {
  it('/new opens the new-conversation modal', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/new');
    submitBareCommand(textarea);

    // Copy that exists ONLY inside the modal, never in the page's empty state.
    expect(screen.getByText(/Configure CLI, project and agent scope/i)).toBeTruthy();
    expect(streamStart).not.toHaveBeenCalled();
  });

  it('/clear asks to confirm, then deletes the active conversation', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/clear');
    submitBareCommand(textarea);

    expect(screen.getByText('Delete conversation?')).toBeTruthy();
    expect(convDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(convDelete).toHaveBeenCalledWith('c1'));
  });

  it('/scope opens the defaults panel on the scope section', async () => {
    const { textarea, container } = await renderChat();
    typeInput(textarea, '/scope');
    submitBareCommand(textarea);

    expect(screen.getByText(/Defaults for next conversation/i)).toBeTruthy();
    expect(container.querySelector('[data-section="scope"][data-focus="1"]')).toBeTruthy();
    expect(container.querySelector('[data-section="agent"][data-focus="1"]')).toBeNull();
  });

  it('/agent opens the defaults panel on the agent section', async () => {
    const { textarea, container } = await renderChat();
    typeInput(textarea, '/agent');
    submitBareCommand(textarea);

    expect(screen.getByText(/Defaults for next conversation/i)).toBeTruthy();
    expect(container.querySelector('[data-section="agent"][data-focus="1"]')).toBeTruthy();
    expect(container.querySelector('[data-section="scope"][data-focus="1"]')).toBeNull();
  });

  it('/cli codex parses the argument and persists codex as the next default', async () => {
    const { textarea } = await renderChat();
    // '/cli codex' prefixes no command, so the menu is already closed: one Enter.
    typeInput(textarea, '/cli codex');
    pressEnter(textarea);

    await waitFor(() => expect(storeSet).toHaveBeenCalled());
    expect(storeSet).toHaveBeenCalledWith('chat.defaults', expect.objectContaining({ cli: 'codex' }));
    expect(screen.getByText(/Prochaine conversation avec Codex/)).toBeTruthy();
    expect(streamStart).not.toHaveBeenCalled();
  });

  it('/cli with an unknown provider warns and persists nothing', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/cli bogus-provider');
    pressEnter(textarea);

    expect(screen.getByText(/Usage : \/cli claude-code \| copilot \| codex/)).toBeTruthy();
    expect(storeSet).not.toHaveBeenCalled();
    expect(streamStart).not.toHaveBeenCalled();
  });

  it('the Send button dispatches through the same path as Enter', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/new');
    fireEvent.click(screen.getByTitle('Send'));

    expect(screen.getByText(/Configure CLI, project and agent scope/i)).toBeTruthy();
    // The button used to bypass slash handling and post the literal command.
    expect(streamStart).not.toHaveBeenCalled();
  });
});

// ---------- The deliberate correction: an unmatched command is refused ----------

describe('CloudChat unknown slash input', () => {
  it('/foo warns and never reaches the stream API', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/foo');
    pressEnter(textarea);

    expect(screen.getByText(/Commande inconnue : \/foo/)).toBeTruthy();
    expect(streamStart).not.toHaveBeenCalled();

    // Non-vacuity guard: this very harness DOES stream a plain message, so the
    // assertion above is about /foo being refused, not about a dead send path.
    typeInput(textarea, 'plain message');
    pressEnter(textarea);
    await waitFor(() => expect(streamStart).toHaveBeenCalledTimes(1));
    expect(streamStart.mock.calls[0][1]).toBe('plain message');
  });
});

// ---------- The palette itself, driven from the page ----------

describe('CloudChat slash palette', () => {
  it('opens on / and lists the five cloud commands', async () => {
    const { textarea } = await renderChat();
    expect(screen.queryAllByTestId(/^slash-cmd-/)).toHaveLength(0);

    typeInput(textarea, '/');
    const rows = screen.getAllByTestId(/^slash-cmd-/);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'slash-cmd-new',
      'slash-cmd-cli',
      'slash-cmd-scope',
      'slash-cmd-agent',
      'slash-cmd-clear',
    ]);
  });

  it('narrows the list as the prefix grows, and Escape dismisses it', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/c');
    expect(screen.getAllByTestId(/^slash-cmd-/).map((r) => r.getAttribute('data-testid'))).toEqual([
      'slash-cmd-cli',
      'slash-cmd-clear',
    ]);

    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryAllByTestId(/^slash-cmd-/)).toHaveLength(0);
  });

  it('moves the highlight with ArrowDown and completes on Enter', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/');
    expect(screen.getByTestId('slash-cmd-new').getAttribute('aria-current')).toBe('true');

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(screen.getByTestId('slash-cmd-cli').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('slash-cmd-new').getAttribute('aria-current')).toBeNull();

    pressEnter(textarea);
    // /cli takes an argument, so the completion leaves a trailing space and waits.
    expect(textarea.value).toBe('/cli ');
    expect(screen.queryAllByTestId(/^slash-cmd-/)).toHaveLength(0);
    expect(streamStart).not.toHaveBeenCalled();
  });

  it('completes on a mouse click and keeps the input focused', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/s');
    fireEvent.click(screen.getByTestId('slash-cmd-scope'));

    expect(textarea.value).toBe('/scope');
    expect(document.activeElement).toBe(textarea);
    expect(screen.queryAllByTestId(/^slash-cmd-/)).toHaveLength(0);
  });

  it('with the menu open, the first Enter completes and the second submits', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '/ne');
    expect(screen.getByTestId('slash-cmd-new')).toBeTruthy();

    pressEnter(textarea);
    expect(textarea.value).toBe('/new');
    expect(screen.queryAllByTestId(/^slash-cmd-/)).toHaveLength(0);
    expect(screen.queryByText(/Configure CLI, project and agent scope/i)).toBeNull();

    pressEnter(textarea);
    expect(screen.getByText(/Configure CLI, project and agent scope/i)).toBeTruthy();
  });

  it('a FULLY typed command runs on the first Enter — nothing left to complete', async () => {
    // The palette hands Enter back when the input already equals the command, so
    // a no-argument command does not need a second keystroke. Pinned here too:
    // the cloud surface shares the primitive, so the contract must hold on both.
    const { textarea } = await renderChat();
    typeInput(textarea, '/new');
    expect(screen.getByTestId('slash-cmd-new')).toBeTruthy();

    pressEnter(textarea);
    expect(screen.getByText(/Configure CLI, project and agent scope/i)).toBeTruthy();
  });
});

// ---------- Enter / Shift+Enter contract ----------

describe('CloudChat submit keys', () => {
  it('Shift+Enter does not submit', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, 'hello');
    pressEnter(textarea, { shift: true });
    expect(streamStart).not.toHaveBeenCalled();

    // Non-vacuity guard: a plain Enter on the same input DOES submit.
    pressEnter(textarea);
    await waitFor(() => expect(streamStart).toHaveBeenCalledTimes(1));
    expect(streamStart.mock.calls[0][0]).toBe('c1');
    expect(streamStart.mock.calls[0][1]).toBe('hello');
  });

  it('an empty input submits nothing', async () => {
    const { textarea } = await renderChat();
    typeInput(textarea, '   ');
    pressEnter(textarea);
    expect(streamStart).not.toHaveBeenCalled();
  });
});
