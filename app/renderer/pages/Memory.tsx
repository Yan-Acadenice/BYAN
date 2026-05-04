// Memory — h._memory ported to React.
// Data: mocked statically — IPC wiring deferred to post-MVP.

import React, { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';

const MOCK_ENTRIES = [
  { id: '1', timestamp: '2026-05-04T10:23:00Z', source: 'byan', snippet: 'User prefers terse, concrete responses. Token efficiency first-class concern.', confidence: 95 },
  { id: '2', timestamp: '2026-05-03T14:05:00Z', source: 'analyst', snippet: 'Project BYAN uses Merise Agile + TDD, 64 mantras. Yan is the primary stakeholder.', confidence: 88 },
  { id: '3', timestamp: '2026-05-02T09:11:00Z', source: 'dev', snippet: 'Electron app targets Linux + Windows. Renderer is React TSX with Tailwind CSS.', confidence: 92 },
];

function formatTs(iso: string) {
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

export default function Memory() {
  const [search, setSearch] = useState('');

  const visible = MOCK_ENTRIES.filter(
    (e) =>
      !search ||
      e.snippet.toLowerCase().includes(search.toLowerCase()) ||
      e.source.toLowerCase().includes(search.toLowerCase())
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
      <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[180px_100px_1fr_80px_60px] px-md py-sm border-b border-ink-800 bg-ink-950">
          <span className="font-label text-label text-ink-400 uppercase">Timestamp</span>
          <span className="font-label text-label text-ink-400 uppercase">Source</span>
          <span className="font-label text-label text-ink-400 uppercase">Snippet</span>
          <span className="font-label text-label text-ink-400 uppercase">Confidence</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="flex items-center justify-center py-xxl text-ink-500">
            <p className="font-body-sm text-body-sm">No memory entries match your search.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-800/50">
            {visible.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[180px_100px_1fr_80px_60px] items-center px-md hover:bg-ink-800 transition-colors"
                style={{ minHeight: '56px', padding: '12px 16px' }}
              >
                <span className="font-mono-code text-mono-code text-ink-400 text-[11px]">{formatTs(e.timestamp)}</span>
                <span className="badge badge-neutral w-fit">{e.source}</span>
                <span className="font-body-sm text-body-sm text-ink-300 truncate pr-md">{e.snippet}</span>
                <span className="font-caption text-caption text-ink-400">{e.confidence}%</span>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-ink-700 text-ink-600 hover:text-red transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
