// McpServers — F14 control panel.
//
// Source de donnee : `window.byanApi.mcp.list()`. Cette page ne passe PAS par
// byan_web : le processus principal lit le `.mcp.json` a la racine du projet.
// Elle est donc nativement sur le disque, hors ligne, sans token — mais elle
// resout cette racine contre la cle de magasin `onboarding.projectRoot`, pas
// contre le registre des projets que lisent les quatre autres pages de liste.
//
// Lot 5 : les deux vides sont separes. VID-F n'existe pas ici — voir la note sur
// l'absence de filtre plus bas. VID-0 a deux causes qui appellent deux sorties
// differentes, et la page dit laquelle :
//   - aucune racine de projet -> il n'y a meme pas de fichier a lire
//   - une racine, mais aucun serveur declare -> il faut en ajouter un
// Melanger les deux enverrait la moitie des utilisateurs vers le mauvais geste.

import React, { useCallback, useEffect, useState } from 'react';
import { Play, Square, RotateCcw, Plus, Loader2, AlertTriangle, Pencil, Trash2, FolderOpen } from 'lucide-react';
import type { McpServer, McpStatus, McpStatusChangePayload } from '../../shared/ipc-contract';
import McpServerFormModal, { type McpFormMode } from '../components/mcp/McpServerFormModal';
import { useToast } from '../components/toast/ToastContext';
import { useT } from '../i18n/I18nContext';
import { mcpStatusBadge } from '../lib/mcp-status';
import { EmptyNever, ConfigureTrace, useConfigureProject } from '../components/EmptyState';

// La cle du magasin contre laquelle le processus principal resout `.mcp.json`
// (main/ipc-handlers/mcp.ts). La page la lit pour savoir LAQUELLE des deux
// causes de VID-0 s'applique, et pour ne pas offrir « Ajouter » quand `mcp.add`
// ne peut que repondre UNAVAILABLE.
const PROJECT_ROOT_KEY = 'onboarding.projectRoot';

function isTransitioning(status: McpStatus): boolean {
  return status.state === 'starting';
}

export default function McpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<McpFormMode>('add');
  const [editTarget, setEditTarget] = useState<McpServer | undefined>(undefined);
  const toast = useToast();
  const { t } = useT();

  const refresh = useCallback(async () => {
    try {
      const list = await window.byanApi.mcp.list();
      setServers(list);
      setLoadError(null);
    } catch (err) {
      // A failed read used to fall through to the empty state, so a broken
      // .mcp.json looked exactly like "no servers configured".
      setServers([]);
      setLoadError((err as { message?: string }).message ?? 'erreur inconnue');
    }
    // Relu a chaque rafraichissement : configurer un projet la deplace, et le
    // vide doit alors changer de cause en meme temps que la liste.
    try {
      const root = await window.byanApi.store?.get?.<string>(PROJECT_ROOT_KEY);
      setProjectRoot(typeof root === 'string' && root.length > 0 ? root : null);
    } catch {
      setProjectRoot(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // La sortie de VID-0 quand aucune racine n'est posee.
  const configure = useConfigureProject(() => refresh());

  // Live status updates pushed from main on every state transition.
  useEffect(() => {
    const off = window.byanEvents?.on('byan:mcp:statusChange', (payload: unknown) => {
      const update = payload as McpStatusChangePayload;
      if (!update || typeof update.id !== 'string') return;
      setServers((prev) => prev.map((s) => (s.id === update.id ? { ...s, status: update.status } : s)));
    });
    return () => { off?.(); };
  }, []);

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const handleStart = (id: string) => withBusy(id, async () => {
    try {
      await window.byanApi.mcp.start(id);
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'démarrage impossible';
      toast.error(`${id} : ${message}`);
    } finally {
      await refresh();
    }
  });

  const handleStop = (id: string) => withBusy(id, async () => {
    try {
      await window.byanApi.mcp.stop(id);
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'arrêt impossible';
      toast.error(`${id} : ${message}`);
    }
    finally { await refresh(); }
  });

  const handleRestart = (id: string) => withBusy(id, async () => {
    try {
      await window.byanApi.mcp.stop(id);
      // Give the exit event a tick to flip state before re-spawning.
      await new Promise((r) => setTimeout(r, 150));
      await window.byanApi.mcp.start(id);
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'redémarrage impossible';
      toast.error(`${id} : ${message}`);
    }
    finally { await refresh(); }
  });

  const openAdd = () => {
    setFormMode('add');
    setEditTarget(undefined);
    setFormOpen(true);
  };

  const openEdit = (srv: McpServer) => {
    setFormMode('edit');
    setEditTarget(srv);
    setFormOpen(true);
  };

  const handleDelete = (srv: McpServer) => withBusy(srv.id, async () => {
    const confirmed = window.confirm(
      `Supprimer le serveur MCP « ${srv.id} » ?\n\nIl sera retiré de .mcp.json. Sans gestion de version, ce retrait est définitif.`
    );
    if (!confirmed) return;
    try {
      await window.byanApi.mcp.delete(srv.id);
      toast.success(`« ${srv.id} » retiré de .mcp.json`);
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'suppression impossible';
      toast.error(`Suppression de « ${srv.id} » impossible : ${message}`);
    } finally {
      await refresh();
    }
  });

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">{t('mcp.section')}</p>
          <h1 className="page-title mt-0.5">{t('mcp.title')}</h1>
        </div>
        {/* `mcp.add` leve UNAVAILABLE sans racine de projet. Un bouton grise
            promettrait la capacite et la retirerait : sans racine il est absent
            du DOM, et le vide porte la vraie sortie (regle 1). */}
        {projectRoot !== null && (
          <button
            type="button"
            data-testid="mcp-add-btn"
            onClick={openAdd}
            className="btn-primary flex items-center gap-xs"
          >
            <Plus size={14} />
            Ajouter un serveur MCP
          </button>
        )}
      </div>

      <ConfigureTrace state={configure} />

      {/* Pas de filtre sur cette page, volontairement : un `.mcp.json` declare
          une poignee de serveurs, tous visibles d'un coup, et chaque ligne est
          une surface d'action (démarrer / arrêter / redémarrer / modifier /
          supprimer). Un filtre y cacherait des actions sans rien faire gagner.
          C'est la seule des cinq pages de liste sans VID-F. */}

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-content-secondary">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Chargement des serveurs…</span>
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="bg-surface-card border border-accent-danger/40 rounded-lg flex flex-col items-center justify-center py-xxl px-md text-center"
        >
          <AlertTriangle size={28} className="mb-md text-accent-danger" />
          <p className="font-h3 text-h3 text-content-strong mb-xs">Impossible de lire les serveurs MCP</p>
          <pre className="font-mono-code text-mono-code text-content-tertiary text-[11px] max-w-md whitespace-pre-wrap break-all">
            {loadError}
          </pre>
          <button type="button" onClick={() => void refresh()} className="btn-secondary btn-sm mt-md">
            Réessayer
          </button>
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-surface-card border border-edge-subtle rounded-lg overflow-hidden">
          {projectRoot === null ? (
            // VID-0, première cause : aucune racine de projet. Il n'y a pas de
            // fichier a lire, donc « ajouter » ne servirait a rien.
            <EmptyNever
              testId="mcp-empty-no-project"
              icon={FolderOpen}
              title="Aucun projet configuré"
              body={
                <>
                  Les serveurs MCP sont lus dans le fichier{' '}
                  <code className="font-mono-code text-[12px] text-content-secondary">.mcp.json</code>{' '}
                  à la racine du projet. Tant qu'aucun projet n'est choisi, il n'y a pas de fichier à lire.
                </>
              }
              actionLabel="Configurer ce projet"
              actionTitle="Choisir un dossier, y appliquer la configuration BYAN et le prendre comme projet courant"
              onAction={() => void configure.run()}
              actionBusy={configure.installing}
            />
          ) : (
            // VID-0, seconde cause : la racine existe, le fichier ne declare
            // aucun serveur. La sortie est d'en ajouter un — ce que `mcp.add`
            // sait faire, maintenant qu'il y a une racine.
            <EmptyNever
              testId="mcp-empty-never"
              icon={Play}
              title="Aucun serveur MCP dans ce projet"
              body={
                <>
                  Le fichier{' '}
                  <code className="font-mono-code text-[12px] text-content-secondary">.mcp.json</code>{' '}
                  de <span className="font-mono-code text-[12px] text-content-secondary break-all">{projectRoot}</span>{' '}
                  ne déclare aucun serveur. Ajoute-en un : il y sera écrit.
                </>
              }
              actionLabel="Ajouter un serveur MCP"
              actionTitle="Déclarer un serveur MCP dans le .mcp.json de ce projet"
              onAction={openAdd}
              secondaryLabel="Changer de projet"
              onSecondary={() => void configure.run()}
            />
          )}
        </div>
      ) : (
        <div className="bg-surface-card border border-edge-subtle rounded-lg overflow-hidden divide-y divide-edge-subtle">
          {servers.map((srv) => {
            const isRunning = srv.status.state === 'running';
            const isBusy = busyIds.has(srv.id) || isTransitioning(srv.status);
            const errorMessage = srv.status.state === 'error' ? srv.status.message : null;
            const badge = mcpStatusBadge(srv.status);
            return (
              <div key={srv.id} className="flex items-start justify-between px-md py-sm hover:bg-surface-hover transition-colors">
                <div className="flex items-start gap-md min-w-0 flex-1">
                  <div
                    className={['w-2 h-2 rounded-full flex-shrink-0 mt-1.5', badge.dotClass].join(' ')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-xs">
                      <p className="font-body-sm text-body-sm text-content-body font-medium">{srv.name}</p>
                      <span className="font-mono-code text-mono-code text-content-tertiary text-[10px] uppercase">
                        {t(badge.labelKey)}
                      </span>
                      {!srv.enabled && (
                        <span className="font-mono-code text-mono-code text-content-tertiary text-[10px] uppercase">désactivé</span>
                      )}
                    </div>
                    <p className="font-mono-code text-mono-code text-content-tertiary text-[11px] truncate">
                      {srv.command} {(srv.args ?? []).join(' ')}
                    </p>
                    {errorMessage && (
                      <div className="mt-xs flex items-start gap-xs text-accent-danger max-w-full">
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                        <pre className="font-mono-code text-mono-code text-[11px] whitespace-pre-wrap break-all">
                          {errorMessage}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-xs flex-shrink-0 ml-md">
                  {!isRunning && (
                    <button
                      type="button"
                      onClick={() => void handleStart(srv.id)}
                      className="btn-secondary btn-sm flex items-center gap-xs"
                      disabled={isBusy || !srv.enabled || srv.transport !== 'stdio'}
                    >
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Démarrer
                    </button>
                  )}
                  {isRunning && (
                    <button
                      type="button"
                      onClick={() => void handleStop(srv.id)}
                      className="btn-secondary btn-sm flex items-center gap-xs"
                      disabled={isBusy}
                    >
                      <Square size={12} /> Arrêter
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRestart(srv.id)}
                    className="btn-ghost btn-sm flex items-center gap-xs"
                    disabled={isBusy || !srv.enabled || srv.transport !== 'stdio'}
                  >
                    <RotateCcw size={12} /> Redémarrer
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(srv)}
                    className="btn-ghost btn-sm flex items-center gap-xs"
                    disabled={isBusy}
                    aria-label={`Modifier ${srv.id}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(srv)}
                    className="btn-ghost btn-sm flex items-center gap-xs text-accent-danger"
                    disabled={isBusy}
                    aria-label={`Supprimer ${srv.id}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <McpServerFormModal
        open={formOpen}
        mode={formMode}
        initial={editTarget}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          toast.success(formMode === 'edit' ? 'Serveur mis à jour.' : 'Serveur ajouté à .mcp.json.');
          void refresh();
        }}
      />
    </div>
  );
}
