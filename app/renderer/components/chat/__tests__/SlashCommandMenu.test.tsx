import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SlashCommandMenu from '../SlashCommandMenu';
import type { SlashCommandDef } from '../../../lib/slash-commands';

const COMMANDS: SlashCommandDef[] = [
  { cmd: '/model', description: 'Choisir le modèle', argHint: '<nom>' },
  { cmd: '/new', description: 'Nouvelle session' },
];

describe('SlashCommandMenu', () => {
  it('renders nothing when there is no match', () => {
    const { container } = render(
      <SlashCommandMenu commands={[]} highlightedIndex={0} onSelect={vi.fn()} onHighlight={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one submit-safe button per command, with its hint', () => {
    render(
      <SlashCommandMenu commands={COMMANDS} highlightedIndex={0} onSelect={vi.fn()} onHighlight={vi.fn()} />,
    );

    const row = screen.getByTestId('slash-cmd-model');
    // type="button" matters: the menu lives inside the chat input area.
    expect(row).toHaveAttribute('type', 'button');
    expect(row).toHaveTextContent('/model');
    expect(row).toHaveTextContent('<nom>');
    expect(screen.getByTestId('slash-cmd-new')).toBeInTheDocument();
  });

  it('marks only the highlighted row', () => {
    render(
      <SlashCommandMenu commands={COMMANDS} highlightedIndex={1} onSelect={vi.fn()} onHighlight={vi.fn()} />,
    );

    expect(screen.getByTestId('slash-cmd-new')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('slash-cmd-model')).not.toHaveAttribute('aria-current');
  });
});
