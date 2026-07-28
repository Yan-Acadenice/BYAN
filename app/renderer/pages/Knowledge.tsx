// Connaissance — fiches de connaissance du projet.
//
// Source de donnee : `byanWeb.knowledge.list()`. En mode local, le processus
// principal route cet appel vers le DISQUE (`localKnowledge()` lit les fichiers
// .md / .txt de `_byan/connaissance/`).
//
// Lot 5 : les deux vides sont separes. VID-0 (rien n'a jamais ete ecrit dans le
// dossier) et VID-F (le filtre cache tout) ne disent plus la meme phrase et
// n'offrent plus la meme sortie.

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, AlertCircle, Search } from 'lucide-react';
import type { ByanKnowledge } from '../../shared/ipc-contract';
import { EmptyNever, EmptyFiltered, ConfigureTrace, useConfigureProject } from '../components/EmptyState';

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function Knowledge() {
  const [items, setItems] = useState<ByanKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.knowledge.list({ limit: 50 });
      setItems(list as ByanKnowledge[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement de la connaissance impossible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const configure = useConfigureProject(() => load());

  // Le filtre existe pour que VID-F ait un sens : une base de connaissance de
  // projet depasse vite ce qu'une grille de cartes laisse voir d'un coup d'oeil.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        (k.category ?? '').toLowerCase().includes(q) ||
        (k.path ?? '').toLowerCase().includes(q) ||
        (k.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
    );
  }, [items, search]);

  return (
    <div className="space-y-lg">
      <div>
        <p className="section-title">Plateforme</p>
        <h1 className="page-title mt-0.5">Connaissance</h1>
      </div>

      <ConfigureTrace state={configure} />

      {/* Pas de filtre tant qu'il n'y a rien a filtrer (regle 1). */}
      {!loading && !error && items.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-sm top-1/2 -translate-y-1/2 text-content-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les fiches…"
            aria-label="Filtrer les fiches"
            data-testid="knowledge-filter"
            className="input pl-8 h-9"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-content-secondary">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Chargement de la connaissance…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl">
          <AlertCircle size={40} className="mb-md text-accent-danger" />
          <p className="font-h3 text-h3 text-content-strong mb-xs">Impossible de charger la connaissance</p>
          <p className="font-body-sm text-body-sm text-content-tertiary mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Réessayer</button>
        </div>
      ) : items.length === 0 ? (
        // VID-0 — aucune fiche n'a jamais ete ecrite dans le dossier du projet.
        <EmptyNever
          testId="knowledge-empty-never"
          icon={BookOpen}
          title="Aucune fiche dans ce projet"
          body={
            <>
              Les fiches sont lues dans le dossier du projet, sous{' '}
              <code className="font-mono-code text-[12px] text-content-secondary">_byan/connaissance/</code>.
              Configure ce projet pour créer ce dossier, puis dépose tes fichiers .md dedans : ils apparaîtront ici.
            </>
          }
          actionLabel="Configurer ce projet"
          actionTitle="Choisir un dossier et y appliquer la configuration BYAN"
          onAction={() => void configure.run()}
          actionBusy={configure.installing}
        />
      ) : visible.length === 0 ? (
        // VID-F — des fiches existent, le filtre les cache toutes.
        <EmptyFiltered
          testId="knowledge-empty-filtered"
          noun={{ singulier: 'fiche', pluriel: 'fiches', feminin: true }}
          query={search.trim()}
          total={items.length}
          onClear={() => setSearch('')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {visible.map((card) => (
            <div
              key={card.id}
              className="bg-surface-card border border-edge-subtle rounded-lg p-md hover:-translate-y-px hover:border-edge-strong transition-all duration-200 group"
            >
              <div className="flex items-start gap-sm mb-md">
                <div className="w-8 h-8 rounded bg-accent-action/10 border border-accent-action/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={14} className="text-accent-action" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-h3 text-h3 text-content-body group-hover:text-content-strong transition-colors leading-snug">
                    {card.title}
                  </h3>
                  {card.path && (
                    <span className="font-mono-code text-mono-code text-content-tertiary text-[11px] block truncate" title={card.path}>
                      {card.path}
                    </span>
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
                <span className="font-caption text-caption text-content-tertiary text-[10px] flex-shrink-0 ml-xs">
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
