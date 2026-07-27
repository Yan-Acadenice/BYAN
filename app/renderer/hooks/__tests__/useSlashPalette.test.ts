import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSlashPalette } from '../useSlashPalette';

describe('useSlashPalette', () => {
  it('opens the menu when the user types a slash', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    expect(result.current.open).toBe(false);

    act(() => result.current.setInput('/'));

    expect(result.current.open).toBe(true);
    expect(result.current.commands.length).toBeGreaterThan(1);
  });

  it('moves the highlight with ArrowDown then selects it with Enter', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    act(() => result.current.setInput('/m'));

    const second = result.current.commands[1];
    expect(second).toBeDefined();

    act(() => { result.current.handleKeyDown({ key: 'ArrowDown' }); });
    expect(result.current.highlightedIndex).toBe(1);

    let consumed = false;
    act(() => { consumed = result.current.handleKeyDown({ key: 'Enter' }); });

    expect(consumed).toBe(true);
    // A bare command is left exactly submittable. The expectation is NOT derived
    // from second.argHint: re-deriving it with production's own ternary made the
    // argument arm untestable (it passed even with the prefill deleted).
    expect(second.argHint).toBeUndefined();
    expect(result.current.input).toBe(second.cmd);
    expect(result.current.open).toBe(false);
  });

  it('prefills "cmd " with a LITERAL trailing space for a command taking an argument', () => {
    // Pinned against a literal, not against def.argHint. Deleting the argHint
    // arm of select() must fail here — that mutation used to survive the suite.
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    act(() => result.current.setInput('/mo'));

    const first = result.current.commands[0];
    expect(first.cmd).toBe('/model');
    expect(first.argHint).toBeDefined();

    act(() => { result.current.handleKeyDown({ key: 'Enter' }); });

    expect(result.current.input).toBe('/model ');
  });

  it('wraps the highlight past both ends', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    act(() => result.current.setInput('/m'));
    const last = result.current.commands.length - 1;

    act(() => { result.current.handleKeyDown({ key: 'ArrowUp' }); });
    expect(result.current.highlightedIndex).toBe(last);

    act(() => { result.current.handleKeyDown({ key: 'ArrowDown' }); });
    expect(result.current.highlightedIndex).toBe(0);
  });

  it('closes on Escape and consumes the key', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    act(() => result.current.setInput('/'));

    let consumed = false;
    act(() => { consumed = result.current.handleKeyDown({ key: 'Escape' }); });

    expect(consumed).toBe(true);
    expect(result.current.open).toBe(false);
    // Escape hides the palette without eating what was typed.
    expect(result.current.input).toBe('/');
    // And `commands` empties, so the plain wiring
    // <SlashCommandMenu commands={palette.commands} /> hides too. Leaving the
    // list populated behind a false `open` made Escape LOOK broken in the host.
    expect(result.current.commands).toEqual([]);
  });

  it('does NOT consume Enter when the menu is closed, so the host still submits', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    act(() => result.current.setInput('bonjour'));

    const preventDefault = vi.fn();
    let consumed = true;
    act(() => { consumed = result.current.handleKeyDown({ key: 'Enter', preventDefault }); });

    expect(consumed).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('hands Enter back once the palette is dismissed, matches or not', () => {
    // The sharp case: '/' still filters to a full list, so only the closed flag
    // can stop the palette from stealing the submit.
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    act(() => result.current.setInput('/'));
    act(() => { result.current.handleKeyDown({ key: 'Escape' }); });

    let consumed = true;
    act(() => { consumed = result.current.handleKeyDown({ key: 'Enter' }); });

    expect(consumed).toBe(false);
    expect(result.current.input).toBe('/');
  });

  it('ignores the arrows when closed rather than wrapping over an empty list', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));

    let consumed = true;
    act(() => { consumed = result.current.handleKeyDown({ key: 'ArrowDown' }); });

    expect(consumed).toBe(false);
    expect(result.current.highlightedIndex).toBe(0);
  });

  it('never consumes Shift+Enter, even with the menu open', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'codex' }));
    act(() => result.current.setInput('/'));
    expect(result.current.open).toBe(true);

    const preventDefault = vi.fn();
    let consumed = true;
    act(() => {
      consumed = result.current.handleKeyDown({ key: 'Enter', shiftKey: true, preventDefault });
    });

    expect(consumed).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.input).toBe('/');
  });

  it('hides a command the current engine does not have', () => {
    const { result } = renderHook(() => useSlashPalette({ engine: 'claude' }));
    act(() => result.current.setInput('/eff'));

    expect(result.current.commands).toEqual([]);
    expect(result.current.open).toBe(false);
  });
});
