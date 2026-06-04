const path = require('path');
const fs = require('fs');
const os = require('os');
const resolver = require('../../../src/byan-v2/generation/scope-resolver');

const MAP = {
  moduleScopes: {
    bmm: ['universal', 'sdlc-process', 'sdlc-code', 'sdlc-modeling', 'sdlc-test'],
    cis: ['universal'],
  },
  agentScopes: {
    dev: ['universal', 'sdlc-code', 'sdlc-test'],
    'ux-designer': ['universal', 'sdlc-process'],
    brainstorming: ['universal'],
  },
};

describe('scope-resolver', () => {
  describe('resolveAgentScopes precedence', () => {
    test('explicit frontmatter mantra_scopes wins over everything', () => {
      const content = 'name: dev\nmantra_scopes: [universal, sdlc-modeling]\n_byan/bmm/config.yaml';
      const scopes = resolver.resolveAgentScopes({ name: 'dev', content, map: MAP });
      expect(scopes).toEqual(['universal', 'sdlc-modeling']);
    });

    test('agentScopes map used when no frontmatter override', () => {
      const content = 'loads _byan/bmm/config.yaml during activation';
      const scopes = resolver.resolveAgentScopes({ name: 'dev', content, map: MAP });
      expect(scopes).toEqual(['universal', 'sdlc-code', 'sdlc-test']);
    });

    test('module-derived when agent name is unknown', () => {
      const content = 'some persona that loads _byan/cis/config.yaml';
      const scopes = resolver.resolveAgentScopes({ name: 'unknown-agent', content, map: MAP });
      expect(scopes).toEqual(['universal']);
    });

    test('module-derived bmm gives all five scopes', () => {
      const content = 'loads _byan/bmm/config.yaml';
      const scopes = resolver.resolveAgentScopes({ name: 'no-map-entry', content, map: MAP });
      expect(scopes).toEqual(['universal', 'sdlc-process', 'sdlc-code', 'sdlc-modeling', 'sdlc-test']);
    });

    test('fallback to universal-only when nothing resolves', () => {
      const scopes = resolver.resolveAgentScopes({ name: 'orphan', content: 'no module reference', map: MAP });
      expect(scopes).toEqual(['universal']);
    });
  });

  describe('invariants', () => {
    test('universal is always present even if a map omits it', () => {
      const map = { agentScopes: { weird: ['sdlc-code'] } };
      const scopes = resolver.resolveAgentScopes({ name: 'weird', content: '', map });
      expect(scopes[0]).toBe('universal');
      expect(scopes).toContain('sdlc-code');
    });

    test('unknown scope names are filtered out', () => {
      const content = 'mantra_scopes: [universal, bogus-scope, sdlc-test]';
      const scopes = resolver.resolveAgentScopes({ content, map: MAP });
      expect(scopes).toEqual(['universal', 'sdlc-test']);
    });

    test('no duplicate scopes', () => {
      const content = 'mantra_scopes: [universal, sdlc-code, sdlc-code, universal]';
      const scopes = resolver.resolveAgentScopes({ content, map: MAP });
      expect(scopes).toEqual(['universal', 'sdlc-code']);
    });
  });

  describe('helpers', () => {
    test('deriveModule extracts the module from a config load line', () => {
      expect(resolver.deriveModule('x _byan/tea/config.yaml y')).toBe('tea');
      expect(resolver.deriveModule('no module here')).toBeNull();
    });

    test('parseFrontmatterScopes reads the list or returns null', () => {
      expect(resolver.parseFrontmatterScopes('mantra_scopes: [a, b]')).toEqual(['a', 'b']);
      expect(resolver.parseFrontmatterScopes('nothing here')).toBeNull();
    });

    test('agentNameFromPath strips dir and extension', () => {
      expect(resolver.agentNameFromPath('/x/_byan/agent/dev/dev.md')).toBe('dev');
      expect(resolver.agentNameFromPath('.github/agents/hermes.md')).toBe('hermes');
    });
  });

  describe('real shipped map', () => {
    test('the shipped agent-scopes.json loads and is well-formed', () => {
      const map = resolver.loadScopeMap();
      expect(map.moduleScopes).toBeDefined();
      expect(map.agentScopes.dev).toEqual(['universal', 'sdlc-code', 'sdlc-test']);
      // every scope in the map is a known scope name
      const all = [
        ...Object.values(map.moduleScopes).flat(),
        ...Object.values(map.agentScopes).flat(),
      ];
      all.forEach(s => expect(resolver.VALID_SCOPES).toContain(s));
    });
  });

  describe('resolveScopesForFile', () => {
    test('reads a persona file and resolves its scopes', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-'));
      const file = path.join(dir, 'dev.md');
      fs.writeFileSync(file, 'name: dev\nloads _byan/bmm/config.yaml');
      const scopes = resolver.resolveScopesForFile(file);
      expect(scopes).toEqual(['universal', 'sdlc-code', 'sdlc-test']);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});
