const { stripApiSuffix, buildAuthHeader } = require('../lib/url-utils');

describe('url-utils', () => {
  describe('stripApiSuffix', () => {
    test('strips trailing /api', () => {
      expect(stripApiSuffix('http://localhost:3737/api')).toBe('http://localhost:3737');
    });

    test('strips trailing /api/', () => {
      expect(stripApiSuffix('http://localhost:3737/api/')).toBe('http://localhost:3737');
    });

    test('strips trailing /api/v1', () => {
      expect(stripApiSuffix('https://byan.example.com/api/v1')).toBe('https://byan.example.com');
    });

    test('strips trailing /api/v2/', () => {
      expect(stripApiSuffix('https://byan.example.com/api/v2/')).toBe('https://byan.example.com');
    });

    test('leaves URL without /api suffix untouched', () => {
      expect(stripApiSuffix('http://localhost:3737')).toBe('http://localhost:3737');
    });

    test('does not strip /api in the middle of the path', () => {
      expect(stripApiSuffix('https://example.com/api/users')).toBe('https://example.com/api/users');
    });

    test('preserves protocol and host', () => {
      expect(stripApiSuffix('https://byan.example.com:8443/api')).toBe(
        'https://byan.example.com:8443'
      );
    });

    test('returns input unchanged when not a string', () => {
      expect(stripApiSuffix(undefined)).toBe(undefined);
      expect(stripApiSuffix(null)).toBe(null);
    });

    test('returns empty string unchanged', () => {
      expect(stripApiSuffix('')).toBe('');
    });
  });

  describe('buildAuthHeader', () => {
    test('returns empty object when token is falsy', () => {
      expect(buildAuthHeader(undefined)).toEqual({});
      expect(buildAuthHeader(null)).toEqual({});
      expect(buildAuthHeader('')).toEqual({});
    });

    test('returns empty object when token is not a string', () => {
      expect(buildAuthHeader(123)).toEqual({});
      expect(buildAuthHeader({})).toEqual({});
    });

    test('uses ApiKey scheme for byan_ prefixed token', () => {
      expect(buildAuthHeader('byan_abc123')).toEqual({
        Authorization: 'ApiKey byan_abc123',
      });
    });

    test('uses Bearer scheme for JWT-style token', () => {
      expect(buildAuthHeader('eyJhbGciOiJIUzI1NiJ9.foo')).toEqual({
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.foo',
      });
    });

    test('uses Bearer scheme for opaque token without byan_ prefix', () => {
      expect(buildAuthHeader('opaque-token-abc')).toEqual({
        Authorization: 'Bearer opaque-token-abc',
      });
    });
  });
});
