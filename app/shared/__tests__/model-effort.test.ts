// model-effort — la matrice modele x effort cote codex, mesuree et pas
// supposee. Ces tests verrouillent : (a) une paire refusee cote API l'est
// AVANT le lancement, (b) une paire acceptee passe, (c) le repli sur un
// modele inconnu se signale au lieu d'echouer, et (d) les deux listes
// dupliquees dans model-effort.ts (pour eviter un cycle d'import avec
// engine-options.ts) ne dérivent pas de leur source.

import { describe, expect, it } from 'vitest';
import {
  effortsForModel,
  isValidEffortForModel,
  resolveEffort,
  listedCodexModels,
  allKnownCodexModels,
} from '../dispatch/model-effort';
import { REASONING_EFFORTS, effortsFor, MODEL_PRESETS, isValidModelFor } from '../engine-options';

describe('effortsForModel — codex, la matrice mesuree', () => {
  it('gpt-5.4 refuse max (catalogue: low, medium, high, xhigh seulement)', () => {
    const { efforts, source } = effortsForModel('codex', 'gpt-5.4');
    expect(efforts).not.toContain('max');
    expect(efforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(source).toBe('catalog');
  });

  it('gpt-5.6-sol accepte max (mesure directe)', () => {
    const { efforts, source } = effortsForModel('codex', 'gpt-5.6-sol');
    expect(efforts).toContain('max');
    expect(source).toBe('measured');
  });

  it("minimal est refusee sur gpt-5.6-sol — mesure du 2026-08-05 contre l'API", () => {
    const { efforts } = effortsForModel('codex', 'gpt-5.6-sol');
    expect(efforts).not.toContain('minimal');
    // et 'none' EST accepte malgre son absence du catalogue produit —
    // exactement la contradiction No.2 documentee en tete de module.
    expect(efforts).toContain('none');
  });

  it("ultra n'apparait jamais, meme sur les modeles qui l'annoncent au catalogue", () => {
    // gpt-5.6-sol, gpt-5.6-sol-wm et gpt-5.6-terra annoncent 'ultra' au
    // catalogue (`codex debug models`) ; l'API ne le connait pas
    // (invalid_enum_value ne le liste pas). La plus restrictive gagne.
    for (const model of ['gpt-5.6-sol', 'gpt-5.6-sol-wm', 'gpt-5.6-terra']) {
      const { efforts } = effortsForModel('codex', model);
      expect(efforts, model).not.toContain('ultra' as never);
    }
  });

  it('un modele codex inconnu retombe sur le domaine du moteur et le SIGNALE', () => {
    const info = effortsForModel('codex', 'gpt-9.9-invente');
    expect(info.source).toBe('engine-fallback');
    expect(info.note).toBeTruthy();
    expect(info.note).toMatch(/gpt-9\.9-invente/);
    // Le domaine de repli doit rester celui, connu, du moteur codex.
    expect([...info.efforts]).toEqual([...effortsFor('codex')]);
  });

  it('aucun modele fourni cote codex retombe aussi sur le domaine du moteur, signale', () => {
    const info = effortsForModel('codex');
    expect(info.source).toBe('engine-fallback');
    expect(info.note).toBeTruthy();
  });

  it('claude ne porte pas de matrice par modele : le domaine entier, marque engine-domain', () => {
    const info = effortsForModel('claude', 'opus');
    expect(info.source).toBe('engine-domain');
    expect([...info.efforts]).toEqual([...effortsFor('claude')]);
  });
});

describe('isValidEffortForModel — la garde AVANT le lancement', () => {
  it('rejette (gpt-5.4, max)', () => {
    expect(isValidEffortForModel('codex', 'gpt-5.4', 'max')).toBe(false);
  });

  it('accepte (gpt-5.6-sol, max)', () => {
    expect(isValidEffortForModel('codex', 'gpt-5.6-sol', 'max')).toBe(true);
  });

  it('rejette (gpt-5.6-sol, minimal)', () => {
    expect(isValidEffortForModel('codex', 'gpt-5.6-sol', 'minimal')).toBe(false);
  });

  it('rejette un effort non-string sans lever', () => {
    expect(isValidEffortForModel('codex', 'gpt-5.4', undefined)).toBe(false);
    expect(isValidEffortForModel('codex', 'gpt-5.4', 42)).toBe(false);
  });
});

describe('resolveEffort — le recalage', () => {
  it('laisse passer une valeur deja valide, sans la marquer clampee', () => {
    const r = resolveEffort('codex', 'gpt-5.6-sol', 'max');
    expect(r).toMatchObject({ effort: 'max', requested: 'max', wasClamped: false, source: 'measured' });
  });

  it('recale gpt-5.4 + max vers le plafond reel du modele (xhigh), jamais au-dessus', () => {
    const r = resolveEffort('codex', 'gpt-5.4', 'max');
    expect(r.wasClamped).toBe(true);
    expect(r.effort).toBe('xhigh');
    // Le rang de la valeur rendue ne doit jamais depasser celui du plafond du modele.
    expect(['low', 'medium', 'high', 'xhigh']).toContain(r.effort);
  });

  it('recale gpt-5.6-sol + minimal vers le plancher atteignable (none), faute de mieux en dessous', () => {
    const r = resolveEffort('codex', 'gpt-5.6-sol', 'minimal');
    expect(r.wasClamped).toBe(true);
    expect(r.effort).toBe('none');
  });

  it('recale un modele inconnu sur le domaine de repli du moteur, en le signalant', () => {
    const r = resolveEffort('codex', 'gpt-9.9-invente', 'max');
    // 'max' appartient au domaine de repli codex (CODEX_ENGINE_DOMAIN) donc
    // aucun recalage n'est necessaire ici — seule la source doit le dire.
    expect(r.wasClamped).toBe(false);
    expect(r.source).toBe('engine-fallback');
    expect(r.note).toBeTruthy();
  });
});

describe('listedCodexModels / allKnownCodexModels', () => {
  it('exclut les modeles marques visibility=hide au catalogue', () => {
    const listed = listedCodexModels();
    expect(listed).not.toContain('gpt-5.6-sol-wm');
    expect(listed).not.toContain('codex-auto-review');
    expect(listed).toContain('gpt-5.6-sol');
    expect(listed.length).toBe(7);
  });

  it('allKnownCodexModels porte les 9 modeles, hide inclus', () => {
    const all = allKnownCodexModels();
    expect(all).toContain('gpt-5.6-sol-wm');
    expect(all).toContain('codex-auto-review');
    expect(all.length).toBe(9);
  });
});

describe('garde anti-derive — les copies locales de model-effort.ts contre leur source', () => {
  // model-effort.ts duplique deux listes d'engine-options.ts (pour eviter un
  // cycle d'import : engine-options.ts importe CE module). Ce test attrape
  // toute derive silencieuse entre les deux.
  it("le domaine de repli codex egale exactement engine-options.ts:effortsFor('codex')", () => {
    const { efforts } = effortsForModel('codex', 'un-modele-qui-n-existe-pas');
    expect([...efforts]).toEqual([...effortsFor('codex')]);
  });

  it("le domaine claude egale exactement engine-options.ts:effortsFor('claude')", () => {
    const { efforts } = effortsForModel('claude');
    expect([...efforts]).toEqual([...effortsFor('claude')]);
  });

  it("l'ordre total interne (EFFORT_ORDER) couvre exactement REASONING_EFFORTS", () => {
    // Prouve indirectement : demander le plus haut effort du monde ('ultracode')
    // sur un modele qui ne le connait pas doit recaler vers SON plafond a lui,
    // jamais planter faute de rang connu pour une des 8 valeurs.
    for (const e of REASONING_EFFORTS) {
      expect(() => resolveEffort('codex', 'gpt-5.4', e)).not.toThrow();
      expect(() => resolveEffort('claude', undefined, e)).not.toThrow();
    }
  });
});

describe("integration engine-options.ts:effortsFor — sensible au modele, retro-compatible", () => {
  it("effortsFor('claude') SANS modele rend exactement les six valeurs actuelles (non-regression)", () => {
    expect([...effortsFor('claude')]).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']);
  });

  it("effortsFor('codex', 'gpt-5.4') ne rend PAS le domaine generique du moteur", () => {
    const generic = effortsFor('codex');
    const perModel = effortsFor('codex', 'gpt-5.4');
    expect(perModel).not.toEqual(generic);
    expect(perModel).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it("effortsFor('codex', 'gpt-5.6-sol') inclut max, effortsFor('codex', 'gpt-5.4') non", () => {
    expect(effortsFor('codex', 'gpt-5.6-sol')).toContain('max');
    expect(effortsFor('codex', 'gpt-5.4')).not.toContain('max');
  });

  it('MODEL_PRESETS.codex expose les modeles reels du catalogue, pas seulement gpt-5.6-sol', () => {
    const values = MODEL_PRESETS.codex.map((p) => p.value);
    expect(values.length).toBeGreaterThan(1);
    expect(values).toEqual(listedCodexModels() as string[]);
    // Aucun preset expose n'est un modele visibility=hide.
    expect(values).not.toContain('gpt-5.6-sol-wm');
    expect(values).not.toContain('codex-auto-review');
    for (const v of values) {
      expect(isValidModelFor('codex', v), v).toBe(true);
    }
  });
});
