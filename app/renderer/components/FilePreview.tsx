// FilePreview — renders a single FileWritePlan with action badge and collapsible content.
//
// Design: dark terminal-like panel with action badge, path display, and monospace content.
// No syntax-highlighting library dependency — plain pre with monospace font.

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus, FileEdit, CheckCircle, type LucideIcon } from 'lucide-react';
import type { PreviewFileWritePlan, FileWriteAction } from '../../shared/ipc-contract';

const ACTION_CONFIG: Record<
  FileWriteAction,
  { label: string; containerClass: string; badgeClass: string; Icon: LucideIcon }
> = {
  create: {
    label: 'create',
    containerClass: 'border-emerald-500/20 bg-emerald-500/[0.04]',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    Icon: FilePlus,
  },
  update: {
    label: 'update',
    containerClass: 'border-amber-500/20 bg-amber-500/[0.04]',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    Icon: FileEdit,
  },
  skip: {
    label: 'skip',
    containerClass: 'border-white/8 bg-white/[0.02]',
    badgeClass: 'bg-white/5 text-ink-500 border-white/10',
    Icon: CheckCircle,
  },
};

interface FilePreviewProps {
  plan: PreviewFileWritePlan;
  defaultExpanded?: boolean;
  // Fetches this file's body, called at most once and only when the row is
  // expanded. Absent -> the panel says the body is unavailable rather than
  // rendering an empty block that reads like an empty file.
  fetchContent?: (plan: PreviewFileWritePlan) => Promise<string>;
}

export default function FilePreview({ plan, defaultExpanded = false, fetchContent }: FilePreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // The body arrives on demand: preview ships ~1000 plans and the list is
  // collapsed, so eagerly carrying every file across IPC moved megabytes that
  // nobody opened.
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const config = ACTION_CONFIG[plan.action];
  const { Icon } = config;

  // Load once, on first expand. A 'skip' row needs nothing: it renders its own
  // "already matches" line instead of a body.
  useEffect(() => {
    if (!expanded || content !== null || loadError !== null) return;
    if (plan.action === 'skip' || !fetchContent) return;
    let cancelled = false;
    void fetchContent(plan)
      .then((text) => { if (!cancelled) setContent(text); })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Lecture impossible.');
      });
    return () => { cancelled = true; };
  }, [expanded, content, loadError, plan, fetchContent]);

  return (
    <div
      data-testid={`file-preview-${plan.relPath}`}
      className={[
        'border rounded-xl overflow-hidden mb-2 transition-all duration-200',
        config.containerClass,
      ].join(' ')}
    >
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Action icon */}
        <Icon size={13} />

        {/* Action badge */}
        <span
          className={[
            'flex-shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider',
            config.badgeClass,
          ].join(' ')}
        >
          {config.label}
        </span>

        {/* Relative path */}
        <span className="flex-1 text-xs font-mono text-ink-200 truncate">{plan.relPath}</span>

        {/* Platform tag */}
        <span className="flex-shrink-0 text-[10px] text-ink-500 uppercase tracking-wider">
          {plan.platform}
        </span>

        {/* Expand chevron */}
        <span className="flex-shrink-0 text-ink-500">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Content panel */}
      {expanded && (
        <div className="border-t border-white/8 bg-black/40">
          {plan.action === 'skip' ? (
            <p className="px-4 py-3 text-xs text-ink-500 italic">
              File already matches — no changes will be written.
            </p>
          ) : loadError !== null ? (
            <p className="px-4 py-3 text-xs text-amber-300/80 italic">{loadError}</p>
          ) : content === null ? (
            <p className="px-4 py-3 text-xs text-ink-500 italic">Chargement...</p>
          ) : content.length === 0 ? (
            <p className="px-4 py-3 text-xs text-ink-500 italic">Empty file.</p>
          ) : (
            <pre className="px-4 py-3 text-[11px] font-mono text-ink-300 overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap break-all">
              {content.length > 4000
                ? content.slice(0, 4000) + '\n... (truncated for display)'
                : content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
