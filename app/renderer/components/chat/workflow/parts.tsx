// Les briques que les quatre ecrans du chantier partagent.
//
// POURQUOI ELLES SONT ICI. La mention « n'est pas facture », le mot « estime »,
// le libelle d'un etat et la raison d'un tiret doivent sortir identiques des
// quatre vues. Recopies quatre fois, ils divergent au premier ajustement — et
// c'est exactement la divergence que `shared/workmanship.ts` a ete ecrit pour
// empecher un etage plus bas. Ce fichier est le meme geste cote rendu.
//
// Tout est presentation pure : aucune de ces briques ne va chercher quoi que ce
// soit, aucune ne garde d'etat.

import React from 'react';

import {
  COST_LABEL,
  WORK_STATE_STYLES,
  formatEstimatedCost,
  personForSlug,
  seniorityForTier,
  seniorityLabel,
  seniorityRank,
  type AccentClasses,
  type SilenceReason,
  type WorkState,
} from '../../../../shared/workmanship';
import PersonFace from './PersonFace';

// ---------------------------------------------------------------------------
// Les constantes d'interaction
// ---------------------------------------------------------------------------

// L'anneau de focus. Visible, jamais supprime : `outline-none` seul est une
// regression d'accessibilite, il ne se pose qu'accompagne d'un anneau qui le
// remplace.
export const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-0';

// La cible de pointage minimale (WCAG 2.5.8). Les controles de ce chat
// mesuraient 19 px avant correction : la contrainte est ecrite en toutes lettres
// pour qu'un futur `p-1` ne la reperde pas en silence.
export const TAP_TARGET = 'min-w-[24px] min-h-[24px]';

// ---------------------------------------------------------------------------
// La couleur d'un etat, sous le budget de deux accents
// ---------------------------------------------------------------------------

// Ce que devient un etat quand le budget d'accents ne peut plus le peindre. Il
// ne disparait pas : il perd sa teinte et garde sa forme, sa position et sa
// phrase — les trois canaux qui le portaient deja.
const NEUTRAL_CLASSES: AccentClasses = {
  text: 'text-content-secondary',
  bg: 'bg-surface-fill',
  border: 'border-edge-strong',
  washBg: 'bg-surface-fill',
  washText: 'text-content-secondary',
};

export interface StateVisual {
  readonly classes: AccentClasses;
  readonly accented: boolean;
  readonly label: string;
}

// `kept` vient de `statesKeepingTheirAccent` : c'est l'appelant qui calcule le
// budget une fois pour tout l'ecran, parce que le budget porte sur l'ECRAN et
// qu'une brique isolee ne peut pas le connaitre.
export function stateVisual(state: WorkState, kept: readonly WorkState[]): StateVisual {
  const style = WORK_STATE_STYLES[state];
  const accented = kept.includes(state);
  return {
    classes: accented ? style.classes : NEUTRAL_CLASSES,
    accented,
    label: style.label,
  };
}

// La forme de l'etat. C'est elle qui rend l'etat lisible quand la couleur tombe,
// et elle qui le rend lisible pour qui ne distingue pas les teintes. Decorative
// au sens technique : le libelle est ecrit a cote.
function StateGlyph({ state }: { state: WorkState }) {
  const common = { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': true as const, focusable: 'false' as const };
  if (state === 'en-cours') {
    return (
      <svg {...common}>
        <circle cx={5} cy={5} r={3.4} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    );
  }
  if (state === 'rendu') {
    return (
      <svg {...common}>
        <circle cx={5} cy={5} r={4} fill="currentColor" />
      </svg>
    );
  }
  if (state === 'rendu-suspect') {
    return (
      <svg {...common}>
        <path d="M5 0.8 9.4 8.8 0.6 8.8Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path
        d="M1.6 1.6 8.4 8.4M8.4 1.6 1.6 8.4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface StateTagProps {
  state: WorkState;
  kept: readonly WorkState[];
  testId?: string;
}

export function StateTag({ state, kept, testId }: StateTagProps) {
  const visual = stateVisual(state, kept);
  return (
    <span
      data-testid={testId}
      data-state={state}
      // L'attribut dit au test si la couleur a ete gardee ou rendue, sans
      // dependre du nom d'une classe utilitaire.
      data-accent={visual.accented ? 'role' : 'neutre'}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] ${visual.classes.washBg} ${visual.classes.washText} ${visual.classes.border}`}
    >
      <StateGlyph state={state} />
      {visual.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// La seniorite, encodee par la position et pas par la couleur
// ---------------------------------------------------------------------------

// QUATRE PALIERS, DEUX ACCENTS DISPONIBLES : la couleur ne peut pas porter cette
// dimension. Elle passe donc par une echelle de quatre barres remplies jusqu'au
// rang — un canal de position, gratuit en budget chromatique. Le libelle
// (« junior », « confirme », « senior », « expert ») est ecrit a cote : l'echelle
// seule serait un code a apprendre.
export function SeniorityScale({ tier }: { tier?: string }) {
  const seniority = seniorityForTier(tier);
  const label = seniorityLabel(seniority);
  const rank = seniority ? seniorityRank(seniority) : 0;
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="seniority">
      <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`w-[3px] rounded-[1px] ${step <= rank ? 'bg-content-secondary' : 'bg-content-muted'}`}
            style={{ height: `${3 + step * 2}px` }}
          />
        ))}
      </span>
      <span className="text-[11px] text-content-tertiary">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// L'intervenant
// ---------------------------------------------------------------------------

export interface PersonLineProps {
  personId: string;
  tier?: string;
  // Ce que cette personne a fait ici, quand la ligne veut le dire. Le role
  // generique du roster sert de repli.
  did?: string;
  testId?: string;
}

// Ce qu'on ecrit quand l'identifiant ne designe personne du roster. Une phrase
// qui dit l'ignorance vaut mieux qu'un identifiant technique lache a l'ecran.
export const UNKNOWN_PERSON_LABEL = 'intervenant non identifié';

export function PersonLine({ personId, tier, did, testId }: PersonLineProps) {
  const person = personForSlug(personId);
  return (
    <span data-testid={testId} className="inline-flex items-center gap-2 text-content-body">
      <PersonFace personId={personId} size={26} className="text-content-secondary shrink-0" />
      <span className="flex flex-col leading-tight">
        <span className="text-sm">
          {person ? person.firstName : UNKNOWN_PERSON_LABEL}
          {/* La mention voyage avec le prenom, elle n'est jamais reportee en note
              de bas de page : hors du regard, elle laisserait croire que ce
              temps est compte dans le cout. */}
          {person && !person.billed && (
            <span className="ml-1.5 text-[11px] text-content-tertiary">n&apos;est pas facturé</span>
          )}
        </span>
        <span className="text-[11px] text-content-tertiary">{did ?? person?.role ?? ''}</span>
      </span>
      {tier !== undefined && <SeniorityScale tier={tier} />}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Le cout estime
// ---------------------------------------------------------------------------

export interface CostReadoutProps {
  amountUsd?: number | null;
  reason?: SilenceReason;
  // Un complement au libelle, pas un remplacement : « estime » reste dans la
  // phrase quoi qu'il arrive. Ex. : 'du travail jeté'.
  qualifier?: string;
  testId?: string;
}

export function CostReadout({ amountUsd, reason = 'non-rapporte', qualifier, testId }: CostReadoutProps) {
  const reading = formatEstimatedCost(amountUsd, reason);
  const label = qualifier ? `${COST_LABEL} ${qualifier}` : COST_LABEL;
  return (
    <span data-testid={testId} data-measured={reading.measured ? 'oui' : 'non'} className="inline-flex flex-col leading-tight">
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-[11px] text-content-tertiary">{label}</span>
        <span
          className={`font-mono-code text-[12px] ${reading.measured ? 'text-content-body' : 'text-content-muted'}`}
        >
          {reading.value}
        </span>
      </span>
      {/* Un tiret sans sa raison est la moitie d'une information. La raison est
          du texte a lire : elle s'arrete au plancher de lisibilite, jamais en
          dessous. */}
      {reading.reason && <span className="text-[11px] text-content-tertiary">{reading.reason}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mise en page
// ---------------------------------------------------------------------------

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="section-title mb-sm">{children}</h4>;
}

// Une remarque de bas de bloc. Informative, donc au plancher de lisibilite et
// pas en dessous.
export function Note({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p data-testid={testId} className="text-[11px] leading-relaxed text-content-tertiary">
      {children}
    </p>
  );
}

// Le teal est deja depense par l'ossature de l'application (boutons, navigation
// active, focus) : le rendre ici ne coute rien au budget.
export const PRIMARY_BUTTON = `btn btn-sm bg-accent-action text-on-accent hover:brightness-110 ${FOCUS_RING} ${TAP_TARGET}`;
export const SECONDARY_BUTTON = `btn btn-sm bg-surface-fill text-content-body border border-edge-strong hover:bg-surface-fill-hover ${FOCUS_RING} ${TAP_TARGET}`;
