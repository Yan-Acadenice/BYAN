// Agents — g._agents ported to React (two-pane layout).
// Data: mocked statically — IPC wiring deferred to post-MVP.

import React, { useState } from 'react';
import { Bot, ChevronRight } from 'lucide-react';

const MOCK_AGENTS = [
  { id: '1', name: 'byan', persona: 'Builder of YAN', version: 'v2.0', description: 'Meta-agent — creates agents via 12-question interview.' },
  { id: '2', name: 'analyst', persona: 'Mary', version: 'v1.2', description: 'Business analysis, etude de marche, brief.' },
  { id: '3', name: 'architect', persona: 'Winston', version: 'v1.1', description: 'System design, tech stack, architecture decisions.' },
  { id: '4', name: 'dev', persona: 'Amelia', version: 'v1.3', description: 'Ultra-succinct implementation specialist.' },
  { id: '5', name: 'ux-designer', persona: 'Sally', version: 'v1.0', description: 'UX/UI design, user empathy, Stitch-to-React translation.' },
];

export default function Agents() {
  const [selected, setSelected] = useState(MOCK_AGENTS[0]);

  return (
    <div className="space-y-lg">
      <div>
        <p className="section-title">Platform</p>
        <h1 className="page-title mt-0.5">Agents</h1>
      </div>

      <div className="flex gap-md h-[600px]">
        {/* Left: agent list */}
        <div className="w-64 flex-shrink-0 bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
          <div className="px-md py-sm border-b border-ink-800">
            <h3 className="font-h3 text-h3 text-ink-100">Available agents</h3>
          </div>
          <div className="divide-y divide-ink-800/50 overflow-y-auto h-[calc(600px-45px)]">
            {MOCK_AGENTS.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelected(agent)}
                className={[
                  'w-full flex items-center justify-between px-md h-[56px] transition-colors text-left',
                  selected.id === agent.id
                    ? 'bg-byan-500/10 border-l-2 border-byan-500'
                    : 'hover:bg-ink-800 border-l-2 border-transparent',
                ].join(' ')}
              >
                <div className="flex items-center gap-sm">
                  <Bot size={14} className={selected.id === agent.id ? 'text-byan-400' : 'text-ink-400'} />
                  <div>
                    <p className="font-body-sm text-body-sm text-ink-100 font-medium">{agent.name}</p>
                    <p className="font-caption text-caption text-ink-500">{agent.persona}</p>
                  </div>
                </div>
                <ChevronRight size={12} className="text-ink-600" />
              </button>
            ))}
          </div>
        </div>

        {/* Right: agent detail */}
        <div className="flex-1 space-y-md">
          {/* Persona card */}
          <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
            <p className="font-label text-label text-ink-400 uppercase mb-sm">Persona</p>
            <div className="flex items-center gap-md">
              <div className="w-12 h-12 rounded-lg bg-byan-500/10 border border-byan-500/20 flex items-center justify-center">
                <Bot size={20} className="text-byan-400" />
              </div>
              <div>
                <p className="font-h2 text-h2 text-white">{selected.name}</p>
                <p className="font-body-sm text-body-sm text-ink-400">{selected.persona} · {selected.version}</p>
              </div>
            </div>
            <p className="font-body text-body text-ink-300 mt-md">{selected.description}</p>
          </div>

          {/* Tools card */}
          <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
            <p className="font-label text-label text-ink-400 uppercase mb-sm">Tools</p>
            <div className="flex flex-wrap gap-xs">
              {['Bash', 'Read', 'Write', 'Edit', 'WebSearch'].map((tool) => (
                <span key={tool} className="badge badge-neutral">{tool}</span>
              ))}
            </div>
          </div>

          {/* Memory card */}
          <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
            <p className="font-label text-label text-ink-400 uppercase mb-sm">Memory</p>
            <p className="font-body-sm text-body-sm text-ink-500 italic">No memory entries for this agent.</p>
          </div>

          {/* Versions card */}
          <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
            <p className="font-label text-label text-ink-400 uppercase mb-sm">Version</p>
            <span className="badge badge-primary">{selected.version}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
