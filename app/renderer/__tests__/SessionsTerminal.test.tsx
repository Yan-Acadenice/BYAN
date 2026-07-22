// Sessions — F5 "open in external terminal" button. Verifies the button reads the
// onboarding project dir and calls terminal.open, surfacing the result as a toast.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Sessions from '../pages/Sessions';
import { ToastProvider } from '../components/toast/ToastContext';

const mockSessionsList = vi.fn();
const mockStoreGet = vi.fn();
const mockTerminalOpen = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'byanApi', {
    value: {
      byanWeb: { sessions: { list: mockSessionsList } },
      store: { get: mockStoreGet, set: vi.fn() },
      terminal: { open: mockTerminalOpen },
    },
    writable: true,
    configurable: true,
  });
  mockSessionsList.mockResolvedValue([]);
  mockStoreGet.mockResolvedValue('/home/yan/monprojet');
  mockTerminalOpen.mockResolvedValue({ ok: true, terminal: 'gnome-terminal' });
});

afterEach(() => vi.clearAllMocks());

function renderSessions() {
  return render(<ToastProvider><Sessions /></ToastProvider>);
}

describe('Sessions — open in terminal (F5)', () => {
  it('opens claude in a terminal at the onboarding project dir', async () => {
    renderSessions();
    const btn = await screen.findByTestId('sessions-open-terminal');
    fireEvent.click(btn);
    await waitFor(() => expect(mockTerminalOpen).toHaveBeenCalledWith({ cwd: '/home/yan/monprojet' }));
    await waitFor(() => expect(screen.getByText(/gnome-terminal/)).toBeInTheDocument());
  });

  it('warns when no project dir is configured', async () => {
    mockStoreGet.mockResolvedValue(null);
    renderSessions();
    fireEvent.click(await screen.findByTestId('sessions-open-terminal'));
    await waitFor(() => expect(screen.getByText(/aucun dossier de projet/i)).toBeInTheDocument());
    expect(mockTerminalOpen).not.toHaveBeenCalled();
  });

  it('surfaces a terminal open failure', async () => {
    mockTerminalOpen.mockResolvedValue({ ok: false, reason: 'no-terminal', message: 'Aucun terminal trouvé sur ce système.' });
    renderSessions();
    fireEvent.click(await screen.findByTestId('sessions-open-terminal'));
    await waitFor(() => expect(screen.getByText(/aucun terminal trouvé/i)).toBeInTheDocument());
  });
});
