// Ecran 2 — le prix de revenir en arriere.
//
// LE CAS. Le chantier a derape quelque part. On peut revenir a plusieurs points,
// et la seule question qui compte n'est pas « lequel est le moins cher » mais
// « lequel repose sur une decision que je crois encore ».
//
// D'OU LE NOMMAGE. Chaque point porte le nom de la DECISION qui y a ete prise —
// « Aucun appel a migrer » — et jamais un numero d'etape. Un numero n'aide pas a
// choisir : il faut relire tout le chantier pour savoir ce qu'il y avait dedans.
// Une decision, elle, se juge directement : ou tu la crois encore, ou tu ne la
// crois plus, et c'est exactement le geste que cet ecran demande.
//
// L'AVERTISSEMENT QUI COMPTE. Le point le moins cher est presque toujours le
// plus tardif, donc celui qui garde la decision fautive. Le montrer sans le dire
// pousserait a reprendre juste au-dessus du probleme. La phrase est a l'ecran.
//
// Presentation pure : tout arrive par proprietes, rien n'est cherche.

import React, { useId, useState } from 'react';

import { COST_IS_AN_ESTIMATE } from '../../../../shared/workmanship';
import {
  CostReadout,
  FOCUS_RING,
  Note,
  PRIMARY_BUTTON,
  PersonLine,
  SectionHeading,
  TAP_TARGET,
} from './parts';
import type { RewindPoint } from './types';

export const CHEAPEST_IS_NOT_MOST_USEFUL =
  "Le point le moins cher n'est pas le plus utile : c'est en général le plus tardif, donc celui qui garde la décision qui pose problème. Choisis d'abord la décision que tu ne crois plus, le montant ensuite.";

// L'identifiant du point le moins cher, ou `null`. Un point dont le montant n'a
// pas ete rapporte n'entre pas dans la comparaison : le classer par un tiret
// reviendrait a lire une absence de mesure comme un zero.
export function cheapestPointId(points: readonly RewindPoint[]): string | null {
  let best: RewindPoint | null = null;
  for (const point of points) {
    const amount = point.discardedCostUsd;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) continue;
    const bestAmount = best?.discardedCostUsd;
    if (typeof bestAmount !== 'number' || amount < bestAmount) best = point;
  }
  return best?.id ?? null;
}

export interface RewindPanelProps {
  points: readonly RewindPoint[];
  onRewind: (pointId: string) => void;
  // Ouvert d'entree seulement quand la question a deja ete posee ailleurs. Le
  // defaut reste ferme : on lit la reponse avant de peser un retour.
  defaultOpen?: boolean;
}

export default function RewindPanel({ points, onRewind, defaultOpen = false }: RewindPanelProps) {
  const cheapest = cheapestPointId(points);
  // REPLIE PAR DEFAUT, comme la frise.
  //
  // Vu a l'ecran le 2026-08-05 : apres une reponse d'une ligne, ce panneau
  // occupait tout l'espace en dessous. C'est le plus lourd des quatre, et c'etait
  // le seul a s'imposer — la frise, elle, attend qu'on la demande. « Combien ca
  // coute de revenir » est une question qu'on se pose APRES avoir lu la reponse,
  // jamais a sa place.
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={panelId}
        data-testid="rewind-toggle"
        className={`inline-flex items-center gap-xs ${TAP_TARGET} px-md rounded-full border border-edge-subtle bg-surface-card text-xs text-content-secondary hover:text-content-strong ${FOCUS_RING}`}
      >
        Revenir en arrière
      </button>
    );
  }

  return (
    <section
      id={panelId}
      role="group"
      aria-label="Revenir en arrière, et ce que chaque point coûte"
      data-testid="rewind"
      className="rounded-2xl border border-edge-subtle bg-surface-card p-md space-y-md"
    >
      <header className="space-y-sm">
        <h3 className="font-h2 text-h2 text-content-strong">Revenir en arrière</h3>
        <Note testId="rewind-warning">{CHEAPEST_IS_NOT_MOST_USEFUL}</Note>
      </header>

      <ol className="space-y-sm">
        {points.map((point) => (
          <li
            key={point.id}
            data-testid={`rewind-${point.id}`}
            data-cheapest={point.id === cheapest ? 'oui' : 'non'}
            className="rounded-xl border border-edge-subtle bg-surface-fill p-sm space-y-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div className="min-w-0 space-y-xs">
                {/* Le titre du point EST la decision. */}
                <p data-testid={`rewind-decision-${point.id}`} className="font-h3 text-h3 text-content-strong">
                  {point.decision}
                </p>
                <PersonLine
                  personId={point.decidedById}
                  did={`a tranché sur ${point.basedOn}`}
                  testId={`rewind-who-${point.id}`}
                />
              </div>
              <div className="flex flex-col items-end gap-xs">
                <CostReadout
                  amountUsd={point.discardedCostUsd}
                  reason={point.discardedSilenceReason}
                  qualifier="du travail jeté"
                  testId={`rewind-cost-${point.id}`}
                />
                {point.id === cheapest && (
                  <span data-testid={`rewind-cheapest-${point.id}`} className="text-[11px] text-content-tertiary">
                    le moins cher des points proposés
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-sm sm:grid-cols-2">
              <div data-testid={`rewind-kept-${point.id}`}>
                <SectionHeading>Ce qu&apos;on garde</SectionHeading>
                <ul className="space-y-xs">
                  {point.kept.map((item) => (
                    <li key={item} className="text-[13px] text-content-body leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div data-testid={`rewind-redone-${point.id}`}>
                <SectionHeading>Ce qu&apos;on refait</SectionHeading>
                <ul className="space-y-xs">
                  {point.redone.map((item) => (
                    <li key={item} className="text-[13px] text-content-body leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button
              type="button"
              data-testid={`rewind-go-${point.id}`}
              onClick={() => onRewind(point.id)}
              className={PRIMARY_BUTTON}
            >
              Revenir à « {point.decision} »
            </button>
          </li>
        ))}
      </ol>

      <Note testId="rewind-estimate-note">{COST_IS_AN_ESTIMATE}</Note>
    </section>
  );
}
