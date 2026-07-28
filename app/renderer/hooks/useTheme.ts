// The theme hooks, re-exported from the store so a component reaches for
// `hooks/useTheme` like it reaches for `hooks/useLocalChat` — the state itself
// lives in context/ThemeContext.tsx, which explains why it is a module-level
// store and not a plain context.
//
// Importing this module is enough to boot the theme: ThemeContext applies the
// persisted choice to the document root at module load.

export {
  useTheme,
  useConsequenceModal,
  openConsequenceModal,
  isConsequenceModalOpen,
  setThemeChoice,
  ensureThemeBootstrap,
  hydrateTheme,
  readSystemTheme,
  resolveTheme,
  ThemeProvider,
  THEME_CHOICES,
  THEME_STORE_KEY,
  DEFAULT_THEME_CHOICE,
} from '../context/ThemeContext';

export type {
  ThemeChoice,
  ResolvedTheme,
  ThemeState,
  ThemeValue,
} from '../context/ThemeContext';
