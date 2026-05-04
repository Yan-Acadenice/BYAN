// Knowledge — i._knowledge ported to React (card grid).
// Data: mocked statically — IPC wiring deferred to post-MVP.

import React from 'react';
import { BookOpen } from 'lucide-react';

const MOCK_CARDS = [
  { id: '1', title: 'Merise Agile Methodology', domain: 'methodology', updated: '2026-05-01', tags: ['merise', 'agile', 'tdd'] },
  { id: '2', title: 'BYAN IPC Contract', domain: 'architecture', updated: '2026-05-03', tags: ['ipc', 'electron', 'typescript'] },
  { id: '3', title: 'Tailwind CSS Dark Mode', domain: 'frontend', updated: '2026-04-28', tags: ['tailwind', 'css', 'dark-mode'] },
  { id: '4', title: '64 Mantras Reference', domain: 'culture', updated: '2026-05-04', tags: ['mantras', 'byan'] },
  { id: '5', title: 'ELO Trust System', domain: 'epistemology', updated: '2026-04-30', tags: ['elo', 'trust', 'epistemology'] },
  { id: '6', title: 'Acadenice CFA Profile', domain: 'business', updated: '2026-05-02', tags: ['acadenice', 'cfa', 'nice'] },
];

export default function Knowledge() {
  return (
    <div className="space-y-lg">
      <div>
        <p className="section-title">Platform</p>
        <h1 className="page-title mt-0.5">Knowledge</h1>
      </div>

      {/* Card grid — 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {MOCK_CARDS.map((card) => (
          <div
            key={card.id}
            className="bg-ink-900 border border-ink-800 rounded-lg p-md hover:-translate-y-px hover:border-ink-700 transition-all duration-200 cursor-pointer group"
          >
            <div className="flex items-start gap-sm mb-md">
              <div className="w-8 h-8 rounded bg-byan-500/10 border border-byan-500/20 flex items-center justify-center flex-shrink-0">
                <BookOpen size={14} className="text-byan-400" />
              </div>
              <div>
                <h3 className="font-h3 text-h3 text-ink-100 group-hover:text-white transition-colors leading-snug">
                  {card.title}
                </h3>
                <span className="font-mono-code text-mono-code text-ink-500 text-[11px]">{card.domain}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-xs">
                {card.tags.map((tag) => (
                  <span key={tag} className="badge badge-neutral text-[9px]">{tag}</span>
                ))}
              </div>
              <span className="font-caption text-caption text-ink-500 text-[10px] flex-shrink-0 ml-xs">{card.updated}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
