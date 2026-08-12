// suitability-store.test.ts — LOT L7. Disque du registre de suitability :
// GLOBAL a la machine via BYAN_HOME (~/.byan/suitability.json), meme patron
// que projects-registry.test.ts (F6). Lecture DEFENSIVE (fichier absent ou
// corrompu -> registre vide, jamais une exception), ecriture qui ne fait
// jamais planter l-appelant.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ledgerPath, readLedger, record, readReport } from '../suitability-store';

let home: string;
const origHome = process.env.BYAN_HOME;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-suitability-'));
  process.env.BYAN_HOME = home;
});

afterEach(() => {
  if (origHome === undefined) delete process.env.BYAN_HOME;
  else process.env.BYAN_HOME = origHome;
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('ledgerPath()', () => {
  it('resout ~/.byan/suitability.json sous BYAN_HOME', () => {
    expect(ledgerPath()).toBe(path.join(home, '.byan', 'suitability.json'));
  });
});

describe('readLedger(): lecture defensive', () => {
  it('rend un registre vide quand le fichier est absent — jamais une exception', () => {
    expect(() => readLedger()).not.toThrow();
    expect(readLedger()).toEqual({});
  });

  it('rend un registre vide quand le fichier est corrompu', () => {
    fs.mkdirSync(path.join(home, '.byan'), { recursive: true });
    fs.writeFileSync(ledgerPath(), '{ not json', 'utf8');
    expect(readLedger()).toEqual({});
  });

  it("rend un registre vide quand le contenu n-est pas un objet simple (tableau, ou primitif)", () => {
    fs.mkdirSync(path.join(home, '.byan'), { recursive: true });
    fs.writeFileSync(ledgerPath(), '[1,2,3]', 'utf8');
    expect(readLedger()).toEqual({});
    fs.writeFileSync(ledgerPath(), '"juste une chaine"', 'utf8');
    expect(readLedger()).toEqual({});
  });
});

describe('record(): ecrit sur disque, ne leve jamais', () => {
  it('enregistre une observation reussie et persiste sur disque', () => {
    const result = record({ model: 'haiku', taskKind: 'resume-court', success: true });
    expect(result.recorded).toBe(true);
    if (result.recorded) {
      expect(result.rating.n).toBe(1);
      expect(result.rating.successes).toBe(1);
    }

    const onDisk = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8'));
    expect(onDisk['haiku::resume-court'].successes).toBe(1);
  });

  it('accumule les observations successives pour la meme paire', () => {
    record({ model: 'haiku', taskKind: 'resume-court', success: true });
    record({ model: 'haiku', taskKind: 'resume-court', success: true });
    const result = record({ model: 'haiku', taskKind: 'resume-court', success: false });
    expect(result.recorded).toBe(true);
    if (result.recorded) {
      expect(result.rating.n).toBe(3);
      expect(result.rating.successes).toBe(2);
      expect(result.rating.failures).toBe(1);
    }
  });

  it("rend recorded:false, reason:'invalid_input' sur une entree malformee, sans ecrire", () => {
    const result = record({ model: '', taskKind: 'x', success: true });
    expect(result.recorded).toBe(false);
    if (!result.recorded) expect(result.reason).toBe('invalid_input');
    expect(fs.existsSync(ledgerPath())).toBe(false);
  });

  it("une note fondee sur peu d-observations le DIT (n bas, verdict watch) — jamais presentee comme acquise", () => {
    const result = record({ model: 'haiku', taskKind: 'gros-diff', success: true });
    expect(result.recorded).toBe(true);
    if (result.recorded) {
      expect(result.rating.n).toBe(1);
      expect(result.rating.verdict).toBe('watch');
      expect(result.rating.lower).toBeLessThan(0.85); // sous keepThreshold malgre 100% de succes affiches
    }
  });

  it("rend recorded:false, reason:'persist_failed' quand l-ecriture disque echoue, sans planter l-appelant", () => {
    // Place un FICHIER (pas un dossier) a l-emplacement ou le registre
    // attend un dossier : mkdirSync(dirname, {recursive:true}) echoue alors
    // avec ENOTDIR, ce qui simule une ecriture disque qui echoue reellement,
    // sans mock de fs.
    fs.writeFileSync(path.join(home, '.byan'), 'ceci est un fichier, pas un dossier', 'utf8');

    expect(() => record({ model: 'haiku', taskKind: 'x', success: true })).not.toThrow();
    const result = record({ model: 'haiku', taskKind: 'x', success: true });
    expect(result.recorded).toBe(false);
    if (!result.recorded) {
      expect(result.reason).toBe('persist_failed');
      // La note reflete le registre D-AVANT l-ecriture ratee : jamais une
      // mise a jour fantome que l-appelant croirait persistee.
      expect(result.rating.n).toBe(0);
    }
  });
});

describe('readReport(): lecture seule, severite en tete', () => {
  it('liste chaque paire observee, filtrable par modele', () => {
    for (let i = 0; i < 30; i++) record({ model: 'haiku', taskKind: 'tache-sure', success: true });
    for (let i = 0; i < 20; i++) record({ model: 'haiku', taskKind: 'tache-a-risque', success: false });
    record({ model: 'sonnet', taskKind: 'tache-sure', success: true });

    const all = readReport();
    expect(all.length).toBe(3);
    expect(all[0].verdict).toBe('demote'); // le plus actionnable d-abord

    const haikuOnly = readReport('haiku');
    expect(haikuOnly.length).toBe(2);
    expect(haikuOnly.every((r) => r.model === 'haiku')).toBe(true);
  });

  it('rend un tableau vide quand aucune observation n-existe encore', () => {
    expect(readReport()).toEqual([]);
  });
});
