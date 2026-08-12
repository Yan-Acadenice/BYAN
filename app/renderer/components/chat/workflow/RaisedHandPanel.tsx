// Ecran 3 — la main levee.
//
// LE CAS. Un intervenant s'arrete de lui-meme parce qu'il n'est pas sur, et il
// attend une reponse.
//
// LA CONFIANCE EST BINAIRE. « Je suis sure » ou « je ne suis pas sure », jamais
// un pourcentage. Un chiffre donnerait une precision que rien ne mesure, et il
// ferait perdre la seule information utile : SUR QUOI ca hesite. Le type de
// `shared/workmanship.ts` n'a d'ailleurs aucun champ ou ecrire « 87 % » — cette
// vue n'aurait nulle part ou aller le chercher.
//
// L'ATTENTE NE COUTE RIEN, ET C'EST DIT. Un ecran qui laisse un compteur tourner
// pendant qu'une personne est a l'arret fabrique une urgence fausse. A l'arret,
// personne ne consomme : la phrase le dit, et aucun compteur ne tourne ici.
//
// LA PORTE QUI NE S'OUVRE PAS A L'ANCIENNETE. Quand l'autorisation ne se garde
// pas, le bouton « pour la suite » est ABSENT du document — pas grise. Un
// controle grise promet une capacite et la retire (regle produit 1 de la
// passation).
//
// Presentation pure : tout arrive par proprietes, rien n'est cherche.

import React from 'react';

import { confidencePhrase, personForSlug } from '../../../../shared/workmanship';
import {
  Note,
  PRIMARY_BUTTON,
  PersonLine,
  SECONDARY_BUTTON,
  SectionHeading,
} from './parts';
import type { PermissionGate, PermissionGrant, RaisedHand } from './types';

export const WAITING_COSTS_NOTHING =
  "L'attente ne coûte rien : à l'arrêt, personne ne consomme. Aucun compteur ne tourne pendant que tu lis.";

export const GATE_REMEMBERS_NOTE =
  'Une fois accordée, cette autorisation vaut pour la suite de ce chantier.';

export const GATE_FORGETS_NOTE =
  "Cette porte ne s'ouvre pas à l'ancienneté : elle se redemande à chaque fois, même après dix accords. C'est pour ça qu'il n'y a pas de bouton « pour la suite » ici.";

export interface RaisedHandPanelProps {
  hand: RaisedHand;
  // Le journal des autorisations deja accordees pour ce type de geste.
  grants: readonly PermissionGrant[];
  gate: PermissionGate;
  onAllowOnce: () => void;
  // Les libelles viennent de l'APPELANT, parce que le geste n'est pas toujours
  // une autorisation. Vu a l'ecran le 2026-08-05 : « choisir le dossier du
  // projet » sous un bouton « Autoriser une fois ». Un libelle emprunte a cote
  // fait douter de tout le reste. Absents -> l'ancien vocabulaire de permission,
  // qui reste le bon quand c'en est vraiment une.
  labels?: { readonly primary?: string; readonly dismiss?: string };
  // Appele seulement quand la porte se souvient. La vue n'affiche pas le bouton
  // sinon, donc la fonction n'est meme pas requise dans ce cas.
  onAllowForRest?: () => void;
  onRefuse: () => void;
}

export default function RaisedHandPanel({
  hand,
  grants,
  gate,
  onAllowOnce,
  onAllowForRest,
  onRefuse,
  labels,
}: RaisedHandPanelProps) {
  const person = personForSlug(hand.personId);
  // Le genre grammatical vient de la personne : sans lui, l'ecran ecrit du
  // francais faux une fois sur deux (« je ne suis pas sûre » sur un intervenant
  // masculin).
  const phrase = confidencePhrase(hand.confidence, person?.gender ?? 'f');

  return (
    <section
      role="group"
      aria-label="Une main levée"
      data-testid="raised-hand"
      className="rounded-2xl border border-edge-action bg-surface-card p-md space-y-md"
    >
      <header className="space-y-sm">
        <h3 className="font-h2 text-h2 text-content-strong">Quelqu&apos;un s&apos;est arrêté et attend</h3>
        <PersonLine personId={hand.personId} testId="hand-person" />
        {/* La phrase de confiance en deux registres : la tete est du texte
            courant, l'objet est un nom de fichier et se compose en chasse fixe.
            C'est la deuxieme moitie qui porte l'information. */}
        <p data-testid="hand-confidence" className="text-sm text-content-body leading-relaxed">
          <span>{phrase.head}</span>
          {phrase.about && (
            <>
              <span> — </span>
              <span data-testid="hand-confidence-about" className="font-mono-code text-[13px] text-content-strong">
                {phrase.about}
              </span>
            </>
          )}
        </p>
        <p data-testid="hand-gesture" className="text-sm text-content-body leading-relaxed">
          Le geste en attente : {hand.gesture}
        </p>
        <Note testId="hand-wait-cost">{WAITING_COSTS_NOTHING}</Note>
      </header>

      <div
        role="group"
        aria-label="Les autorisations déjà accordées pour ce geste"
        data-testid="hand-grants"
      >
        <SectionHeading>Ce qui a déjà été autorisé</SectionHeading>
        {grants.length === 0 ? (
          <Note testId="hand-grants-empty">Aucune autorisation de ce type n&apos;a encore été accordée.</Note>
        ) : (
          <ul className="space-y-xs">
            {grants.map((grant) => (
              <li
                key={grant.id}
                data-testid={`hand-grant-${grant.id}`}
                className="flex flex-wrap items-center justify-between gap-sm rounded-xl border border-edge-subtle bg-surface-fill px-sm py-xs"
              >
                <span className="text-[13px] text-content-body">{grant.label}</span>
                <span className="flex items-center gap-md">
                  <PersonLine personId={grant.grantedToId} did="a reçu cette autorisation" />
                  <span className="font-mono-code text-[11px] text-content-tertiary">{grant.when}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-sm">
          <Note testId="hand-gate-note">{gate.remembers ? GATE_REMEMBERS_NOTE : GATE_FORGETS_NOTE}</Note>
        </div>
      </div>

      <footer role="group" aria-label="Ta réponse" className="flex flex-wrap items-center gap-sm">
        <button type="button" data-testid="hand-allow-once" onClick={onAllowOnce} className={PRIMARY_BUTTON}>
          {labels?.primary ?? 'Autoriser une fois'}
        </button>
        {/* Absent, pas grise : le bouton n'existe que si la porte se souvient. */}
        {gate.remembers && (
          <button
            type="button"
            data-testid="hand-allow-rest"
            onClick={onAllowForRest}
            className={SECONDARY_BUTTON}
          >
            Autoriser pour la suite
          </button>
        )}
        <button type="button" data-testid="hand-refuse" onClick={onRefuse} className={SECONDARY_BUTTON}>
          {labels?.dismiss ?? 'Refuser'}
        </button>
      </footer>
    </section>
  );
}
