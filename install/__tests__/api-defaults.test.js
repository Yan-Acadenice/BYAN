'use strict';

// L'URL de l'API byan_web — la source unique et son ordre de resolution.
//
// D'OU VIENT CE FICHIER. Trois endroits posaient http://localhost:3737 en dur.
// Un projet installe sur une machine qui n'heberge pas byan_web recevait donc
// une configuration pointant sur son propre port 3737, ou rien n'ecoute.
//
// Le host retenu a ete MESURE le 2026-08-11 :
//   https://byan-api.stark.a3n.fr/api/health -> 200, application/json,
//     {"status":"ok","version":"1.0.0"}
//   https://byan.stark.a3n.fr/api/health     -> 302 vers auth.acadenice.com,
//     text/html (l'interface web derriere son authentification)
// Confondre les deux produit une panne difficile a lire, parce que la reponse
// ressemble a une reponse.

const { resolveApiUrl, normalizeApiUrl, PROD_API_URL, isHttpUrl } = require('../lib/api-defaults');

const SANS_CREDENTIALS = () => ({});

describe('normalizeApiUrl', () => {
  test('retire le suffixe /api : les endpoints le portent deja', () => {
    // La verification de derive de install-core signale ce cas, preuve que la
    // faute a deja ete commise sur le terrain.
    expect(normalizeApiUrl('https://byan-api.stark.a3n.fr/api')).toBe('https://byan-api.stark.a3n.fr');
    expect(normalizeApiUrl('https://byan-api.stark.a3n.fr/API')).toBe('https://byan-api.stark.a3n.fr');
  });

  test('retire la barre oblique finale', () => {
    expect(normalizeApiUrl('https://exemple.test/')).toBe('https://exemple.test');
    expect(normalizeApiUrl('https://exemple.test///')).toBe('https://exemple.test');
  });

  test('ne touche pas a un chemin qui n est pas /api', () => {
    expect(normalizeApiUrl('https://exemple.test/byan')).toBe('https://exemple.test/byan');
  });

  test('rend une chaine vide pour ce qui n est pas une chaine', () => {
    for (const bidon of [null, undefined, 42, {}, []]) expect(normalizeApiUrl(bidon)).toBe('');
  });
});

describe('isHttpUrl', () => {
  test('accepte http et https, refuse le reste', () => {
    expect(isHttpUrl('https://a.test')).toBe(true);
    expect(isHttpUrl('http://localhost:3737')).toBe(true);
    expect(isHttpUrl('a.test')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});

describe('resolveApiUrl — l ordre est le contrat', () => {
  test('1. explicite gagne sur tout le reste', () => {
    const r = resolveApiUrl({
      explicit: 'https://ma-machine.test',
      env: { BYAN_API_URL: 'https://env.test' },
      readCredentials: () => ({ BYAN_API_URL: 'https://memorise.test' }),
    });
    expect(r).toEqual({ url: 'https://ma-machine.test', source: 'explicit' });
  });

  test('2. l environnement gagne sur la valeur memorisee', () => {
    const r = resolveApiUrl({
      env: { BYAN_API_URL: 'https://env.test' },
      readCredentials: () => ({ BYAN_API_URL: 'https://memorise.test' }),
    });
    expect(r).toEqual({ url: 'https://env.test', source: 'env' });
  });

  test('3. la valeur memorisee gagne sur le defaut', () => {
    // Ne pas la relire ferait re-saisir a chaque projet ce qui a deja ete donne.
    const r = resolveApiUrl({
      env: {},
      readCredentials: () => ({ BYAN_API_URL: 'https://memorise.test' }),
    });
    expect(r).toEqual({ url: 'https://memorise.test', source: 'credentials' });
  });

  test('4. sans rien, le host de production — plus localhost', () => {
    const r = resolveApiUrl({ env: {}, readCredentials: SANS_CREDENTIALS });
    expect(r).toEqual({ url: 'https://byan-api.stark.a3n.fr', source: 'default' });
    expect(r.url).toBe(PROD_API_URL);
    expect(r.url).not.toContain('localhost');
  });

  test('une valeur inexploitable est ignoree, on descend d un echelon', () => {
    // Une variable posee a vide ou a une valeur qui n est pas une URL ne doit
    // pas produire une configuration cassee : elle ne compte simplement pas.
    for (const mauvais of ['', '   ', 'byan-api.stark.a3n.fr', 'ftp://a.test']) {
      const r = resolveApiUrl({ env: { BYAN_API_URL: mauvais }, readCredentials: SANS_CREDENTIALS });
      expect(r.source).toBe('default');
    }
  });

  test('la normalisation s applique a chaque echelon, pas seulement au defaut', () => {
    expect(resolveApiUrl({ explicit: 'https://a.test/api/', readCredentials: SANS_CREDENTIALS }).url).toBe('https://a.test');
    expect(resolveApiUrl({ env: { BYAN_API_URL: 'https://b.test/api' }, readCredentials: SANS_CREDENTIALS }).url).toBe('https://b.test');
    expect(resolveApiUrl({ env: {}, readCredentials: () => ({ BYAN_API_URL: 'https://c.test/' }) }).url).toBe('https://c.test');
  });

  test('un fichier de configuration illisible ne bloque pas l installation', () => {
    const r = resolveApiUrl({
      env: {},
      readCredentials: () => { throw new Error('EACCES'); },
    });
    expect(r.source).toBe('default');
  });
});

describe('plus aucun localhost livre comme defaut', () => {
  test('le defaut de production ne pointe pas sur la machine locale', () => {
    expect(PROD_API_URL.startsWith('https://')).toBe(true);
    expect(PROD_API_URL).not.toMatch(/localhost|127\.0\.0\.1|:3737/);
  });

  test('le host retenu est celui qui repond en JSON, pas celui de l interface', () => {
    // Mesure du 2026-08-11, reproductible :
    //   curl -s -o /dev/null -w '%{http_code} %{content_type}' \
    //     https://byan-api.stark.a3n.fr/api/health   -> 200 application/json
    //     https://byan.stark.a3n.fr/api/health       -> 302 text/html
    expect(PROD_API_URL).toBe('https://byan-api.stark.a3n.fr');
  });
});
