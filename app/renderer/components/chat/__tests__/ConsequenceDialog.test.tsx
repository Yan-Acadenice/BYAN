// ConsequenceDialog — the shared ACT-X surface (handoff rule 3, first half:
// state the consequence BEFORE).
//
// What is pinned here is not the layout, it is the safety contract: the escape
// routes all land on staying put, the destructive button is OUTLINED and not
// filled (a filled red button reads as the default, and the default is to stay),
// and the named facts actually reach the screen.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConsequenceDialog from '../ConsequenceDialog';

const FACTS = [
  { label: 'Dossier', value: '/home/yan/monprojet' },
  { label: 'Ce qui s\'arrête', value: 'la session sess-1' },
];

function renderDialog(over: Partial<React.ComponentProps<typeof ConsequenceDialog>> = {}) {
  const cancel = vi.fn();
  const danger = vi.fn();
  const view = render(
    <ConsequenceDialog
      open
      title="Ouvrir une nouvelle session ferme celle-ci"
      facts={FACTS}
      cancel={{ label: 'Garder cette session', onClick: cancel }}
      danger={{ label: 'Fermer et ouvrir', onClick: danger }}
      {...over}
    />,
  );
  return { ...view, cancel, danger };
}

describe('ConsequenceDialog', () => {
  it('renders nothing at all when closed', () => {
    render(
      <ConsequenceDialog
        open={false}
        title="Titre"
        facts={FACTS}
        cancel={{ label: 'Rester', onClick: vi.fn() }}
      />,
    );
    expect(screen.queryByTestId('consequence-dialog')).toBeNull();
    expect(screen.queryByText('Titre')).toBeNull();
  });

  it('names the consequences instead of asking a bare "are you sure?"', () => {
    renderDialog();
    const dialog = screen.getByTestId('consequence-dialog');
    expect(dialog).toHaveTextContent('Ouvrir une nouvelle session ferme celle-ci');
    expect(dialog).toHaveTextContent('Dossier');
    expect(dialog).toHaveTextContent('/home/yan/monprojet');
    expect(dialog).toHaveTextContent('la session sess-1');
  });

  it('is a modal dialog labelled by its own title', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId as string)?.textContent)
      .toBe('Ouvrir une nouvelle session ferme celle-ci');
  });

  it('outlines the destructive action rather than filling it', () => {
    // A filled red button reads as the recommended path. Here it is not.
    const { danger } = renderDialog();
    const button = screen.getByTestId('consequence-dialog-danger');
    expect(button.className).toContain('border-accent-danger');
    expect(button.className).toContain('text-accent-danger');
    expect(button.className).toContain('bg-transparent');
    fireEvent.click(button);
    expect(danger).toHaveBeenCalledOnce();
  });

  it('gives focus to staying put, so a stray Enter is harmless', () => {
    const { cancel, danger } = renderDialog();
    expect(document.activeElement).toBe(screen.getByTestId('consequence-dialog-cancel'));
    fireEvent.click(document.activeElement as HTMLElement);
    expect(cancel).toHaveBeenCalledOnce();
    expect(danger).not.toHaveBeenCalled();
  });

  it('Escape means staying put, never the destructive path', () => {
    const { cancel, danger } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(danger).not.toHaveBeenCalled();
  });

  it('a click on the backdrop also stays put', () => {
    const { cancel, danger } = renderDialog();
    // The dialog panel stops propagation, so only the backdrop answers.
    fireEvent.click(screen.getByTestId('consequence-dialog').parentElement as HTMLElement);
    expect(cancel).toHaveBeenCalledOnce();
    expect(danger).not.toHaveBeenCalled();
  });

  it('a click inside the panel does NOT dismiss it', () => {
    const { cancel } = renderDialog();
    fireEvent.click(screen.getByTestId('consequence-dialog-facts'));
    expect(cancel).not.toHaveBeenCalled();
  });

  it('renders only the actions it was given', () => {
    renderDialog({ danger: undefined, confirm: { label: 'Passer en Cloud', onClick: vi.fn() } });
    expect(screen.getByTestId('consequence-dialog-confirm')).toBeInTheDocument();
    expect(screen.queryByTestId('consequence-dialog-danger')).toBeNull();
  });

  it('scopes its test ids so two dialogs can coexist', () => {
    renderDialog({ testId: 'local-restart-dialog' });
    expect(screen.getByTestId('local-restart-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('local-restart-dialog-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('local-restart-dialog-danger')).toBeInTheDocument();
    expect(screen.queryByTestId('consequence-dialog')).toBeNull();
  });

  it('stops listening for Escape once it closes', () => {
    const cancel = vi.fn();
    const { unmount } = render(
      <ConsequenceDialog
        open
        title="Titre"
        facts={FACTS}
        cancel={{ label: 'Rester', onClick: cancel }}
      />,
    );
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cancel).not.toHaveBeenCalled();
  });
});
