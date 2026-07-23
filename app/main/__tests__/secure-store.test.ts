// secure-store.test.ts — F6
//
// Strategy: inject keytar directly via _injectKeytarForTests() to bypass the
// require() probe (which Vitest cannot intercept for CJS require() calls).
// vi.hoisted() is used for fs-mock variables because vi.mock() factory is
// hoisted above top-level let/const declarations.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- fs mock — declared via vi.hoisted so the factory can reference it ----------

const { fsMock, getFsContent, setFsContent } = vi.hoisted(() => {
  let _content = '';
  return {
    fsMock: {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn((_p: unknown, content: unknown) => { _content = content as string; }),
      readFileSync: vi.fn(() => _content),
      openSync: vi.fn(() => 42),
      closeSync: vi.fn(),
      unlinkSync: vi.fn(),
      chmodSync: vi.fn(),
      constants: { O_CREAT: 64, O_EXCL: 128, O_WRONLY: 1 }
    },
    getFsContent: () => _content,
    setFsContent: (v: string) => { _content = v; }
  };
});

vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

// ---------- Import secure-store after mocks ----------

import {
  secureStore,
  _injectKeytarForTests
} from '../secure-store';

// ---------- Keytar spy factory ----------

function makeKeytarMock() {
  return {
    setPassword: vi.fn<[string, string, string], Promise<void>>().mockResolvedValue(undefined),
    getPassword: vi.fn<[string, string], Promise<string | null>>().mockResolvedValue(null),
    deletePassword: vi.fn<[string, string], Promise<boolean>>().mockResolvedValue(true)
  };
}

// ---------- Reset fs mock between tests ----------

function resetFsMock() {
  setFsContent('');
  fsMock.mkdirSync.mockClear();
  fsMock.writeFileSync.mockClear().mockImplementation((_p: unknown, c: unknown) => { setFsContent(c as string); });
  fsMock.readFileSync.mockClear().mockImplementation(() => getFsContent());
  fsMock.openSync.mockClear().mockReturnValue(42);
  fsMock.closeSync.mockClear();
  fsMock.unlinkSync.mockClear();
  fsMock.chmodSync.mockClear();
}

// ---------- SecureStore — keytar available ----------

describe('SecureStore — keytar available', () => {
  let kt: ReturnType<typeof makeKeytarMock>;

  beforeEach(() => {
    resetFsMock();
    kt = makeKeytarMock();
    _injectKeytarForTests(kt);
    secureStore._resetForTests();
  });

  it('set delegates to keytar.setPassword with service "byan"', async () => {
    await secureStore.set('auth.token', 'byan_abc123');
    expect(kt.setPassword).toHaveBeenCalledWith('byan', 'auth.token', 'byan_abc123');
    expect(kt.setPassword).toHaveBeenCalledTimes(1);
  });

  it('get delegates to keytar.getPassword with service "byan"', async () => {
    kt.getPassword.mockResolvedValueOnce('byan_abc123');
    const result = await secureStore.get('auth.token');
    expect(kt.getPassword).toHaveBeenCalledWith('byan', 'auth.token');
    expect(result).toBe('byan_abc123');
  });

  it('delete delegates to keytar.deletePassword with service "byan"', async () => {
    await secureStore.delete('auth.token');
    expect(kt.deletePassword).toHaveBeenCalledWith('byan', 'auth.token');
  });

  it('get returns null when keytar returns null', async () => {
    kt.getPassword.mockResolvedValueOnce(null);
    const result = await secureStore.get('missing.key');
    expect(result).toBeNull();
  });

  it('write -> read -> delete -> read returns null cycle', async () => {
    kt.getPassword
      .mockResolvedValueOnce('tok_v1')  // after write
      .mockResolvedValueOnce(null);      // after delete

    await secureStore.set('auth.token', 'tok_v1');
    const v1 = await secureStore.get('auth.token');
    expect(v1).toBe('tok_v1');

    await secureStore.delete('auth.token');
    const v2 = await secureStore.get('auth.token');
    expect(v2).toBeNull();

    expect(kt.setPassword).toHaveBeenCalledTimes(1);
    expect(kt.deletePassword).toHaveBeenCalledTimes(1);
  });

  it('handles keys with spaces and accents — keytar receives raw key (no sanitization)', async () => {
    await secureStore.set('clé avec espaces', 'valeur');
    expect(kt.setPassword).toHaveBeenCalledWith('byan', 'clé avec espaces', 'valeur');
  });

  it('stores empty string (different from delete)', async () => {
    await secureStore.set('some.key', '');
    expect(kt.setPassword).toHaveBeenCalledWith('byan', 'some.key', '');
  });
});

// ---------- SecureStore — keytar unavailable (fallback .env) ----------

describe('SecureStore — keytar unavailable (fallback .env)', () => {
  beforeEach(() => {
    resetFsMock();
    _injectKeytarForTests(null);
    secureStore._resetForTests();
  });

  it('does not call keytar methods — uses fs instead', async () => {
    await secureStore.set('auth.token', 'tok');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('write persists key=value to .env file', async () => {
    await secureStore.set('auth.token', 'byan_fallback');
    const written = fsMock.writeFileSync.mock.calls[0][1] as string;
    expect(written).toContain('auth_token=byan_fallback');
  });

  it('read retrieves value written by set', async () => {
    await secureStore.set('auth.token', 'byan_fallback');
    const v = await secureStore.get('auth.token');
    expect(v).toBe('byan_fallback');
  });

  it('write -> read -> delete -> read returns null cycle via .env', async () => {
    await secureStore.set('auth.token', 'byan_fallback');
    const v1 = await secureStore.get('auth.token');
    expect(v1).toBe('byan_fallback');

    await secureStore.delete('auth.token');
    const v2 = await secureStore.get('auth.token');
    expect(v2).toBeNull();
  });

  it('handles keys with special characters via sanitized env key', async () => {
    await secureStore.set('clé avec espaces', 'valeur');
    const written = fsMock.writeFileSync.mock.calls[0][1] as string;
    expect(written).toContain('cl__avec_espaces=valeur');
  });

  it('stores empty string value (not treated as absent)', async () => {
    await secureStore.set('some.key', '');
    const v = await secureStore.get('some.key');
    expect(v).toBe('');
  });

  it('creates the config directory on first write', async () => {
    await secureStore.set('x', 'y');
    expect(fsMock.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});

// ---------- SecureStore — keytar LOADS but FAILS at runtime (locked/absent keyring) ----------
//
// The field bug : on a Linux desktop with a locked/absent keyring, keytar's
// native binding loads fine but libsecret throws "Password is required." at CALL
// time. The store must degrade to the .env fallback at RUNTIME, not only when the
// module is absent — otherwise nothing persists (token, mode, project root).

describe('SecureStore — keytar loads but throws at runtime (-> .env fallback)', () => {
  let kt: ReturnType<typeof makeKeytarMock>;

  beforeEach(() => {
    resetFsMock();
    kt = makeKeytarMock();
    const boom = () => Promise.reject(new Error('Password is required.'));
    kt.setPassword.mockImplementation(boom);
    kt.getPassword.mockImplementation(boom);
    kt.deletePassword.mockImplementation(boom);
    _injectKeytarForTests(kt);
    secureStore._resetForTests();
  });

  it('set does not throw and writes to the .env fallback', async () => {
    await expect(secureStore.set('auth.token', 'tok')).resolves.toBeUndefined();
    expect(fsMock.writeFileSync).toHaveBeenCalled();
    const written = fsMock.writeFileSync.mock.calls[0][1] as string;
    expect(written).toContain('auth_token=tok');
  });

  it('onboarding.projectRoot survives a locked keyring (set -> get round-trips)', async () => {
    await secureStore.set('onboarding.projectRoot', '/home/yan/Acquagest');
    const v = await secureStore.get('onboarding.projectRoot');
    expect(v).toBe('/home/yan/Acquagest'); // the chosen project folder is remembered
  });

  it('degrades PERMANENTLY — keytar is not consulted again after the first failure', async () => {
    await secureStore.set('k', 'v'); // first op fails on keytar -> switches to fallback
    kt.getPassword.mockClear();
    const v = await secureStore.get('k');
    expect(v).toBe('v');
    expect(kt.getPassword).not.toHaveBeenCalled();
  });
});
