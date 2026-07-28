// Agents — liste des agents du projet.
//
// Source de donnee : `byanWeb.customAgents.list()`. En mode local, le processus
// principal route cet appel vers le DISQUE (`localAgents()` lit les dossiers de
// `_byan/agent/`), donc cette page a du contenu hors ligne sans token.
//
// Lot 5 : les deux vides sont separes. VID-0 (rien n'a jamais ete ecrit dans le
// dossier) et VID-F (le filtre cache tout) ne disent plus la meme phrase et
// n'offrent plus la meme sortie.

import React, { useEffect, useMemo, useState } from 'react';
import { Bot, ChevronRight, Loader2, AlertCircle, Search } from 'lucide-react';
import type { ByanCustomAgent } from '../../shared/ipc-contract';
import { EmptyNever, EmptyFiltered, ConfigureTrace, useConfigureProject } from '../components/EmptyState';

export default function Agents() {
  const [agents, setAgents] = useState<ByanCustomAgent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.customAgents.list();
      const items = list as ByanCustomAgent[];
      setAgents(items);
      setSelectedId(items.length > 0 ? items[0].id : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des agents impossible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // La porte de sortie de VID-0 : choisir un dossier, y appliquer la
  // configuration BYAN, puis relire la liste.
  const configure = useConfigureProject(() => load());

  // Le filtre existe pour que VID-F ait un sens : un roster BYAN complet passe
  // la trentaine d'agents, chercher devient necessaire avant de scroller.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.title ?? '').toLowerCase().includes(q) ||
        (a.role ?? '').toLowerCase().includes(q)
    );
  }, [agents, search]);

  // La selection suit le filtre : garder en detail un agent que la liste ne
  // montre plus donnerait un panneau qui parle d'un absent.
  const selected = visible.find((a) => a.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="space-y-lg">
      <div>
        <p className="section-title">Plateforme</p>
        <h1 className="page-title mt-0.5">Agents</h1>
      </div>

      <ConfigureTrace state={configure} />

      {/* Le filtre n'a rien a filtrer tant que la liste est vide : on ne montre
          pas un controle qui ne peut rien faire (regle 1 de la passation). */}
      {!loading && !error && agents.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-sm top-1/2 -translate-y-1/2 text-content-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les agents…"
            aria-label="Filtrer les agents"
            data-testid="agents-filter"
            className="input pl-8 h-9"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-content-secondary">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Chargement des agents…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl">
          <AlertCircle size={40} className="mb-md text-accent-danger" />
          <p className="font-h3 text-h3 text-content-strong mb-xs">Impossible de charger les agents</p>
          <p className="font-body-sm text-body-sm text-content-tertiary mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Réessayer</button>
        </div>
      ) : agents.length === 0 ? (
        // VID-0 — le dossier du projet n'a jamais recu d'agents.
        <EmptyNever
          testId="agents-empty-never"
          icon={Bot}
          title="Aucun agent dans ce projet"
          body={
            <>
              Les agents sont écrits dans le dossier du projet, sous <code className="font-mono-code text-[12px] text-content-secondary">_byan/agent/</code>,
              quand tu appliques la configuration. Tant que rien n'y a été appliqué, il n'y a rien à lire.
            </>
          }
          actionLabel="Configurer ce projet"
          actionTitle="Choisir un dossier et y appliquer la configuration BYAN"
          onAction={() => void configure.run()}
          actionBusy={configure.installing}
        />
      ) : visible.length === 0 ? (
        // VID-F — des agents existent, le filtre les cache tous.
        <EmptyFiltered
          testId="agents-empty-filtered"
          noun={{ singulier: 'agent', pluriel: 'agents' }}
          query={search.trim()}
          total={agents.length}
          onClear={() => setSearch('')}
        />
      ) : (
        <div className="flex gap-md h-[600px]">
          {/* Gauche : la liste */}
          <div className="w-64 flex-shrink-0 bg-surface-card border border-edge-subtle rounded-lg overflow-hidden">
            <div className="px-md py-sm border-b border-edge-subtle">
              <h3 className="font-h3 text-h3 text-content-body">
                {visible.length === agents.length
                  ? `Agents (${agents.length})`
                  : `${visible.length} sur ${agents.length}`}
              </h3>
            </div>
            <div className="divide-y divide-edge-subtle overflow-y-auto h-[calc(600px-45px)]">
              {visible.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedId(agent.id)}
                  className={[
                    'w-full flex items-center justify-between px-md h-[56px] transition-colors text-left',
                    selected?.id === agent.id
                      ? 'bg-accent-action/10 border-l-2 border-accent-action'
                      : 'hover:bg-surface-hover border-l-2 border-transparent',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-sm min-w-0">
                    <Bot
                      size={14}
                      className={selected?.id === agent.id ? 'text-accent-action' : 'text-content-secondary'}
                    />
                    <div className="min-w-0">
                      <p className="font-body-sm text-body-sm text-content-body font-medium truncate">{agent.name}</p>
                      <p className="font-caption text-caption text-content-tertiary truncate">{agent.slug}</p>
                    </div>
                  </div>
                  <ChevronRight size={12} className="text-content-muted flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Droite : le detail */}
          {selected && (
            <div className="flex-1 space-y-md overflow-y-auto">
              <div className="bg-surface-card border border-edge-subtle rounded-lg p-md">
                <p className="font-label text-label text-content-tertiary uppercase mb-sm">Persona</p>
                <div className="flex items-center gap-md">
                  <div className="w-12 h-12 rounded-lg bg-accent-action/10 border border-accent-action/20 flex items-center justify-center">
                    <Bot size={20} className="text-accent-action" />
                  </div>
                  <div>
                    <p className="font-h2 text-h2 text-content-strong">{selected.name}</p>
                    <p className="font-body-sm text-body-sm text-content-secondary">
                      {selected.title ?? selected.slug}
                    </p>
                  </div>
                </div>
                {selected.role && (
                  <p className="font-body text-body text-content-body mt-md">{selected.role}</p>
                )}
              </div>

              {selected.principles.length > 0 && (
                <div className="bg-surface-card border border-edge-subtle rounded-lg p-md">
                  <p className="font-label text-label text-content-tertiary uppercase mb-sm">Principes</p>
                  <ul className="space-y-xs">
                    {selected.principles.map((p, i) => (
                      <li key={i} className="font-body-sm text-body-sm text-content-body">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-surface-card border border-edge-subtle rounded-lg p-md">
                <p className="font-label text-label text-content-tertiary uppercase mb-sm">État</p>
                <span className={`badge ${selected.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                  {selected.status}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
