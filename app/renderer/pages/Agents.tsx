// Agents — wired to live byan_web API (/api/custom-agents).

import React, { useEffect, useState } from 'react';
import { Bot, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import type { ByanCustomAgent } from '../../shared/ipc-contract';

export default function Agents() {
  const [agents, setAgents] = useState<ByanCustomAgent[]>([]);
  const [selected, setSelected] = useState<ByanCustomAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.customAgents.list();
      const items = list as ByanCustomAgent[];
      setAgents(items);
      if (items.length > 0) setSelected(items[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-lg">
      <div>
        <p className="section-title">Platform</p>
        <h1 className="page-title mt-0.5">Agents</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-ink-400">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Loading agents...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <AlertCircle size={40} className="mb-md text-red opacity-70" />
          <p className="font-h3 text-h3 text-ink-300 mb-xs">Could not load agents</p>
          <p className="font-body-sm text-body-sm text-ink-500 mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <Bot size={40} className="mb-md opacity-30" />
          <p className="font-h3 text-h3 text-ink-400 mb-xs">No custom agents yet</p>
          <p className="font-body-sm text-body-sm text-ink-500">Create your first agent in byan_web.</p>
        </div>
      ) : (
        <div className="flex gap-md h-[600px]">
          {/* Left: agent list */}
          <div className="w-64 flex-shrink-0 bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
            <div className="px-md py-sm border-b border-ink-800">
              <h3 className="font-h3 text-h3 text-ink-100">Custom agents</h3>
            </div>
            <div className="divide-y divide-ink-800/50 overflow-y-auto h-[calc(600px-45px)]">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelected(agent)}
                  className={[
                    'w-full flex items-center justify-between px-md h-[56px] transition-colors text-left',
                    selected?.id === agent.id
                      ? 'bg-byan-500/10 border-l-2 border-byan-500'
                      : 'hover:bg-ink-800 border-l-2 border-transparent',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-sm">
                    <Bot size={14} className={selected?.id === agent.id ? 'text-byan-400' : 'text-ink-400'} />
                    <div>
                      <p className="font-body-sm text-body-sm text-ink-100 font-medium">{agent.name}</p>
                      <p className="font-caption text-caption text-ink-500">{agent.slug}</p>
                    </div>
                  </div>
                  <ChevronRight size={12} className="text-ink-600" />
                </button>
              ))}
            </div>
          </div>

          {/* Right: agent detail */}
          {selected && (
            <div className="flex-1 space-y-md overflow-y-auto">
              {/* Persona card */}
              <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                <p className="font-label text-label text-ink-400 uppercase mb-sm">Persona</p>
                <div className="flex items-center gap-md">
                  <div className="w-12 h-12 rounded-lg bg-byan-500/10 border border-byan-500/20 flex items-center justify-center">
                    <Bot size={20} className="text-byan-400" />
                  </div>
                  <div>
                    <p className="font-h2 text-h2 text-white">{selected.name}</p>
                    <p className="font-body-sm text-body-sm text-ink-400">
                      {selected.title ?? selected.slug}
                    </p>
                  </div>
                </div>
                {selected.role && (
                  <p className="font-body text-body text-ink-300 mt-md">{selected.role}</p>
                )}
              </div>

              {/* Principles card */}
              {selected.principles.length > 0 && (
                <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                  <p className="font-label text-label text-ink-400 uppercase mb-sm">Principles</p>
                  <ul className="space-y-xs">
                    {selected.principles.map((p, i) => (
                      <li key={i} className="font-body-sm text-body-sm text-ink-300">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Status card */}
              <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                <p className="font-label text-label text-ink-400 uppercase mb-sm">Status</p>
                <span className={`badge ${selected.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                  {selected.status}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
