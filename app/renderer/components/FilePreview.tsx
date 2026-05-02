// FilePreview — renders a single FileWritePlan with action badge and content.
//
// No syntax-highlighting library dependency (Prism/Monaco not in this package).
// We use a plain <pre> with monospace font — readable and zero extra deps.
// The action badge ('create' / 'update' / 'skip') communicates idempotence clearly.

import React, { useState } from 'react';
import type { FileWritePlan, FileWriteAction } from '../../shared/ipc-contract';

const ACTION_STYLES: Record<FileWriteAction, string> = {
  create: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  update: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  skip: 'bg-white/5 text-ink-500 border-white/10',
};

const ACTION_LABELS: Record<FileWriteAction, string> = {
  create: 'will create',
  update: 'will update',
  skip: 'up to date',
};

interface FilePreviewProps {
  plan: FileWritePlan;
  // When true, the content panel is expanded on mount.
  defaultExpanded?: boolean;
}

export default function FilePreview({ plan, defaultExpanded = false }: FilePreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      data-testid={`file-preview-${plan.relPath}`}
      className="border border-white/10 rounded-xl overflow-hidden mb-2 bg-white/3"
    >
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Action badge */}
        <span
          className={[
            'flex-shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider',
            ACTION_STYLES[plan.action],
          ].join(' ')}
        >
          {ACTION_LABELS[plan.action]}
        </span>

        {/* Relative path */}
        <span className="flex-1 text-xs font-mono text-ink-200 truncate">{plan.relPath}</span>

        {/* Platform tag */}
        <span className="flex-shrink-0 text-[10px] text-ink-500 uppercase tracking-wider">
          {plan.platform}
        </span>

        {/* Expand chevron (text-based, no svg dep) */}
        <span className="flex-shrink-0 text-ink-500 text-xs">{expanded ? '-' : '+'}</span>
      </button>

      {/* Content panel */}
      {expanded && (
        <div className="border-t border-white/10 bg-black/30">
          {plan.action === 'skip' ? (
            <p className="px-4 py-3 text-xs text-ink-500 italic">
              File already matches — no changes will be written.
            </p>
          ) : plan.content.length === 0 ? (
            <p className="px-4 py-3 text-xs text-ink-500 italic">Empty file.</p>
          ) : (
            <pre className="px-4 py-3 text-[11px] font-mono text-ink-300 overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap break-all">
              {plan.content.length > 4000
                ? plan.content.slice(0, 4000) + '\n... (truncated for display)'
                : plan.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
