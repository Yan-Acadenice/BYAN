// Memoire — entrees de memoire du projet.
//
// Source de donnee : `byanWeb.memory.list()`. En mode local, le processus
// principal route cet appel vers le DISQUE (`localMemory()` lit les
// transcriptions sous `_byan/memoire/chat-sessions/`). Consequence a dire
// honnetement dans le vide : ce dossier n'est PAS cree par la configuration, il
// se remplit quand des sessions locales tournent.
//
// Lot 5 : les deux vides sont separes. VID-0 (rien n'a jamais ete ecrit) et
// VID-F (la recherche cache tout) ne disent plus la meme phrase.

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, AlertCircle, Brain } from 'lucide-react';
import type { ByanMemory } from '../../shared/ipc-contract';
import { EmptyNever, EmptyFiltered, ConfigureTrace, useConfigureProject } from '../components/EmptyState';

function formatTs(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

export default function Memory() {
  const [entries, setEntries] = useState<ByanMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.memory.list({ limit: 50 });
      setEntries(list as ByanMemory[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement de la mémoire impossible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const configure = useConfigureProject(() => load());

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        (e.category ?? '').toLowerCase().includes(q) ||
        (e.cli_source ?? '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Plateforme</p>
          <h1 className="page-title mt-0.5">Mémoire</h1>
        </div>
      </div>

      <ConfigureTrace state={configure} />

      {/* Pas de champ de recherche tant qu'il n'y a rien a chercher : un controle
          qui ne peut rien faire promet une capacite et la retire (regle 1). */}
      {!loading && !error && entries.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-sm top-1/2 -translate-y-1/2 text-content-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher dans la mémoire…"
            aria-label="Chercher dans la mémoire"
            data-testid="memory-filter"
            className="input pl-8 h-9"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-content-secondary">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Chargement de la mémoire…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl">
          <AlertCircle size={40} className="mb-md text-accent-danger" />
          <p className="font-h3 text-h3 text-content-strong mb-xs">Impossible de charger la mémoire</p>
          <p className="font-body-sm text-body-sm text-content-tertiary mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Réessayer</button>
        </div>
      ) : entries.length === 0 ? (
        // VID-0 — aucune entree n'a jamais ete ecrite dans le dossier du projet.
        // Le texte ne promet pas que configurer suffira : la memoire arrive avec
        // les sessions, pas avec la configuration.
        <div className="bg-surface-card border border-edge-subtle rounded-lg overflow-hidden">
          <EmptyNever
            testId="memory-empty-never"
            icon={Brain}
            title="Aucune mémoire dans ce projet"
            body={
              <>
                La mémoire se remplit toute seule, dans le dossier du projet, sous{' '}
                <code className="font-mono-code text-[12px] text-content-secondary">_byan/memoire/</code>.
                Configure ce projet, puis lance une session : ce qui s'y dit se retrouvera ici.
              </>
            }
            actionLabel="Configurer ce projet"
            actionTitle="Choisir un dossier et y appliquer la configuration BYAN"
            onAction={() => void configure.run()}
            actionBusy={configure.installing}
          />
        </div>
      ) : (
        <div className="bg-surface-card border border-edge-subtle rounded-lg overflow-hidden">
          <div className="grid grid-cols-[180px_100px_80px_1fr_80px] px-md py-sm border-b border-edge-subtle bg-surface-page">
            <span className="font-label text-label text-content-tertiary uppercase">Horodatage</span>
            <span className="font-label text-label text-content-tertiary uppercase">Source</span>
            <span className="font-label text-label text-content-tertiary uppercase">Couche</span>
            <span className="font-label text-label text-content-tertiary uppercase">Contenu</span>
            <span className="font-label text-label text-content-tertiary uppercase">Épinglé</span>
          </div>
          {visible.length === 0 ? (
            // VID-F — des entrees existent, la recherche les cache toutes.
            <EmptyFiltered
              testId="memory-empty-filtered"
              noun={{ singulier: 'entrée de mémoire', pluriel: 'entrées de mémoire', feminin: true }}
              query={search.trim()}
              total={entries.length}
              onClear={() => setSearch('')}
              clearLabel="Effacer la recherche"
            />
          ) : (
            <div className="divide-y divide-edge-subtle">
              {visible.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[180px_100px_80px_1fr_80px] items-center px-md hover:bg-surface-hover transition-colors"
                  style={{ minHeight: '56px', padding: '12px 16px' }}
                >
                  <span className="font-mono-code text-mono-code text-content-secondary text-[11px]">
                    {formatTs(e.created_at)}
                  </span>
                  <span className="badge badge-neutral w-fit">{e.cli_source ?? 'inconnue'}</span>
                  <span className="font-caption text-caption text-content-secondary">{e.layer}</span>
                  <span className="font-body-sm text-body-sm text-content-body truncate pr-md">{e.content}</span>
                  <span className="font-caption text-caption text-content-secondary">
                    {e.pinned ? 'oui' : ''}
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
