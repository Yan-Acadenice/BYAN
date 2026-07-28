// session-facts — the wording of the two temporalities, tested pure.
//
// These sentences are the substance of the divergence line, so they are pinned as
// LITERALS rather than re-derived from the module's own expressions: a test that
// rebuilds the sentence the same way the code does would still pass with the
// behaviour deleted.

import { describe, it, expect } from 'vitest';
import { divergenceLines, folderLabel, openForLabel, pluralS } from '../session-facts';

const LIVE_CLAUDE = { engine: 'claude' as const, model: null, agent: null, folder: '/home/yan/monprojet' };
const NEXT_CLAUDE = { engine: 'claude' as const, model: null, agent: null, folder: '/home/yan/monprojet' };

describe('folderLabel', () => {
  it('keeps the last segment of a path', () => {
    expect(folderLabel('/home/yan/monprojet')).toBe('monprojet');
    expect(folderLabel('/home/yan/monprojet/')).toBe('monprojet');
    expect(folderLabel('C:\\Users\\yan\\monprojet')).toBe('monprojet');
  });

  it('falls back to the whole string when there is no segment to take', () => {
    expect(folderLabel('monprojet')).toBe('monprojet');
    expect(folderLabel('/')).toBe('/');
  });
});

describe('pluralS', () => {
  it('marks the plural from two on, French rules', () => {
    expect(pluralS(0)).toBe('');
    expect(pluralS(1)).toBe('');
    expect(pluralS(2)).toBe('s');
  });
});

describe('openForLabel', () => {
  it('does not claim a minute it has not counted', () => {
    expect(openForLabel(0)).toBe('ouverte depuis moins d\'une minute');
    expect(openForLabel(59)).toBe('ouverte depuis moins d\'une minute');
  });

  it('counts minutes, then hours', () => {
    expect(openForLabel(60)).toBe('ouverte depuis 1 min');
    expect(openForLabel(125)).toBe('ouverte depuis 2 min');
    expect(openForLabel(3600)).toBe('ouverte depuis 1 h');
    expect(openForLabel(3600 + 125)).toBe('ouverte depuis 1 h 2 min');
  });
});

describe('divergenceLines', () => {
  it('says nothing when the selection and the live session agree', () => {
    expect(divergenceLines(LIVE_CLAUDE, NEXT_CLAUDE)).toEqual([]);
  });

  it('names BOTH sides of an engine divergence', () => {
    const lines = divergenceLines(
      { ...LIVE_CLAUDE, engine: 'codex' },
      { ...NEXT_CLAUDE, engine: 'claude' },
    );
    expect(lines).toEqual([
      'Le moteur claude est choisi. Il s\'appliquera au prochain démarrage '
      + '— la conversation en cours tourne toujours sur codex.',
    ]);
  });

  it('names the CLI default rather than leaving a hole when no model was pinned', () => {
    const lines = divergenceLines(LIVE_CLAUDE, { ...NEXT_CLAUDE, model: 'opus' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Le modèle opus est choisi');
    expect(lines[0]).toContain('le modèle par défaut du CLI');
  });

  it('compares a model against a model when both are pinned', () => {
    const lines = divergenceLines(
      { ...LIVE_CLAUDE, model: 'sonnet' },
      { ...NEXT_CLAUDE, model: 'opus' },
    );
    expect(lines[0]).toContain('tourne sur sonnet');
  });

  it('reports NO divergence when the next model is unset', () => {
    // An unset choice means "let the CLI decide", which is not something the user
    // picked and therefore not something that can be waiting to take effect.
    expect(divergenceLines({ ...LIVE_CLAUDE, model: 'sonnet' }, NEXT_CLAUDE)).toEqual([]);
  });

  it('says "sans agent" instead of printing a null', () => {
    const lines = divergenceLines(LIVE_CLAUDE, { ...NEXT_CLAUDE, agent: 'bmad-byan' });
    expect(lines[0]).toContain('L\'agent bmad-byan est choisi');
    expect(lines[0]).toContain('tourne sans agent');
    expect(lines[0]).not.toContain('null');
  });

  it('names the running agent when there is one', () => {
    const lines = divergenceLines(
      { ...LIVE_CLAUDE, agent: 'bmad-bmm-dev' },
      { ...NEXT_CLAUDE, agent: 'bmad-byan' },
    );
    expect(lines[0]).toContain('avec l\'agent bmad-bmm-dev');
  });

  it('compares folders by their last segment, both sides', () => {
    const lines = divergenceLines(LIVE_CLAUDE, { ...NEXT_CLAUDE, folder: '/home/yan/autre' });
    expect(lines[0]).toContain('Le dossier autre est choisi');
    expect(lines[0]).toContain('travaille dans monprojet');
  });

  it('stays silent on the folder when the live one is unknown', () => {
    // "travaille dans null" would invent a fact to fill a hole.
    const lines = divergenceLines(
      { ...LIVE_CLAUDE, folder: null },
      { ...NEXT_CLAUDE, folder: '/home/yan/autre' },
    );
    expect(lines).toEqual([]);
  });

  it('reports every diverging setting, in a stable order', () => {
    const lines = divergenceLines(
      { engine: 'claude', model: 'sonnet', agent: null, folder: '/home/yan/a' },
      { engine: 'codex', model: 'gpt-5.6-sol', agent: 'bmad-byan', folder: '/home/yan/b' },
    );
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('Le moteur codex');
    expect(lines[1]).toContain('Le modèle gpt-5.6-sol');
    expect(lines[2]).toContain('L\'agent bmad-byan');
    expect(lines[3]).toContain('Le dossier b');
  });
});
