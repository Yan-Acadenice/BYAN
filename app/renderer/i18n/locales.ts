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
//
// Two roles that are easy to confuse, so they are named apart:
//   - The `en` map is the KEY SHAPE. `MessageKey` derives from it, so every key
//     must exist there and every other locale is checked against it.
//   - `DEFAULT_LOCALE` is the LANGUAGE SHOWN when nothing else is known, and the
//     last resort of `translate`. It is French: this app is French-first, and an
//     English default made a French UI depend on the browser guessing right.
//
// Tone rule, enforced by __tests__/i18n.test.ts: the French strings address the
// user with "tu". No "vous", no "votre", no "vos", anywhere.

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';

// Master key list. English defines the SHAPE — every other locale must
// implement the same keys (enforced by `Record<MessageKey, string>`).
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

  // Bottom status strip. Everything here is measured or absent — the strings
  // must never imply a reading that was not taken.
  'status.latency.pending': 'IPC bridge latency: not measured yet',
  'status.latency.measured': 'Round trip to the main process, measured less than {seconds}s ago',
  'status.logs': 'Logs',
  'status.logs.open': 'Open the log folder',
  'status.logs.missing': 'log folder not found',
  'status.acadenice': 'AcadéNice',
  'status.acadenice.hover': 'An AcadéNice product — training in Nice',

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

  // Onboarding — the five steps, their copy, and their failures.
  'onboarding.step.welcome': 'Welcome',
  'onboarding.step.detection': 'Detection',
  'onboarding.step.preview': 'Preview',
  'onboarding.step.apply': 'Apply',
  'onboarding.step.done': 'Done',
  'onboarding.welcome.title': 'Set up BYAN',
  'onboarding.welcome.body': 'We will detect which AI platforms are installed, show you exactly what will be written, and let you confirm before anything touches your project.',
  'onboarding.projectFolder.label': 'Project folder',
  'onboarding.browse': 'Browse',
  'onboarding.skip': 'Skip for now',
  'onboarding.continue': 'Continue',
  'onboarding.back': 'Back',
  'onboarding.detection.title': 'Detected platforms',
  'onboarding.detection.body': 'Select the platforms you want to configure. Unchecked platforms will be skipped.',
  'onboarding.detection.progress': 'Detecting installed platforms...',
  'onboarding.detection.found': 'detected',
  'onboarding.detection.notFound': 'not found',
  'onboarding.detection.next': 'Preview changes',
  'onboarding.detection.computing': 'Computing...',
  'onboarding.preview.title': 'Preview changes',
  'onboarding.preview.body': 'Review each file before it is written. Nothing is written until you click Apply.',
  'onboarding.preview.file': 'file',
  'onboarding.preview.files': 'files',
  'onboarding.preview.cancelPlatform': 'Cancel platform',
  'onboarding.preview.restore': 'Restore',
  'onboarding.preview.cancelled': 'Cancelled — {platform} will not be configured.',
  'onboarding.preview.apply': 'Confirm & apply',
  'onboarding.apply.title': 'Applying setup...',
  'onboarding.apply.progress': 'Writing files to your project...',
  'onboarding.done.ok': 'All set.',
  'onboarding.done.warnings': 'Setup done with warnings.',
  'onboarding.done.nothing': 'Your selected platforms were already configured. Nothing to do.',
  'onboarding.done.ready': 'BYAN is ready for your project.',
  'onboarding.done.written': 'written',
  'onboarding.done.skipped': 'skipped',
  'onboarding.done.errors': 'errors',
  'onboarding.done.errorTitle': 'Some files could not be written:',
  'onboarding.done.continue': 'Continue to BYAN',
  'onboarding.error.folderPicker': 'Could not open the folder picker.',
  'onboarding.error.noFolder': 'Pick or type a project folder.',
  'onboarding.error.detection': 'Detection failed.',
  'onboarding.error.noPlatform': 'Select at least one platform, or skip this step.',
  'onboarding.error.preview': 'Preview failed.',
  'onboarding.error.nothingToWrite': 'Nothing to write — the selected platforms are already configured.',
  'onboarding.error.allCancelled': 'Every platform was cancelled. Restore at least one to continue.',

  // Login — three connection modes.
  'login.title': 'Connect to BYAN',
  'login.subtitle': 'Choose your connection mode',
  'login.brandCaption': 'An AcadéNice product',
  'login.tab.cloud': 'Cloud',
  'login.tab.local': 'Local',
  'login.tab.custom': 'Custom',
  'login.tab.cloud.description': 'Connect to the BYAN cloud service',
  'login.tab.local.description': 'Run BYAN on this machine',
  'login.tab.custom.description': 'Self-hosted BYAN instance',
  'login.cloud.url.label': 'BYAN cloud URL',
  'login.token.label': 'API token',
  'login.token.show': 'Show the token',
  'login.token.hide': 'Hide the token',
  'login.getToken': 'Get a token',
  'login.connect': 'Connect',
  'login.connecting': 'Connecting...',
  'login.local.body': 'Launch an embedded BYAN server locally. No internet connection required.',
  'login.local.start': 'Start the local server',
  'login.local.starting': 'Starting the server...',
  'login.local.running': 'Server running on {url}',
  'login.local.token.label': 'Token (optional)',
  'login.local.token.placeholder': 'Leave empty for dev mode',
  'login.local.connect': 'Connect locally',
  'login.custom.body': 'Connect to a self-hosted BYAN instance.',
  'login.custom.url.label': 'Server URL',
  'login.error.invalidToken': 'Token rejected by the server, or invalid.',
  'login.error.unreachable': 'Server unreachable. Check the URL and your connection.',
  'login.error.cancelled': 'Connection cancelled.',
  'login.error.unknown': 'Unknown error while connecting.',
  'login.error.generic': 'Connection error.',
  'login.error.serverStart': 'Could not start the local server.',

  // Local chat — the header chips, the two temporalities, the composer.
  'chat.engine.group': 'Local engine',
  'chat.engine.claude': 'Local chat via claude',
  'chat.engine.codex': 'Local chat via codex',
  'chat.engine.codex.missing': 'codex not found on this machine',
  'chat.engine.set': 'Engine {engine} for the next session.',
  'chat.cwd.pick': 'Pick a folder',
  'chat.cwd.pick.title': 'Pick a project folder',
  'chat.cwd.default': '{path} (folder kept by default — click to pick another)',
  'chat.model.auto': 'auto model',
  'chat.model.title': 'Model for the next {engine} session',
  'chat.model.cliDefault': 'CLI default',
  'chat.model.other': 'Other model: /model <name>',
  'chat.model.set': 'Model {model} for the next {engine} session.',
  'chat.model.reset': 'Default {engine} model restored.',
  'chat.effort.auto': 'auto effort',
  'chat.effort.title': 'Reasoning effort (codex) — applied to the next message',
  'chat.effort.set': 'Effort {level} from the next message on.',
  'chat.effort.reset': 'Default effort restored.',
  'chat.effort.unknown': 'Unknown effort: "{value}". Accepted values: {values}.',
  'chat.usage.title': 'Session usage',
  'chat.usage.badge': 'Usage ({count})',
  'chat.sessions.title': 'Resume a session',
  'chat.sessions.empty': 'No recorded session.',
  'chat.sessions.emptyMessage': '(empty)',
  'chat.sessions.resumable': 'resumable',
  'chat.session.new': 'New session',
  'chat.session.new.title': 'New local session',
  'chat.session.new.done': 'New local session.',
  'chat.session.new.agent': 'New session with agent {agent}.',
  'chat.session.new.noAgent': 'New session with no agent.',
  'chat.empty.title': 'Local chat with {engine} on this machine.',
  'chat.empty.starting': 'Opening the session — what you type will be sent as soon as it answers.',
  'chat.empty.open': 'Session open, no message yet. Write something.',
  'chat.empty.idle': 'Send a message — a session starts on its own.',
  'chat.input.placeholder': 'Message, or / for a command (Enter to send, Shift+Enter for a line break)',
  'chat.input.streaming': '{engine} is answering...',
  'chat.send': 'Send',
  'chat.stop': 'Interrupt',

  // Usage panel — measured data. A metric the engine never reported renders as a
  // dash with its reason, never as a zero.
  'usage.title': 'Usage',
  'usage.close': 'Close',
  'usage.aria': 'Session usage',
  'usage.empty': 'No turn measured in this session.',
  'usage.metric.cost': 'Cost',
  'usage.metric.duration': 'Duration',
  'usage.metric.input': 'Input',
  'usage.metric.cachedInput': 'Cached input',
  'usage.metric.cacheWrite': 'Cache write',
  'usage.metric.output': 'Output',
  'usage.metric.reasoning': 'Reasoning',
  'usage.recap.input': 'in',
  'usage.recap.output': 'out',
  'usage.turn.one': 'turn',
  'usage.turn.many': 'turns',
  'usage.recent': 'Last turns ({count})',
  'usage.gap.claude': 'claude publishes no token breakdown: only the cost and the duration are reported.',
  'usage.gap.codex': 'codex reports no dollar amount (subscription): only the tokens are.',
  'usage.scope': 'Current session only. Nothing is kept when the application restarts.',

  // File preview — four categories, and the one that destroys work.
  'preview.action.create': 'create',
  'preview.action.update': 'update',
  'preview.action.conflict': 'replace',
  'preview.action.skip': 'unchanged',
  'preview.keepMine': 'Uncheck to keep your version',
  'preview.skip.body': 'The file is already identical — nothing will be written.',
  'preview.loading': 'Loading...',
  'preview.empty': 'Empty file.',
  'preview.unreadable': 'Could not read the file.',
  'preview.truncated': '... (truncated for display)',

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
  'connectivity.offline.toast': "Tu es hors ligne. Tes modifications ne seront pas enregistrées tant que la connexion n'est pas rétablie.",
  'connectivity.unstable.toast': 'byan_web ne répond pas. Nouvelle tentative en arrière-plan.',
  'connectivity.recovered.toast': 'Connexion rétablie.',

  'status.latency.pending': 'Latence du pont IPC : pas encore mesurée',
  'status.latency.measured': 'Aller-retour vers le processus principal, mesuré il y a moins de {seconds}s',
  'status.logs': 'Logs',
  'status.logs.open': 'Ouvrir le dossier des logs',
  'status.logs.missing': 'dossier de logs introuvable',
  'status.acadenice': 'AcadéNice',
  'status.acadenice.hover': 'Un produit AcadéNice — formations à Nice',

  'update.available': 'Mise à jour v{version} disponible — téléchargement…',
  'update.downloading': 'Téléchargement de la mise à jour… {percent}%',
  'update.downloaded': 'Mise à jour v{version} prête à installer.',
  'update.install': 'Installer maintenant',
  'update.dismiss': 'Ignorer',

  'mcp.title': 'Serveurs MCP',
  'mcp.section': 'Plateforme',
  'mcp.add': 'Ajouter un serveur MCP',
  'mcp.empty.title': 'Aucun serveur MCP configuré',
  'mcp.empty.body': "Configures-en un dans .mcp.json à la racine de ton projet. Termine d'abord la mise en route si tu n'as pas choisi de projet.",
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

  'onboarding.step.welcome': 'Bienvenue',
  'onboarding.step.detection': 'Détection',
  'onboarding.step.preview': 'Aperçu',
  'onboarding.step.apply': 'Écriture',
  'onboarding.step.done': 'Terminé',
  'onboarding.welcome.title': 'Mettre BYAN en route',
  'onboarding.welcome.body': "On détecte les plateformes IA installées sur ta machine, on te montre exactement ce qui sera écrit, et rien ne touche ton projet avant que tu confirmes.",
  'onboarding.projectFolder.label': 'Dossier du projet',
  'onboarding.browse': 'Parcourir',
  'onboarding.skip': "Passer pour l'instant",
  'onboarding.continue': 'Continuer',
  'onboarding.back': 'Retour',
  'onboarding.detection.title': 'Plateformes détectées',
  'onboarding.detection.body': 'Choisis les plateformes à configurer. Les plateformes décochées seront ignorées.',
  'onboarding.detection.progress': 'Détection des plateformes installées...',
  'onboarding.detection.found': 'détectée',
  'onboarding.detection.notFound': 'introuvable',
  'onboarding.detection.next': 'Voir les changements',
  'onboarding.detection.computing': 'Calcul en cours...',
  'onboarding.preview.title': 'Aperçu des changements',
  'onboarding.preview.body': "Relis chaque fichier avant son écriture. Rien n'est écrit avant que tu cliques sur Appliquer.",
  'onboarding.preview.file': 'fichier',
  'onboarding.preview.files': 'fichiers',
  'onboarding.preview.cancelPlatform': 'Retirer cette plateforme',
  'onboarding.preview.restore': 'Rétablir',
  'onboarding.preview.cancelled': 'Retirée — {platform} ne sera pas configurée.',
  'onboarding.preview.apply': 'Confirmer et appliquer',
  'onboarding.apply.title': 'Mise en route en cours...',
  'onboarding.apply.progress': 'Écriture des fichiers dans ton projet...',
  'onboarding.done.ok': 'Tout est prêt.',
  'onboarding.done.warnings': 'Mise en route terminée, avec des avertissements.',
  'onboarding.done.nothing': 'Les plateformes que tu as choisies étaient déjà configurées. Rien à faire.',
  'onboarding.done.ready': 'BYAN est prêt pour ton projet.',
  'onboarding.done.written': 'écrits',
  'onboarding.done.skipped': 'ignorés',
  'onboarding.done.errors': 'erreurs',
  'onboarding.done.errorTitle': "Certains fichiers n'ont pas pu être écrits :",
  'onboarding.done.continue': 'Entrer dans BYAN',
  'onboarding.error.folderPicker': "Impossible d'ouvrir le sélecteur de dossier.",
  'onboarding.error.noFolder': 'Choisis ou saisis un dossier de projet.',
  'onboarding.error.detection': 'La détection a échoué.',
  'onboarding.error.noPlatform': 'Choisis au moins une plateforme, ou passe cette étape.',
  'onboarding.error.preview': "Le calcul de l'aperçu a échoué.",
  'onboarding.error.nothingToWrite': 'Rien à écrire — les plateformes choisies sont déjà configurées.',
  'onboarding.error.allCancelled': 'Toutes les plateformes ont été retirées. Rétablis-en au moins une pour continuer.',

  'login.title': 'Se connecter à BYAN',
  'login.subtitle': 'Choisis ton mode de connexion',
  'login.brandCaption': 'Un produit AcadéNice',
  'login.tab.cloud': 'Cloud',
  'login.tab.local': 'Local',
  'login.tab.custom': 'Personnalisé',
  'login.tab.cloud.description': 'Se connecter au service BYAN dans le cloud',
  'login.tab.local.description': 'Faire tourner BYAN sur cette machine',
  'login.tab.custom.description': 'Instance BYAN que tu héberges toi-même',
  'login.cloud.url.label': 'URL du cloud BYAN',
  'login.token.label': "Jeton d'API",
  'login.token.show': 'Afficher le jeton',
  'login.token.hide': 'Masquer le jeton',
  'login.getToken': 'Obtenir un jeton',
  'login.connect': 'Se connecter',
  'login.connecting': 'Connexion...',
  'login.local.body': 'Lance un serveur BYAN embarqué en local. Aucune connexion internet nécessaire.',
  'login.local.start': 'Démarrer le serveur local',
  'login.local.starting': 'Démarrage du serveur...',
  'login.local.running': 'Serveur actif sur {url}',
  'login.local.token.label': 'Jeton (optionnel)',
  'login.local.token.placeholder': 'Laisse vide pour le mode dev',
  'login.local.connect': 'Se connecter en local',
  'login.custom.body': 'Connecte-toi à une instance BYAN que tu héberges toi-même.',
  'login.custom.url.label': 'URL du serveur',
  'login.error.invalidToken': 'Jeton invalide ou refusé par le serveur.',
  'login.error.unreachable': "Serveur inaccessible. Vérifie l'URL et ta connexion.",
  'login.error.cancelled': 'Connexion annulée.',
  'login.error.unknown': 'Erreur inconnue pendant la connexion.',
  'login.error.generic': 'Erreur de connexion.',
  'login.error.serverStart': 'Impossible de démarrer le serveur local.',

  'chat.engine.group': 'Moteur local',
  'chat.engine.claude': 'Chat local via claude',
  'chat.engine.codex': 'Chat local via codex',
  'chat.engine.codex.missing': 'codex introuvable sur cette machine',
  'chat.engine.set': 'Moteur {engine} pour la prochaine session.',
  'chat.cwd.pick': 'Choisir un dossier',
  'chat.cwd.pick.title': 'Choisir un dossier de projet',
  'chat.cwd.default': '{path} (dossier retenu par défaut — clique pour en choisir un autre)',
  'chat.model.auto': 'modèle auto',
  'chat.model.title': 'Modèle de la prochaine session {engine}',
  'chat.model.cliDefault': 'Défaut du CLI',
  'chat.model.other': 'Autre modèle : /model <nom>',
  'chat.model.set': 'Modèle {model} pour la prochaine session {engine}.',
  'chat.model.reset': 'Modèle par défaut de {engine} restauré.',
  'chat.effort.auto': 'effort auto',
  'chat.effort.title': 'Effort de raisonnement (codex) — appliqué au prochain message',
  'chat.effort.set': 'Effort {level} dès le prochain message.',
  'chat.effort.reset': 'Effort par défaut restauré.',
  'chat.effort.unknown': 'Effort inconnu : "{value}". Valeurs acceptées : {values}.',
  'chat.usage.title': 'Consommation de la session',
  'chat.usage.badge': 'Consommation ({count})',
  'chat.sessions.title': 'Reprendre une session',
  'chat.sessions.empty': 'Aucune session enregistrée.',
  'chat.sessions.emptyMessage': '(vide)',
  'chat.sessions.resumable': 'reprenable',
  'chat.session.new': 'Nouvelle session',
  'chat.session.new.title': 'Nouvelle session locale',
  'chat.session.new.done': 'Nouvelle session locale.',
  'chat.session.new.agent': "Nouvelle session avec l'agent {agent}.",
  'chat.session.new.noAgent': 'Nouvelle session sans agent.',
  'chat.empty.title': 'Chat local avec {engine} sur cette machine.',
  'chat.empty.starting': "Ouverture de la session — ce que tu écris sera envoyé dès qu'elle répond.",
  'chat.empty.open': 'Session ouverte, aucun message pour le moment. Écris quelque chose.',
  'chat.empty.idle': 'Envoie un message — une session démarre toute seule.',
  'chat.input.placeholder': 'Message, ou / pour une commande (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)',
  'chat.input.streaming': '{engine} répond...',
  'chat.send': 'Envoyer',
  'chat.stop': 'Interrompre',

  'usage.title': 'Consommation',
  'usage.close': 'Fermer',
  'usage.aria': 'Consommation de la session',
  'usage.empty': 'Aucun tour mesuré dans cette session.',
  'usage.metric.cost': 'Coût',
  'usage.metric.duration': 'Durée',
  'usage.metric.input': 'Entrée',
  'usage.metric.cachedInput': 'Entrée en cache',
  'usage.metric.cacheWrite': 'Écriture de cache',
  'usage.metric.output': 'Sortie',
  'usage.metric.reasoning': 'Raisonnement',
  'usage.recap.input': 'entrée',
  'usage.recap.output': 'sortie',
  'usage.turn.one': 'tour',
  'usage.turn.many': 'tours',
  'usage.recent': 'Derniers tours ({count})',
  'usage.gap.claude': 'claude ne publie aucun détail de tokens : seuls le coût et la durée sont rapportés.',
  'usage.gap.codex': 'codex ne rapporte aucun montant en dollars (abonnement) : seuls les tokens le sont.',
  'usage.scope': "Session en cours uniquement. Rien n'est conservé au redémarrage de l'application.",

  'preview.action.create': 'créer',
  'preview.action.update': 'mettre à jour',
  'preview.action.conflict': 'remplacer',
  'preview.action.skip': 'inchangé',
  'preview.keepMine': 'Décoche pour conserver ta version',
  'preview.skip.body': 'Le fichier est déjà identique — rien ne sera écrit.',
  'preview.loading': 'Chargement...',
  'preview.empty': 'Fichier vide.',
  'preview.unreadable': 'Lecture impossible.',
  'preview.truncated': "... (tronqué pour l'affichage)",

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

// Translate a key for a given locale, falling back to the default locale
// (French) then to the key itself so something always renders.
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const localeMap = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const template = localeMap[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return formatMessage(template, params);
}

// Detect a sensible default from navigator.language. Falls back to the default
// locale (French) when the browser locale is not one of our supported tags —
// this app is French-first, so an unknown browser tag lands on French, not on
// English.
export function detectLocale(navigatorLanguage: string | undefined): Locale {
  if (!navigatorLanguage) return DEFAULT_LOCALE;
  const tag = navigatorLanguage.toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(tag) ? (tag as Locale) : DEFAULT_LOCALE;
}
