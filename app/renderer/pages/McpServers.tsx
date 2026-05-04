// McpServers — k._mcp_servers ported to React.
// Reads live data via window.byanApi.mcp.list (IPC wired for MVP).

import React, { useEffect, useState } from 'react';
import { Play, Square, RotateCcw, Plus, Loader2 } from 'lucide-react';
import type { McpServer } from '../../shared/ipc-contract';

export default function McpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await window.byanApi.mcp.list();
        setServers(list);
      } catch {
        // mcp.list not available in this context — show empty state
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleStart = async (id: string) => {
    try {
      await window.byanApi.mcp.start(id);
      const list = await window.byanApi.mcp.list();
      setServers(list);
    } catch {
      // ignore
    }
  };

  const handleStop = async (id: string) => {
    try {
      await window.byanApi.mcp.stop(id);
      const list = await window.byanApi.mcp.list();
      setServers(list);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Platform</p>
          <h1 className="page-title mt-0.5">MCP Servers</h1>
        </div>
        <button type="button" className="btn-primary flex items-center gap-xs py-2 px-md">
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
          <p className="font-body-sm text-body-sm text-ink-500">Add an MCP server to get started.</p>
        </div>
      ) : (
        <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden divide-y divide-ink-800/50">
          {servers.map((srv) => {
            const isRunning = srv.status.state === 'running';
            const isError = srv.status.state === 'error';
            return (
              <div key={srv.id} className="flex items-center justify-between px-md h-[72px] hover:bg-ink-800 transition-colors">
                <div className="flex items-center gap-md">
                  <div className={['w-2 h-2 rounded-full flex-shrink-0', isRunning ? 'dot-on' : isError ? 'bg-red' : 'dot-off'].join(' ')} />
                  <div>
                    <p className="font-body-sm text-body-sm text-ink-100 font-medium">{srv.name}</p>
                    <p className="font-mono-code text-mono-code text-ink-500 text-[11px] truncate max-w-[360px]">
                      {srv.command}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-xs">
                  {!isRunning && (
                    <button
                      type="button"
                      onClick={() => void handleStart(srv.id)}
                      className="btn-secondary btn-sm flex items-center gap-xs"
                    >
                      <Play size={12} /> Start
                    </button>
                  )}
                  {isRunning && (
                    <button
                      type="button"
                      onClick={() => void handleStop(srv.id)}
                      className="btn-secondary btn-sm flex items-center gap-xs"
                    >
                      <Square size={12} /> Stop
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost btn-sm flex items-center gap-xs"
                  >
                    <RotateCcw size={12} /> Restart
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
