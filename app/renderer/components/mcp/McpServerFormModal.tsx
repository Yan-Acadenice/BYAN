// McpServerFormModal — F14: add OR edit a stdio MCP server in .mcp.json.
//
// One modal, two modes:
//   mode='add'  → blank form, calls mcp.add, id is editable.
//   mode='edit' → pre-filled from `initial`, calls mcp.update, id is locked
//                 (renaming requires delete + add — out of scope here).

import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { McpServer, McpServerInput } from '../../../shared/ipc-contract';

export type McpFormMode = 'add' | 'edit';

interface McpServerFormModalProps {
  open: boolean;
  mode: McpFormMode;
  initial?: McpServer;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  id: string;
  command: string;
  argsText: string;
  envText: string;
}

const EMPTY: FormState = { id: '', command: '', argsText: '', envText: '' };

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

function splitLines(raw: string): string[] {
  return raw.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
}

function parseEnv(raw: string): { ok: true; env: Record<string, string> } | { ok: false; line: number } {
  const out: Record<string, string> = {};
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return { ok: false, line: i + 1 };
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key.length === 0) return { ok: false, line: i + 1 };
    out[key] = value;
  }
  return { ok: true, env: out };
}

function fromServer(srv: McpServer | undefined): FormState {
  if (!srv) return { ...EMPTY };
  return {
    id: srv.id,
    command: srv.command ?? '',
    argsText: (srv.args ?? []).join('\n'),
    envText: '',
  };
}

function buildInput(form: FormState): { ok: true; input: McpServerInput } | { ok: false; error: string } {
  if (!ID_PATTERN.test(form.id)) {
    return { ok: false, error: 'id must be lowercase letters, digits or hyphens (1-63 chars, starts with letter or digit)' };
  }
  if (form.command.trim().length === 0) {
    return { ok: false, error: 'command is required' };
  }
  const args = splitLines(form.argsText);
  const envResult = parseEnv(form.envText);
  if (!envResult.ok) {
    return { ok: false, error: `env line ${envResult.line}: expected KEY=VALUE format` };
  }
  const input: McpServerInput = {
    id: form.id,
    command: form.command.trim(),
    ...(args.length > 0 ? { args } : {}),
    ...(Object.keys(envResult.env).length > 0 ? { env: envResult.env } : {}),
  };
  return { ok: true, input };
}

export default function McpServerFormModal({ open, mode, initial, onClose, onSaved }: McpServerFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(mode === 'edit' ? fromServer(initial) : EMPTY);
      setError(null);
      setSubmitting(false);
    }
  }, [open, mode, initial]);

  if (!open) return null;

  const isEdit = mode === 'edit';

  const handleSubmit = async () => {
    setError(null);
    const built = buildInput(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await window.byanApi.mcp.update(built.input);
      } else {
        await window.byanApi.mcp.add(built.input);
      }
      onSaved();
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = (err as { message?: string }).message ?? 'unknown error';
      if (code === 'CONFLICT') {
        setError(`Server "${form.id}" already exists in .mcp.json`);
      } else if (code === 'NOT_FOUND') {
        setError(`Server "${form.id}" no longer exists — refresh the page`);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-md py-sm border-b border-ink-800">
          <h2 className="font-h3 text-h3 text-ink-100">
            {isEdit ? `Edit ${initial?.id ?? 'server'}` : 'Add MCP server'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-500 hover:text-ink-300 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-md space-y-md">
          <div>
            <label htmlFor="mcp-form-id" className="block font-body-sm text-body-sm text-ink-300 mb-xs">
              id <span className="text-ink-500">(lowercase, kebab-case)</span>
            </label>
            <input
              id="mcp-form-id"
              type="text"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              disabled={isEdit}
              placeholder="my-server"
              className="w-full px-sm py-xs bg-ink-800 border border-ink-700 rounded-lg text-ink-100 font-mono-code text-mono-code focus:outline-none focus:border-byan-500 disabled:opacity-60 disabled:cursor-not-allowed"
              autoFocus={!isEdit}
            />
            {isEdit && (
              <p className="text-ink-500 text-[11px] mt-xs">
                Renaming an MCP server requires deleting it and adding it again.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="mcp-form-command" className="block font-body-sm text-body-sm text-ink-300 mb-xs">
              command
            </label>
            <input
              id="mcp-form-command"
              type="text"
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder="node"
              className="w-full px-sm py-xs bg-ink-800 border border-ink-700 rounded-lg text-ink-100 font-mono-code text-mono-code focus:outline-none focus:border-byan-500"
              autoFocus={isEdit}
            />
          </div>

          <div>
            <label htmlFor="mcp-form-args" className="block font-body-sm text-body-sm text-ink-300 mb-xs">
              args <span className="text-ink-500">(one per line, optional)</span>
            </label>
            <textarea
              id="mcp-form-args"
              value={form.argsText}
              onChange={(e) => setForm({ ...form, argsText: e.target.value })}
              placeholder="_byan/mcp/server.js"
              rows={3}
              className="w-full px-sm py-xs bg-ink-800 border border-ink-700 rounded-lg text-ink-100 font-mono-code text-mono-code focus:outline-none focus:border-byan-500 resize-none"
            />
          </div>

          <div>
            <label htmlFor="mcp-form-env" className="block font-body-sm text-body-sm text-ink-300 mb-xs">
              env <span className="text-ink-500">(KEY=VALUE per line, optional)</span>
            </label>
            <textarea
              id="mcp-form-env"
              value={form.envText}
              onChange={(e) => setForm({ ...form, envText: e.target.value })}
              placeholder="BYAN_API_URL=https://example.com"
              rows={3}
              className="w-full px-sm py-xs bg-ink-800 border border-ink-700 rounded-lg text-ink-100 font-mono-code text-mono-code focus:outline-none focus:border-byan-500 resize-none"
            />
            {isEdit && (
              <p className="text-ink-500 text-[11px] mt-xs">
                Existing env values are not displayed. Leaving this empty overwrites them with nothing — re-enter values to keep them.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg p-sm">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <p className="font-body-sm text-body-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-sm px-md py-sm border-t border-ink-800">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost btn-sm"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            className="btn-primary btn-sm"
            disabled={submitting}
          >
            {submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save changes' : 'Add server')}
          </button>
        </div>
      </div>
    </div>
  );
}
