// NewConversationModal — full conversation creation with project + agent + scope.
//
// WHY this replaces the inline modal that was in Chat.tsx:
// The old modal only sent title + cli_provider, so the backend received no
// projectId or agentId. The CLI then fell back to its global context (the BYAN
// platform project), making "centralis" conversations answer as if they were
// about BYAN itself. Passing projectId at creation time fixes the scope for the
// entire conversation lifetime.

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type {
  ByanCustomAgent,
  ByanProject,
  ChatCliProvider,
  ChatScope,
  CreateConversationOpts,
} from '../../../shared/ipc-contract';
import ScopePicker, { DEFAULT_SCOPE } from './ScopePicker';
import type { ChatDefaults } from '../../hooks/useChatDefaults';

// ---------- CLI selector ----------

const CLI_LABELS: Record<ChatCliProvider, string> = {
  'claude-code': 'Claude Code',
  copilot: 'Copilot',
  codex: 'Codex',
};

interface CliSelectorProps {
  value: ChatCliProvider;
  onChange: (cli: ChatCliProvider) => void;
}

function CliSelector({ value, onChange }: CliSelectorProps) {
  return (
    <div className="flex gap-sm flex-wrap">
      {(['claude-code', 'copilot', 'codex'] as ChatCliProvider[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={[
            'px-sm py-xs rounded-lg text-sm font-medium border transition-colors',
            value === p
              ? 'bg-teal-600 border-accent-action text-white'
              : 'bg-surface-hover border-edge-strong text-content-tertiary hover:border-edge-strong',
          ].join(' ')}
        >
          {CLI_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

// ---------- Main modal ----------

interface NewConversationModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (opts: CreateConversationOpts) => void;
  // Pre-populate the form from persisted user defaults so the modal opens
  // already aligned with the current work context. Optional — falls back to
  // EMPTY_FORM when omitted (e.g. for tests).
  defaults?: ChatDefaults;
}

interface FormState {
  title: string;
  cli: ChatCliProvider;
  projectId: string;     // '' = none
  agentId: string;       // '' = none
  scope: ChatScope;
  showScope: boolean;
}

const EMPTY_FORM: FormState = {
  title: '',
  cli: 'claude-code',
  projectId: '',
  agentId: '',
  scope: { ...DEFAULT_SCOPE },
  showScope: false,
};

function fromDefaults(d: ChatDefaults | undefined): FormState {
  if (!d) return { ...EMPTY_FORM };
  return {
    title: '',
    cli: d.cli,
    projectId: d.projectId ?? '',
    agentId: d.agentId ?? '',
    scope: { ...d.scope },
    // Auto-expand the scope panel when the user has actually configured one.
    showScope: (d.scope.types?.length ?? 0) > 0,
  };
}

export default function NewConversationModal({
  open,
  onClose,
  onCreate,
  defaults,
}: NewConversationModalProps) {
  const [form, setForm] = useState<FormState>(() => fromDefaults(defaults));
  const [projects, setProjects] = useState<ByanProject[]>([]);
  const [agents, setAgents] = useState<ByanCustomAgent[]>([]);
  const [listsError, setListsError] = useState('');

  // Re-sync the form when the modal (re-)opens so an updated `defaults`
  // (e.g. after the inline /scope or /agent panel modified them) is reflected.
  useEffect(() => {
    if (open) setForm(fromDefaults(defaults));
  }, [open, defaults]);

  // Load lists once when modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setListsError('');
    void Promise.all([
      window.byanApi.byanWeb.projects.list(),
      window.byanApi.byanWeb.customAgents.list(),
    ]).then(([p, a]) => {
      if (cancelled) return;
      setProjects(p as ByanProject[]);
      setAgents(a as ByanCustomAgent[]);
    }).catch((err: unknown) => {
      // Without this catch an IPC failure was an unhandled rejection and the
      // dropdowns silently stayed empty with no explanation.
      if (cancelled) return;
      setListsError(err instanceof Error ? err.message : 'Chargement des projets/agents impossible.');
    });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const opts: CreateConversationOpts = {
      title: form.title.trim() || 'New conversation',
      cli_provider: form.cli,
    };
    if (form.projectId) opts.projectId = form.projectId;
    if (form.agentId)   opts.agentId   = form.agentId;
    // Only include scope if at least one type is toggled.
    if (form.scope.types.length > 0) opts.scope = form.scope;

    onCreate(opts);
    setForm(fromDefaults(defaults));
    onClose();
  };

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-md"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-edge-strong rounded-xl shadow-xl w-full max-w-lg p-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-lg">
          <div>
            <h3 className="font-h3 text-h3 text-content-body">New conversation</h3>
            <p className="text-xs text-content-tertiary mt-0.5">Configure CLI, project and agent scope</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-content-tertiary hover:text-content-secondary transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-md">
          {listsError && (
            <div role="alert" className="px-sm py-xs rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-xs">
              {listsError}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block font-label text-label text-content-tertiary uppercase mb-xs">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="New conversation"
              className="w-full bg-surface-hover border border-edge-strong rounded-lg px-sm py-sm text-content-body text-sm focus:outline-none focus:border-accent-action transition-colors"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>

          {/* CLI Provider */}
          <div>
            <label className="block font-label text-label text-content-tertiary uppercase mb-xs">
              CLI Provider
            </label>
            <CliSelector value={form.cli} onChange={(v) => set('cli', v)} />
          </div>

          {/* Project */}
          <div>
            <label className="block font-label text-label text-content-tertiary uppercase mb-xs">
              Project
            </label>
            <select
              value={form.projectId}
              onChange={(e) => {
                // Auto-bind project + knowledge + memory scope when a project
                // is selected so the CLI receives the project's CLAUDE.md,
                // pinned knowledge entries and recent memory at conversation
                // creation time. Without this the backend resolveConversationScope
                // falls back to the user's default context, which is the
                // root cause of "centralis confused with byan" on cold start.
                const projectId = e.target.value;
                setForm((f) => ({
                  ...f,
                  projectId,
                  scope: projectId
                    ? {
                        types: ['project', 'knowledge', 'memory'],
                        projectId,
                        knowledgeTags: f.scope.knowledgeTags ?? [],
                        memoryTags: f.scope.memoryTags ?? [],
                        knowledgeLimit: f.scope.knowledgeLimit ?? 10,
                        memoryLimit: f.scope.memoryLimit ?? 10,
                        tokenBudget: f.scope.tokenBudget ?? 2000,
                      }
                    : { ...DEFAULT_SCOPE },
                }));
              }}
              className="w-full bg-surface-hover border border-edge-strong rounded-lg px-sm py-sm text-content-body text-sm focus:outline-none focus:border-accent-action transition-colors"
            >
              <option value="">None (global context)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {form.projectId ? (
              <p className="text-[10px] text-emerald-400/80 mt-xs">
                Project context auto-loaded (CLAUDE.md, knowledge, memory).
              </p>
            ) : (
              <p className="text-[10px] text-amber-500/70 mt-xs">
                Without a project the CLI may use the default BYAN context.
              </p>
            )}
          </div>

          {/* Agent */}
          <div>
            <label className="block font-label text-label text-content-tertiary uppercase mb-xs">
              Agent
            </label>
            <select
              value={form.agentId}
              onChange={(e) => set('agentId', e.target.value)}
              className="w-full bg-surface-hover border border-edge-strong rounded-lg px-sm py-sm text-content-body text-sm focus:outline-none focus:border-accent-action transition-colors"
            >
              <option value="">None (bare CLI)</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.slug})</option>
              ))}
            </select>
          </div>

          {/* Scope toggle */}
          <div>
            <button
              type="button"
              onClick={() => set('showScope', !form.showScope)}
              className="flex items-center gap-xs text-xs text-content-tertiary hover:text-content-body transition-colors"
            >
              {form.showScope ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {form.showScope ? 'Hide' : 'Configure'} advanced scope
            </button>

            {form.showScope && (
              <div className="mt-sm">
                <ScopePicker
                  scope={form.scope}
                  onChange={(s) => set('scope', s)}
                  projects={projects}
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-sm mt-xl">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
