// Ces tests epinglent le VOCABULAIRE autant que la logique : quatre surfaces
// vont consommer ce module, et une traduction qui derive se lit a l'ecran avant
// de casser un test. Les cas limites des trois signaux mecaniques sont ecrits en
// premier parce que ce sont eux qui peuvent mentir sans planter.

import { describe, expect, it } from 'vitest';
import {
  ABERRANT_SHORT_RATIO,
  ACCENT_CLASSES,
  ADVERSE_REVIEWER_ID,
  COST_IS_AN_ESTIMATE,
  COST_LABEL,
  DASH,
  MIN_MEASURED_NEIGHBOURS,
  MODEL_TIERS,
  NON_TEAL_ACCENT_BUDGET,
  NOT_BILLED_NOTE,
  NO_SIGNAL_CATCHES_A_PLAUSIBLE_FALSEHOOD,
  PEOPLE,
  READING_DEPTHS,
  READING_DEPTH_LABELS,
  SENIORITIES,
  SENIORITY_LABELS,
  SIGNAL_BLIND_SPOTS,
  SILENCE_REASON_LABELS,
  UNKNOWN_SENIORITY_LABEL,
  WORK_STATES,
  WORK_STATE_STYLES,
  aberrantDuration,
  accentBudgetExceeded,
  confidenceLine,
  confidencePhrase,
  confident,
  emptyReconnaissance,
  formatDuration,
  formatEstimatedCost,
  isBottomRung,
  isModelTier,
  isWorkState,
  nonTealAccents,
  partialTotalNote,
  personForSlug,
  personLabel,
  readConfidence,
  scanContamination,
  seniorityForTier,
  seniorityLabel,
  seniorityRank,
  soleLoadBearingLink,
  soleLoadBearingSignal,
  statesKeepingTheirAccent,
  tierForSeniority,
  totalEstimatedCost,
  unsureAbout,
  workStateLabel,
  type ContaminationSignal,
  type Person,
  type WorkStepFact,
} from '../workmanship';

// Deux aides qui evitent l'assertion non-nulle : un `!` mal place transforme un
// echec net en TypeError illisible, et masque QUELLE attente a lache.
function personNamed(firstName: string): Person {
  const person = PEOPLE.find((p) => p.firstName === firstName);
  if (!person) throw new Error(`aucun intervenant nommé ${firstName}`);
  return person;
}

function mustSignal(signal: ContaminationSignal | null): ContaminationSignal {
  if (!signal) throw new Error('un constat était attendu, aucun n\'est venu');
  return signal;
}

// Intl separe le nombre de la devise par une espace insecable (U+00A0), et pose
// une espace fine insecable (U+202F) sur les milliers. Les ecrire en clair ici
// evite un test qui passe parce qu'il compare deux fois la meme sortie d'Intl.
const NBSP = ' ';

describe('paliers de modele et seniorite', () => {
  it('traduit les quatre paliers, y compris celui dont on doutait', () => {
    // 'fable' EXISTE : _byan/mcp/byan-mcp-server/lib/native-tiers.js le cite 5
    // fois, dont dans la constante gelee UP_TIER_MODELS.
    expect(seniorityForTier('haiku')).toBe('junior');
    expect(seniorityForTier('sonnet')).toBe('confirme');
    expect(seniorityForTier('opus')).toBe('senior');
    expect(seniorityForTier('fable')).toBe('expert');
  });

  it('fait l\'aller-retour dans les deux sens sans perte', () => {
    for (const tier of MODEL_TIERS) {
      const seniority = seniorityForTier(tier);
      expect(seniority).not.toBeNull();
      if (seniority) expect(tierForSeniority(seniority)).toBe(tier);
    }
    for (const seniority of SENIORITIES) {
      expect(seniorityForTier(tierForSeniority(seniority))).toBe(seniority);
    }
  });

  it('tolere la casse et les espaces, qui ne sont pas une supposition', () => {
    expect(seniorityForTier('  OPUS ')).toBe('senior');
    expect(isModelTier('Sonnet')).toBe(true);
  });

  it('rend une valeur honnete sur un palier inconnu, jamais une supposition', () => {
    expect(seniorityForTier('gpt-5.6-sol')).toBeNull();
    expect(seniorityForTier('')).toBeNull();
    expect(seniorityForTier(null)).toBeNull();
    expect(seniorityForTier(42)).toBeNull();
    expect(seniorityLabel(null)).toBe(UNKNOWN_SENIORITY_LABEL);
  });

  it('refuse de deviner un palier depuis un nom de modele complet', () => {
    // Volontaire : 'opus-mini' contiendrait aussi 'opus' sans etre du meme
    // palier. La recherche approximative est exactement la supposition que la
    // branche "inconnu" existe pour eviter.
    expect(seniorityForTier('claude-opus-5')).toBeNull();
    expect(seniorityLabel(seniorityForTier('claude-opus-5'))).toBe(UNKNOWN_SENIORITY_LABEL);
  });

  it('affiche des libelles francais accentues, pas des cles', () => {
    expect(SENIORITY_LABELS.confirme).toBe('confirmé');
    expect(seniorityLabel('confirme')).toBe('confirmé');
  });

  it('ordonne du moins cher au plus cher', () => {
    expect(SENIORITIES.map(seniorityRank)).toEqual([1, 2, 3, 4]);
  });

  it('place le palier bas sur le junior, et lui seul', () => {
    expect(SENIORITIES.filter(isBottomRung)).toEqual(['junior']);
  });

  it('n\'expose aucun nom de palier technique dans un libelle visible', () => {
    const visible = Object.values(SENIORITY_LABELS).join(' ') + ' ' + UNKNOWN_SENIORITY_LABEL;
    for (const tier of MODEL_TIERS) expect(visible).not.toContain(tier);
  });
});

describe('les quatre etats d\'un intervenant', () => {
  it('en compte quatre, pas trois', () => {
    expect(WORK_STATES).toHaveLength(4);
    expect(WORK_STATES).toContain('rendu-suspect');
  });

  it('nomme chaque etat en francais lisible', () => {
    expect(workStateLabel('en-cours')).toBe('en cours');
    expect(workStateLabel('rendu')).toBe('rendu');
    expect(workStateLabel('rendu-suspect')).toBe('rendu mais suspect');
    expect(workStateLabel('arrete-en-route')).toBe("s'est arrêté en route");
  });

  it('porte "rendu mais suspect" par l\'ambre, et par aucune cinquieme couleur', () => {
    const suspect = WORK_STATE_STYLES['rendu-suspect'];
    expect(suspect.accent).toBe('change');
    expect(suspect.classes).toBe(ACCENT_CLASSES.change);
    expect(suspect.classes.text).toBe('text-accent-change');
    // Le seul etat marque suspect.
    expect(WORK_STATES.filter((s) => WORK_STATE_STYLES[s].suspect)).toEqual(['rendu-suspect']);
  });

  it('n\'utilise que les quatre roles de couleur du systeme', () => {
    const roles = new Set(WORK_STATES.map((s) => WORK_STATE_STYLES[s].accent));
    expect([...roles].sort()).toEqual(['action', 'change', 'danger', 'success']);
  });

  it('ecrit les classes en toutes lettres, pour que le scanner les voie', () => {
    for (const role of ['action', 'change', 'danger', 'success'] as const) {
      const c = ACCENT_CLASSES[role];
      expect(c.text).toBe(`text-accent-${role}`);
      expect(c.bg).toBe(`bg-accent-${role}`);
      expect(c.border).toBe(`border-edge-${role}`);
      expect(c.washBg).toBe(`bg-wash-${role}`);
      expect(c.washText).toBe(`text-on-wash-${role}`);
    }
  });

  it('reconnait un etat valide et refuse le reste', () => {
    expect(isWorkState('rendu-suspect')).toBe(true);
    expect(isWorkState('failed')).toBe(false);
    expect(isWorkState(undefined)).toBe(false);
  });
});

describe('budget de deux accents par ecran', () => {
  it('ne compte pas le teal, deja depense par l\'ossature', () => {
    expect(nonTealAccents(['en-cours'])).toEqual([]);
    expect(accentBudgetExceeded(['en-cours', 'rendu'])).toBe(false);
  });

  it('depasse des que deux teintes non-teal se rencontrent', () => {
    expect(nonTealAccents(['rendu', 'rendu-suspect'])).toHaveLength(2);
    expect(accentBudgetExceeded(['rendu', 'rendu-suspect'])).toBe(true);
    expect(NON_TEAL_ACCENT_BUDGET).toBe(1);
  });

  it('garde le teal gratuit et protege le trou de livraison en premier', () => {
    expect(statesKeepingTheirAccent([...WORK_STATES])).toEqual(['en-cours', 'arrete-en-route']);
  });

  it('ajoute le rendu suspect quand le budget monte a deux', () => {
    expect(statesKeepingTheirAccent([...WORK_STATES], 2))
      .toEqual(['en-cours', 'rendu-suspect', 'arrete-en-route']);
  });

  it('ne rend que des etats reellement presents', () => {
    expect(statesKeepingTheirAccent(['rendu', 'rendu'])).toEqual(['rendu']);
    expect(statesKeepingTheirAccent([])).toEqual([]);
  });
});

describe('confiance binaire', () => {
  it('n\'a aucun endroit ou ecrire un pourcentage', () => {
    // Le type l'interdit ; ce test verifie qu'aucun champ numerique ne survit au
    // passage par les constructeurs.
    expect(Object.keys(confident())).toEqual(['sure']);
    expect(Object.keys(unsureAbout('a.ts')).sort()).toEqual(['about', 'sure']);
  });

  it('exige un objet des que ce n\'est pas sur', () => {
    expect(unsureAbout('  src/a.ts  ')).toEqual({ sure: false, about: 'src/a.ts' });
    expect(() => unsureAbout('   ')).toThrow(/hésitation sans objet/);
  });

  it('laisse tomber une hesitation sans objet plutot que de l\'afficher', () => {
    expect(readConfidence({ sure: false })).toBeNull();
    expect(readConfidence({ sure: false, about: '   ' })).toBeNull();
    expect(readConfidence({ sure: false, about: 42 })).toBeNull();
  });

  it('jette le pourcentage qu\'une source exterieure tenterait de faire passer', () => {
    expect(readConfidence({ sure: true, confidence: 0.87 })).toEqual({ sure: true });
    expect(readConfidence({ confidence: 0.87 })).toBeNull();
    expect(readConfidence(null)).toBeNull();
    expect(readConfidence('sure')).toBeNull();
  });

  it('accorde la phrase avec celui ou celle qui parle', () => {
    expect(confidencePhrase(confident(), 'm')).toEqual({ head: 'je suis sûr', about: null });
    expect(confidencePhrase(confident(), 'f')).toEqual({ head: 'je suis sûre', about: null });
    expect(confidencePhrase(unsureAbout('locales.ts'), 'm'))
      .toEqual({ head: 'je ne suis pas sûr', about: 'locales.ts' });
  });

  it('met l\'objet de l\'hesitation dans la deuxieme moitie de la ligne', () => {
    expect(confidenceLine(unsureAbout('locales.ts'), 'f'))
      .toBe('je ne suis pas sûre — locales.ts');
    expect(confidenceLine(confident(), 'f')).toBe('je suis sûre');
  });
});

describe('signal 1 — un reperage qui n\'a rien rapporte', () => {
  const reperage = (resultCount?: number): WorkStepFact =>
    ({ id: 's1', label: 'recherche des appels', nature: 'reperage', resultCount });

  it('declenche sur zero resultat', () => {
    const signal = emptyReconnaissance(reperage(0));
    expect(signal?.kind).toBe('reperage-vide');
    expect(signal?.fact).toContain('recherche des appels');
    expect(signal?.blindSpot).toBe(SIGNAL_BLIND_SPOTS['reperage-vide']);
  });

  it('ne declenche pas quand le reperage a rapporte quelque chose', () => {
    expect(emptyReconnaissance(reperage(3))).toBeNull();
  });

  it('cas limite — une mesure absente n\'est pas un zero', () => {
    // Regle dure du produit : un tiret n'est pas un zero. Un compte non mesure
    // ne doit pas produire un constat.
    expect(emptyReconnaissance(reperage(undefined))).toBeNull();
  });

  it('ne regarde que les etapes de reperage', () => {
    expect(emptyReconnaissance({ id: 's2', nature: 'implementation', resultCount: 0 })).toBeNull();
  });

  it('dit ce qu\'il ne voit pas', () => {
    expect(SIGNAL_BLIND_SPOTS['reperage-vide']).toMatch(/à côté de la plaque/);
  });
});

describe('signal 2 — une duree aberrante face aux voisines de meme nature', () => {
  // Le cas cite par le designer : 4 s contre 2 a 3 min.
  const voisines: WorkStepFact[] = [
    { id: 'b', nature: 'implementation', durationMs: 150_000 },
    { id: 'c', nature: 'implementation', durationMs: 170_000 },
    { id: 'd', nature: 'implementation', durationMs: 160_000 },
  ];

  it('declenche sur le cas mesure : 4 s contre 2 a 3 min', () => {
    const suspecte: WorkStepFact = { id: 'a', label: 'écriture du module', nature: 'implementation', durationMs: 4_000 };
    const signal = aberrantDuration(suspecte, [suspecte, ...voisines]);
    expect(signal?.kind).toBe('duree-aberrante');
    expect(signal?.fact).toContain('4 s');
    expect(signal?.fact).toContain('2 min 40 s');
  });

  it('ne declenche pas sur une variation ordinaire', () => {
    const normale: WorkStepFact = { id: 'a', nature: 'implementation', durationMs: 40_000 };
    expect(aberrantDuration(normale, [normale, ...voisines])).toBeNull();
  });

  it('cas limite — le seuil exact declenche, un cheveu au-dessus non', () => {
    const reference = 120_000; // mediane de trois voisines identiques
    const memeDuree: WorkStepFact[] = [
      { id: 'b', nature: 'verification', durationMs: reference },
      { id: 'c', nature: 'verification', durationMs: reference },
      { id: 'd', nature: 'verification', durationMs: reference },
    ];
    const pile: WorkStepFact = { id: 'a', nature: 'verification', durationMs: reference / ABERRANT_SHORT_RATIO };
    const juste: WorkStepFact = { id: 'a', nature: 'verification', durationMs: reference / ABERRANT_SHORT_RATIO + 1 };
    expect(aberrantDuration(pile, [pile, ...memeDuree])).not.toBeNull();
    expect(aberrantDuration(juste, [juste, ...memeDuree])).toBeNull();
  });

  it('cas limite — une seule voisine mesuree ne fait pas une mediane', () => {
    const seule: WorkStepFact = { id: 'b', nature: 'implementation', durationMs: 150_000 };
    const suspecte: WorkStepFact = { id: 'a', nature: 'implementation', durationMs: 1_000 };
    expect(MIN_MEASURED_NEIGHBOURS).toBe(2);
    expect(aberrantDuration(suspecte, [suspecte, seule])).toBeNull();
  });

  it('ignore les voisines dont la duree n\'a pas ete mesuree', () => {
    const suspecte: WorkStepFact = { id: 'a', nature: 'implementation', durationMs: 1_000 };
    const sansMesure: WorkStepFact[] = [
      { id: 'b', nature: 'implementation' },
      { id: 'c', nature: 'implementation', durationMs: 150_000 },
    ];
    expect(aberrantDuration(suspecte, [suspecte, ...sansMesure])).toBeNull();
  });

  it('ne compare pas des etapes de natures differentes', () => {
    const suspecte: WorkStepFact = { id: 'a', nature: 'reperage', durationMs: 4_000 };
    expect(aberrantDuration(suspecte, [suspecte, ...voisines])).toBeNull();
  });

  it('ne signale pas une etape beaucoup plus LONGUE : lent n\'est pas contamine', () => {
    const lente: WorkStepFact = { id: 'a', nature: 'implementation', durationMs: 4_000_000 };
    expect(aberrantDuration(lente, [lente, ...voisines])).toBeNull();
  });

  it('se tait quand toutes les voisines ont bacle pareil — son angle mort, teste', () => {
    const toutesBaclees: WorkStepFact[] = [
      { id: 'a', nature: 'implementation', durationMs: 4_000 },
      { id: 'b', nature: 'implementation', durationMs: 4_100 },
      { id: 'c', nature: 'implementation', durationMs: 3_900 },
    ];
    expect(aberrantDuration(toutesBaclees[0], toutesBaclees)).toBeNull();
    expect(SIGNAL_BLIND_SPOTS['duree-aberrante']).toMatch(/bâclé de la même façon/);
  });

  it('ne dit rien quand sa propre duree n\'a pas ete mesuree', () => {
    const sansMesure: WorkStepFact = { id: 'a', nature: 'implementation' };
    expect(aberrantDuration(sansMesure, [sansMesure, ...voisines])).toBeNull();
  });
});

describe('signal 3 — tout l\'aval repose sur un seul maillon', () => {
  it('declenche quand un seul appui porte toute la suite', () => {
    const steps: WorkStepFact[] = [
      { id: 'lecture', label: 'lecture du dossier', nature: 'reperage', hasOwnSource: true },
      { id: 'plan', nature: 'autre', consumes: ['lecture'] },
      { id: 'code', nature: 'implementation', consumes: ['plan'] },
    ];
    expect(soleLoadBearingLink(steps)).toBe('lecture');
    const signal = soleLoadBearingSignal(steps);
    expect(signal?.kind).toBe('maillon-unique');
    expect(signal?.fact).toContain('lecture du dossier');
  });

  it('ne declenche pas des qu\'un second appui independant existe', () => {
    const steps: WorkStepFact[] = [
      { id: 'lecture', nature: 'reperage', hasOwnSource: true },
      { id: 'mesure', nature: 'verification', hasOwnSource: true },
      { id: 'code', nature: 'implementation', consumes: ['lecture', 'mesure'] },
    ];
    expect(soleLoadBearingLink(steps)).toBeNull();
    expect(soleLoadBearingSignal(steps)).toBeNull();
  });

  it('cas limite — un appui sans personne en aval ne contamine rien', () => {
    const steps: WorkStepFact[] = [{ id: 'lecture', nature: 'reperage', hasOwnSource: true }];
    expect(soleLoadBearingLink(steps)).toBeNull();
  });

  it('cas limite — un cycle ne fait pas tourner la remontee indefiniment', () => {
    const steps: WorkStepFact[] = [
      { id: 'a', nature: 'autre', consumes: ['b'] },
      { id: 'b', nature: 'autre', consumes: ['a'] },
    ];
    expect(soleLoadBearingLink(steps)).toBeNull();
  });

  it('remonte une chaine, pas seulement la consommation directe', () => {
    const steps: WorkStepFact[] = [
      { id: 'source', nature: 'reperage', hasOwnSource: true },
      { id: 'relais', nature: 'autre', consumes: ['source'] },
      { id: 'fin', nature: 'verification', consumes: ['relais'] },
    ];
    expect(soleLoadBearingLink(steps)).toBe('source');
  });

  it('ne juge pas la justesse du maillon, et le dit', () => {
    expect(SIGNAL_BLIND_SPOTS['maillon-unique']).toMatch(/ne dit pas que ce maillon est faux/);
  });
});

describe('les trois signaux ensemble', () => {
  it('les rend dans un ordre stable : par etape, puis le chantier', () => {
    const steps: WorkStepFact[] = [
      { id: 'lecture', nature: 'reperage', resultCount: 0, hasOwnSource: true },
      { id: 'code', nature: 'implementation', durationMs: 2_000, consumes: ['lecture'] },
      { id: 'code2', nature: 'implementation', durationMs: 150_000, consumes: ['lecture'] },
      { id: 'code3', nature: 'implementation', durationMs: 160_000, consumes: ['lecture'] },
    ];
    expect(scanContamination(steps).map((s) => s.kind))
      .toEqual(['reperage-vide', 'duree-aberrante', 'maillon-unique']);
  });

  it('ne rend rien sur un chantier sain', () => {
    const steps: WorkStepFact[] = [
      { id: 'lecture', nature: 'reperage', resultCount: 12, hasOwnSource: true },
      { id: 'mesure', nature: 'verification', hasOwnSource: true },
      { id: 'code', nature: 'implementation', durationMs: 150_000, consumes: ['lecture', 'mesure'] },
    ];
    expect(scanContamination(steps)).toEqual([]);
  });

  it('avoue en un seul endroit ce qu\'aucun des trois n\'attrape', () => {
    expect(NO_SIGNAL_CATCHES_A_PLAUSIBLE_FALSEHOOD).toMatch(/fausse mais plausible/);
    expect(NO_SIGNAL_CATCHES_A_PLAUSIBLE_FALSEHOOD).toMatch(/jamais sa justesse/);
  });
});

describe('durees en francais', () => {
  it('formate chaque palier', () => {
    expect(formatDuration(500)).toBe("moins d'une seconde");
    expect(formatDuration(4_000)).toBe('4 s');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(150_000)).toBe('2 min 30 s');
    expect(formatDuration(3_300_000)).toBe('55 min');
    expect(formatDuration(3_600_000)).toBe('1 h');
    expect(formatDuration(3_900_000)).toBe('1 h 05');
  });

  it('rend le tiret sur une duree impossible', () => {
    expect(formatDuration(-1)).toBe(DASH);
    expect(formatDuration(Number.NaN)).toBe(DASH);
  });
});

describe('cout estime', () => {
  it('porte le mot "estime" dans le libelle, pas dans une note de bas de page', () => {
    expect(COST_LABEL).toBe('coût estimé');
    expect(formatEstimatedCost(0.42).label).toContain('estimé');
    expect(COST_IS_AN_ESTIMATE).toMatch(/estimations/);
    expect(COST_IS_AN_ESTIMATE).toMatch(/pas à payer/);
  });

  it('ne dit jamais "total depense"', () => {
    expect(COST_LABEL).not.toMatch(/dépens/i);
  });

  it('formate un montant mesure a la francaise', () => {
    const reading = formatEstimatedCost(0.42);
    expect(reading.value).toBe(`0,42${NBSP}$US`);
    expect(reading.measured).toBe(true);
    expect(reading.reason).toBeNull();
  });

  it('rend un tiret AVEC sa raison quand le moteur ne publie aucun montant', () => {
    const reading = formatEstimatedCost(undefined, 'abonnement');
    expect(reading.value).toBe(DASH);
    // La forme interdite, explicitement : jamais un zero fabrique a partir d'une
    // absence.
    expect(reading.value).not.toMatch(/0[.,]00/);
    expect(reading.measured).toBe(false);
    expect(reading.reason).toBe(SILENCE_REASON_LABELS.abonnement);
    expect(reading.reason).toMatch(/abonnement/);
  });

  it('rend un tiret sur null, NaN ou negatif', () => {
    expect(formatEstimatedCost(null).value).toBe(DASH);
    expect(formatEstimatedCost(Number.NaN).value).toBe(DASH);
    expect(formatEstimatedCost(-3).value).toBe(DASH);
    expect(formatEstimatedCost(null).reason).toBe(SILENCE_REASON_LABELS['non-rapporte']);
  });

  it('cas limite — un zero MESURE reste un zero, il n\'est pas fabrique', () => {
    const reading = formatEstimatedCost(0);
    expect(reading.measured).toBe(true);
    expect(reading.value).toBe(`0,00${NBSP}$US`);
    expect(reading.reason).toBeNull();
  });

  it('cas limite — sous le centime, le montant ne s\'ecrase pas en 0,00', () => {
    expect(formatEstimatedCost(0.003).value).toBe(`< 0,01${NBSP}$US`);
    expect(formatEstimatedCost(0.003).measured).toBe(true);
  });

  it('additionne les montants rapportes et compte les silencieux a part', () => {
    const total = totalEstimatedCost([0.5, undefined, 0.25, null]);
    expect(total.measuredUsd).toBeCloseTo(0.75, 10);
    expect(total.countedCount).toBe(2);
    expect(total.silentCount).toBe(2);
  });

  it('dit qu\'un total est partiel, au singulier comme au pluriel', () => {
    expect(partialTotalNote(totalEstimatedCost([1, 2, 3]))).toBeNull();
    expect(partialTotalNote(totalEstimatedCost([1, undefined])))
      .toBe('1 intervenant sur 2 ne publie aucun montant : ce total ne le compte pas.');
    expect(partialTotalNote(totalEstimatedCost([1, undefined, null])))
      .toBe('2 intervenants sur 3 ne publient aucun montant : ce total ne les compte pas.');
  });
});

describe('les intervenants', () => {
  it('donne un prenom aux sept qui travaillent', () => {
    const noms = PEOPLE.filter((p) => p.billed).map((p) => p.firstName);
    expect(noms).toEqual(
      expect.arrayContaining(['Winston', 'Amelia', 'Quinn', 'Barry', 'Murat', 'Carmack', 'Rachid']),
    );
  });

  it('met Hermes et BYAN a part, avec la mention', () => {
    const aPart = PEOPLE.filter((p) => !p.billed).map((p) => p.firstName);
    expect(aPart).toEqual(['Hermes', 'BYAN']);
    expect(personLabel(personNamed('Hermes'))).toBe(`Hermes — ${NOT_BILLED_NOTE}`);
    expect(personLabel(personNamed('BYAN'))).toBe(`BYAN — ${NOT_BILLED_NOTE}`);
    expect(NOT_BILLED_NOTE).toBe("n'est pas facturé");
  });

  it('n\'ajoute pas la mention a ceux qui sont comptes', () => {
    expect(personLabel(personNamed('Amelia'))).toBe('Amelia');
  });

  it('donne un prenom par defaut au relecteur adverse, marque comme en attente', () => {
    const relecteur = PEOPLE.find((p) => p.id === ADVERSE_REVIEWER_ID);
    expect(relecteur?.firstName).toBe('Cassandre');
    expect(relecteur?.billed).toBe(true);
  });

  it('retrouve la personne depuis un identifiant complet', () => {
    expect(personForSlug('architect')?.firstName).toBe('Winston');
    expect(personForSlug('bmad-bmm-architect')?.firstName).toBe('Winston');
    expect(personForSlug('  BMAD-BMM-DEV ')?.firstName).toBe('Amelia');
  });

  it('cas limite — le plus long gagne, sinon Barry devient Amelia', () => {
    // 'bmad-bmm-quick-flow-solo-dev' se termine par '-dev'. Sans la regle du
    // plus long, Barry serait attribue a Amelia.
    expect(personForSlug('bmad-bmm-quick-flow-solo-dev')?.firstName).toBe('Barry');
  });

  it('ne devine personne sur un identifiant inconnu', () => {
    expect(personForSlug('bmad-bmm-pm')).toBeNull();
    expect(personForSlug('')).toBeNull();
    expect(personForSlug(null)).toBeNull();
  });

  it('a des identifiants uniques et des prenoms uniques', () => {
    expect(new Set(PEOPLE.map((p) => p.id)).size).toBe(PEOPLE.length);
    expect(new Set(PEOPLE.map((p) => p.firstName)).size).toBe(PEOPLE.length);
  });

  it('donne a chacun un genre grammatical, sans quoi la phrase de confiance est fausse', () => {
    for (const person of PEOPLE) expect(['f', 'm']).toContain(person.gender);
    expect(confidenceLine(confident(), personNamed('Winston').gender)).toBe('je suis sûr');
    expect(confidenceLine(confident(), personNamed('Amelia').gender)).toBe('je suis sûre');
  });
});

describe('les trois profondeurs de lecture', () => {
  it('les nomme dans l\'ordre', () => {
    expect(READING_DEPTHS).toEqual(['phrase', 'bon-de-livraison', 'minute']);
    expect(READING_DEPTH_LABELS['bon-de-livraison']).toBe('ce qui a été rendu');
  });
});

describe('garde de vocabulaire — zero mot technique a l\'ecran', () => {
  // La regle qui gouverne tout le module. Ce test la rend mecanique : si
  // quelqu'un ajoute un libelle avec "agent" ou "haiku" dedans, il casse ici
  // avant d'arriver a l'ecran.
  const INTERDITS = [
    'agent', 'worker', 'haiku', 'sonnet', 'opus', 'fable',
    'token', 'workflow', 'échec', 'echec', 'failed', 'error', 'timeout',
  ];

  const visibles: string[] = [
    ...Object.values(SENIORITY_LABELS),
    UNKNOWN_SENIORITY_LABEL,
    ...WORK_STATES.map(workStateLabel),
    ...Object.values(SIGNAL_BLIND_SPOTS),
    NO_SIGNAL_CATCHES_A_PLAUSIBLE_FALSEHOOD,
    ...Object.values(SILENCE_REASON_LABELS),
    COST_LABEL,
    COST_IS_AN_ESTIMATE,
    NOT_BILLED_NOTE,
    ...PEOPLE.map((p) => p.role),
    ...PEOPLE.map(personLabel),
    ...Object.values(READING_DEPTH_LABELS),
    formatDuration(500),
    confidenceLine(confident(), 'f'),
    confidenceLine(unsureAbout('a.ts'), 'm'),
    mustSignal(emptyReconnaissance({ id: 'x', label: 'relecture', nature: 'reperage', resultCount: 0 })).fact,
    mustSignal(soleLoadBearingSignal([
      { id: 'a', label: 'lecture', nature: 'reperage', hasOwnSource: true },
      { id: 'b', nature: 'autre', consumes: ['a'] },
    ])).fact,
  ];

  it('ne laisse passer aucun mot technique dans une chaine visible', () => {
    for (const phrase of visibles) {
      for (const mot of INTERDITS) {
        expect(phrase.toLowerCase()).not.toContain(mot);
      }
    }
  });

  it('a bien quelque chose a inspecter — sinon le test ci-dessus est vide', () => {
    // Un test qui itere sur une liste vide passe toujours. Ce garde-fou empeche
    // le precedent de devenir decoratif.
    expect(visibles.length).toBeGreaterThan(30);
    expect(visibles.every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Les deux moteurs sont des intervenants a part entiere.
//
// DEFAUT VU A L'ECRAN (2026-08-05, capture) : la main levee affichait
// « intervenant non identifie » alors que l'application SAIT que le travail
// tourne sur codex. Dire qu'on ignore ce qu'on sait est pire qu'un nom
// technique : ca fait douter de tout le reste de l'ecran.
//
// Ce n'est pas une erreur de casting d'ajouter les moteurs au repertoire : en
// mode local, c'est bien EUX qui font le travail. Ils ne remplacent aucun agent
// BYAN, ils occupent une place que personne n'occupait.
// ---------------------------------------------------------------------------
describe('les moteurs locaux comme intervenants', () => {
  it('claude et codex sont reconnus par personForSlug', () => {
    expect(personForSlug('claude')?.firstName).toBe('Claude');
    expect(personForSlug('codex')?.firstName).toBe('Codex');
  });

  it('leur role dit ce qu ils font, sans mot technique', () => {
    for (const id of ['claude', 'codex']) {
      const role = personForSlug(id)?.role ?? '';
      expect(role.length).toBeGreaterThan(5);
      // Pas de jargon : la phrase doit se lire sans dictionnaire.
      expect(role).not.toMatch(/CLI|binaire|process|runtime/i);
    }
  });

  it('ils ne prennent la place d aucun agent BYAN', () => {
    // Les identifiants du repertoire restent uniques, et les agents existants
    // repondent toujours.
    const ids = PEOPLE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(personForSlug('architect')?.firstName).toBe('Winston');
    expect(personForSlug('dev')?.firstName).toBe('Amelia');
  });

  it('un identifiant complet resout toujours vers le bon agent', () => {
    // `personForSlug` accepte un nom prefixe. Ajouter 'codex' ne doit pas casser
    // cette resolution — ni capturer un nom qui finit par -codex par hasard.
    expect(personForSlug('bmad-bmm-dev')?.firstName).toBe('Amelia');
    expect(personForSlug('bmad-bmm-architect')?.firstName).toBe('Winston');
  });
});
