// Projects — e._projects_list ported to React.
// Data: mocked statically — IPC wiring deferred to post-MVP.

import React, { useState } from 'react';
import { Search, Pin, Archive, FolderOpen, Plus, ArrowLeft } from 'lucide-react';
import ProjectDetail from './ProjectDetail';

const MOCK_PROJECTS = [
  {
    id: '1',
    name: 'BYAN Platform',
    slug: 'byan-platform',
    agents: 4,
    lastActivity: '2 hours ago',
    pinned: true,
  },
  {
    id: '2',
    name: 'Acadenice CFA Portal',
    slug: 'acadenice-cfa',
    agents: 2,
    lastActivity: '1 day ago',
    pinned: false,
  },
  {
    id: '3',
    name: 'Data Pipeline Demo',
    slug: 'data-pipeline',
    agents: 1,
    lastActivity: '3 days ago',
    pinned: false,
  },
];

type Filter = 'all' | 'recent' | 'pinned';

export default function Projects() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [detailId, setDetailId] = useState<string | null>(null);

  // Show project detail inline if a row is opened
  if (detailId !== null) {
    return (
      <div className="space-y-lg">
        <button
          type="button"
          onClick={() => setDetailId(null)}
          className="flex items-center gap-xs font-body-sm text-body-sm text-ink-400 hover:text-ink-100 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Projects
        </button>
        <ProjectDetail />
      </div>
    );
  }

  const FILTERS: Filter[] = ['all', 'recent', 'pinned'];

  const visible = MOCK_PROJECTS.filter((p) => {
    if (filter === 'pinned' && !p.pinned) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-lg">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Workspace</p>
          <h1 className="page-title mt-0.5">Projects</h1>
        </div>
        <button type="button" className="btn-primary flex items-center gap-xs py-2 px-md">
          <Plus size={14} />
          New project
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-md">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-sm top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects"
            className="input pl-8 h-9"
          />
        </div>
        <div className="flex gap-xs bg-ink-950 border border-ink-800 rounded-full p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                'px-sm py-1 rounded-full font-caption text-caption capitalize transition-all',
                filter === f
                  ? 'bg-byan-500/15 border border-byan-500/30 text-white'
                  : 'text-ink-400 hover:text-ink-200',
              ].join(' ')}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_180px_80px_160px_100px] px-md py-sm border-b border-ink-800 bg-ink-950">
          <span className="font-label text-label text-ink-400 uppercase">Name</span>
          <span className="font-label text-label text-ink-400 uppercase">Slug</span>
          <span className="font-label text-label text-ink-400 uppercase">Agents</span>
          <span className="font-label text-label text-ink-400 uppercase">Last activity</span>
          <span className="font-label text-label text-ink-400 uppercase">Actions</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
            <FolderOpen size={40} className="mb-md opacity-50" />
            <p className="font-h3 text-h3 text-ink-400 mb-xs">No projects found</p>
            <p className="font-body-sm text-body-sm text-ink-500">Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-800/50">
            {visible.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_180px_80px_160px_100px] items-center px-md hover:bg-ink-800 transition-colors cursor-pointer"
                style={{ height: '56px' }}
                onClick={() => setDetailId(p.id)}
              >
                <div className="flex items-center gap-sm">
                  {p.pinned && <Pin size={12} className="text-byan-400 flex-shrink-0" />}
                  <span className="font-body-sm text-body-sm text-ink-100 font-medium truncate">
                    {p.name}
                  </span>
                </div>
                <span className="font-mono-code text-mono-code text-ink-400 truncate">{p.slug}</span>
                <span className="font-body-sm text-body-sm text-ink-400">{p.agents}</span>
                <span className="font-caption text-caption text-ink-400">{p.lastActivity}</span>
                <div className="flex items-center gap-xs" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-ink-700 text-ink-500 hover:text-ink-200 transition-colors"
                    title="Open"
                    onClick={() => setDetailId(p.id)}
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-ink-700 text-ink-500 hover:text-byan-400 transition-colors"
                    title="Pin"
                  >
                    <Pin size={14} />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-ink-700 text-ink-500 hover:text-ink-200 transition-colors"
                    title="Archive"
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
