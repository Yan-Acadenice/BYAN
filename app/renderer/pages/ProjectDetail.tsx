// ProjectDetail — f._project_detail ported to React.
// Data: mocked statically — IPC wiring deferred to post-MVP.

import React, { useState } from 'react';

type Tab = 'overview' | 'agents' | 'memory' | 'knowledge' | 'sessions' | 'settings';
const TABS: Tab[] = ['overview', 'agents', 'memory', 'knowledge', 'sessions', 'settings'];

const MOCK_PROJECT = {
  name: 'BYAN Platform',
  slug: 'byan-platform',
  description: 'AI agent orchestration platform. Multi-agent dispatch, Merise Agile + TDD.',
  sessions: 12,
  agents: 4,
  knowledge: 9,
  lastActivity: '2 hours ago',
};

const MOCK_SESSIONS = [
  { id: '1', name: 'Alpha Deployment', agent: 'Agent-X', duration: '45m', ago: '2h ago' },
  { id: '2', name: 'Data Ingestion Pipeline', agent: 'Crawler-Bot', duration: '1h 20m', ago: '5h ago' },
];

export default function ProjectDetail() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div>
        <p className="section-title">Projects / {MOCK_PROJECT.slug}</p>
        <h1 className="page-title mt-0.5">{MOCK_PROJECT.name}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-xs border-b border-ink-800">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'px-sm pb-sm pt-xs font-body-sm text-body-sm capitalize transition-all border-b-2 -mb-px',
              activeTab === tab
                ? 'text-byan-400 border-byan-500'
                : 'text-ink-400 border-transparent hover:text-ink-200',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-lg animate-fade-in-up">
          {/* Description */}
          <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
            <p className="font-label text-label text-ink-400 uppercase mb-sm">Description</p>
            <p className="font-body text-body text-ink-200">{MOCK_PROJECT.description}</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-md">
            {[
              { label: 'Sessions', value: MOCK_PROJECT.sessions },
              { label: 'Agents', value: MOCK_PROJECT.agents },
              { label: 'Knowledge entries', value: MOCK_PROJECT.knowledge },
            ].map(({ label, value }) => (
              <div key={label} className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                <p className="font-label text-label text-ink-400 uppercase mb-xs">{label}</p>
                <p className="font-display text-display text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Recent sessions */}
          <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
            <div className="px-md py-sm border-b border-ink-800 flex justify-between items-center">
              <h3 className="font-h3 text-h3 text-ink-100">Recent sessions</h3>
            </div>
            {MOCK_SESSIONS.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-md border-b border-ink-800/50 last:border-b-0 hover:bg-ink-800 transition-colors"
                style={{ height: '56px' }}
              >
                <div>
                  <p className="font-body-sm text-body-sm text-ink-100 font-medium">{s.name}</p>
                  <p className="font-caption text-caption text-ink-400">{s.agent}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono-code text-mono-code text-ink-300">{s.duration}</p>
                  <p className="font-caption text-caption text-ink-500">{s.ago}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other tabs — placeholder */}
      {activeTab !== 'overview' && (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500 animate-fade-in-up">
          <p className="font-h3 text-h3 text-ink-400 capitalize">{activeTab} — coming soon</p>
          <p className="font-body-sm text-body-sm text-ink-500 mt-xs">This section will be wired in a future sprint.</p>
        </div>
      )}
    </div>
  );
}
