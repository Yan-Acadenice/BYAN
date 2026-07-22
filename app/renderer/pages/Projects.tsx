// Projects — project list wired to live byan_web API.

import React, { useEffect, useState } from 'react';
import { Search, FolderOpen, Plus, ArrowLeft, Loader2, AlertCircle, Globe, Lock, HardDriveDownload } from 'lucide-react';
import ProjectDetail from './ProjectDetail';
import type { ByanProject } from '../../shared/ipc-contract';
import { useInstallProject } from '../hooks/useInstallProject';

type Filter = 'all' | 'recent';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Projects() {
  const [projects, setProjects] = useState<ByanProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.projects.list();
      setProjects(list as ByanProject[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  // N2 : install / update BYAN into a chosen folder ; reload the list on success.
  const install = useInstallProject(() => { void load(); });

  useEffect(() => { void load(); }, []);

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
        <ProjectDetail projectId={detailId} />
      </div>
    );
  }

  const FILTERS: Filter[] = ['all', 'recent'];

  const sorted = [...projects].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const visible = sorted.filter((p) => {
    if (filter === 'recent') {
      const ageH = (Date.now() - new Date(p.updated_at).getTime()) / 3_600_000;
      if (ageH > 72) return false;
    }
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
        <button
          type="button"
          data-testid="install-project-btn"
          onClick={() => void install.run()}
          disabled={install.installing}
          className="btn-primary flex items-center gap-xs py-2 px-md disabled:opacity-60"
          title="Choisir un dossier et installer / mettre a jour BYAN dedans"
        >
          {install.installing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New project
        </button>
      </div>

      {/* N2 : live install progress + result */}
      {(install.installing || install.result || install.error) && (
        <div data-testid="install-panel" className="bg-ink-900 border border-ink-800 rounded-lg p-md space-y-xs">
          <div className="flex items-center gap-xs text-ink-200 font-body-sm text-body-sm">
            <HardDriveDownload size={14} />
            {install.installing
              ? (install.step ? `Etape ${install.step.index}/${install.step.total} — ${install.step.label}` : 'Installation en cours...')
              : install.error
              ? `Echec : ${install.error}`
              : `Termine : ${install.result?.verify.passed}/${install.result?.verify.total} verifications OK`}
          </div>
          {install.logs.length > 0 && (
            <pre className="font-mono-code text-[11px] text-ink-500 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {install.logs.slice(-8).join('\n')}
            </pre>
          )}
          {!install.installing && (
            <button type="button" className="btn-ghost text-xs" onClick={install.reset}>Fermer</button>
          )}
        </div>
      )}

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
      {loading ? (
        <div className="flex items-center justify-center py-xxl text-ink-400">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Loading projects...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <AlertCircle size={40} className="mb-md text-red opacity-70" />
          <p className="font-h3 text-h3 text-ink-300 mb-xs">Could not load projects</p>
          <p className="font-body-sm text-body-sm text-ink-500 mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>
        </div>
      ) : (
        <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_180px_120px_80px] px-md py-sm border-b border-ink-800 bg-ink-950">
            <span className="font-label text-label text-ink-400 uppercase">Name</span>
            <span className="font-label text-label text-ink-400 uppercase">Type</span>
            <span className="font-label text-label text-ink-400 uppercase">Last activity</span>
            <span className="font-label text-label text-ink-400 uppercase">Role</span>
            <span className="font-label text-label text-ink-400 uppercase">Vis.</span>
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
                  className="grid grid-cols-[1fr_120px_180px_120px_80px] items-center px-md hover:bg-ink-800 transition-colors cursor-pointer"
                  style={{ height: '56px' }}
                  onClick={() => setDetailId(p.id)}
                >
                  <span className="font-body-sm text-body-sm text-ink-100 font-medium truncate">
                    {p.name}
                  </span>
                  <span className="font-mono-code text-mono-code text-ink-400 text-[11px] truncate">{p.type}</span>
                  <span className="font-caption text-caption text-ink-400">{timeAgo(p.updated_at)}</span>
                  <span className="font-caption text-caption text-ink-400">{p.my_role}</span>
                  <span className="text-ink-500">
                    {p.visibility === 'public' ? <Globe size={14} /> : <Lock size={14} />}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
