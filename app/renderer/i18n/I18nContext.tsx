// I18n React context + useT hook — F15.
//
// Wrap the app in <I18nProvider> and call useT() from any component to get
// a translator bound to the current locale. The locale is persisted in the
// secure store under 'app.locale' so it survives across runs.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LOCALE,
  detectLocale,
  type Locale,
  LOCALES,
  type MessageKey,
  translate,
} from './locales';

const STORE_KEY = 'app.locale';

interface I18nContextShape {
  locale: Locale;
  setLocale(next: Locale): void;
  t(key: MessageKey, params?: Record<string, string | number>): string;
}

const I18nContext = createContext<I18nContextShape | null>(null);

export interface I18nProviderProps {
  children: React.ReactNode;
  // Test injection — skip the async store read when set.
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined)
  );

  // Hydrate from the persistent store on mount. We start with the browser
  // default so SSR / first paint already shows a sensible language.
  useEffect(() => {
    if (initialLocale) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await window.byanApi?.store?.get?.<Locale>(STORE_KEY);
        if (!cancelled && stored && (LOCALES as readonly string[]).includes(stored)) {
          setLocaleState(stored);
        }
      } catch { /* store not available — keep detected default */ }
    })();
    return () => { cancelled = true; };
  }, [initialLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void window.byanApi?.store?.set?.(STORE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );

  const value = useMemo<I18nContextShape>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Returns the translator + locale state. Called outside a provider, it falls
// back to a no-op translator bound to DEFAULT_LOCALE — French — so isolated unit
// tests do not have to mount the provider.
//
// Read that carefully before pinning a string in a test: a component rendered
// WITHOUT <I18nProvider> speaks the default language, not English. A test that
// asserts an English literal must mount <I18nProvider initialLocale="en">, or it
// is really asserting what the default locale happens to be.
export function useT(): I18nContextShape {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: (key, params) => translate(DEFAULT_LOCALE, key, params),
  };
}
