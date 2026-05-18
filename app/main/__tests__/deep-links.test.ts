import { describe, expect, it } from 'vitest';
import { findDeepLinkInArgv, parseDeepLink } from '../deep-links';

describe('parseDeepLink', () => {
  it('returns null for non-string input', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink(undefined)).toBeNull();
    expect(parseDeepLink(42)).toBeNull();
    expect(parseDeepLink('')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(parseDeepLink('not a url')).toBeNull();
    expect(parseDeepLink('://broken')).toBeNull();
  });

  it('returns null for the wrong scheme', () => {
    expect(parseDeepLink('https://example.com')).toBeNull();
    expect(parseDeepLink('vscode://foo')).toBeNull();
  });

  it('parses byan://project/<id>', () => {
    const link = parseDeepLink('byan://project/abc-123');
    expect(link).toMatchObject({ kind: 'project', id: 'abc-123' });
  });

  it('parses byan://chat/<conv-id>', () => {
    const link = parseDeepLink('byan://chat/conv-42');
    expect(link).toMatchObject({ kind: 'chat', id: 'conv-42' });
  });

  it('parses byan://agent/<slug>', () => {
    const link = parseDeepLink('byan://agent/winston');
    expect(link).toMatchObject({ kind: 'agent', id: 'winston' });
  });

  it('parses byan://settings (no id)', () => {
    const link = parseDeepLink('byan://settings');
    expect(link).toMatchObject({ kind: 'settings' });
    expect(link?.id).toBeUndefined();
  });

  it('captures query params', () => {
    const link = parseDeepLink('byan://project/abc?ref=email&utm=launch');
    expect(link).toMatchObject({
      kind: 'project',
      id: 'abc',
      params: { ref: 'email', utm: 'launch' },
    });
  });

  it('returns kind=unknown for an unrecognized host', () => {
    const link = parseDeepLink('byan://wat');
    expect(link).toMatchObject({ kind: 'unknown' });
  });

  it('returns kind=unknown when a known host has no id', () => {
    // byan://project (no id segment) — we cannot route it.
    const link = parseDeepLink('byan://project');
    expect(link).toMatchObject({ kind: 'unknown' });
  });

  it('preserves the original URL in raw', () => {
    const raw = 'byan://chat/abc?x=1';
    expect(parseDeepLink(raw)?.raw).toBe(raw);
  });
});

describe('findDeepLinkInArgv', () => {
  it('finds the URL when present', () => {
    const argv = ['/usr/bin/electron', '/app', 'byan://chat/abc'];
    expect(findDeepLinkInArgv(argv)).toBe('byan://chat/abc');
  });

  it('returns null when absent', () => {
    const argv = ['/usr/bin/electron', '/app'];
    expect(findDeepLinkInArgv(argv)).toBeNull();
  });

  it('matches the scheme case-insensitively', () => {
    expect(findDeepLinkInArgv(['BYAN://project/foo'])).toBe('BYAN://project/foo');
  });

  it('returns null on empty argv', () => {
    expect(findDeepLinkInArgv([])).toBeNull();
  });
});
