// Ecran 4 — la frise.
//
// LA TROISIEME PROFONDEUR DE LECTURE. La phrase, puis le bon de livraison, puis
// seulement ceci. La frise est derriere un bouton et n'apparait jamais en
// premier ecran : elle repond a une question qu'on ne se pose qu'apres avoir lu
// les deux premieres — « ou est passe le temps ? ».
//
// UN SEUL OBJET SUR L'AXE DU TEMPS REEL. Pas une barre par intervenant : huit
// barres de largeurs egales mentiraient sur l'endroit ou le temps part, puisque
// dans le meme chantier une etape met 40 secondes et une autre 40 minutes. Ici
// l'axe est le temps reel, la hauteur dit combien de personnes travaillaient en
// meme temps, et une part distincte dit combien de ce travail a ete jete.
//
// CE QUE LA FRISE REVELE ET QU'AUCUN TOTAL NE MONTRE : les minutes ou une seule
// personne travaillait ET ou son travail a ete perdu. Un total les noie — il
// additionne du temps parallele avec du temps solitaire. La frise les separe,
// et la phrase sous le dessin les nomme.
//
// LA COULEUR NE PORTE RIEN SEULE. La part jetee est hachurée en plus d'etre
// ambre, et la phrase sous le dessin dit le meme fait en toutes lettres.
//
// Presentation pure : tout arrive par proprietes, rien n'est cherche.

import React, { useId, useState } from 'react';

import { READING_DEPTH_LABELS, formatDuration } from '../../../../shared/workmanship';
import { FOCUS_RING, Note, TAP_TARGET } from './parts';
import type { TimelineSlice } from './types';

// Geometrie du dessin, en unites de la boite de vue. Elles n'ont pas d'unite
// physique : le SVG s'etire a la largeur disponible.
const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 120;
const BASELINE = VIEW_HEIGHT - 14;
const TOP_MARGIN = 8;

function endOf(slice: TimelineSlice): number {
  return slice.startMs + Math.max(0, slice.durationMs);
}

export function totalSpanMs(slices: readonly TimelineSlice[]): number {
  return slices.reduce((max, slice) => Math.max(max, endOf(slice)), 0);
}

export function peakWorking(slices: readonly TimelineSlice[]): number {
  return slices.reduce((max, slice) => Math.max(max, slice.working), 0);
}

// Les tranches ou une seule personne travaillait et ou son travail a ete jete.
// C'est le seul fait que cette vue existe pour rendre visible.
export function lonelyLostSlices(slices: readonly TimelineSlice[]): TimelineSlice[] {
  return slices.filter((slice) => slice.working === 1 && slice.discarded >= 1);
}

// Y a-t-il eu du travail jete, ne serait-ce qu'une fois ? Sur un chantier sans
// mecanisme de reprise, la reponse est structurellement non — et tout le
// vocabulaire du rejet devient du remplissage. Vu a l'ecran le 2026-08-05.
export function hasDiscardedWork(slices: readonly TimelineSlice[]): boolean {
  return slices.some((slice) => slice.discarded >= 1);
}

export function lonelyLostSentence(slices: readonly TimelineSlice[]): string {
  // Rien n'a JAMAIS ete jete : ce n'est pas « aucune minute perdue », c'est une
  // question qui ne se pose pas. On dit alors ce que la donnee sait vraiment.
  if (!hasDiscardedWork(slices)) {
    const etapes = slices.length;
    const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.durationMs), 0);
    // Formule volontairement sans le mot « jeté » : la legende correspondante
    // vient d'etre retiree, et la reintroduire dans la phrase ferait chercher a
    // l'ecran une couleur qui n'y est plus.
    return `${etapes} étape${etapes > 1 ? 's' : ''} sur ${formatDuration(total)}.`
      + ' Rien ne se reprend ici, donc rien ne se perd.';
  }
  const lonely = lonelyLostSlices(slices);
  if (lonely.length === 0) {
    return "Aucune minute où une seule personne travaillait et où son travail a été jeté. C'est la seule chose qu'un total ne saurait pas dire.";
  }
  const total = lonely.reduce((sum, slice) => sum + Math.max(0, slice.durationMs), 0);
  const moment = lonely.length === 1 ? 'Un moment' : `${lonely.length} moments`;
  return `${moment} pour ${formatDuration(total)} : une seule personne travaillait, et son travail a été jeté. Aucun total ne montre ça — il additionne ce temps-là avec le temps où tout le monde avançait.`;
}

export interface WorkTimelineProps {
  slices: readonly TimelineSlice[];
  // Ouvert d'entree, uniquement pour un contexte ou la premiere et la deuxieme
  // profondeur ont deja ete lues ailleurs. Le defaut reste ferme : c'est la
  // troisieme profondeur.
  defaultOpen?: boolean;
}

export default function WorkTimeline({ slices, defaultOpen = false }: WorkTimelineProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  // Un identifiant par instance : deux frises sur le meme ecran partageraient
  // sinon la meme definition de hachure, et la seconde repeindrait la premiere.
  // Les deux-points que `useId` produit (« :r1: ») sont retires : une reference
  // de fragment SVG `url(#...)` les supporte mal selon les moteurs, et le bogue
  // serait invisible en test — le motif disparaitrait seulement a l'ecran.
  const patternSeed = useId().replace(/:/g, '');
  const hatchId = `${patternSeed}-hachure`;

  const span = totalSpanMs(slices);
  const peak = peakWorking(slices);
  const lonely = lonelyLostSlices(slices);
  const lonelyIds = new Set(lonely.map((slice) => slice.startMs));
  const unit = peak > 0 ? (BASELINE - TOP_MARGIN) / peak : 0;

  const reading = `Frise du chantier sur ${formatDuration(span)}. Jusqu'à ${peak} personne${peak > 1 ? 's' : ''} en même temps. ${lonelyLostSentence(slices)}`;

  return (
    <div data-testid="timeline" className="space-y-sm">
      <button
        type="button"
        data-testid="timeline-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        className={`btn btn-sm bg-surface-fill text-content-body border border-edge-strong hover:bg-surface-fill-hover ${FOCUS_RING} ${TAP_TARGET}`}
      >
        {READING_DEPTH_LABELS.minute}
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={READING_DEPTH_LABELS.minute}
          data-testid="timeline-panel"
          className="rounded-2xl border border-edge-subtle bg-surface-card p-md space-y-sm"
        >
          {slices.length === 0 ? (
            <Note testId="timeline-empty">Aucune minute mesurée sur ce chantier.</Note>
          ) : (
            <>
              <svg
                data-testid="timeline-figure"
                role="img"
                aria-label={reading}
                viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                preserveAspectRatio="none"
                className="w-full h-[120px] text-content-secondary"
              >
                <defs>
                  {/* La hachure double l'ambre : la part jetee reste lisible
                      quand la couleur ne se lit pas. */}
                  <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width={6} height={6} fill="var(--wash-change)" />
                    <line x1={0} y1={0} x2={0} y2={6} stroke="var(--accent-change)" strokeWidth={2} />
                  </pattern>
                </defs>

                {slices.map((slice) => {
                  const x = span > 0 ? (slice.startMs / span) * VIEW_WIDTH : 0;
                  const width = span > 0 ? Math.max(2, (Math.max(0, slice.durationMs) / span) * VIEW_WIDTH) : 0;
                  const kept = Math.max(0, slice.working - slice.discarded);
                  const keptHeight = kept * unit;
                  const lostHeight = Math.max(0, Math.min(slice.discarded, slice.working)) * unit;
                  return (
                    <g key={`${slice.startMs}-${slice.durationMs}`} data-testid={`timeline-slice-${slice.startMs}`}>
                      {/* Le travail garde, en bas : c'est le socle. */}
                      <rect
                        x={x}
                        y={BASELINE - keptHeight}
                        width={width}
                        height={keptHeight}
                        fill="currentColor"
                        fillOpacity={0.28}
                      />
                      {/* Le travail jete, au-dessus : la colonne entiere dit
                          toujours combien de personnes travaillaient, et la part
                          hachuree dit combien de ce travail est parti. */}
                      {lostHeight > 0 && (
                        <rect
                          data-testid={`timeline-lost-${slice.startMs}`}
                          x={x}
                          y={BASELINE - keptHeight - lostHeight}
                          width={width}
                          height={lostHeight}
                          fill={`url(#${hatchId})`}
                        />
                      )}
                      {/* Le repere sous l'axe : une seule personne, et son
                          travail perdu. */}
                      {lonelyIds.has(slice.startMs) && (
                        <rect
                          data-testid={`timeline-lonely-mark-${slice.startMs}`}
                          x={x}
                          y={BASELINE + 3}
                          width={width}
                          height={3}
                          fill="var(--accent-change)"
                        />
                      )}
                    </g>
                  );
                })}

                <line x1={0} y1={BASELINE} x2={VIEW_WIDTH} y2={BASELINE} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
              </svg>

              <div className="flex flex-wrap items-center justify-between gap-sm">
                <span data-testid="timeline-peak" className="text-[11px] text-content-tertiary">
                  {formatDuration(span)} du début à la fin
                  {/* Un decompte toujours egal a un n'est pas une information.
                      Avec un seul intervenant, « jusqu'a 1 personne en meme temps »
                      occupe de la place et n'apprend rien. */}
                  {peak > 1 ? ` · jusqu'à ${peak} personnes en même temps` : ''}
                </span>
                <span className="flex items-center gap-md text-[11px] text-content-tertiary">
                  <span className="inline-flex items-center gap-1.5 text-content-secondary">
                    {/* Meme encre et meme opacite que le socle du dessin. En
                        style en ligne parce que les jetons de role sont des
                        variables CSS : `bg-content-secondary/30` ne produirait
                        rien du tout. */}
                    <span
                      className="inline-block w-3 h-3 rounded-[2px]"
                      style={{ backgroundColor: 'currentColor', opacity: 0.28 }}
                      aria-hidden="true"
                    />
                    <span className="text-content-tertiary">travail gardé</span>
                  </span>
                  {/* Une legende pour une categorie qui ne peut pas survenir fait
                      chercher a l'ecran quelque chose qui n'y sera jamais. */}
                  {hasDiscardedWork(slices) && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-[2px] bg-wash-change border border-edge-change" aria-hidden="true" />
                    travail jeté
                  </span>
                  )}
                </span>
              </div>

              <p data-testid="timeline-lonely" className="text-sm text-content-body leading-relaxed">
                {lonelyLostSentence(slices)}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
