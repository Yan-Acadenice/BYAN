// The theme layer: three states, persistence, and the one exception to
// following the OS.
//
// The exception is the whole reason this is not a two-position switch with a
// boolean behind it: in "système" mode the theme can change WITHOUT the user
// acting, and there is exactly one moment where that must not happen.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Settings from '../pages/Settings';
import { I18nProvider } from '../i18n/I18nContext';
import {
  __resetThemeForTests,
  ensureThemeBootstrap,
  hydrateTheme,
  openConsequenceModal,
  setThemeChoice,
  isConsequenceModalOpen,
  readSystemTheme,
  resolveTheme,
  THEME_STORE_KEY,
  DEFAULT_THEME_CHOICE,
} from '../context/ThemeContext';

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

/** A controllable prefers-color-scheme, since jsdom ships no matchMedia at all. */
function installMatchMedia(startsLight: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  let matches = startsLight;
  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: light)',
    onchange: null,
    addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
      listeners.delete(cb);
    },
    addListener: (cb: (e: { matches: boolean }) => void) => {
      listeners.add(cb);
    },
    removeListener: (cb: (e: { matches: boolean }) => void) => {
      listeners.delete(cb);
    },
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn(() => mql),
    writable: true,
    configurable: true,
  });
  return {
    /** The OS flips. Wrapped in act() because subscribers re-render. */
    flip(toLight: boolean) {
      matches = toLight;
      act(() => {
        for (const cb of listeners) cb({ matches });
      });
    },
    listenerCount: () => listeners.size,
  };
}

let storeValues: Record<string, unknown>;
let storeSet: ReturnType<typeof vi.fn>;
let storeGet: ReturnType<typeof vi.fn>;

function installApi(opts: { storeAvailable?: boolean } = {}) {
  const { storeAvailable = true } = opts;
  storeValues = {};
  storeGet = vi.fn(async (key: string) => storeValues[key] ?? null);
  storeSet = vi.fn(async (key: string, value: unknown) => {
    storeValues[key] = value;
  });
  Object.defineProperty(window, 'byanApi', {
    value: {
      store: storeAvailable ? { get: storeGet, set: storeSet } : undefined,
      auth: { logout: vi.fn().mockResolvedValue(undefined) },
      app: { version: vi.fn().mockResolvedValue('1.3.0'), openExternal: vi.fn() },
    },
    writable: true,
    configurable: true,
  });
}

function root() {
  return document.documentElement;
}

function renderSettings() {
  return render(
    <I18nProvider initialLocale="fr">
      <Settings />
    </I18nProvider>
  );
}

beforeEach(() => {
  installApi();
  installMatchMedia(false);
  __resetThemeForTests();
});

afterEach(() => {
  cleanup();
  __resetThemeForTests();
});

// --------------------------------------------------------------------------
// The three states
// --------------------------------------------------------------------------

describe('the theme choice is three-state, not a toggle', () => {
  it('offers exactly three options, and none of them is a switch', async () => {
    renderSettings();
    const group = await screen.findByTestId('theme-selector');
    expect(group).toHaveAttribute('role', 'radiogroup');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.textContent?.split('.')[0])).toEqual([
      expect.stringContaining('Sombre'),
      expect.stringContaining('Clair'),
      expect.stringContaining('Système'),
    ]);
    // A switch would expose a checkbox/switch role. None here.
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('ships dark: no persisted choice resolves dark', async () => {
    ensureThemeBootstrap();
    await hydrateTheme();
    expect(DEFAULT_THEME_CHOICE).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
  });

  it('puts the class on the document root, and exactly one of the two', () => {
    setThemeChoice('light');
    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);

    setThemeChoice('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Persistence
// --------------------------------------------------------------------------

describe('the choice is persisted through the store', () => {
  it('writes to ui.theme, a prefix the store allowlist accepts', async () => {
    setThemeChoice('light');
    await waitFor(() => expect(storeSet).toHaveBeenCalledWith(THEME_STORE_KEY, 'light'));
    expect(THEME_STORE_KEY.startsWith('ui.')).toBe(true);
  });

  it('persists each of the three states', async () => {
    for (const choice of ['light', 'system', 'dark'] as const) {
      setThemeChoice(choice);
      await waitFor(() => expect(storeValues[THEME_STORE_KEY]).toBe(choice));
    }
  });

  it('restores the persisted choice on boot', async () => {
    storeValues[THEME_STORE_KEY] = 'light';
    ensureThemeBootstrap();
    await hydrateTheme();
    expect(root().classList.contains('light')).toBe(true);
  });

  it('falls back to the default when the persisted value is junk', async () => {
    storeValues[THEME_STORE_KEY] = 'chartreuse';
    ensureThemeBootstrap();
    await hydrateTheme();
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('still applies the theme when the store is unavailable', async () => {
    installApi({ storeAvailable: false });
    __resetThemeForTests();
    // A missing preload must not leave the app unstyled, and must not throw.
    await expect(hydrateTheme()).resolves.toBeUndefined();
    expect(root().classList.contains('dark')).toBe(true);
    expect(() => setThemeChoice('light')).not.toThrow();
    expect(root().classList.contains('light')).toBe(true);
  });

  it('shows the theme on screen the moment it is clicked', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByTestId('theme-option-light'));
    expect(root().classList.contains('light')).toBe(true);
    await waitFor(() => expect(storeSet).toHaveBeenCalledWith(THEME_STORE_KEY, 'light'));
  });

  it('is reachable by keyboard: a radiogroup that only answers the mouse is not one', async () => {
    const user = userEvent.setup();
    renderSettings();
    const dark = await screen.findByTestId('theme-option-dark');
    dark.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('theme-option-light')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('theme-option-system')).toHaveAttribute('aria-checked', 'true');
    // Wraps, so the group has no dead end.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('theme-option-dark')).toHaveAttribute('aria-checked', 'true');
  });
});

// --------------------------------------------------------------------------
// Following the OS
// --------------------------------------------------------------------------

describe('system mode follows the OS immediately', () => {
  it('resolves to whatever the OS says at boot', async () => {
    const os = installMatchMedia(true);
    storeValues[THEME_STORE_KEY] = 'system';
    __resetThemeForTests();
    ensureThemeBootstrap();
    await hydrateTheme();
    expect(readSystemTheme()).toBe('light');
    expect(root().classList.contains('light')).toBe(true);
    expect(os.listenerCount()).toBeGreaterThan(0);
  });

  it('follows a mid-session flip with no user action', async () => {
    const os = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('system');
    expect(root().classList.contains('dark')).toBe(true);

    os.flip(true);
    expect(root().classList.contains('light')).toBe(true);

    os.flip(false);
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('ignores the OS when the choice is explicit', () => {
    const os = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('dark');

    os.flip(true);
    // The OS went light. The user said dark. Dark wins.
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
  });

  it('reports what the OS asked for, so "système" is not a mute setting', async () => {
    const user = userEvent.setup();
    installMatchMedia(true);
    __resetThemeForTests();
    renderSettings();
    await user.click(await screen.findByTestId('theme-option-system'));
    const note = await screen.findByTestId('theme-resolved-note');
    expect(note.textContent).toContain('clair');
  });

  it('detaches on reset, so a stale listener cannot make the next test lie', () => {
    const stale = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('system');
    expect(stale.listenerCount()).toBe(1);

    // A new test would install a fresh mock and reset. The OLD one must be inert.
    __resetThemeForTests();
    expect(stale.listenerCount()).toBe(0);

    installMatchMedia(false);
    ensureThemeBootstrap();
    setThemeChoice('system');
    stale.flip(true);
    // The stale query going light moves nothing: it was let go of.
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('resolveTheme only defers to the OS in system mode', () => {
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });
});

// --------------------------------------------------------------------------
// The exception
// --------------------------------------------------------------------------

describe('the one exception: never flip under an open consequence modal', () => {
  it('holds the OS flip while the modal is open, then applies it on close', () => {
    const os = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('system');
    expect(root().classList.contains('dark')).toBe(true);

    // "This will overwrite three files" is on screen.
    const close = openConsequenceModal();
    expect(isConsequenceModalOpen()).toBe(true);

    os.flip(true);
    // The worst possible instant. The background does NOT move.
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);

    act(() => close());
    // Read, decided, closed — now it applies.
    expect(root().classList.contains('light')).toBe(true);
    expect(isConsequenceModalOpen()).toBe(false);
  });

  it('surfaces the held flip instead of looking merely unresponsive', async () => {
    const user = userEvent.setup();
    const os = installMatchMedia(false);
    __resetThemeForTests();
    renderSettings();
    await user.click(await screen.findByTestId('theme-option-system'));

    const close = openConsequenceModal();
    os.flip(true);

    const note = await screen.findByTestId('theme-deferred-note');
    expect(note.textContent).toContain('clair');

    act(() => close());
    await waitFor(() => expect(screen.queryByTestId('theme-deferred-note')).toBeNull());
  });

  it('counts nested modals, so the inner one closing does not unlock the outer', () => {
    const os = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('system');

    const closeOuter = openConsequenceModal();
    const closeInner = openConsequenceModal();
    os.flip(true);

    act(() => closeInner());
    expect(root().classList.contains('dark')).toBe(true);

    act(() => closeOuter());
    expect(root().classList.contains('light')).toBe(true);
  });

  it('releases once even if the close function is called twice', () => {
    const os = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('system');

    const closeOuter = openConsequenceModal();
    const closeInner = openConsequenceModal();
    os.flip(true);
    act(() => closeInner());
    act(() => closeInner());
    // A double release must not have drained the outer lock.
    expect(isConsequenceModalOpen()).toBe(true);
    expect(root().classList.contains('dark')).toBe(true);

    act(() => closeOuter());
    expect(root().classList.contains('light')).toBe(true);
  });

  it('applies an EXPLICIT choice during a modal — the exception guards against surprise, not against the user', () => {
    installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();

    const close = openConsequenceModal();
    setThemeChoice('light');
    // The user just clicked it. Holding this back would make the control look broken.
    expect(root().classList.contains('light')).toBe(true);
    act(() => close());
  });

  it('drops the held flip when the OS returns to where it was', () => {
    const os = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('system');

    const close = openConsequenceModal();
    os.flip(true);
    os.flip(false);
    act(() => close());
    // Nothing to apply: the OS ended up back on dark.
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('leaving system mode while a flip is held cancels it', () => {
    const os = installMatchMedia(false);
    __resetThemeForTests();
    ensureThemeBootstrap();
    setThemeChoice('system');

    const close = openConsequenceModal();
    os.flip(true);
    setThemeChoice('dark');
    act(() => close());
    // The user pinned dark while the flip was waiting. It does not resurrect.
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
  });
});
