// McpServers — F14 control panel.
// Reads the live list from the main process (sourced from .mcp.json) and
// subscribes to byan:mcp:statusChange to keep state in sync without polling.

import React, { useCallback, useEffect, useState } from 'react';
import { Play, Square, RotateCcw, Plus, Loader2, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import type { McpServer, McpStatus, McpStatusChangePayload } from '../../shared/ipc-contract';
import McpServerFormModal, { type McpFormMode } from '../components/mcp/McpServerFormModal';

function stateLabel(status: McpStatus): string {
  switch (status.state) {
    case 'running': return 'Running';
    case 'starting': return 'Starting…';
    case 'error': return 'Error';
    case 'stopped': return 'Stopped';
  }
}

function isTransitioning(status: McpStatus): boolean {
  return status.state === 'starting';
}

export default function McpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<McpFormMode>('add');
  const [editTarget, setEditTarget] = useState<McpServer | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const list = await window.byanApi.mcp.list();
      setServers(list);
    } catch {
      setServers([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // Live status updates pushed from main on every state transition.
  useEffect(() => {
    const off = window.byanEvents?.on('byan:mcp:statusChange', (payload: unknown) => {
      const update = payload as McpStatusChangePayload;
      if (!update || typeof update.id !== 'string') return;
      setServers((prev) => prev.map((s) => (s.id === update.id ? { ...s, status: update.status } : s)));
    });
    return () => { off?.(); };
  }, []);

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const handleStart = (id: string) => withBusy(id, async () => {
    try {
      await window.byanApi.mcp.start(id);
    } catch {
      // surface as a temporary toast in a later iteration; status event will
      // also flip the row to error if the spawn fails.
    } finally {
      await refresh();
    }
  });

  const handleStop = (id: string) => withBusy(id, async () => {
    try {
      await window.byanApi.mcp.stop(id);
    } catch { /* ignore */ }
    finally { await refresh(); }
  });

  const handleRestart = (id: string) => withBusy(id, async () => {
    try {
      await window.byanApi.mcp.stop(id);
      // Give the exit event a tick to flip state before re-spawning.
      await new Promise((r) => setTimeout(r, 150));
      await window.byanApi.mcp.start(id);
    } catch { /* ignore */ }
    finally { await refresh(); }
  });

  const openAdd = () => {
    setFormMode('add');
    setEditTarget(undefined);
    setFormOpen(true);
  };

  const openEdit = (srv: McpServer) => {
    setFormMode('edit');
    setEditTarget(srv);
    setFormOpen(true);
  };

  const handleDelete = (srv: McpServer) => withBusy(srv.id, async () => {
    const confirmed = window.confirm(
      `Delete MCP server "${srv.id}"?\n\nThis removes it from .mcp.json. The change cannot be undone unless you have version control.`
    );
    if (!confirmed) return;
    try {
      await window.byanApi.mcp.delete(srv.id);
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'delete failed';
      window.alert(`Failed to delete "${srv.id}": ${message}`);
    } finally {
      await refresh();
    }
  });

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Platform</p>
          <h1 className="page-title mt-0.5">MCP Servers</h1>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="btn-primary flex items-center gap-xs py-2 px-md"
        >
          <Plus size={14} />
          Add MCP server
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-ink-400">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Loading servers...</span>
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-ink-900 border border-ink-800 rounded-lg flex flex-col items-center justify-center py-xxl text-ink-500">
          <Play size={40} className="mb-md opacity-30" />
          <p className="font-h3 text-h3 text-ink-400 mb-xs">No MCP servers configured</p>
          <p className="font-body-sm text-body-sm text-ink-500 max-w-md text-center px-md">
            Configure one in <code className="font-mono-code text-mono-code">.mcp.json</code> at your project root. Complete onboarding first if you haven't picked a project.
          </p>
        </div>
      ) : (
        <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden divide-y divide-ink-800/50">
          {servers.map((srv) => {
            const isRunning = srv.status.state === 'running';
            const isError = srv.status.state === 'error';
            const isBusy = busyIds.has(srv.id) || isTransitioning(srv.status);
            const errorMessage = srv.status.state === 'error' ? srv.status.message : null;
            return (
              <div key={srv.id} className="flex items-start justify-between px-md py-sm hover:bg-ink-800 transition-colors">
                <div className="flex items-start gap-md min-w-0 flex-1">
                  <div
                    className={[
                      'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                      isRunning ? 'dot-on' : isError ? 'bg-red' : 'dot-off',
                    ].join(' ')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-xs">
                      <p className="font-body-sm text-body-sm text-ink-100 font-medium">{srv.name}</p>
                      <span className="font-mono-code text-mono-code text-ink-500 text-[10px] uppercase">
                        {stateLabel(srv.status)}
                      </span>
                      {!srv.enabled && (
                        <span className="font-mono-code text-mono-code text-ink-500 text-[10px] uppercase">disabled</span>
                      )}
                    </div>
                    <p className="font-mono-code text-mono-code text-ink-500 text-[11px] truncate">
                      {srv.command} {(srv.args ?? []).join(' ')}
                    </p>
                    {errorMessage && (
                      <div className="mt-xs flex items-start gap-xs text-red-400 max-w-full">
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                        <pre className="font-mono-code text-mono-code text-[11px] whitespace-pre-wrap break-all">
                          {errorMessage}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-xs flex-shrink-0 ml-md">
                  {!isRunning && (
                    <button
                      type="button"
                      onClick={() => void handleStart(srv.id)}
                      className="btn-secondary btn-sm flex items-center gap-xs"
                      disabled={isBusy || !srv.enabled || srv.transport !== 'stdio'}
                    >
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Start
                    </button>
                  )}
                  {isRunning && (
                    <button
                      type="button"
                      onClick={() => void handleStop(srv.id)}
                      className="btn-secondary btn-sm flex items-center gap-xs"
                      disabled={isBusy}
                    >
                      <Square size={12} /> Stop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRestart(srv.id)}
                    className="btn-ghost btn-sm flex items-center gap-xs"
                    disabled={isBusy || !srv.enabled || srv.transport !== 'stdio'}
                  >
                    <RotateCcw size={12} /> Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(srv)}
                    className="btn-ghost btn-sm flex items-center gap-xs"
                    disabled={isBusy}
                    aria-label={`Edit ${srv.id}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(srv)}
                    className="btn-ghost btn-sm flex items-center gap-xs text-red-400 hover:text-red-300"
                    disabled={isBusy}
                    aria-label={`Delete ${srv.id}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <McpServerFormModal
        open={formOpen}
        mode={formMode}
        initial={editTarget}
        onClose={() => setFormOpen(false)}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
