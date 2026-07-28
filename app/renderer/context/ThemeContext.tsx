// ThemeContext — the ONE place the renderer decides which theme is on the root.
//
// Three states, not two: sombre / clair / systeme (THEMES-ET-MATIERE.md section
// 4). "Systeme" is the reason this file is not a boolean and not a toggle: with
// it, the theme can change WITHOUT THE USER ACTING — at sunset, in the middle of
// a response being written.
//
// WHY A MODULE-LEVEL STORE AND NOT A PLAIN CONTEXT
//
//   1. The class on <html> has to be right before React paints. A value that
//      only exists inside a provider cannot beat the first frame, and a theme
//      that arrives one frame late is a flash of the wrong theme.
//   2. The consequence-modal exception has to be reachable from ANY modal in the
//      app, and those modals live in files this module does not own. A
//      module-level lock is callable from anywhere; a context value is not.
//
// A <ThemeProvider> is still exported, because App.tsx mounting it is the
// idiomatic seam and gives the store a deterministic boot point.

import React, { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system'];

// `ui.` is inside the store's prefix allowlist (main/ipc-handlers/store.ts), so
// this key is writable from the renderer while the auth keys stay out of reach.
export const THEME_STORE_KEY = 'ui.theme';

// The app ships dark. A fresh install with nothing persisted resolves dark with
// no JavaScript at all, because :root carries the dark values — so the default
// costs no first-frame flash.
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'dark';

const LIGHT_CLASS = 'light';
const DARK_CLASS = 'dark';
const OS_LIGHT_QUERY = '(prefers-color-scheme: light)';

export interface ThemeState {
  /** What the user picked. Persisted. */
  choice: ThemeChoice;
  /** What is actually on the root right now. */
  resolved: ResolvedTheme;
  /** What the OS currently says, whether or not we are following it. */
  system: ResolvedTheme;
  /** False until the persisted choice has been read back. */
  hydrated: boolean;
  /**
   * True when the OS has flipped, we are in system mode, and the flip is being
   * HELD because a consequence modal is open. Exposed so a UI can be honest
   * about it rather than looking merely unresponsive (mantra: no mute command).
   */
  deferred: boolean;
}

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'dark' || value === 'light' || value === 'system';
}

// --------------------------------------------------------------------------
// The store
// --------------------------------------------------------------------------

let state: ThemeState = {
  choice: DEFAULT_THEME_CHOICE,
  resolved: 'dark',
  system: 'dark',
  hydrated: false,
  deferred: false,
};

const listeners = new Set<() => void>();

/**
 * How many consequence modals are open. A COUNT and not a boolean: two of them
 * can overlap (a mode switch that itself warns about an open session), and the
 * inner one closing must not unlock the flip while the outer one is still being
 * read.
 */
let consequenceDepth = 0;

let mediaQuery: MediaQueryList | null = null;
// Kept so the listener can actually be detached. Production never detaches — the
// listener lives as long as the window — but a reset that only forgot the
// reference would leave a live handler mutating module state behind the next
// test's back.
let mediaHandler: ((e: MediaQueryListEvent | MediaQueryList) => void) | null = null;
let bootstrapped = false;

function detachMediaListener(): void {
  if (!mediaQuery || !mediaHandler) return;
  try {
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaHandler as EventListener);
    } else if (typeof mediaQuery.removeListener === 'function') {
      mediaQuery.removeListener(mediaHandler);
    }
  } catch {
    // A media query list that refuses to let go is not worth throwing over.
  }
  mediaQuery = null;
  mediaHandler = null;
}

function emit(next: Partial<ThemeState>): void {
  const merged = { ...state, ...next };
  // Bail on a no-op so useSyncExternalStore does not re-render the tree every
  // time the OS re-announces a preference it already had.
  if (
    merged.choice === state.choice &&
    merged.resolved === state.resolved &&
    merged.system === state.system &&
    merged.hydrated === state.hydrated &&
    merged.deferred === state.deferred
  ) {
    return;
  }
  state = merged;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureThemeBootstrap();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemeState {
  return state;
}

/** What the OS asks for, right now. */
export function readSystemTheme(): ResolvedTheme {
  // matchMedia is absent in the jsdom test environment, and an Electron window
  // that somehow lacks it must still resolve to the shipped default.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  try {
    return window.matchMedia(OS_LIGHT_QUERY).matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveTheme(choice: ThemeChoice, system: ResolvedTheme): ResolvedTheme {
  return choice === 'system' ? system : choice;
}

/**
 * Put the theme on the document root. Exactly one of the two classes is present
 * at any time, so the root always NAMES the active theme rather than implying it
 * by absence — that is also what makes Tailwind's `dark:` variants usable, since
 * darkMode is 'class' and nothing was ever adding `dark`.
 */
function applyToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle(LIGHT_CLASS, resolved === 'light');
  root.classList.toggle(DARK_CLASS, resolved === 'dark');
}

function persist(choice: ThemeChoice): void {
  // Fire and forget: the visual change already happened and must not wait on a
  // keychain round-trip. A failed write costs the choice at next launch, not the
  // choice now. The API is absent in tests (no preload).
  void window.byanApi?.store?.set?.(THEME_STORE_KEY, choice)?.catch?.(() => {
    // Swallowed on purpose: nothing actionable, and a toast about a preference
    // write would be noise on top of a working theme.
  });
}

// --------------------------------------------------------------------------
// The system-mode behaviour rule
// --------------------------------------------------------------------------

// DECISION EN ATTENTE: en mode « systeme », l'application doit-elle suivre l'OS
// immediatement — y compris en pleine reponse en train de s'ecrire — et la seule
// exception est-elle la modale de consequence ? (THEMES-ET-MATIERE.md section 4,
// « Regle proposee, a valider ».) Defaut implemente ici : oui, suivi immediat,
// et le basculement declenche pendant qu'une modale de consequence est ouverte
// est RETENU puis applique a la fermeture. Un fond qui change au moment ou
// l'utilisateur lit « ca va ecraser trois fichiers » est le pire instant
// possible. Question ouverte laissee a Yan : faut-il etendre l'exception a
// d'autres moments (un flux en cours, une saisie en cours) ? Le defaut dit non
// — un flux dure, et retenir le theme pendant toute sa duree reviendrait a ne
// plus suivre l'OS du tout.
function onSystemChange(nextSystem: ResolvedTheme): void {
  if (state.choice !== 'system') {
    // Not following the OS: record what it says (Settings shows it) and change
    // nothing on screen.
    emit({ system: nextSystem });
    return;
  }

  if (consequenceDepth > 0) {
    // The one exception. Record the new OS value and mark the flip as held; the
    // class on the root is left exactly as the user found it.
    emit({ system: nextSystem, deferred: nextSystem !== state.resolved });
    return;
  }

  applyToDocument(nextSystem);
  emit({ system: nextSystem, resolved: nextSystem, deferred: false });
}

/**
 * Open a consequence modal — a modal that states what is about to be destroyed
 * or overwritten. While one is open, an OS theme flip is held back.
 *
 * Returns the matching close function, so a caller cannot leak the lock by
 * forgetting which one to call. Idempotent: calling the returned function twice
 * releases once.
 */
export function openConsequenceModal(): () => void {
  consequenceDepth += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    consequenceDepth = Math.max(0, consequenceDepth - 1);
    if (consequenceDepth === 0) flushDeferredSystemFlip();
  };
}

/** Apply a flip that was held back while a consequence modal was open. */
function flushDeferredSystemFlip(): void {
  if (state.choice !== 'system') {
    if (state.deferred) emit({ deferred: false });
    return;
  }
  const target = state.system;
  if (target === state.resolved) {
    if (state.deferred) emit({ deferred: false });
    return;
  }
  applyToDocument(target);
  emit({ resolved: target, deferred: false });
}

/** Test seam and honest read for a UI that wants to explain the hold. */
export function isConsequenceModalOpen(): boolean {
  return consequenceDepth > 0;
}

// --------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------

/**
 * Set the theme choice. Applies IMMEDIATELY even while a consequence modal is
 * open: the exception exists to protect the user from a change they did not ask
 * for, and this is a change they just clicked. Holding it back here would make
 * the control look broken.
 */
export function setThemeChoice(choice: ThemeChoice): void {
  if (!isThemeChoice(choice)) return;
  const system = readSystemTheme();
  const resolved = resolveTheme(choice, system);
  applyToDocument(resolved);
  emit({ choice, system, resolved, hydrated: true, deferred: false });
  persist(choice);
}

/** Read the persisted choice and apply it. Safe to call more than once. */
export async function hydrateTheme(): Promise<void> {
  let stored: unknown = null;
  try {
    stored = (await window.byanApi?.store?.get?.(THEME_STORE_KEY)) ?? null;
  } catch {
    stored = null;
  }
  const choice = isThemeChoice(stored) ? stored : DEFAULT_THEME_CHOICE;
  const system = readSystemTheme();
  const resolved = resolveTheme(choice, system);
  applyToDocument(resolved);
  emit({ choice, system, resolved, hydrated: true, deferred: false });
}

/**
 * Attach the OS listener and read the persisted choice. Idempotent, so it is
 * safe from the provider, from a subscribing hook, and at module load.
 */
export function ensureThemeBootstrap(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  const system = readSystemTheme();
  // Paint the default before the async read lands, so the first frame is the
  // shipped theme rather than an unstyled one.
  applyToDocument(resolveTheme(state.choice, system));
  emit({ system, resolved: resolveTheme(state.choice, system) });

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      mediaQuery = window.matchMedia(OS_LIGHT_QUERY);
      mediaHandler = (e: MediaQueryListEvent | MediaQueryList) => {
        onSystemChange(e.matches ? 'light' : 'dark');
      };
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', mediaHandler as EventListener);
      } else if (typeof mediaQuery.addListener === 'function') {
        // Older Chromium surface. Electron pins a modern one, but a renderer is
        // not the place to assume it.
        mediaQuery.addListener(mediaHandler);
      }
    } catch {
      mediaQuery = null;
      mediaHandler = null;
    }
  }

  void hydrateTheme();
}

// Boot at module load when there is a document to paint. The theme has to be on
// the root before the first frame, and the only thing guaranteed to run that
// early is the module itself — App.tsx mounting <ThemeProvider> happens later.
// Guarded so importing this module in a non-DOM context is inert.
if (typeof document !== 'undefined') {
  ensureThemeBootstrap();
}

/**
 * Reset every piece of module state. Tests only — a module-level store outlives
 * a single test, and a leaked OS listener or a stuck modal depth would make the
 * next test lie.
 */
export function __resetThemeForTests(): void {
  detachMediaListener();
  state = {
    choice: DEFAULT_THEME_CHOICE,
    resolved: 'dark',
    system: 'dark',
    hydrated: false,
    deferred: false,
  };
  listeners.clear();
  consequenceDepth = 0;
  bootstrapped = false;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove(LIGHT_CLASS, DARK_CLASS);
  }
}

// --------------------------------------------------------------------------
// React surface
// --------------------------------------------------------------------------

export interface ThemeValue extends ThemeState {
  setChoice: (choice: ThemeChoice) => void;
}

export function useTheme(): ThemeValue {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setChoice = useCallback((choice: ThemeChoice) => setThemeChoice(choice), []);
  return { ...snapshot, setChoice };
}

/**
 * Declare that a consequence modal is on screen for as long as `isOpen` is true.
 * Any modal that states what it is about to overwrite or destroy calls this; it
 * needs no other wiring.
 */
export function useConsequenceModal(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    return openConsequenceModal();
  }, [isOpen]);
}

/**
 * Mounted by App.tsx. The store works without it — see the module-load boot
 * above — but mounting it makes the boot explicit and gives the theme a place in
 * the provider stack where a reader expects to find it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureThemeBootstrap();
  }, []);
  return <>{children}</>;
}
