// AgentPicker — filterable dropdown of BYAN custom agents.
//
// WHY separated: both NewConversationModal and the conversation header need
// to select an agent; keeping it isolated avoids duplication.
//
// Loads the full agent list once on mount from the IPC layer (no fetch in
// renderer — memory: feedback_stay_in_byan_dir, no fetch in renderer).

import React, { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, Loader2, X } from 'lucide-react';
import type { ByanCustomAgent } from '../../../shared/ipc-contract';

interface AgentPickerProps {
  /** Currently selected agent id, or null for "None". */
  value: string | null;
  onChange: (agentId: string | null) => void;
  disabled?: boolean;
}

export default function AgentPicker({ value, onChange, disabled = false }: AgentPickerProps) {
  const [agents, setAgents] = useState<ByanCustomAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load agent list once.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    window.byanApi.byanWeb.customAgents.list()
      .then((list) => {
        if (!cancelled) setAgents(list as ByanCustomAgent[]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load agents');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = value ? agents.find((a) => a.id === value) : null;

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.slug.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = (agentId: string | null) => {
    onChange(agentId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center gap-xs px-sm py-xs rounded-lg border text-sm font-medium transition-colors',
          'border-edge-strong bg-surface-hover text-content-secondary',
          'hover:border-edge-strong hover:text-content-body',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose agent"
      >
        {loading ? (
          <Loader2 size={13} className="animate-spin shrink-0" />
        ) : (
          <Bot size={13} className="shrink-0" />
        )}
        <span className="max-w-[160px] truncate">
          {selected ? selected.name : 'Aucun agent'}
        </span>
        <ChevronDown size={11} className="shrink-0" />
      </button>

      {open && !disabled && (
        <div
          className="absolute z-30 mt-1 left-0 min-w-[260px] max-h-72 flex flex-col rounded-xl border border-edge-strong bg-surface-card shadow-xl"
          role="listbox"
          aria-label="Available agents"
        >
          {/* Search input */}
          <div className="p-xs border-b border-edge-subtle">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full bg-surface-hover border border-edge-strong rounded-lg px-xs py-xs text-xs text-content-body focus:outline-none focus:border-accent-action placeholder-content-tertiary"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-xs">
            {error && (
              <p className="px-sm py-xs text-xs text-red-400">{error}</p>
            )}

            {/* "None" option */}
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => handleSelect(null)}
              className={[
                'w-full text-left px-sm py-xs text-xs flex items-center gap-xs transition-colors',
                !value
                  ? 'bg-teal-900/30 text-teal-300'
                  : 'text-content-tertiary hover:bg-surface-hover hover:text-content-body',
              ].join(' ')}
            >
              <X size={11} className="shrink-0" />
              No agent
            </button>

            {filtered.length === 0 && !error && (
              <p className="px-sm py-xs text-xs text-content-tertiary">
                {query ? 'Aucune correspondance' : 'Aucun agent disponible'}
              </p>
            )}

            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={a.id === value}
                onClick={() => handleSelect(a.id)}
                className={[
                  'w-full text-left px-sm py-xs text-xs flex flex-col transition-colors',
                  a.id === value
                    ? 'bg-teal-900/30 text-teal-300'
                    : 'text-content-secondary hover:bg-surface-hover hover:text-content-body',
                ].join(' ')}
              >
                <span className="font-medium">{a.name}</span>
                <span className="text-[10px] text-content-tertiary font-mono">{a.slug}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
