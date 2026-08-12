// LOT L5 — ce que le chat a decide pour ce message, et ce qu'il n'a PAS ose
// faire tout seul.
//
// LE CAS. Avant, l'utilisateur choisissait a la main : le moteur, le modele,
// l'agent, l'effort. Quatre boutons, quatre decisions, a chaque fois. Maintenant
// le chat decide — et une decision prise a votre place, sans etre montree, est
// une decision que vous ne pouvez ni comprendre ni corriger.
//
// D'OU LES DEUX ETATS DE CE PANNEAU, et ils ne se ressemblent pas :
//
//   APPLIQUE  — c'est fait, on vous le dit. Une ligne, discrete, qu'on peut
//               ignorer. Personne n'a besoin de valider qu'un effort a bouge
//               sur codex : ca ne coute rien et ca se refait au tour suivant.
//   PROPOSE   — ca coute le fil de la conversation, donc ca ne part pas sans
//               vous. Le panneau dit ce que ca change, ce que ca coute, et
//               attend. Le tour EN COURS part quand meme, avec les reglages
//               actuels : on ne bloque pas votre message pour une question de
//               reglage.
//
// CE QUI SE DIT ET CE QUI NE SE DIT PAS. Le panneau parle en SENIORITE — junior,
// confirme, senior, expert — jamais en nom de modele. La regle vient de
// shared/workmanship.ts et elle n'est pas cosmetique : un nom de modele est
// illisible pour qui ne suit pas les sorties, et il change deux fois par an
// alors que "senior" veut dire la meme chose dans cinq ans.
//
// Presentation pure : tout arrive par proprietes, rien n'est cherche ici.

import React from 'react';

import type { DispatchPlan, DispatchPlanField } from '../../../../shared/dispatch/plan';
import { seniorityForTier, seniorityLabel } from '../../../../shared/workmanship';

// Le nom lisible d'une case. Les identifiants techniques (agent, runtime,
// model, effort) ne sortent pas d'ici.
const NOM_DE_CASE: Readonly<Record<string, string>> = {
  agent: 'Qui',
  runtime: 'Moteur',
  model: 'Niveau',
  effort: 'Profondeur',
};

// Ce qu'on AFFICHE pour une valeur. Le modele devient une seniorite ; le reste
// se montre tel quel, parce que "codex" et "bmad-bmm-dev" sont deja les mots
// que l'utilisateur voit ailleurs dans l'interface.
function valeurLisible(cle: string, valeur: unknown): string {
  if (valeur === null || valeur === undefined) return 'rien d imposé';
  if (cle === 'model') {
    const s = seniorityForTier(valeur);
    // Un modele hors echelle (un nom complet, une gamme inconnue) n'a pas de
    // seniorite : on le tait plutot que d'afficher un identifiant technique.
    return s ? seniorityLabel(s) : 'niveau non précisé';
  }
  return String(valeur);
}

interface LigneProps {
  readonly cle: string;
  readonly champ: DispatchPlanField<unknown>;
  readonly onOverride?: (cle: string) => void;
}

function Ligne({ cle, champ, onOverride }: LigneProps) {
  return (
    <div className="flex items-baseline gap-xs py-[2px]" data-testid={`dispatch-row-${cle}`}>
      <span className="w-[5.5rem] shrink-0 text-content-secondary">{NOM_DE_CASE[cle] ?? cle}</span>
      <span className="font-medium text-content-body" data-testid={`dispatch-value-${cle}`}>
        {valeurLisible(cle, champ.value)}
      </span>
      {champ.changed && (
        <span
          className={champ.applies === 'proposed'
            ? 'text-[11px] text-on-wash-danger bg-wash-danger px-[6px] py-[1px] rounded-full border border-edge-danger'
            : 'text-[11px] text-content-secondary'}
          data-testid={`dispatch-state-${cle}`}
        >
          {champ.applies === 'proposed' ? 'à décider' : 'appliqué'}
        </span>
      )}
      {onOverride && (
        <button
          type="button"
          className="ml-auto text-[11px] text-content-secondary underline underline-offset-2 hover:text-content-body"
          onClick={() => onOverride(cle)}
          data-testid={`dispatch-override-${cle}`}
        >
          reprendre la main
        </button>
      )}
    </div>
  );
}

export interface DispatchPanelProps {
  readonly plan: DispatchPlan;
  // Accepter les changements proposes. Absent : rien n'est propose, le panneau
  // reste purement informatif.
  readonly onAccept?: () => void;
  // Ecarter la proposition pour ce tour.
  readonly onDismiss?: () => void;
  // Rendre la main a l'utilisateur sur une case precise. Absent : pas de bouton.
  readonly onOverride?: (cle: string) => void;
  readonly defaultOpen?: boolean;
}

// Les quatre cases, dans l'ordre ou on les lit : qui fait le travail, sur quoi,
// a quel niveau, avec quelle profondeur.
const ORDRE = ['agent', 'runtime', 'model', 'effort'] as const;

export default function DispatchPanel({
  plan,
  onAccept,
  onDismiss,
  onOverride,
  defaultOpen = false,
}: DispatchPanelProps) {
  const [ouvert, setOuvert] = React.useState(defaultOpen);

  const propose = ORDRE.filter((c) => plan[c].changed && plan[c].applies === 'proposed');
  const applique = ORDRE.filter((c) => plan[c].changed && plan[c].applies === 'immediate');
  const aDecider = propose.length > 0;

  // Rien n'a bouge : le panneau n'a rien a dire. Un panneau qui s'affiche pour
  // annoncer qu'il ne s'est rien passe est du bruit — la meme regle que les
  // quatre ecrans de workflow, ou une donnee absente rend un ecran absent.
  if (!aDecider && applique.length === 0) return null;

  return (
    <div
      className={[
        'rounded-xl border px-sm py-xs text-xs',
        aDecider
          ? 'border-edge-danger bg-wash-danger text-on-wash-danger'
          : 'border-edge-subtle bg-surface-hover text-content-body',
      ].join(' ')}
      data-testid="local-dispatch"
      data-pending={aDecider ? 'true' : 'false'}
    >
      <div className="flex items-center gap-xs">
        <span className="font-medium">
          {aDecider
            ? 'Je changerais de réglage pour ce message'
            : 'Réglage adapté à ce message'}
        </span>
        <button
          type="button"
          className="ml-auto text-[11px] underline underline-offset-2"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          data-testid="dispatch-toggle"
        >
          {ouvert ? 'masquer le détail' : 'voir le détail'}
        </button>
      </div>

      {/* La raison de CE qui a bouge, toujours visible : c'est l'information
          qui justifie le panneau. Le detail complet, lui, se demande. */}
      <div className="mt-[2px] text-content-secondary" data-testid="dispatch-summary">
        {(aDecider ? propose : applique)
          .map((c) => plan[c].reason)
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ')}
      </div>

      {ouvert && (
        <div className="mt-xs border-t border-edge-subtle pt-xs" data-testid="dispatch-detail">
          {ORDRE.map((c) => (
            <Ligne key={c} cle={c} champ={plan[c]} onOverride={onOverride} />
          ))}
          <div className="mt-xs text-[11px] text-content-secondary">
            {/* Le score n'est pas decoratif : c'est lui qui explique pourquoi le
                niveau est celui-la, et c'est la seule facon de comprendre un
                choix qui parait trop haut ou trop bas. */}
            complexité mesurée : {plan.complexity} sur 100
            {plan.warnings.length > 0 && (
              <span data-testid="dispatch-warnings"> — {plan.warnings.join(' ; ')}</span>
            )}
          </div>
        </div>
      )}

      {aDecider && (
        <div className="mt-xs flex items-center gap-xs">
          {/* Le cout est ecrit AVANT le bouton, pas apres. Un bouton qui coute
              le fil de la conversation ne se clique pas a l'aveugle. */}
          <span className="text-[11px]" data-testid="dispatch-cost">{plan.acceptCost}</span>
          {onAccept && (
            <button
              type="button"
              className="ml-auto rounded-md border border-edge-danger px-xs py-[2px] text-[11px] font-medium"
              onClick={onAccept}
              data-testid="dispatch-accept"
            >
              Changer et repartir
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className="rounded-md px-xs py-[2px] text-[11px] underline underline-offset-2"
              onClick={onDismiss}
              data-testid="dispatch-dismiss"
            >
              Garder comme ça
            </button>
          )}
        </div>
      )}
    </div>
  );
}
