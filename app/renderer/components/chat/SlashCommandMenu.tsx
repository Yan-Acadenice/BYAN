// SlashCommandMenu — the visual half of the slash-command primitive.
//
// Presentational only: no state, no filtering, no keyboard handling (that is
// useSlashPalette). Same dropdown shape as the one already proven in Chat.tsx,
// so the two chat surfaces look identical; positioned against the nearest
// `relative` ancestor, which is the input area in both hosts.

import React from 'react';
import type { SlashCommandDef } from '../../lib/slash-commands';

export interface SlashCommandMenuProps {
  commands: SlashCommandDef[];
  highlightedIndex: number;
  onSelect: (def: SlashCommandDef) => void;
  onHighlight: (index: number) => void;
}

export default function SlashCommandMenu({
  commands,
  highlightedIndex,
  onSelect,
  onHighlight,
}: SlashCommandMenuProps) {
  if (commands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-lg right-lg mb-xs bg-ink-850 border border-ink-700 rounded-xl overflow-hidden shadow-xl z-10">
      {commands.map((def, i) => {
        const highlighted = i === highlightedIndex;
        return (
          <button
            key={def.cmd}
            type="button"
            data-testid={`slash-cmd-${def.cmd.slice(1)}`}
            aria-current={highlighted ? 'true' : undefined}
            onClick={() => onSelect(def)}
            onMouseEnter={() => onHighlight(i)}
            className={[
              'w-full flex items-center gap-sm px-sm py-sm transition-colors text-left',
              highlighted ? 'bg-ink-800' : 'hover:bg-ink-800',
            ].join(' ')}
          >
            <span className="font-mono text-byan-400 text-sm">{def.cmd}</span>
            {def.argHint && (
              <span className="font-mono text-xs text-ink-600">{def.argHint}</span>
            )}
            <span className="text-xs text-ink-400">{def.description}</span>
          </button>
        );
      })}
    </div>
  );
}
