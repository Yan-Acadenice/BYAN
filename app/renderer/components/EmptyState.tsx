// Les deux vides — roles VID-0 et VID-F de la passation UX (lot 5).
//
// Les cinq pages de liste (Agents, Memoire, Connaissance, Projets, Serveurs MCP)
// rendaient UN SEUL bloc pour deux faits differents :
//
//   VID-0  rien n'a jamais ete ecrit ici        -> la sortie est de configurer le projet
//   VID-F  quelque chose existe, le filtre le cache -> la sortie est d'effacer le filtre
//
// Confondus, ils disaient a l'utilisateur « c'est vide » sans jamais dire lequel
// des deux, et sans donner de porte de sortie. Deux textes, deux sorties.
//
// Plancher de lisibilite (section 4.2 de la passation) : le corps d'un vide est
// du texte informatif, il s'arrete donc a `content-tertiary`. `content-muted`
// est SOUS le plancher volontairement et ne sert ici qu'a l'icone decorative.

import React, { useCallback } from 'react';
import { FilterX, Loader2, HardDriveDownload, type LucideIcon } from 'lucide-react';
import { useInstallProject, type UseInstallProject } from '../hooks/useInstallProject';

// ---------------------------------------------------------------------------
// Mise en page commune. Une seule geometrie pour les deux vides : ce qui change
// entre eux, ce sont les mots et la sortie, pas la forme.
// ---------------------------------------------------------------------------

interface EmptyShellProps {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  // 'vide' = VID-0, 'filtre' = VID-F. Expose en attribut pour que les tests
  // puissent distinguer les deux sans dependre du texte exact.
  kind: 'vide' | 'filtre';
  testId?: string;
}

function EmptyShell({ icon: Icon, title, children, kind, testId }: EmptyShellProps) {
  return (
    <div
      data-empty={kind}
      data-testid={testId}
      className="flex flex-col items-center justify-center text-center py-xxl px-md"
    >
      <Icon size={40} className="mb-md text-content-muted" aria-hidden="true" />
      <p className="font-h3 text-h3 text-content-strong mb-xs">{title}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VID-0 — jamais initialise
// ---------------------------------------------------------------------------

export interface EmptyNeverProps {
  icon: LucideIcon;
  // « Aucun agent dans ce projet »
  title: string;
  // Pourquoi c'est vide et d'ou viendra le contenu. Une a deux phrases.
  body: React.ReactNode;
  // La porte de sortie. Absente si aucune action honnete n'existe : un bouton
  // qui ne produit rien est une commande muette (regle 3 de la passation).
  actionLabel?: string;
  onAction?: () => void;
  actionBusy?: boolean;
  actionTitle?: string;
  // Action secondaire, discrete.
  secondaryLabel?: string;
  onSecondary?: () => void;
  testId?: string;
}

export function EmptyNever({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  actionBusy = false,
  actionTitle,
  secondaryLabel,
  onSecondary,
  testId,
}: EmptyNeverProps) {
  return (
    <EmptyShell icon={icon} title={title} kind="vide" testId={testId}>
      <p className="font-body-sm text-body-sm text-content-tertiary max-w-md">{body}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-sm mt-md">
          {actionLabel && onAction && (
            <button
              type="button"
              data-testid={testId ? `${testId}-action` : undefined}
              onClick={onAction}
              disabled={actionBusy}
              title={actionTitle}
              className="btn-primary flex items-center gap-xs"
            >
              {actionBusy && <Loader2 size={14} className="animate-spin" />}
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              data-testid={testId ? `${testId}-secondary` : undefined}
              onClick={onSecondary}
              className="btn-ghost"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </EmptyShell>
  );
}

// ---------------------------------------------------------------------------
// VID-F — rien ne correspond au filtre
// ---------------------------------------------------------------------------

// Le nom de ce que la page liste, pour que les cinq pages formulent la meme
// phrase. `feminin` porte l'accord : « Aucun agent » vs « Aucune fiche ».
export interface EmptyNoun {
  singulier: string;
  pluriel: string;
  feminin?: boolean;
}

export interface EmptyFilteredProps {
  noun: EmptyNoun;
  // Ce que l'utilisateur a TAPE. Rendu tel quel entre guillemets, pour qu'il
  // relise sa propre requete au lieu de deviner ce qui a ete cherche. Vide
  // quand le filtre actif n'est pas textuel (un onglet, une periode).
  query?: string;
  // Le filtre non textuel actif, en clair : "les projets recents". Les deux
  // peuvent etre presents en meme temps, la phrase les compose alors.
  scopeLabel?: string;
  // Combien existent au total, filtre ignore.
  total: number;
  // Ou vivent ces choses, pour la phrase du total. Par defaut « dans ce
  // projet » — la page Projets, elle, compte des projets et dit autre chose.
  totalScope?: string;
  onClear: () => void;
  clearLabel?: string;
  testId?: string;
}

// Compose l'enonce du critere. Trois cas, une seule regle :
//   texte + portee -> ne correspond a "audit" parmi les projets recents
//   texte seul     -> ne correspond a "audit"
//   portee seule   -> aucun projet parmi les projets recents
function filterTitle(noun: EmptyNoun, query?: string, scopeLabel?: string): string {
  const aucun = noun.feminin ? 'Aucune' : 'Aucun';
  const q = (query ?? '').trim();
  // Espaces fines insecables autour des guillemets (typographie francaise),
  // ecrites en echappement : le caractere brut declenche no-irregular-whitespace.
  const cite = `«\u202F${q}\u202F»`;
  if (q && scopeLabel) return `${aucun} ${noun.singulier} ne correspond à ${cite} parmi ${scopeLabel}`;
  if (q) return `${aucun} ${noun.singulier} ne correspond à ${cite}`;
  if (scopeLabel) return `${aucun} ${noun.singulier} parmi ${scopeLabel}`;
  return `${aucun} ${noun.singulier} ne correspond au filtre`;
}

export function EmptyFiltered({
  noun,
  query,
  scopeLabel,
  total,
  totalScope = 'dans ce projet',
  onClear,
  clearLabel = 'Effacer le filtre',
  testId,
}: EmptyFilteredProps) {
  const nom = total > 1 ? noun.pluriel : noun.singulier;

  return (
    <EmptyShell
      icon={FilterX}
      title={filterTitle(noun, query, scopeLabel)}
      kind="filtre"
      testId={testId}
    >
      <p className="font-body-sm text-body-sm text-content-tertiary max-w-md">
        {total} {nom} au total {totalScope}. Efface le filtre pour tout revoir.
      </p>
      <div className="mt-md">
        <button
          type="button"
          data-testid={testId ? `${testId}-clear` : undefined}
          onClick={onClear}
          className="btn-secondary"
        >
          {clearLabel}
        </button>
      </div>
    </EmptyShell>
  );
}

// ---------------------------------------------------------------------------
// La sortie de VID-0 : configurer le projet
// ---------------------------------------------------------------------------

// Choisit un dossier, y installe / met a jour BYAN, l'enregistre, puis relit la
// page. Une seule implementation pour les cinq vides.
//
// POURQUOI ecrire aussi `onboarding.projectRoot` : la page Serveurs MCP ne lit
// PAS le registre des projets, elle resout `.mcp.json` contre cette cle du
// magasin (main/ipc-handlers/mcp.ts). Sans elle, un projet fraichement
// configure laisserait cette page relire le meme neant, et le bouton serait une
// commande muette. L'ordre compte : la cle est posee AVANT de relire.
export interface UseConfigureProject extends UseInstallProject {
  run: () => Promise<string | null>;
}

export function useConfigureProject(afterConfigure?: () => void | Promise<void>): UseConfigureProject {
  const install = useInstallProject();

  const run = useCallback(async (): Promise<string | null> => {
    const root = await install.run();
    if (!root) return null;
    try {
      await window.byanApi.store?.set?.('onboarding.projectRoot', root);
    } catch {
      // Best-effort : l'installation a bien eu lieu, la trace ci-dessous le dit.
    }
    await afterConfigure?.();
    return root;
    // `install` est stable (useInstallProject memoise run), afterConfigure est
    // fourni par la page.
  }, [install, afterConfigure]);

  return { ...install, run };
}

// La trace de la commande : etapes en direct, puis bilan. Regle 3 de la
// passation — toute action produit une trace, meme quand la liste ne change pas.
export function ConfigureTrace({ state }: { state: UseInstallProject }) {
  if (!state.installing && !state.result && !state.error) return null;

  const line = state.installing
    ? state.step
      ? `Étape ${state.step.index}/${state.step.total} — ${state.step.label}`
      : 'Configuration en cours…'
    : state.error
    ? `Échec : ${state.error}`
    : `Terminé : ${state.result?.verify.passed}/${state.result?.verify.total} vérifications OK`;

  return (
    <div
      data-testid="install-panel"
      className={[
        'bg-surface-card border rounded-lg p-md space-y-xs',
        state.error ? 'border-accent-danger/40' : 'border-edge-subtle',
      ].join(' ')}
    >
      <div className="flex items-center gap-xs font-body-sm text-body-sm text-content-body">
        {state.installing
          ? <Loader2 size={14} className="animate-spin shrink-0" />
          : <HardDriveDownload size={14} className="shrink-0" />}
        <span>{line}</span>
      </div>
      {state.logs.length > 0 && (
        <pre className="font-mono-code text-[11px] text-content-tertiary max-h-32 overflow-y-auto whitespace-pre-wrap">
          {state.logs.slice(-8).join('\n')}
        </pre>
      )}
      {!state.installing && (
        <button type="button" className="btn-ghost btn-sm" onClick={state.reset}>
          Fermer
        </button>
      )}
    </div>
  );
}
