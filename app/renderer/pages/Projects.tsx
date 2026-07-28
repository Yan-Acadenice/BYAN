// Projets — la liste des projets.
//
// Source de donnee : `byanWeb.projects.list()`. En mode local, le processus
// principal route cet appel vers le DISQUE (`localProjects()` lit le registre
// `~/.byan/projects.json`), donc la page a du contenu hors ligne sans token.
//
// Lot 5 : les deux vides sont separes. VID-0 (aucun projet n'a jamais ete
// enregistre) et VID-F (les filtres cachent tout) ne disent plus la meme phrase
// et n'offrent plus la meme sortie.

import React, { useEffect, useMemo, useState } from 'react';
import { Search, FolderOpen, Plus, ArrowLeft, Loader2, AlertCircle, Globe, Lock } from 'lucide-react';
import ProjectDetail from './ProjectDetail';
import type { ByanProject } from '../../shared/ipc-contract';
import type { NavPage } from '../components/Sidebar';
import { EmptyNever, EmptyFiltered, ConfigureTrace, useConfigureProject } from '../components/EmptyState';

type Filter = 'all' | 'recent';

const FILTERS: Filter[] = ['all', 'recent'];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'Tous',
  recent: 'Récents',
};

// Fenetre du filtre « Récents », en heures. Nommee pour que le vide puisse la
// dire en clair au lieu de laisser l'utilisateur deviner ce que « récent » veut
// dire ici.
const RECENT_WINDOW_H = 72;
const RECENT_SCOPE_LABEL = 'les projets touchés depuis 3 jours';

interface ProjectsProps {
  // Navigate to another app page (forwarded to ProjectDetail for "launch chat").
  onNavigate?: (page: NavPage) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "À l'instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

export default function Projects({ onNavigate }: ProjectsProps = {}) {
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
      setError(err instanceof Error ? err.message : 'Chargement des projets impossible.');
    } finally {
      setLoading(false);
    }
  };

  // N2 : choisir un dossier, y installer / mettre a jour BYAN, relire la liste.
  // C'est aussi la porte de sortie de VID-0.
  const configure = useConfigureProject(() => load());

  useEffect(() => { void load(); }, []);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [projects]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((p) => {
      if (filter === 'recent') {
        const ageH = (Date.now() - new Date(p.updated_at).getTime()) / 3_600_000;
        if (ageH > RECENT_WINDOW_H) return false;
      }
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, search, filter]);

  if (detailId !== null) {
    return (
      <div className="space-y-lg">
        <button
          type="button"
          onClick={() => setDetailId(null)}
          className="flex items-center gap-xs font-body-sm text-body-sm text-content-secondary hover:text-content-strong transition-colors"
        >
          <ArrowLeft size={14} />
          Retour aux projets
        </button>
        <ProjectDetail projectId={detailId} onNavigate={onNavigate} />
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      {/* En-tete */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Espace de travail</p>
          <h1 className="page-title mt-0.5">Projets</h1>
        </div>
        <button
          type="button"
          data-testid="install-project-btn"
          onClick={() => void configure.run()}
          disabled={configure.installing}
          className="btn-primary flex items-center gap-xs"
          title="Choisir un dossier et y installer / mettre à jour BYAN"
        >
          {configure.installing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Nouveau projet
        </button>
      </div>

      <ConfigureTrace state={configure} />

      {/* Les filtres n'ont rien a filtrer tant que la liste est vide : on ne
          montre pas un controle qui ne peut rien faire (regle 1). */}
      {!loading && !error && projects.length > 0 && (
        <div className="flex items-center gap-md">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-sm top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer les projets…"
              aria-label="Filtrer les projets"
              data-testid="projects-filter"
              className="input pl-8 h-9"
            />
          </div>
          <div className="flex gap-xs bg-surface-page border border-edge-subtle rounded-full p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={[
                  'px-sm py-1 rounded-full font-caption text-caption transition-all',
                  filter === f
                    ? 'bg-accent-action/15 border border-accent-action/30 text-content-strong'
                    : 'text-content-secondary hover:text-content-body',
                ].join(' ')}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-content-secondary">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Chargement des projets…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl">
          <AlertCircle size={40} className="mb-md text-accent-danger" />
          <p className="font-h3 text-h3 text-content-strong mb-xs">Impossible de charger les projets</p>
          <p className="font-body-sm text-body-sm text-content-tertiary mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Réessayer</button>
        </div>
      ) : projects.length === 0 ? (
        // VID-0 — aucun projet n'a jamais ete enregistre sur cette machine.
        <EmptyNever
          testId="projects-empty-never"
          icon={FolderOpen}
          title="Aucun projet enregistré"
          body={
            <>
              Choisis un dossier et applique la configuration : BYAN s'y installe, le dossier est
              enregistré sur cette machine, et il apparaît dans cette liste. Rien n'est envoyé sur le réseau.
            </>
          }
          actionLabel="Configurer un projet"
          actionTitle="Choisir un dossier et y appliquer la configuration BYAN"
          onAction={() => void configure.run()}
          actionBusy={configure.installing}
        />
      ) : (
        <div className="bg-surface-card border border-edge-subtle rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_180px_120px_80px] px-md py-sm border-b border-edge-subtle bg-surface-page">
            <span className="font-label text-label text-content-tertiary uppercase">Nom</span>
            <span className="font-label text-label text-content-tertiary uppercase">Type</span>
            <span className="font-label text-label text-content-tertiary uppercase">Dernière activité</span>
            <span className="font-label text-label text-content-tertiary uppercase">Rôle</span>
            <span className="font-label text-label text-content-tertiary uppercase">Vis.</span>
          </div>

          {visible.length === 0 ? (
            // VID-F — des projets existent, les filtres les cachent tous. Le
            // bouton remet les DEUX filtres a zero, sinon il en resterait un
            // actif et le vide reviendrait aussitot.
            <EmptyFiltered
              testId="projects-empty-filtered"
              noun={{ singulier: 'projet', pluriel: 'projets' }}
              query={search.trim()}
              scopeLabel={filter === 'recent' ? RECENT_SCOPE_LABEL : undefined}
              total={projects.length}
              totalScope="sur cette machine"
              onClear={() => { setSearch(''); setFilter('all'); }}
              clearLabel="Effacer les filtres"
            />
          ) : (
            <div className="divide-y divide-edge-subtle">
              {visible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left grid grid-cols-[1fr_120px_180px_120px_80px] items-center px-md hover:bg-surface-hover transition-colors"
                  style={{ height: '56px' }}
                  onClick={() => setDetailId(p.id)}
                >
                  <span className="font-body-sm text-body-sm text-content-body font-medium truncate">
                    {p.name}
                  </span>
                  <span className="font-mono-code text-mono-code text-content-secondary text-[11px] truncate">{p.type}</span>
                  <span className="font-caption text-caption text-content-secondary">{timeAgo(p.updated_at)}</span>
                  <span className="font-caption text-caption text-content-secondary">{p.my_role}</span>
                  <span className="text-content-tertiary" title={p.visibility === 'public' ? 'Public' : 'Privé'}>
                    {p.visibility === 'public' ? <Globe size={14} /> : <Lock size={14} />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
