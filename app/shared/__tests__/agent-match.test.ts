// F1 — le matcher d'agent honnete : preuve que matchAgent() ne ment jamais.
//
// Trois choses sont prouvees ici, dans l'ordre du risque :
//   1. le scoring route juste sur des exemples simples (refactor -> dev,
//      documentation -> tech-writer, JAMAIS dev)
//   2. l'absence de fit ne bascule JAMAIS sur un agent au hasard
//   3. un agent qui matche dans le roster BYAN mais dont le slug ne se
//      resout contre AUCUN agent claude charge est rendu "unresolvable",
//      jamais "resolved" — le coeur du lot : ne pas promettre un agent qui ne
//      chargera jamais (mesure, voir app/shared/agent-slugs.ts)
//
// Le manifeste reel du depot sert de donnee de test (pas un mock) : ses
// colonnes role/identity portent des virgules et des guillemets imbriques
// dans des champs cites — exactement le cas que le mini-parseur CSV doit
// encaisser sans se tromper de colonne.

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  DOMAIN_KEYWORDS,
  FIT_THRESHOLD,
  deburr,
  matchAgent,
  matchAgents,
  matchesKeyword,
  parseCsv,
  rosterFromCsv,
  type RosterAgent,
} from '../dispatch/agent-match';

// Sous-ensemble stable du roster reel : des tests deterministes qui ne
// cassent pas au premier agent ajoute au manifeste.
const ROSTER: RosterAgent[] = [
  { name: 'analyst', displayName: 'Mary', title: 'Business Analyst', role: 'Strategic Business Analyst + Requirements Expert' },
  { name: 'architect', displayName: 'Winston', title: 'Architect', role: 'System Architect + Technical Design Leader' },
  { name: 'dev', displayName: 'Amelia', title: 'Developer Agent', role: 'Senior Software Engineer' },
  { name: 'quinn', displayName: 'Quinn', title: 'QA Engineer', role: 'QA Engineer' },
  { name: 'sm', displayName: 'Bob', title: 'Scrum Master', role: 'Technical Scrum Master + Story Preparation Specialist' },
  { name: 'tech-writer', displayName: 'Paige', title: 'Technical Writer', role: 'Technical Documentation Specialist + Knowledge Curator' },
  { name: 'ux-designer', displayName: 'Sally', title: 'UX Designer', role: 'User Experience Designer + UI Specialist' },
  { name: 'pm', displayName: 'John', title: 'Product Manager', role: 'Product Manager specializing in collaborative PRD creation' },
];

describe('deburr', () => {
  it('retire les diacritiques francais et met en minuscule', () => {
    expect(deburr('Marché Étude')).toBe('marche etude');
  });

  it('ne casse pas sur une entree absente', () => {
    expect(deburr(null)).toBe('');
    expect(deburr(undefined)).toBe('');
  });
});

describe('matchAgents — le routage juste', () => {
  it('route une refonte de module de paiement vers dev', () => {
    const result = matchAgents('il faut refactoriser le module de paiement', ROSTER);
    expect(result.fit).toBe(true);
    expect(result.best?.name).toBe('dev');
  });

  it("route une demande de documentation vers tech-writer, jamais vers dev", () => {
    const result = matchAgents("il faut documenter l'API du service", ROSTER);
    expect(result.fit).toBe(true);
    expect(result.best?.name).toBe('tech-writer');
    expect(result.candidates.some((c) => c.name === 'dev')).toBe(false);
  });

  it('ne bascule jamais sur un agent au hasard hors de tout domaine', () => {
    const result = matchAgents('achete du pain frais ce matin', ROSTER);
    expect(result.fit).toBe(false);
    expect(result.needsInterview).toBe(true);
    expect(result.best === null || (result.best?.score ?? 0) < FIT_THRESHOLD).toBe(true);
  });

  it('le seuil de fit est un nombre positif expose', () => {
    expect(FIT_THRESHOLD).toBeGreaterThan(0);
  });
});

describe('DOMAIN_KEYWORDS', () => {
  it('indexe sous le nom REEL du roster (colonne name), pas un slug claude', () => {
    // "bmad-tea-tea" est le slug .claude/agents/, mais la cle du dictionnaire
    // doit matcher agent.name ("tea") pour que scoreAgent() la trouve.
    expect(DOMAIN_KEYWORDS.tea).toBeDefined();
    expect((DOMAIN_KEYWORDS as Record<string, unknown>)['tea-tea']).toBeUndefined();
  });
});

describe('matchAgent — le verdict complet (matche PUIS resout)', () => {
  it('rend "resolved" quand le roster ET la resolution claude s alignent', () => {
    const verdict = matchAgent(
      'il faut refactoriser le module de paiement',
      ROSTER,
      ['bmad-bmm-dev', 'bmad-byan'],
    );
    expect(verdict.kind).toBe('resolved');
    if (verdict.kind === 'resolved') {
      expect(verdict.slug).toBe('bmad-bmm-dev');
      expect(verdict.best.name).toBe('dev');
    }
  });

  it('rend "unresolvable" — PAS "resolved" — quand aucun slug claude ne colle', () => {
    // Le roster BYAN dit "dev" fit, mais l'espace .claude/agents/ ne charge
    // que bmad-byan ici : proposer "dev" tel quel promettrait un agent qui ne
    // chargera jamais (mesure : `claude --agent <inconnu>` sort en 0 et
    // l'omet en silence, sans jamais le signaler).
    const verdict = matchAgent(
      'il faut refactoriser le module de paiement',
      ROSTER,
      ['bmad-byan'],
    );
    expect(verdict.kind).toBe('unresolvable');
    expect(verdict.kind).not.toBe('resolved');
    if (verdict.kind === 'unresolvable') {
      expect(verdict.best.name).toBe('dev');
      expect(verdict.recommendation).toMatch(/ne chargera jamais|aucun agent claude/i);
    }
  });

  it('rend "no-fit" hors de tout domaine, sans jamais proposer un agent', () => {
    const verdict = matchAgent('achete du pain frais ce matin', ROSTER, ['bmad-bmm-dev']);
    expect(verdict.kind).toBe('no-fit');
    if (verdict.kind === 'no-fit') {
      expect(verdict.recommendation).toMatch(/interview/i);
    }
  });

  it('meme roster vide -> "no-fit", jamais une exception', () => {
    expect(() => matchAgent('n importe quoi', [], [])).not.toThrow();
    expect(matchAgent('n importe quoi', [], []).kind).toBe('no-fit');
  });
});

describe('parseCsv / rosterFromCsv — le manifeste reel du depot', () => {
  const manifestPath = path.join(__dirname, '..', '..', '..', '_byan', '_config', 'agent-manifest.csv');

  it('lit le manifeste reel sans lever d exception', () => {
    const text = fs.readFileSync(manifestPath, 'utf8');
    expect(() => rosterFromCsv(text)).not.toThrow();
  });

  it('porte les virgules et guillemets imbriques des colonnes identity/principles', () => {
    const text = fs.readFileSync(manifestPath, 'utf8');
    const roster = rosterFromCsv(text);
    expect(roster.length).toBeGreaterThan(10);

    const dev = roster.find((a) => a.name === 'dev');
    expect(dev?.title).toBe('Developer Agent');

    // La colonne "identity" de la ligne "analyst" porte une virgule imbriquee
    // dans un champ cite ("...market research, competitive analysis, and
    // requirements elicitation..."). rosterFromCsv() ne garde pas cette
    // colonne, mais parseCsv() doit la traverser SANS s'y arreter : sinon la
    // ligne entiere se decale d'une colonne et "role"/"title" se corrompent.
    const rows = parseCsv(text);
    const header = rows[0];
    const iName = header.indexOf('name');
    const iIdentity = header.indexOf('identity');
    const analystRow = rows.find((r) => r[iName] === 'analyst');
    expect(analystRow?.[iIdentity]).toContain(',');
    expect(analystRow?.[iIdentity]?.length ?? 0).toBeGreaterThan(20);
  });

  it('gere les guillemets doubles echappes et les champs avec virgule', () => {
    const csv = 'name,displayName,title,role\n"quo""te","D","T","R, avec virgule"\n';
    expect(rosterFromCsv(csv)).toEqual([
      { name: 'quo"te', displayName: 'D', title: 'T', role: 'R, avec virgule' },
    ]);
  });

  it('ignore les lignes sans name et rend [] sur un texte vide', () => {
    expect(rosterFromCsv('')).toEqual([]);
    const csv = 'name,title\n,\n"dev","Developer Agent"\n';
    expect(rosterFromCsv(csv)).toEqual([{ name: 'dev', displayName: '', title: 'Developer Agent', role: '' }]);
  });
});

// ---------------------------------------------------------------------------
// La frontiere de mot a gauche — le defaut mesure le 2026-08-07
// ---------------------------------------------------------------------------
//
// Avant, le score se faisait sur une sous-chaine brute. Deux phrases reelles,
// tapees dans le chat, proposaient un specialiste sans rapport :
//   "tu peux me lister le dossier src"   -> "peux" contient "ux"  -> agent UX
//   "deploie la version en production"   -> "production" contient "product"
// Un mauvais agent propose est pire qu'aucun : il donne l'air de comprendre en
// se trompant, et l'utilisateur ne sait pas pourquoi.
describe('un mot-cle doit COMMENCER un mot', () => {
  it('ne trouve plus "ux" au milieu de "peux"', () => {
    const r = matchAgents('tu peux me lister ce quil y a dans le dossier src', ROSTER);
    expect(r.candidates.map((c) => c.name)).not.toContain('ux-designer');
  });

  it('ne trouve pas "ci" au milieu de "merci" ni "ceci"', () => {
    const r = matchAgents('merci, ceci est un simple bonjour', ROSTER);
    expect(r.candidates.map((c) => c.name)).not.toContain('tea');
  });

  it('mais garde le comportement de RACINE : "documente" attrape "documenter"', () => {
    // Sans cette moitie de la regle, la liste francaise ne sert a rien : le meme
    // verbe y a cinq terminaisons.
    const r = matchAgents("il faut documenter l'API du service", ROSTER);
    expect(r.best?.name).toBe('tech-writer');
  });

  it('trouve un mot-cle en debut de phrase comme au milieu', () => {
    expect(matchesKeyword('refactorise le module', 'refactor')).toBe(true);
    expect(matchesKeyword('il faut refactoriser ca', 'refactor')).toBe(true);
    expect(matchesKeyword('prerefactor nest pas un debut de mot', 'refactor')).toBe(false);
  });

  it("laisse passer un mot-cle de plusieurs mots par sous-chaine", () => {
    // Sa longueur le protege : pas besoin d'une frontiere, et l'exiger casserait
    // les variantes d'espacement.
    expect(matchesKeyword('je veux creer un agent pour ca', 'creer un agent')).toBe(true);
  });
});
