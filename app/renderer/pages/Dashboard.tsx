// Dashboard — post-login home screen.
// Stitch screen d._dashboard ported to React.
// Data: mocked statically — IPC wiring deferred to post-MVP.

import React from 'react';
import { FolderOpen, History, Terminal, Zap, Upload, ArrowUpRight, Brain } from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

const MOCK_SESSIONS = [
  { id: '1', name: 'Alpha Deployment', agent: 'Agent-X', duration: '45m', ago: '2h ago' },
  { id: '2', name: 'Data Ingestion Pipeline', agent: 'Crawler-Bot', duration: '1h 20m', ago: '5h ago' },
  { id: '3', name: 'System Diagnostics', agent: 'Diagnostic-Core', duration: '12m', ago: 'Yesterday' },
  { id: '4', name: 'Model Evaluation', agent: 'Evaluator-Prime', duration: '3h 10m', ago: 'Yesterday' },
];

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="space-y-xl">
      {/* Hero */}
      <section className="space-y-xs">
        <h2 className="font-display text-display text-white">Welcome back, Yan.</h2>
        <div className="flex items-center gap-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
          <p className="font-caption text-caption text-ink-400">Last session 2 hours ago</p>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {/* Active projects */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-lg hover:-translate-y-px hover:border-ink-700 transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <FolderOpen size={20} className="text-ink-400 group-hover:text-byan-500 transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-ink-400 mb-1">Active projects</p>
          <p className="font-display text-display text-white">4</p>
        </div>
        {/* Sessions today */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-lg hover:-translate-y-px hover:border-ink-700 transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <History size={20} className="text-ink-400 group-hover:text-byan-500 transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-ink-400 mb-1">Sessions today</p>
          <p className="font-display text-display text-white">12</p>
        </div>
        {/* MCP servers */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-lg hover:-translate-y-px hover:border-ink-700 transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <Terminal size={20} className="text-ink-400 group-hover:text-byan-500 transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-ink-400 mb-1">MCP servers online</p>
          <div className="flex items-end gap-xs">
            <p className="font-display text-display text-white">3</p>
            <p className="font-body-sm text-body-sm text-ink-400 pb-1">/ 4</p>
          </div>
        </div>
      </section>

      {/* Two-column section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Recent sessions — 2 cols */}
        <div className="lg:col-span-2 bg-ink-900 border border-ink-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-md py-sm border-b border-ink-800 flex justify-between items-center">
            <h3 className="font-h3 text-h3 text-ink-100">Recent sessions</h3>
            <button
              type="button"
              className="font-label text-label text-byan-500 hover:text-byan-700 transition-colors uppercase"
              onClick={() => onNavigate('sessions')}
            >
              View all
            </button>
          </div>
          <div className="flex-1">
            {MOCK_SESSIONS.map((s) => (
              <div
                key={s.id}
                className="flex items-center px-md border-b border-ink-800/50 last:border-b-0 hover:bg-ink-800 transition-colors cursor-pointer group"
                style={{ height: '56px' }}
              >
                <div className="w-8 h-8 rounded bg-ink-850 border border-ink-700 flex items-center justify-center mr-md shrink-0">
                  <Zap size={14} className="text-ink-300 group-hover:text-byan-500 transition-colors" />
                </div>
                <div className="flex-1 min-w-0 pr-md">
                  <p className="font-body-sm text-body-sm text-ink-100 truncate font-medium">{s.name}</p>
                  <p className="font-caption text-caption text-ink-400 truncate mt-0.5">{s.agent}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-code text-mono-code text-ink-300">{s.duration}</p>
                  <p className="font-caption text-caption text-ink-500 mt-0.5">{s.ago}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions — 1 col */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-md flex flex-col">
          <h3 className="font-h3 text-h3 text-ink-100 mb-md px-xs">Quick actions</h3>
          <div className="space-y-xs flex-1">
            <button
              type="button"
              className="w-full bg-gradient-to-r from-byan-500 to-byan-700 text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:opacity-90 transition-opacity"
            >
              <Zap size={16} />
              New session
            </button>
            <button
              type="button"
              className="w-full bg-transparent border border-ink-600 text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:bg-ink-800 transition-colors mt-sm"
              onClick={() => onNavigate('projects')}
            >
              <Upload size={16} />
              Import project
            </button>
            <button
              type="button"
              className="w-full bg-transparent border border-ink-600 text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:bg-ink-800 transition-colors"
              onClick={() => onNavigate('projects')}
            >
              <ArrowUpRight size={16} />
              Open last project
            </button>
            <button
              type="button"
              className="w-full bg-transparent text-ink-400 font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:text-ink-100 hover:bg-ink-850 transition-colors"
              onClick={() => onNavigate('memory')}
            >
              <Brain size={16} />
              Browse memory
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
