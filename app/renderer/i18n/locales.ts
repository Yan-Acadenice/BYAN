// i18n locales — F15.
//
// Why a hand-rolled solution instead of i18next/react-intl:
//   - 0 KB of vendor code (i18next is ~25 KB gzipped)
//   - Strict typing: keys are union types; missing translations fail at compile time
//   - Plural / format hooks land when we actually need them
//
// To add a language:
//   1. Add the locale tag to `LOCALES`.
//   2. Define the full message map below (TypeScript will refuse partial maps).
//   3. The settings selector picks it up automatically.

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

// Master key list. English is the source of truth — every other locale must
// implement the same shape (enforced by `Record<MessageKey, string>`).
const en = {
  // Sidebar / navigation
  'nav.dashboard': 'Dashboard',
  'nav.chat': 'Chat',
  'nav.projects': 'Projects',
  'nav.agents': 'Agents',
  'nav.memory': 'Memory',
  'nav.knowledge': 'Knowledge',
  'nav.sessions': 'Sessions',
  'nav.mcp': 'MCP Servers',
  'nav.settings': 'Settings',

  // Topbar
  'topbar.search.placeholder': 'Search...',
  'topbar.brand': 'BYAN',

  // Status / connectivity
  'connectivity.offline.label': 'Offline',
  'connectivity.offline.detail': 'No network connection detected.',
  'connectivity.unstable.label': 'API unreachable',
  'connectivity.unstable.detail': 'Network is up but byan_web is not responding.',
  'connectivity.offline.toast': 'You are offline. Changes may not save until connectivity is restored.',
  'connectivity.unstable.toast': 'byan_web is not responding. Retrying in the background.',
  'connectivity.recovered.toast': 'Back online.',

  // Update banner
  'update.available': 'Update v{version} available — downloading…',
  'update.downloading': 'Downloading update… {percent}%',
  'update.downloaded': 'Update v{version} ready to install.',
  'update.install': 'Install now',
  'update.dismiss': 'Dismiss',

  // MCP page
  'mcp.title': 'MCP Servers',
  'mcp.section': 'Platform',
  'mcp.add': 'Add MCP server',
  'mcp.empty.title': 'No MCP servers configured',
  'mcp.empty.body': 'Configure one in .mcp.json at your project root. Complete onboarding first if you have not picked a project.',
  'mcp.loading': 'Loading servers...',
  'mcp.error.title': 'Could not load MCP servers',
  'mcp.error.retry': 'Retry',
  'mcp.state.running': 'Running',
  'mcp.state.starting': 'Starting…',
  'mcp.state.stopped': 'Stopped',
  'mcp.state.error': 'Error',
  'mcp.action.start': 'Start',
  'mcp.action.stop': 'Stop',
  'mcp.action.restart': 'Restart',
  'mcp.disabled': 'disabled',

  // Common buttons
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
} as const;

export type MessageKey = keyof typeof en;

const fr: Record<MessageKey, string> = {
  'nav.dashboard': 'Tableau de bord',
  'nav.chat': 'Chat',
  'nav.projects': 'Projets',
  'nav.agents': 'Agents',
  'nav.memory': 'Mémoire',
  'nav.knowledge': 'Connaissance',
  'nav.sessions': 'Sessions',
  'nav.mcp': 'Serveurs MCP',
  'nav.settings': 'Paramètres',

  'topbar.search.placeholder': 'Rechercher...',
  'topbar.brand': 'BYAN',

  'connectivity.offline.label': 'Hors ligne',
  'connectivity.offline.detail': 'Aucune connexion réseau détectée.',
  'connectivity.unstable.label': 'API injoignable',
  'connectivity.unstable.detail': 'Le réseau fonctionne mais byan_web ne répond pas.',
  'connectivity.offline.toast': 'Vous êtes hors ligne. Les modifications ne seront pas enregistrées tant que la connexion n\'est pas rétablie.',
  'connectivity.unstable.toast': 'byan_web ne répond pas. Nouvelle tentative en arrière-plan.',
  'connectivity.recovered.toast': 'Connexion rétablie.',

  'update.available': 'Mise à jour v{version} disponible — téléchargement…',
  'update.downloading': 'Téléchargement de la mise à jour… {percent}%',
  'update.downloaded': 'Mise à jour v{version} prête à installer.',
  'update.install': 'Installer maintenant',
  'update.dismiss': 'Ignorer',

  'mcp.title': 'Serveurs MCP',
  'mcp.section': 'Plateforme',
  'mcp.add': 'Ajouter un serveur MCP',
  'mcp.empty.title': 'Aucun serveur MCP configuré',
  'mcp.empty.body': 'Configurez-en un dans .mcp.json à la racine du projet. Terminez d\'abord l\'onboarding si vous n\'avez pas choisi de projet.',
  'mcp.loading': 'Chargement des serveurs...',
  'mcp.error.title': 'Impossible de charger les serveurs MCP',
  'mcp.error.retry': 'Réessayer',
  'mcp.state.running': 'Actif',
  'mcp.state.starting': 'Démarrage…',
  'mcp.state.stopped': 'Arrêté',
  'mcp.state.error': 'Erreur',
  'mcp.action.start': 'Démarrer',
  'mcp.action.stop': 'Arrêter',
  'mcp.action.restart': 'Redémarrer',
  'mcp.disabled': 'désactivé',

  'common.cancel': 'Annuler',
  'common.save': 'Enregistrer',
  'common.delete': 'Supprimer',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en,
  fr,
};

// Format {placeholder} substitutions. Missing values render as empty strings
// so a missing param never crashes the UI.
export function formatMessage(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = params[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

// Translate a key for a given locale, falling back to English then to the key
// itself so something always renders.
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const localeMap = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const template = localeMap[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return formatMessage(template, params);
}

// Detect a sensible default from navigator.language. Falls back to English
// when the browser locale is not one of our supported tags.
export function detectLocale(navigatorLanguage: string | undefined): Locale {
  if (!navigatorLanguage) return DEFAULT_LOCALE;
  const tag = navigatorLanguage.toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(tag) ? (tag as Locale) : DEFAULT_LOCALE;
}
