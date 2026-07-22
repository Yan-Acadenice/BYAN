// ProjectDetail — wired to live byan_web API.
// Receives projectId from Projects.tsx; fetches project + memory + knowledge tabs.

import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, BookOpen, Brain, FolderOpen } from 'lucide-react';
import type { ByanProject, ByanMemory, ByanKnowledge, LocalProjectEntry } from '../../shared/ipc-contract';

type Tab = 'overview' | 'memory' | 'knowledge';
const TABS: Tab[] = ['overview', 'memory', 'knowledge'];

interface ProjectDetailProps {
  projectId?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProjectDetail({ projectId }: ProjectDetailProps) {
  const [project, setProject] = useState<ByanProject | null>(null);
  const [memory, setMemory] = useState<ByanMemory[]>([]);
  const [knowledge, setKnowledge] = useState<ByanKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  // F6 : the local folder linked to this project (from ~/.byan/projects.json).
  const [localEntry, setLocalEntry] = useState<LocalProjectEntry | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (projectId) {
        const [p, m, k] = await Promise.all([
          window.byanApi.byanWeb.projects.get(projectId),
          window.byanApi.byanWeb.memory.list({ projectId, limit: 10 }),
          window.byanApi.byanWeb.knowledge.list({ projectId, limit: 10 }),
        ]);
        setProject(p as ByanProject | null);
        setMemory(m as ByanMemory[]);
        setKnowledge(k as ByanKnowledge[]);
        // Best-effort local folder match (by id, then name). Never blocks the view.
        try {
          const proj = p as ByanProject | null;
          const entry = await window.byanApi.projectsLocal?.find?.({ id: projectId, name: proj?.name });
          setLocalEntry(entry ?? null);
        } catch { setLocalEntry(null); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-xxl text-ink-400">
        <Loader2 size={20} className="animate-spin mr-sm" />
        <span className="font-body-sm text-body-sm">Loading project...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
        <AlertCircle size={40} className="mb-md text-red opacity-70" />
        <p className="font-h3 text-h3 text-ink-300 mb-xs">{error || 'Project not found'}</p>
        <button type="button" className="btn-secondary mt-md" onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div>
        <p className="section-title">Projects / {project.type}</p>
        <h1 className="page-title mt-0.5">{project.name}</h1>
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
          <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
            <p className="font-label text-label text-ink-400 uppercase mb-sm">Description</p>
            <p className="font-body text-body text-ink-200">
              {project.description ?? 'No description.'}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-md">
            {[
              { label: 'Type', value: project.type },
              { label: 'Visibility', value: project.visibility },
              { label: 'Your role', value: project.my_role },
            ].map(({ label, value }) => (
              <div key={label} className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                <p className="font-label text-label text-ink-400 uppercase mb-xs">{label}</p>
                <p className="font-body-sm text-body-sm text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-md">
            {[
              { label: 'Memory entries (preview)', value: memory.length },
              { label: 'Knowledge entries (preview)', value: knowledge.length },
            ].map(({ label, value }) => (
              <div key={label} className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                <p className="font-label text-label text-ink-400 uppercase mb-xs">{label}</p>
                <p className="font-display text-display text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Local folder (F6) — only shown when this project maps to a dir on this PC. */}
          {localEntry && (
            <div className="bg-ink-900 border border-ink-800 rounded-lg p-md" data-testid="project-local-folder">
              <p className="font-label text-label text-ink-400 uppercase mb-xs">Dossier local</p>
              <div className="flex items-center justify-between gap-md">
                <p className="font-mono-code text-mono-code text-ink-300 text-[12px] truncate" title={localEntry.path}>
                  {localEntry.path}
                </p>
                <button
                  type="button"
                  data-testid="project-open-folder"
                  onClick={() => void window.byanApi.projectsLocal.reveal(localEntry.path)}
                  className="btn-secondary flex items-center gap-xs text-xs shrink-0"
                  title="Ouvrir le dossier"
                >
                  <FolderOpen size={14} />
                  Ouvrir
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Memory tab */}
      {activeTab === 'memory' && (
        <div className="space-y-sm animate-fade-in-up">
          {memory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
              <Brain size={40} className="mb-md opacity-30" />
              <p className="font-h3 text-h3 text-ink-400">No memory entries</p>
            </div>
          ) : (
            memory.map((m) => (
              <div key={m.id} className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                <div className="flex items-center gap-sm mb-xs">
                  <span className="badge badge-neutral">{m.layer}</span>
                  {m.category && <span className="badge badge-neutral">{m.category}</span>}
                  {m.pinned && <span className="badge badge-primary">pinned</span>}
                  <span className="font-caption text-caption text-ink-500 ml-auto">{timeAgo(m.created_at)}</span>
                </div>
                <p className="font-body-sm text-body-sm text-ink-300">{m.content}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Knowledge tab */}
      {activeTab === 'knowledge' && (
        <div className="space-y-sm animate-fade-in-up">
          {knowledge.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
              <BookOpen size={40} className="mb-md opacity-30" />
              <p className="font-h3 text-h3 text-ink-400">No knowledge entries</p>
            </div>
          ) : (
            knowledge.map((k) => (
              <div key={k.id} className="bg-ink-900 border border-ink-800 rounded-lg p-md">
                <div className="flex items-center gap-sm mb-xs">
                  <h3 className="font-h3 text-h3 text-ink-100">{k.title}</h3>
                  <span className="font-caption text-caption text-ink-500 ml-auto">{timeAgo(k.created_at)}</span>
                </div>
                {k.path && (
                  <p className="font-mono-code text-mono-code text-ink-500 text-[11px] mb-xs">{k.path}</p>
                )}
                {k.tags && k.tags.length > 0 && (
                  <div className="flex flex-wrap gap-xs">
                    {k.tags.map((tag) => (
                      <span key={tag} className="badge badge-neutral text-[9px]">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
