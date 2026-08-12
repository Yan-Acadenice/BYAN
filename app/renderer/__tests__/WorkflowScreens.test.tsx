// Les quatre ecrans du chantier.
//
// CE QUE CES TESTS VERROUILLENT, ET POURQUOI. Chacun des quatre ecrans existe
// pour corriger une facon precise de mentir a l'utilisateur, et chacune de ces
// facons est revenue au moins une fois dans cette application :
//
//   - un rendu contamine qui se lit comme un rendu propre (le quatrieme etat) ;
//   - un point de reprise nomme par un numero, donc impossible a juger ;
//   - une hesitation resumee par un pourcentage, qui perd son objet ;
//   - un total qui noie les minutes ou une seule personne travaillait pour rien.
//
// Un test qui se contenterait de verifier « l'ecran s'affiche » ne pourrait
// echouer sur aucune de ces quatre regressions. On assert donc les FAITS :
// l'objet de l'hesitation plutot qu'un chiffre, le tiret ET sa raison, le mot
// « estime » dans le libelle, l'absence totale de vocabulaire technique, et le
// bouton qui doit etre ABSENT du document plutot que grise.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import {
  ContaminationPanel,
  PersonLine,
  RaisedHandPanel,
  RewindPanel,
  UNKNOWN_PERSON_LABEL,
  WorkTimeline,
  type PermissionGrant,
  type RewindPoint,
  type TimelineSlice,
  type WorkStep,
} from '../components/chat/workflow';
import {
  COST_LABEL,
  DASH,
  SILENCE_REASON_LABELS,
  formatDuration,
  formatEstimatedCost,
  unsureAbout,
} from '../../shared/workmanship';

// ---------------------------------------------------------------------------
// Le detecteur de mot technique
// ---------------------------------------------------------------------------

// LA REGLE : zero mot technique a l'ecran. Le detecteur ratisse le texte rendu
// ET les noms accessibles (aria-label, title, alt) — ce que lit une synthese
// vocale est aussi « a l'ecran », et un mot technique planque dans un aria-label
// passerait sans cette moitie-la.
const FORBIDDEN = /\b(agents?|workers?|haiku|sonnet|opus|fable|tokens?|workflows?|prompts?|échecs?|echecs?|failed|error)\b/i;

// LE PIEGE, RENCONTRE ICI MEME. `container.textContent` colle les noeuds de
// texte voisins sans separateur : « ...dans l'existant » suivi de « haiku »
// donne « existanthaiku », et la limite de mot de l'expression ne s'y accroche
// plus. Le detecteur laissait donc passer exactement ce qu'il etait cense
// attraper. On parcourt les noeuds un par un et on les joint par une espace.
function everythingTheUserCanPerceive(container: HTMLElement): string {
  const parts: string[] = [];
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue) parts.push(node.nodeValue);
    node = walker.nextNode();
  }
  for (const element of Array.from(container.querySelectorAll('[aria-label], [title], [alt]'))) {
    for (const attribute of ['aria-label', 'title', 'alt']) {
      const value = element.getAttribute(attribute);
      if (value) parts.push(value);
    }
  }
  return parts.join(' ');
}

function expectNoTechnicalWord(container: HTMLElement) {
  const perceived = everythingTheUserCanPerceive(container);
  const hit = perceived.match(FORBIDDEN);
  expect(hit ? hit[0] : null).toBeNull();
}

// ---------------------------------------------------------------------------
// Le chantier d'exemple : une migration d'appels qui part d'un reperage vide
// ---------------------------------------------------------------------------

// Les durees et les montants sont credibles, pas ronds : un jeu de donnees en
// chiffres ronds cache les erreurs d'arrondi et de format.
const CHANTIER: WorkStep[] = [
  {
    id: 'reperage',
    label: 'Repérage des appels à migrer',
    nature: 'reperage',
    personId: 'bmad-bmm-quick-flow-solo-dev',
    tier: 'haiku',
    state: 'rendu-suspect',
    durationMs: 4_000,
    // Strictement zero : c'est la donnee qui declenche le premier signal.
    resultCount: 0,
    hasOwnSource: true,
    costUsd: 0.004,
  },
  {
    id: 'plan',
    label: 'Plan de remplacement',
    nature: 'implementation',
    personId: 'bmad-bmm-architect',
    tier: 'opus',
    state: 'rendu',
    durationMs: 180_000,
    consumes: ['reperage'],
    costUsd: 0.42,
  },
  {
    id: 'code',
    label: 'Réécriture des appels',
    nature: 'implementation',
    personId: 'bmad-bmm-dev',
    tier: 'opus',
    state: 'rendu',
    durationMs: 195_000,
    consumes: ['plan'],
    // Ce moteur ne publie aucun montant : le tiret et sa raison, jamais un zero.
    costUsd: null,
    silenceReason: 'abonnement',
  },
  {
    id: 'ajustements',
    label: 'Ajustements après relecture',
    nature: 'implementation',
    personId: 'bmad-bmm-dev',
    tier: 'haiku',
    state: 'rendu',
    // Un facteur ~47 sous ses deux voisines de meme nature : le deuxieme signal.
    durationMs: 4_000,
    consumes: ['code'],
    costUsd: 0.003,
  },
  {
    id: 'verification',
    label: 'Vérification des appels réécrits',
    nature: 'verification',
    personId: 'quinn',
    tier: 'sonnet',
    state: 'rendu',
    durationMs: 90_000,
    consumes: ['code'],
    costUsd: 0.11,
  },
];

function renderContamination(over: Partial<React.ComponentProps<typeof ContaminationPanel>> = {}) {
  const onRedo = vi.fn();
  const onAccept = vi.fn();
  const view = render(
    <ContaminationPanel
      steps={CHANTIER}
      redoCostUsd={0.006}
      onRedo={onRedo}
      onAccept={onAccept}
      {...over}
    />,
  );
  return { ...view, onRedo, onAccept };
}

// ---------------------------------------------------------------------------
// Ecran 1 — la contamination
// ---------------------------------------------------------------------------

describe('ContaminationPanel — un chantier rendu mais suspect', () => {
  it('nomme en une phrase l\'étape fautive et compte les personnes qui ont travaillé par-dessus', () => {
    renderContamination();
    const phrase = screen.getByTestId('contamination-phrase').textContent ?? '';
    expect(phrase).toContain('Repérage des appels à migrer');
    expect(phrase).toContain("n'a rien rapporté");
    // Winston, Amelia et Quinn ont consomme la sortie du reperage. Amelia y est
    // intervenue deux fois : on compte des PERSONNES, pas des etapes.
    expect(phrase).toContain('3 personnes ont travaillé par-dessus');
  });

  it('marque où le vide est entré et quelles étapes ont travaillé par-dessus', () => {
    renderContamination();
    expect(screen.getByTestId('chain-reperage')).toHaveAttribute('data-hole', 'entree');
    for (const id of ['plan', 'code', 'ajustements', 'verification']) {
      expect(screen.getByTestId(`chain-${id}`)).toHaveAttribute('data-hole', 'aval');
    }
    expect(screen.getByTestId('chain-reperage').textContent).toContain('le vide est entré ici');
  });

  it('porte l\'état « rendu mais suspect » en toutes lettres, pas seulement en couleur', () => {
    renderContamination();
    expect(screen.getByTestId('contamination-state').textContent).toContain('rendu mais suspect');
  });

  it('rend les trois signaux mécaniques, chacun avec son angle mort', () => {
    const { container } = renderContamination();

    const empty = screen.getByTestId('signal-reperage-vide');
    expect(empty.textContent).toContain('Repérage des appels à migrer');
    expect(empty.textContent).toContain('Ce que ce constat ne voit pas');

    const aberrant = screen.getByTestId('signal-duree-aberrante');
    expect(aberrant.textContent).toContain('Ajustements après relecture');
    expect(aberrant.textContent).toContain(formatDuration(4_000));

    const sole = screen.getByTestId('signal-maillon-unique');
    expect(sole.textContent).toContain('tout ce qui suit repose sur');

    // La phrase qui dit qu'aucun des trois ne juge la qualite doit etre a
    // l'ecran, pas seulement dans un commentaire de code.
    expect(screen.getByTestId('contamination-no-judgement').textContent).toContain('ne juge la qualité');
    expect(screen.getByTestId('contamination-blind-spot').textContent).toContain('jamais sa justesse');
    expectNoTechnicalWord(container);
  });

  it('ne peint qu\'un seul accent non-teal : le rendu propre tombe en neutre', () => {
    renderContamination();
    // 'rendu-suspect' (ambre) et 'rendu' (vert) demandent deux accents non-teal
    // pour un budget de un. Le quatrieme etat est protege ; le rendu propre,
    // attendu et sans surprise, perd sa couleur et garde sa forme.
    expect(screen.getByTestId('contamination-state')).toHaveAttribute('data-accent', 'role');
    const propre = within(screen.getByTestId('chain-plan')).getByText('rendu');
    expect(propre.closest('[data-state]')).toHaveAttribute('data-accent', 'neutre');
  });

  it('affiche un coût estimé par étape, et le tiret avec sa raison quand rien n\'est rapporté', () => {
    renderContamination();
    const mesure = screen.getByTestId('chain-cost-plan');
    expect(mesure).toHaveAttribute('data-measured', 'oui');
    expect(mesure.textContent).toContain(COST_LABEL);
    expect(mesure.textContent).toContain(formatEstimatedCost(0.42).value);

    const silencieux = screen.getByTestId('chain-cost-code');
    expect(silencieux).toHaveAttribute('data-measured', 'non');
    expect(silencieux.textContent).toContain(DASH);
    expect(silencieux.textContent).toContain(SILENCE_REASON_LABELS.abonnement);
  });

  it('offre exactement deux sorties, la première chiffrée en estimation', () => {
    const { onRedo, onAccept } = renderContamination();
    const redo = screen.getByTestId('contamination-redo');
    expect(redo.textContent).toContain('Repérage des appels à migrer');
    expect(screen.getByTestId('contamination-redo-cost').textContent).toContain('estimé');

    fireEvent.click(redo);
    expect(onRedo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('contamination-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);

    // Le mot « estimation » est a l'ecran, pas en note de bas de page.
    expect(screen.getByTestId('contamination-estimate-note').textContent).toContain('estimations');
  });

  it('nomme le groupe et rend chaque sortie atteignable au clavier', () => {
    renderContamination();
    expect(screen.getByRole('group', { name: 'Un chantier rendu mais suspect' })).toBeInTheDocument();
    for (const id of ['contamination-redo', 'contamination-accept']) {
      const button = screen.getByTestId(id);
      // La cible de pointage et l'anneau de focus sont verifies par la classe :
      // jsdom ne fait aucune mise en page, donc une mesure en pixels y serait un
      // mensonge. Retirer la classe casse le test, ce qui est le point.
      expect(button.className).toContain('min-h-[24px]');
      expect(button.className).toContain('focus-visible:ring-2');
    }
  });
});

// ---------------------------------------------------------------------------
// Ecran 2 — le prix de revenir en arriere
// ---------------------------------------------------------------------------

const POINTS: RewindPoint[] = [
  {
    id: 'p1',
    decision: 'Aucun appel à migrer',
    decidedById: 'bmad-bmm-quick-flow-solo-dev',
    basedOn: 'src/api/client.ts',
    kept: ['La configuration du projet'],
    redone: ['Le repérage', 'Le plan de remplacement', 'La réécriture', 'La vérification'],
    discardedCostUsd: 0.537,
  },
  {
    id: 'p2',
    decision: 'Le plan de remplacement tient',
    decidedById: 'bmad-bmm-architect',
    basedOn: 'le rapport de repérage',
    kept: ['Le repérage', 'Le plan de remplacement'],
    redone: ['La réécriture', 'La vérification'],
    discardedCostUsd: 0.118,
  },
  {
    id: 'p3',
    decision: 'La réécriture est bonne',
    decidedById: 'bmad-bmm-dev',
    basedOn: 'src/api/client.ts',
    kept: ['Tout jusqu\'à la réécriture'],
    redone: ['La vérification'],
    discardedCostUsd: null,
    discardedSilenceReason: 'abonnement',
  },
];

describe('RewindPanel — le prix de revenir en arrière', () => {
  it('nomme chaque point par sa décision, jamais par un numéro d\'étape', () => {
    const { container } = render(<RewindPanel points={POINTS} onRewind={vi.fn()} defaultOpen />);
    expect(screen.getByTestId('rewind-decision-p1').textContent).toBe('Aucun appel à migrer');
    expect(screen.getByTestId('rewind-decision-p2').textContent).toBe('Le plan de remplacement tient');
    // Aucun « étape 3 » nulle part : c'est le nommage que cet ecran remplace.
    expect(container.textContent ?? '').not.toMatch(/étape\s*\d/i);
    expectNoTechnicalWord(container);
  });

  it('dit qui a tranché et sur quoi, ce qu\'on garde et ce qu\'on refait', () => {
    render(<RewindPanel points={POINTS} onRewind={vi.fn()} defaultOpen />);
    const who = screen.getByTestId('rewind-who-p2');
    expect(who.textContent).toContain('Winston');
    expect(who.textContent).toContain('a tranché sur le rapport de repérage');
    expect(screen.getByTestId('rewind-kept-p2').textContent).toContain('Le plan de remplacement');
    expect(screen.getByTestId('rewind-redone-p2').textContent).toContain('La vérification');
  });

  it('chiffre le rejet en estimation, et laisse le tiret quand rien n\'est rapporté', () => {
    render(<RewindPanel points={POINTS} onRewind={vi.fn()} defaultOpen />);
    const cost = screen.getByTestId('rewind-cost-p1');
    expect(cost.textContent).toContain('estimé');
    expect(cost.textContent).toContain('du travail jeté');
    expect(cost.textContent).toContain(formatEstimatedCost(0.537).value);

    const silent = screen.getByTestId('rewind-cost-p3');
    expect(silent).toHaveAttribute('data-measured', 'non');
    expect(silent.textContent).toContain(DASH);
    expect(silent.textContent).toContain(SILENCE_REASON_LABELS.abonnement);
  });

  it('désigne le point le moins cher ET prévient qu\'il n\'est pas le plus utile', () => {
    render(<RewindPanel points={POINTS} onRewind={vi.fn()} defaultOpen />);
    expect(screen.getByTestId('rewind-p2')).toHaveAttribute('data-cheapest', 'oui');
    expect(screen.getByTestId('rewind-p1')).toHaveAttribute('data-cheapest', 'non');
    // Un montant non rapporte n'entre pas dans la comparaison : le classer par
    // un tiret reviendrait a lire une absence de mesure comme un zero.
    expect(screen.getByTestId('rewind-p3')).toHaveAttribute('data-cheapest', 'non');
    expect(screen.getByTestId('rewind-warning').textContent).toContain("n'est pas le plus utile");
  });

  it('remonte le point choisi', () => {
    const onRewind = vi.fn();
    render(<RewindPanel points={POINTS} onRewind={onRewind} defaultOpen />);
    fireEvent.click(screen.getByTestId('rewind-go-p2'));
    expect(onRewind).toHaveBeenCalledWith('p2');
  });
});

// ---------------------------------------------------------------------------
// Ecran 3 — la main levee
// ---------------------------------------------------------------------------

const GRANTS: PermissionGrant[] = [
  {
    id: 'g1',
    label: 'écrire dans le dossier des tests',
    grantedToId: 'quinn',
    when: "aujourd'hui à 14 h 05",
  },
  {
    id: 'g2',
    label: 'lancer la suite de vérification',
    grantedToId: 'bmad-bmm-tea',
    when: "aujourd'hui à 14 h 22",
  },
];

function renderHand(remembers: boolean) {
  const onAllowOnce = vi.fn();
  const onAllowForRest = vi.fn();
  const onRefuse = vi.fn();
  const view = render(
    <RaisedHandPanel
      hand={{
        personId: 'bmad-bmm-dev',
        confidence: unsureAbout('src/api/client.ts'),
        gesture: "écrire dans src/api/client.ts, un fichier que tu as modifié à la main",
      }}
      grants={GRANTS}
      gate={{ remembers }}
      onAllowOnce={onAllowOnce}
      onAllowForRest={onAllowForRest}
      onRefuse={onRefuse}
    />,
  );
  return { ...view, onAllowOnce, onAllowForRest, onRefuse };
}

describe('RaisedHandPanel — la main levée', () => {
  it('dit l\'hésitation et son objet, jamais un pourcentage', () => {
    const { container } = renderHand(false);
    expect(screen.getByTestId('hand-confidence').textContent).toContain('je ne suis pas sûre');
    // LA VRAIE INFORMATION EST LA : sur quoi ca hesite.
    expect(screen.getByTestId('hand-confidence-about').textContent).toBe('src/api/client.ts');
    // Aucun chiffre suivi d'un pourcent nulle part.
    expect(container.textContent ?? '').not.toMatch(/\d+\s*(%|pour cent)/);
    expectNoTechnicalWord(container);
  });

  it('accorde la phrase au genre de la personne', () => {
    // Amelia est feminine dans le roster : « sûre ». Le masculin serait du
    // francais faux une fois sur deux.
    renderHand(false);
    expect(screen.getByTestId('hand-confidence').textContent).toContain('sûre');
    expect(screen.getByTestId('hand-confidence').textContent).not.toContain('pas sûr —');
  });

  it('dit que l\'attente ne coûte rien plutôt que de laisser croire qu\'un compteur tourne', () => {
    renderHand(false);
    const note = screen.getByTestId('hand-wait-cost').textContent ?? '';
    expect(note).toContain("L'attente ne coûte rien");
    expect(note).toContain('personne ne consomme');
  });

  it('rend le journal des autorisations déjà accordées', () => {
    renderHand(false);
    const grants = screen.getByTestId('hand-grants');
    expect(within(grants).getByTestId('hand-grant-g1').textContent).toContain('écrire dans le dossier des tests');
    expect(within(grants).getByTestId('hand-grant-g1').textContent).toContain('Quinn');
    expect(within(grants).getByTestId('hand-grant-g2').textContent).toContain('Murat');
  });

  it('retire du document le bouton « pour la suite » quand la porte ne s\'ouvre pas à l\'ancienneté', () => {
    const { unmount } = renderHand(false);
    // ABSENT, pas grise : un controle grise promet une capacite et la retire.
    expect(screen.queryByTestId('hand-allow-rest')).toBeNull();
    expect(screen.getByTestId('hand-gate-note').textContent).toContain("ne s'ouvre pas à l'ancienneté");
    unmount();

    const second = renderHand(true);
    expect(screen.getByTestId('hand-allow-rest')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hand-allow-rest'));
    expect(second.onAllowForRest).toHaveBeenCalledTimes(1);
  });

  it('remonte les deux réponses toujours disponibles', () => {
    const { onAllowOnce, onRefuse } = renderHand(false);
    fireEvent.click(screen.getByTestId('hand-allow-once'));
    fireEvent.click(screen.getByTestId('hand-refuse'));
    expect(onAllowOnce).toHaveBeenCalledTimes(1);
    expect(onRefuse).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Ecran 4 — la frise
// ---------------------------------------------------------------------------

const SLICES: TimelineSlice[] = [
  // 4 min, une seule personne, et son travail est parti.
  { startMs: 0, durationMs: 240_000, working: 1, discarded: 1 },
  { startMs: 240_000, durationMs: 600_000, working: 4, discarded: 1 },
  { startMs: 840_000, durationMs: 300_000, working: 2, discarded: 0 },
  // 3 min, meme chose.
  { startMs: 1_140_000, durationMs: 180_000, working: 1, discarded: 1 },
  // LA BORNE. Deux personnes, et TOUT leur travail est parti : du travail jete,
  // mais pas une minute solitaire. Sans cette tranche, un filtre relache en
  // « une ou deux personnes » passerait le test sans que rien ne bouge — c'est
  // exactement la mutation qui a survecu au premier essai.
  { startMs: 1_320_000, durationMs: 120_000, working: 2, discarded: 2 },
];

describe('WorkTimeline — la frise, troisième profondeur de lecture', () => {
  it('reste derrière un bouton et n\'apparaît pas en premier écran', () => {
    render(<WorkTimeline slices={SLICES} />);
    expect(screen.queryByTestId('timeline-panel')).toBeNull();
    expect(screen.getByTestId('timeline-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('s\'ouvre au clic et se referme', () => {
    render(<WorkTimeline slices={SLICES} />);
    const toggle = screen.getByTestId('timeline-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId('timeline-panel')).toBeNull();
  });

  it('nomme les minutes où une seule personne travaillait et où son travail a été jeté', () => {
    const { container } = render(<WorkTimeline slices={SLICES} defaultOpen />);
    const sentence = screen.getByTestId('timeline-lonely').textContent ?? '';
    expect(sentence).toContain('2 moments');
    // 4 min + 3 min : c'est ce qu'aucun total ne montre.
    expect(sentence).toContain(formatDuration(420_000));
    expect(sentence).toContain('une seule personne travaillait');
    // Le repere sous l'axe existe pour les deux tranches concernees.
    expect(screen.getByTestId('timeline-lonely-mark-0')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-lonely-mark-1140000')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-lonely-mark-840000')).toBeNull();
    // Deux personnes dont tout le travail est jete : du travail perdu, mais pas
    // une minute solitaire. Le repere ne doit pas s'y poser.
    expect(screen.queryByTestId('timeline-lonely-mark-1320000')).toBeNull();
    expectNoTechnicalWord(container);
  });

  it('dit la hauteur maximale et la durée totale, et double la couleur d\'une hachure', () => {
    render(<WorkTimeline slices={SLICES} defaultOpen />);
    const peak = screen.getByTestId('timeline-peak').textContent ?? '';
    expect(peak).toContain('4 personnes en même temps');
    expect(peak).toContain(formatDuration(1_440_000));
    // La part jetee est hachuree en plus d'etre ambre : lisible sans la couleur.
    const lost = screen.getByTestId('timeline-lost-0');
    expect(lost.getAttribute('fill') ?? '').toMatch(/^url\(#.+-hachure\)$/);
  });

  it('le dit franchement quand aucune minute solitaire n\'a été perdue', () => {
    render(
      <WorkTimeline
        slices={[
          { startMs: 0, durationMs: 120_000, working: 2, discarded: 0 },
          { startMs: 120_000, durationMs: 60_000, working: 3, discarded: 1 },
        ]}
        defaultOpen
      />,
    );
    expect(screen.getByTestId('timeline-lonely').textContent).toContain('Aucune minute où une seule personne');
  });

  it('ne dessine rien plutôt que de dessiner du vide quand aucune minute n\'est mesurée', () => {
    render(<WorkTimeline slices={[]} defaultOpen />);
    expect(screen.queryByTestId('timeline-figure')).toBeNull();
    expect(screen.getByTestId('timeline-empty').textContent).toContain('Aucune minute mesurée');
  });
});

// ---------------------------------------------------------------------------
// Ce qui doit tenir sur les quatre ecrans a la fois
// ---------------------------------------------------------------------------

describe('les quatre écrans ensemble', () => {
  it('n\'écrivent aucun mot technique, nulle part', () => {
    const { container } = render(
      <div>
        <ContaminationPanel steps={CHANTIER} redoCostUsd={0.006} onRedo={vi.fn()} onAccept={vi.fn()} />
        <RewindPanel points={POINTS} onRewind={vi.fn()} defaultOpen />
        <RaisedHandPanel
          hand={{
            personId: 'bmad-bmm-dev',
            confidence: unsureAbout('src/api/client.ts'),
            gesture: 'écrire dans src/api/client.ts',
          }}
          grants={GRANTS}
          gate={{ remembers: true }}
          onAllowOnce={vi.fn()}
          onAllowForRest={vi.fn()}
          onRefuse={vi.fn()}
        />
        <WorkTimeline slices={SLICES} defaultOpen />
      </div>,
    );
    expectNoTechnicalWord(container);
  });

  it('traduisent les paliers en séniorité, expert compris', () => {
    render(<ContaminationPanel steps={CHANTIER} redoCostUsd={0.006} onRedo={vi.fn()} onAccept={vi.fn()} />);
    // 'haiku' -> junior, 'opus' -> senior, 'sonnet' -> confirme. Aucun de ces
    // trois mots techniques n'atteint l'ecran.
    expect(within(screen.getByTestId('chain-reperage')).getByText('junior')).toBeInTheDocument();
    expect(within(screen.getByTestId('chain-plan')).getByText('senior')).toBeInTheDocument();
    expect(within(screen.getByTestId('chain-verification')).getByText('confirmé')).toBeInTheDocument();
  });

  it('accolent « n\'est pas facturé » aux deux qui conduisent le chantier, et à eux seuls', () => {
    const { unmount } = render(<PersonLine personId="hermes" testId="ligne" />);
    expect(screen.getByTestId('ligne').textContent).toContain('Hermes');
    expect(screen.getByTestId('ligne').textContent).toContain("n'est pas facturé");
    unmount();

    render(<PersonLine personId="bmad-bmm-dev" testId="ligne" />);
    expect(screen.getByTestId('ligne').textContent).toContain('Amelia');
    expect(screen.getByTestId('ligne').textContent).not.toContain("n'est pas facturé");
  });

  it('disent l\'ignorance plutôt que de lâcher un identifiant technique à l\'écran', () => {
    const { container } = render(<PersonLine personId="quelque-chose-qui-n-existe-pas" testId="ligne" />);
    expect(screen.getByTestId('ligne').textContent).toContain(UNKNOWN_PERSON_LABEL);
    expect(screen.getByTestId('ligne').textContent).not.toContain('quelque-chose-qui-n-existe-pas');
    expectNoTechnicalWord(container);
  });

  it('exposent un rôle et un nom accessible sur chaque groupe', () => {
    render(
      <div>
        <ContaminationPanel steps={CHANTIER} redoCostUsd={0.006} onRedo={vi.fn()} onAccept={vi.fn()} />
        <RewindPanel points={POINTS} onRewind={vi.fn()} defaultOpen />
      </div>,
    );
    expect(screen.getByRole('group', { name: 'Un chantier rendu mais suspect' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Les signaux relevés' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Les deux sorties' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Revenir en arrière, et ce que chaque point coûte' }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// La frise ne parle que de ce qui existe.
//
// VU A L'ECRAN (2026-08-05, capture) : sur un chat local, la frise affichait une
// legende « travail jeté » et la phrase « Aucune minute ou une seule personne
// travaillait et ou son travail a ete jete » — pour une categorie qui ne peut PAS
// se produire en local, faute de mecanisme de reprise. Plus « jusqu'a 1 personne
// en meme temps », avec un seul moteur.
//
// Trois lignes, zero information. Une legende pour l'impossible et un decompte
// toujours egal a un font douter du reste de l'ecran.
//
// La regle : ce qui ne peut pas arriver ne se legende pas ; ce qui vaut toujours
// un ne se compte pas.
// ---------------------------------------------------------------------------
describe('WorkTimeline — pas de legende pour l impossible', () => {
  const UN_SEUL = [
    { startMs: 0, durationMs: 1000, working: 1, discarded: 0 },
    { startMs: 1000, durationMs: 2000, working: 1, discarded: 0 },
  ];
  const AVEC_REJET = [
    { startMs: 0, durationMs: 1000, working: 1, discarded: 1 },
    { startMs: 1000, durationMs: 2000, working: 2, discarded: 0 },
  ];

  it('ne montre PAS la legende « travail jeté » quand rien n est jeté', () => {
    render(<WorkTimeline slices={UN_SEUL} defaultOpen />);
    expect(screen.queryByText(/travail jeté/i)).toBeNull();
  });

  it('la montre des qu un travail EST jeté', () => {
    render(<WorkTimeline slices={AVEC_REJET} defaultOpen />);
    expect(screen.getByText(/travail jeté/i)).toBeInTheDocument();
  });

  it('ne dit PAS « aucune minute ou le travail a ete jete » quand c est structurel', () => {
    // Repondre a une question que personne ne pose, sur un cas qui ne peut pas
    // survenir, c'est du remplissage.
    render(<WorkTimeline slices={UN_SEUL} defaultOpen />);
    expect(screen.queryByText(/aucune minute/i)).toBeNull();
  });

  it('dit ce que la donnee sait vraiment : la duree et le nombre d etapes', () => {
    render(<WorkTimeline slices={UN_SEUL} defaultOpen />);
    const resume = screen.getByTestId('timeline-lonely');
    expect(resume.textContent ?? '').toMatch(/2 étapes|deux étapes/i);
  });

  it('ne compte pas les personnes quand il n y en a jamais plus d une', () => {
    render(<WorkTimeline slices={UN_SEUL} defaultOpen />);
    expect(screen.queryByText(/1 personne en même temps/i)).toBeNull();
  });

  it('les compte des qu il y en a plusieurs', () => {
    render(<WorkTimeline slices={AVEC_REJET} defaultOpen />);
    expect(screen.getByText(/2 personnes en même temps/i)).toBeInTheDocument();
  });
});
