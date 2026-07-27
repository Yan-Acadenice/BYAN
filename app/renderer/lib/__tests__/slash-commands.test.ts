import { describe, expect, it } from 'vitest';
import {
  LOCAL_SLASH_COMMANDS,
  matchCommands,
  parseSlashInput,
} from '../slash-commands';

describe('matchCommands', () => {
  it('surfaces /model on a partial prefix', () => {
    const hits = matchCommands('/mo', { engine: 'codex' });
    expect(hits.map((c) => c.cmd)).toContain('/model');
  });

  it('offers every command for a bare slash', () => {
    const hits = matchCommands('/', { engine: 'codex' });
    expect(hits.length).toBe(LOCAL_SLASH_COMMANDS.length);
  });

  it('drops /effort for claude and keeps it for codex', () => {
    expect(matchCommands('/eff', { engine: 'claude' })).toEqual([]);
    expect(matchCommands('/eff', { engine: 'codex' }).map((c) => c.cmd)).toEqual(['/effort']);
  });

  it('returns nothing for an empty or non-slash input', () => {
    expect(matchCommands('', { engine: 'codex' })).toEqual([]);
    expect(matchCommands('bonjour', { engine: 'codex' })).toEqual([]);
  });

  it('closes once the argument starts (a space prefixes no command)', () => {
    expect(matchCommands('/model ', { engine: 'codex' })).toEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(matchCommands('/MO', { engine: 'codex' }).map((c) => c.cmd)).toContain('/model');
  });
});

describe('parseSlashInput', () => {
  it('classifies a typo as unknown, never as a plain message', () => {
    const parsed = parseSlashInput('/modle x');
    expect(parsed.kind).toBe('unknown');
    expect(parsed).toMatchObject({ cmd: '/modle' });
  });

  it('classifies ordinary text as not-slash', () => {
    expect(parseSlashInput('bonjour')).toEqual({ kind: 'not-slash' });
  });

  it('splits the command from its argument', () => {
    const parsed = parseSlashInput('/model opus');
    expect(parsed.kind).toBe('command');
    expect(parsed).toMatchObject({ cmd: '/model', arg: 'opus' });
  });

  it('yields an empty arg for a bare command', () => {
    expect(parseSlashInput('/new')).toMatchObject({ kind: 'command', cmd: '/new', arg: '' });
  });

  it('resolves a codex-only command whatever the engine, so the host can explain', () => {
    expect(parseSlashInput('/effort high')).toMatchObject({ kind: 'command', cmd: '/effort', arg: 'high' });
  });
});
