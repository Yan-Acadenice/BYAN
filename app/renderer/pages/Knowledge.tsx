// Knowledge — wired to live byan_web API (/api/knowledge).

import React, { useEffect, useState } from 'react';
import { BookOpen, Loader2, AlertCircle } from 'lucide-react';
import type { ByanKnowledge } from '../../shared/ipc-contract';

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function Knowledge() {
  const [items, setItems] = useState<ByanKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.knowledge.list({ limit: 50 });
      setItems(list as ByanKnowledge[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-lg">
      <div>
        <p className="section-title">Platform</p>
        <h1 className="page-title mt-0.5">Knowledge</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-ink-400">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Loading knowledge...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <AlertCircle size={40} className="mb-md text-red opacity-70" />
          <p className="font-h3 text-h3 text-ink-300 mb-xs">Could not load knowledge</p>
          <p className="font-body-sm text-body-sm text-ink-500 mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <BookOpen size={40} className="mb-md opacity-30" />
          <p className="font-h3 text-h3 text-ink-400 mb-xs">No knowledge entries yet</p>
          <p className="font-body-sm text-body-sm text-ink-500">Import a project to populate this library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {items.map((card) => (
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
                  {card.path && (
                    <span className="font-mono-code text-mono-code text-ink-500 text-[11px]">{card.path}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-xs">
                  {card.tags?.map((tag) => (
                    <span key={tag} className="badge badge-neutral text-[9px]">{tag}</span>
                  ))}
                  {card.category && (
                    <span className="badge badge-neutral text-[9px]">{card.category}</span>
                  )}
                </div>
                <span className="font-caption text-caption text-ink-500 text-[10px] flex-shrink-0 ml-xs">
                  {formatDate(card.updated_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
