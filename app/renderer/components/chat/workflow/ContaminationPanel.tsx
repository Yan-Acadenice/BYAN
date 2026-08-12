// Ecran 1 — la contamination.
//
// LE CAS. Un chantier se declare termine sans rien signaler. Une etape de
// reperage n'a rien rapporte, et trois personnes ont travaille par-dessus ce
// vide. Le systeme actuel ne connait que trois etats et lit ce rendu-la comme un
// rendu propre : c'est precisement le trou que le quatrieme etat bouche.
//
// CE QUE CET ECRAN NE FAIT PAS. Il ne dit pas que le travail est faux. Les trois
// signaux mesurent la FORME du travail — un compte a zero, une duree hors norme,
// une topologie sans second appui — et aucun ne lit ce qui a ete produit. La
// mention est a l'ecran, pas seulement dans ce commentaire : un signal qui ne
// dit pas son angle mort se fait lire comme une garantie.
//
// Presentation pure : tout arrive par proprietes, rien n'est cherche.

import React from 'react';

import {
  COST_IS_AN_ESTIMATE,
  NO_SIGNAL_CATCHES_A_PLAUSIBLE_FALSEHOOD,
  READING_DEPTH_LABELS,
  personForSlug,
  scanContamination,
  statesKeepingTheirAccent,
  type ContaminationSignal,
} from '../../../../shared/workmanship';
import {
  CostReadout,
  Note,
  PRIMARY_BUTTON,
  PersonLine,
  SECONDARY_BUTTON,
  SectionHeading,
  StateTag,
} from './parts';
import type { SilenceReason, WorkStep } from './types';

// ---------------------------------------------------------------------------
// Ou le vide est entre, et jusqu'ou il est alle
// ---------------------------------------------------------------------------

// POURQUOI LA DEPENDANCE ET PAS LA POSITION. « Les etapes d'apres » compterait
// aussi celles qui n'ont jamais touche a la sortie de l'etape fautive — elles
// tournaient a cote, pas par-dessus. On remonte donc les liens `consumes` : ne
// sont contaminees que les etapes qui ont reellement consomme ce vide, meme
// indirectement.
export function stepsBuiltOn(steps: readonly WorkStep[], rootId: string): WorkStep[] {
  const tainted = new Set<string>([rootId]);
  // Plusieurs passes : un `consumes` peut pointer vers une etape declaree plus
  // loin dans la liste, et une seule passe la manquerait. La boucle s'arrete des
  // qu'un tour n'ajoute plus rien — donc au pire en autant de tours que d'etapes.
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of steps) {
      if (tainted.has(step.id)) continue;
      if ((step.consumes ?? []).some((upstream) => tainted.has(upstream))) {
        tainted.add(step.id);
        grew = true;
      }
    }
  }
  return steps.filter((step) => step.id !== rootId && tainted.has(step.id));
}

function peopleCount(steps: readonly WorkStep[]): number {
  return new Set(steps.map((step) => personForSlug(step.personId)?.id ?? step.personId)).size;
}

// La premiere profondeur de lecture : une ligne de francais. Elle nomme l'etape
// fautive et compte les personnes qui ont travaille par-dessus — pas un score,
// pas un pourcentage.
export function contaminationPhrase(steps: readonly WorkStep[], holeId: string | null): string {
  // Deux facons d'entrer dans le vide, et elles ne se disent pas pareil.
  //
  // 1. Un REPERAGE qui n'a rien rapporte : le signal `reperage-vide` le designe,
  //    et `holeId` arrive rempli. Formulation : « cherchait et n'a rien rapporte ».
  // 2. Une etape qui a ECHOUE : aucun signal ne la designe (elle n'a ni la
  //    nature 'reperage' ni un resultCount a zero), mais la donnee la marque
  //    explicitement 'rendu-suspect'. Formulation : « n'a pas abouti ».
  //
  // Sans ce second chemin, un chantier ou une commande a echoue affichait « rien
  // ne depasse » — sur un ecran qui n'apparait QUE parce que quelque chose a
  // echoue. Constate le 2026-07-31 en verifiant le paquet.
  const suspecte = holeId ? null : steps.find((step) => step.state === 'rendu-suspect');
  const pointId = holeId ?? suspecte?.id ?? null;
  if (!pointId) {
    return "Le chantier s'est déclaré terminé, et rien dans la forme du travail ne dépasse.";
  }
  const hole = steps.find((step) => step.id === pointId);
  const name = hole?.label ?? pointId;
  const over = peopleCount(stepsBuiltOn(steps, pointId));
  const who = over === 0
    ? "personne n'a travaillé par-dessus"
    : over === 1
      ? '1 personne a travaillé par-dessus'
      : `${over} personnes ont travaillé par-dessus`;
  if (!holeId) {
    // Le fautif a echoue : il n'a pas « cherche sans trouver ». Et ce qui a
    // suivi a tourne APRES lui — le fil ne porte que l'ordre des gestes, pas
    // les dependances. La phrase le dit, plutot que de laisser croire a une
    // chaine de consommation qu'on n'a pas mesuree.
    const apres = over === 0
      ? "rien n'a tourné après"
      : over === 1
        ? '1 intervenant a travaillé après'
        : `${over} intervenants ont travaillé après`;
    return `« ${name} » n'a pas abouti ; ${apres}, sans qu'on sache si ce travail s'appuyait dessus.`;
  }
  return `« ${name} » cherchait et n'a rien rapporté ; ${who} ce vide, et le chantier s'est déclaré terminé sans rien signaler.`;
}

// ---------------------------------------------------------------------------
// L'ecran
// ---------------------------------------------------------------------------

export interface ContaminationPanelProps {
  steps: readonly WorkStep[];
  // Ce que couterait de refaire la seule etape fautive.
  redoCostUsd?: number | null;
  redoSilenceReason?: SilenceReason;
  onRedo: () => void;
  onAccept: () => void;
}

export default function ContaminationPanel({
  steps,
  redoCostUsd,
  redoSilenceReason,
  onRedo,
  onAccept,
}: ContaminationPanelProps) {
  const signals: ContaminationSignal[] = scanContamination(steps);
  // Le vide entre par le seul signal qui designe une etape ayant cherche sans
  // rien trouver. Les deux autres signaux decrivent la meme chaine sous un autre
  // angle ; ils ne designent pas le point d'entree.
  const holeId = signals.find((signal) => signal.kind === 'reperage-vide')?.stepId ?? null;
  // Meme lecture que `contaminationPhrase` : a defaut de signal, l'etape marquee
  // 'rendu-suspect' EST le point d'entree. Sans ce repli, la phrase de tete
  // nommerait un fautif que le dessin en dessous ne montrerait pas — deux
  // affirmations contradictoires sur le meme ecran.
  const pointId = holeId ?? steps.find((step) => step.state === 'rendu-suspect')?.id ?? null;
  const downstream = pointId ? new Set(stepsBuiltOn(steps, pointId).map((step) => step.id)) : new Set<string>();

  // Le budget porte sur l'ECRAN entier : on le calcule une fois, ici, et chaque
  // etiquette d'etat s'y conforme. Un calcul par etiquette rendrait chacune
  // coherente avec elle-meme et l'ecran incoherent avec la regle.
  const kept = statesKeepingTheirAccent(steps.map((step) => step.state));

  return (
    <section
      role="group"
      aria-label="Un chantier rendu mais suspect"
      data-testid="contamination"
      className="rounded-2xl border border-edge-change bg-surface-card p-md space-y-md"
    >
      {/* Premiere profondeur : la phrase. */}
      <header className="space-y-sm">
        <div className="flex items-center gap-sm flex-wrap">
          <StateTag state="rendu-suspect" kept={kept} testId="contamination-state" />
          <h3 className="font-h2 text-h2 text-content-strong">Rendu, mais à regarder de près</h3>
        </div>
        <p data-testid="contamination-phrase" className="text-sm text-content-body leading-relaxed">
          {contaminationPhrase(steps, holeId)}
        </p>
      </header>

      {/* Deuxieme profondeur : le bon de livraison. Ce qui a ete rendu, par qui,
          a quel prix — et ou le vide est entre. */}
      <div role="group" aria-label={READING_DEPTH_LABELS['bon-de-livraison']} data-testid="contamination-chain">
        <SectionHeading>{READING_DEPTH_LABELS['bon-de-livraison']}</SectionHeading>
        <ol className="space-y-xs">
          {steps.map((step) => {
            const place = step.id === pointId ? 'entree' : downstream.has(step.id) ? 'aval' : 'hors';
            return (
              <li
                key={step.id}
                data-testid={`chain-${step.id}`}
                data-hole={place}
                className={`flex flex-wrap items-center justify-between gap-sm rounded-xl border px-sm py-xs ${
                  place === 'entree'
                    ? 'border-edge-change bg-wash-change'
                    : 'border-edge-subtle bg-surface-fill'
                }`}
              >
                <span className="flex items-center gap-sm min-w-0">
                  <PersonLine personId={step.personId} tier={step.tier} did={step.label} />
                </span>
                <span className="flex items-center gap-md flex-wrap">
                  {place === 'entree' && (
                    <span className="text-[11px] text-on-wash-change">le vide est entré ici</span>
                  )}
                  {place === 'aval' && (
                    <span className="text-[11px] text-content-tertiary">a travaillé par-dessus</span>
                  )}
                  <StateTag state={step.state} kept={kept} />
                  <CostReadout
                    amountUsd={step.costUsd}
                    reason={step.silenceReason}
                    testId={`chain-cost-${step.id}`}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Les trois signaux. Chacun avec son angle mort, et la phrase qui dit ce
          qu'aucun des trois ne sait faire. */}
      <div role="group" aria-label="Les signaux relevés" data-testid="contamination-signals">
        <SectionHeading>Ce qui a déclenché le doute</SectionHeading>
        <Note testId="contamination-no-judgement">
          Trois constats mécaniques sur la forme du travail. Aucun ne juge la qualité de ce qui a été rendu.
        </Note>
        <ul className="mt-sm space-y-sm">
          {signals.map((signal) => (
            <li
              key={`${signal.kind}-${signal.stepId}`}
              data-testid={`signal-${signal.kind}`}
              className="rounded-xl border border-edge-subtle bg-surface-fill px-sm py-xs"
            >
              <p className="text-sm text-content-body leading-relaxed">{signal.fact}</p>
              <p className="mt-xs text-[11px] text-content-tertiary leading-relaxed">
                Ce que ce constat ne voit pas : {signal.blindSpot}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-sm">
          <Note testId="contamination-blind-spot">{NO_SIGNAL_CATCHES_A_PLAUSIBLE_FALSEHOOD}</Note>
        </div>
      </div>

      {/* Deux sorties, et rien d'autre. */}
      <footer role="group" aria-label="Les deux sorties" className="space-y-sm">
        <div className="flex flex-wrap items-center gap-sm">
          <button type="button" data-testid="contamination-redo" onClick={onRedo} className={PRIMARY_BUTTON}>
            Refaire « {steps.find((step) => step.id === pointId)?.label ?? 'cette étape'} » seule
          </button>
          <CostReadout
            amountUsd={redoCostUsd}
            reason={redoSilenceReason}
            qualifier="pour la refaire"
            testId="contamination-redo-cost"
          />
          <button type="button" data-testid="contamination-accept" onClick={onAccept} className={SECONDARY_BUTTON}>
            Accepter tel quel
          </button>
        </div>
        <Note testId="contamination-estimate-note">{COST_IS_AN_ESTIMATE}</Note>
      </footer>
    </section>
  );
}
