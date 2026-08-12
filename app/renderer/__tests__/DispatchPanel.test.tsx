// LOT L5 — ce que le panneau de dispatch doit dire, et ce qu'il doit taire.
//
// Trois regles y sont gardees, et chacune vient d'un defaut deja vu sur ce
// depot :
//   1. rien n'a bouge -> le panneau ne s'affiche pas. Un panneau qui annonce
//      qu'il ne s'est rien passe est du bruit ; c'est la meme regle que les
//      quatre ecrans de workflow, ou une donnee absente rend un ecran absent.
//   2. le vocabulaire est la SENIORITE, jamais un nom de modele. Regle posee
//      par shared/workmanship.ts.
//   3. un changement qui coute le fil ne se clique pas a l'aveugle : le cout
//      est ecrit AVANT le bouton qui l'engage.

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import DispatchPanel from '../components/chat/dispatch/DispatchPanel';
import type { DispatchPlan, DispatchPlanField } from '../../shared/dispatch/plan';

function champ<T>(value: T, changed = false, applies: 'immediate' | 'proposed' = 'immediate', reason = ''): DispatchPlanField<T> {
  return { value, changed, applies, reason };
}

function plan(patch: Partial<DispatchPlan> = {}): DispatchPlan {
  return {
    complexity: 45,
    complexityRung: 'medium',
    agentVerdict: { kind: 'no-fit', candidates: [], recommendation: '' },
    agent: champ<string | null>(null),
    runtime: champ<'claude' | 'codex'>('claude'),
    model: champ<string | null>('sonnet'),
    effort: champ<'low' | 'medium' | 'high' | null>('medium'),
    acceptCost: null,
    warnings: [],
    ...patch,
  } as DispatchPlan;
}

describe('le panneau se tait quand il n a rien a dire', () => {
  it('ne rend rien quand aucune case n a bouge', () => {
    const { container } = render(<DispatchPanel plan={plan()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('un changement qui ne coute rien est annonce, pas soumis au vote', () => {
  it("s'affiche sans bouton d'acceptation", () => {
    render(<DispatchPanel plan={plan({
      effort: champ<'high' | null>('high', true, 'immediate', 'la tâche demande plus de profondeur'),
    })} />);
    expect(screen.getByTestId('local-dispatch')).toHaveAttribute('data-pending', 'false');
    expect(screen.queryByTestId('dispatch-accept')).toBeNull();
    expect(screen.getByTestId('dispatch-summary').textContent).toContain('profondeur');
  });
});

describe('un changement qui coute le fil attend une decision', () => {
  const avecProposition = plan({
    model: champ<string | null>('opus', true, 'proposed', 'ce travail demande un niveau au-dessus'),
    acceptCost: 'le fil de la conversation repart de zéro',
  });

  it('se marque comme en attente', () => {
    render(<DispatchPanel plan={avecProposition} />);
    expect(screen.getByTestId('local-dispatch')).toHaveAttribute('data-pending', 'true');
  });

  it('ecrit le cout AVANT le bouton qui l engage', () => {
    render(<DispatchPanel plan={avecProposition} onAccept={() => undefined} />);
    const cout = screen.getByTestId('dispatch-cost');
    const bouton = screen.getByTestId('dispatch-accept');
    // Le cout precede le bouton dans l'ordre du document : un lecteur d'ecran
    // comme un oeil rencontrent la consequence avant l'action.
    expect(cout.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cout.textContent).toContain('fil');
  });

  it('rend la main sans rien engager', () => {
    const ecarter = vi.fn();
    render(<DispatchPanel plan={avecProposition} onAccept={() => undefined} onDismiss={ecarter} />);
    fireEvent.click(screen.getByTestId('dispatch-dismiss'));
    expect(ecarter).toHaveBeenCalledOnce();
  });
});

describe('le vocabulaire a l ecran', () => {
  it('traduit le modele en seniorite, sans jamais le nommer', () => {
    render(<DispatchPanel
      plan={plan({ model: champ<string | null>('opus', true, 'proposed', 'travail exigeant'), acceptCost: 'le fil repart de zéro' })}
      defaultOpen
    />);
    const valeur = screen.getByTestId('dispatch-value-model');
    expect(valeur.textContent).toBe('senior');
    // Le nom du modele n'apparait nulle part dans le panneau rendu.
    expect(screen.getByTestId('local-dispatch').textContent?.toLowerCase()).not.toContain('opus');
  });

  it('dit "niveau non précisé" pour un modele hors echelle plutot qu un identifiant', () => {
    render(<DispatchPanel
      plan={plan({ model: champ<string | null>('gpt-5.6-sol', true, 'immediate', 'moteur différent') })}
      defaultOpen
    />);
    expect(screen.getByTestId('dispatch-value-model').textContent).toBe('niveau non précisé');
    expect(screen.getByTestId('local-dispatch').textContent).not.toContain('gpt-5.6-sol');
  });
});

describe('la reprise en main', () => {
  it('rend la case demandee, pas une valeur choisie a la place de l utilisateur', () => {
    const reprendre = vi.fn();
    render(<DispatchPanel
      plan={plan({ model: champ<string | null>('opus', true, 'immediate', 'r') })}
      onOverride={reprendre}
      defaultOpen
    />);
    fireEvent.click(screen.getByTestId('dispatch-override-model'));
    expect(reprendre).toHaveBeenCalledWith('model');
  });
});

describe('le detail explique le choix', () => {
  it('montre le score mesure, qui est la seule facon de comprendre un niveau', () => {
    render(<DispatchPanel plan={plan({ model: champ<string | null>('opus', true, 'immediate', 'r'), complexity: 72 })} defaultOpen />);
    expect(screen.getByTestId('dispatch-detail').textContent).toContain('72');
  });

  it('reste ferme par defaut : il ne s impose pas', () => {
    render(<DispatchPanel plan={plan({ model: champ<string | null>('opus', true, 'immediate', 'r') })} />);
    expect(screen.queryByTestId('dispatch-detail')).toBeNull();
    expect(screen.getByTestId('dispatch-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});
