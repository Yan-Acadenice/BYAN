// Memory — wired to live byan_web API (/api/memory).

import React, { useEffect, useState } from 'react';
import { Search, Trash2, Loader2, AlertCircle, Brain } from 'lucide-react';
import type { ByanMemory } from '../../shared/ipc-contract';

function formatTs(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

export default function Memory() {
  const [entries, setEntries] = useState<ByanMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.memory.list({ limit: 50 });
      setEntries(list as ByanMemory[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const visible = entries.filter(
    (e) =>
      !search ||
      e.content.toLowerCase().includes(search.toLowerCase()) ||
      (e.category ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.cli_source ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Platform</p>
          <h1 className="page-title mt-0.5">Memory</h1>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-sm top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memory..."
          className="input pl-8 h-9"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-xxl text-ink-400">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Loading memory...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <AlertCircle size={40} className="mb-md text-red opacity-70" />
          <p className="font-h3 text-h3 text-ink-300 mb-xs">Could not load memory</p>
          <p className="font-body-sm text-body-sm text-ink-500 mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>
        </div>
      ) : (
        <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[180px_100px_80px_1fr_80px_60px] px-md py-sm border-b border-ink-800 bg-ink-950">
            <span className="font-label text-label text-ink-400 uppercase">Timestamp</span>
            <span className="font-label text-label text-ink-400 uppercase">Source</span>
            <span className="font-label text-label text-ink-400 uppercase">Layer</span>
            <span className="font-label text-label text-ink-400 uppercase">Content</span>
            <span className="font-label text-label text-ink-400 uppercase">Pinned</span>
            <span />
          </div>
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
              <Brain size={40} className="mb-md opacity-30" />
              <p className="font-body-sm text-body-sm">
                {search ? 'No memory entries match your search.' : 'No memory entries yet.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-ink-800/50">
              {visible.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[180px_100px_80px_1fr_80px_60px] items-center px-md hover:bg-ink-800 transition-colors"
                  style={{ minHeight: '56px', padding: '12px 16px' }}
                >
                  <span className="font-mono-code text-mono-code text-ink-400 text-[11px]">
                    {formatTs(e.created_at)}
                  </span>
                  <span className="badge badge-neutral w-fit">{e.cli_source ?? 'unknown'}</span>
                  <span className="font-caption text-caption text-ink-400">{e.layer}</span>
                  <span className="font-body-sm text-body-sm text-ink-300 truncate pr-md">{e.content}</span>
                  <span className="font-caption text-caption text-ink-400">
                    {e.pinned ? 'yes' : ''}
                  </span>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-ink-700 text-ink-600 hover:text-red transition-colors"
                    title="Delete (not implemented)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
