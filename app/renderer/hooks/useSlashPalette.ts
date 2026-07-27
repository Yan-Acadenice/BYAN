// useSlashPalette — the stateful half of the slash-command primitive.
//
// Owns the input value, the filtered command list, the open flag and the
// highlighted row. It does NOT execute commands: the host reads `input` on
// submit and routes it through parseSlashInput.
//
// The keyboard helper returns whether it CONSUMED the key. That contract is what
// lets a host keep its own Enter-to-submit: Chat.tsx swallows Enter
// unconditionally, so a closed palette must hand the key back or the message
// never leaves the box.

import { useCallback, useMemo, useState } from 'react';
import type { EngineId } from '../../shared/engine-options';
import { matchCommands, type SlashCommandDef } from '../lib/slash-commands';

// Structural, not React-typed: a real React.KeyboardEvent satisfies it, and a
// test can hand over a plain object without faking a synthetic event.
export interface SlashPaletteKeyEvent {
  key: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
}

export interface UseSlashPaletteOpts {
  engine: EngineId;
  commands?: SlashCommandDef[];
}

export interface SlashPalette {
  input: string;
  setInput: (value: string) => void;
  commands: SlashCommandDef[];
  open: boolean;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  select: (def: SlashCommandDef) => void;
  close: () => void;
  reset: () => void;
  handleKeyDown: (event: SlashPaletteKeyEvent) => boolean;
}

export function useSlashPalette(opts: UseSlashPaletteOpts): SlashPalette {
  const { engine, commands: source } = opts;
  const [input, setInputRaw] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // Escape (and a selection) must beat the filter: '/new' still matches itself,
  // so openness cannot be derived from the match count alone.
  const [dismissed, setDismissed] = useState(false);

  const matches = useMemo(
    () => matchCommands(input, { engine, commands: source }),
    [input, engine, source],
  );

  const open = matches.length > 0 && !dismissed;

  const setInput = useCallback((value: string) => {
    setInputRaw(value);
    setDismissed(false);
    setHighlightedIndex(0);
  }, []);

  const close = useCallback(() => setDismissed(true), []);

  const reset = useCallback(() => {
    setInputRaw('');
    setDismissed(false);
    setHighlightedIndex(0);
  }, []);

  // A command that takes an argument prefills 'cmd ' and waits; a bare command
  // is left exactly submittable so Enter fires it on the next keystroke.
  const select = useCallback((def: SlashCommandDef) => {
    setInputRaw(def.argHint ? `${def.cmd} ` : def.cmd);
    setDismissed(true);
    setHighlightedIndex(0);
  }, []);

  const handleKeyDown = useCallback((event: SlashPaletteKeyEvent): boolean => {
    // Newline insertion belongs to the textarea, always.
    if (event.shiftKey) return false;
    if (!open) return false;

    const consume = (): true => {
      event.preventDefault?.();
      return true;
    };

    switch (event.key) {
      case 'ArrowDown':
        setHighlightedIndex((i) => (i + 1) % matches.length);
        return consume();
      case 'ArrowUp':
        setHighlightedIndex((i) => (i - 1 + matches.length) % matches.length);
        return consume();
      case 'Enter':
      case 'Tab': {
        const def = matches[highlightedIndex];
        if (!def) return false;
        select(def);
        return consume();
      }
      case 'Escape':
        close();
        return consume();
      default:
        return false;
    }
  }, [open, matches, highlightedIndex, select, close]);

  return {
    input,
    setInput,
    // Empty once dismissed, so the OBVIOUS host wiring is the correct one:
    // <SlashCommandMenu commands={palette.commands} /> hides on Escape without
    // the host having to remember to combine `open` and `commands` itself. The
    // unfiltered `matches` stays internal for the keyboard handler.
    commands: open ? matches : [],
    open,
    highlightedIndex,
    setHighlightedIndex,
    select,
    close,
    reset,
    handleKeyDown,
  };
}
