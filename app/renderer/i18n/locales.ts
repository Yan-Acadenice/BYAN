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

  // ── The job — making a workflow's work visible ────────────────────────────
  //
  // The vocabulary below is locked by the design handoff and is NOT open for
  // re-negotiation. Every screen that shows work in progress reads from here,
  // so no component ever has to hard-code a label.
  //
  // Four words carry the whole decision:
  //   - "teammate", never "agent" and never "worker". The agent/worker split is
  //     topological, not hierarchical, so the interface reads it as a SENIORITY
  //     ladder instead: junior -> mid-level -> senior -> expert. The bottom rung
  //     is the worker; the three above it are the agents. No model name is ever
  //     shown — haiku / sonnet / opus / fable stay inside the machine.
  //   - "stopped along the way", never "failed". Work that stopped still left
  //     something behind, and the word has to say so.
  //   - "estimated cost", never "total spent". The subscription does not move;
  //     the figure exists to compare one job against another, not to pay.
  //   - confidence is BINARY. "I am sure" / "I am not sure", never a percentage.
  //     The useful half of the sentence is WHAT it is hesitating about.
  //
  // __tests__/i18n.test.ts scans this namespace, in both languages, for the
  // words that must never come back. The scan is scoped to `work.*` on purpose:
  // the chat and usage screens legitimately name their engine and their model,
  // and those strings belong to other screens.

  // The frame
  'work.title': 'The job',
  'work.subtitle': 'Who is working, on what, and what it is estimated to cost.',
  'work.aria': 'Work in progress',
  'work.open': 'Open the job',
  'work.close': 'Close the job',
  'work.phase': 'Step {index} of {total} — {name}',
  'work.phase.current': 'We are here',
  'work.phase.done': 'Step finished',
  'work.phase.pending': 'Not started yet',

  // How the work is laid out. Two shapes, and no hierarchy between them.
  'work.shape.parallel': 'at the same time',
  'work.shape.parallel.detail': 'These people work at the same time. Nothing moves on until every one of them has handed in.',
  'work.shape.chained': 'one after the other',
  'work.shape.chained.detail': 'Each one picks up where the previous one left off.',

  // The people. First names and a plain-language trade, so nobody has to know
  // what an "architect agent" is to read the screen.
  'work.people.title': 'Who worked on this',
  'work.people.one': 'teammate',
  'work.people.many': 'teammates',
  'work.people.count': '{count} teammates',
  'work.people.count.one': 'One teammate',
  'work.people.notBilled': 'is not billed',
  'work.people.notBilled.detail': 'Hermes and BYAN hand out the work and keep the job on course. They do not count towards the estimated cost.',
  'work.people.winston.name': 'Winston',
  'work.people.winston.role': 'Draws the plan before anything gets built.',
  'work.people.amelia.name': 'Amelia',
  'work.people.amelia.role': 'Writes the code.',
  'work.people.quinn.name': 'Quinn',
  'work.people.quinn.role': 'Tries to break what has just been made.',
  'work.people.barry.name': 'Barry',
  'work.people.barry.role': 'Takes a small job and sees it through alone.',
  'work.people.murat.name': 'Murat',
  'work.people.murat.role': 'Sets up the test bench and decides what gets measured.',
  'work.people.carmack.name': 'Carmack',
  'work.people.carmack.role': 'Trims the fat: fewer moves, less spending.',
  'work.people.rachid.name': 'Rachid',
  'work.people.rachid.role': 'Packs it up and puts it online.',
  // DECISION EN ATTENTE: prenom du relecteur adverse — "Cassandre" is the
  // proposed default (the one who sees the problem and is not listened to).
  // The designer marked this blocking; change the value here, not in a
  // component, once it is settled.
  'work.people.reviewer.name': 'Cassandre',
  'work.people.reviewer.role': 'Looks for what is wrong, even when everything looks fine.',
  'work.people.hermes.name': 'Hermes',
  'work.people.hermes.role': 'Hands out the work. Does not do the work.',
  'work.people.byan.name': 'BYAN',
  'work.people.byan.role': 'Keeps the job on course from start to finish.',

  // The four states. There is no fifth: "handed in but worth a second look" is
  // carried by amber, not by a fifth colour.
  'work.state.running.badge': 'at work',
  'work.state.running.sentence': '{name} is working right now.',
  'work.state.delivered.badge': 'handed in',
  'work.state.delivered.sentence': '{name} handed in the work.',
  'work.state.stopped.badge': 'stopped along the way',
  'work.state.stopped.sentence': 'The work by {name} stopped along the way. Whatever was done before it is kept.',
  'work.state.suspect.badge': 'handed in but suspect',
  'work.state.suspect.sentence': '{name} handed in the work, but one signal says to read it again before leaning on it.',
  'work.state.legend': 'Four states, and no others: at work, handed in, stopped along the way, handed in but suspect.',

  // The four seniority rungs. This is what replaces the model names.
  'work.level.title': 'Level',
  'work.level.junior': 'junior',
  'work.level.junior.hint': 'For reading, searching, spotting. The cheapest hour.',
  'work.level.confirmed': 'mid-level',
  'work.level.confirmed.hint': 'For comparing, sorting, checking what can be checked without argument.',
  'work.level.senior': 'senior',
  'work.level.senior.hint': 'For writing, deciding, and reading back what matters.',
  'work.level.expert': 'expert',
  'work.level.expert.hint': 'For the cases where everything else has stalled. The dearest hour.',
  'work.level.scale': 'From junior to expert: the higher it goes, the dearer the hour. It is the first lever on the estimated cost.',
  'work.level.assigned': '{name}, {level}',

  // The three mechanical signals. None of them judges the work.
  'work.doubt.title': 'Three things worth checking again',
  'work.doubt.open': 'See what is worth checking again',
  'work.doubt.none': 'Nothing to flag on this job.',
  'work.doubt.disclaimer': 'None of these three signals judges the quality of the work. They only say where to look first.',
  'work.doubt.empty': 'came back empty-handed',
  'work.doubt.empty.detail': '{name} searched through {target} and brought nothing back. A scouting step that finds nothing leaves everything after it working blind.',
  'work.doubt.duration': 'unusual time',
  'work.doubt.duration.detail': '{name} took {duration}, where neighbouring tasks of the same kind fit in {reference}.',
  'work.doubt.downstream': 'everything else leans on it',
  'work.doubt.downstream.detail': '{count} people picked this up as it was. If it is wrong, everything after it is wrong too.',

  // What going back would cost. Never shown as a fact — it is an estimate.
  'work.rewind.title': 'What going back would cost',
  'work.rewind.open': 'See what going back would cost',
  'work.rewind.from': 'Pick it up again from {name}',
  'work.rewind.cost': 'Estimated cost of going back: {amount}',
  'work.rewind.people': '{count} teammates would have to start again',
  'work.rewind.people.one': 'One teammate would have to start again',
  'work.rewind.duration': 'Time already spent that would have to be spent again: {duration}',
  'work.rewind.nothing': 'Nothing to redo: this work has not been used by anyone yet.',
  'work.rewind.all': 'Start the whole job again',
  'work.rewind.confirm': 'Pick it up here',
  'work.rewind.cancel': 'Leave it as it is',
  'work.rewind.warning': 'Everything done after {name} would have to be done again too.',
  'work.rewind.estimate': 'That figure is an estimate, like every other figure on this screen.',

  // The raised hand — someone is waiting on a go-ahead.
  'work.hand.title': 'Someone raised a hand',
  'work.hand.body': '{name} is waiting for your go-ahead to {action}.',
  'work.hand.since': 'The hand has been up for {duration}.',
  'work.hand.idle': 'While the hand is up, {name} costs nothing.',
  'work.hand.allow': 'Go ahead',
  'work.hand.deny': 'No, leave it',
  'work.hand.allowAlways': 'Go ahead, and stop asking me for this',
  'work.hand.none': 'Nobody is waiting on you.',
  'work.hand.answered': 'Answer recorded.',
  'work.hand.count': '{count} hands up',
  'work.hand.count.one': 'One hand up',

  // The permission log — every answer you gave, kept and reversible.
  'work.permissions.title': 'What you allowed',
  'work.permissions.open': 'See what you allowed',
  'work.permissions.subtitle': 'Every answer you gave, in order.',
  'work.permissions.empty': 'You have not had to allow anything yet.',
  'work.permissions.allowed': 'You said yes to {name} for {action}.',
  'work.permissions.denied': 'You said no to {name} for {action}.',
  'work.permissions.always': 'You said yes once and for all to {action}.',
  'work.permissions.revoke': 'Take this back',
  'work.permissions.revoked': 'Permission taken back. You will be asked again.',

  // The minutes — third reading depth, behind a button.
  'work.minute.title': 'The minutes',
  'work.minute.subtitle': 'Every move, in the order it happened.',
  'work.minute.open': 'See the minutes',
  'work.minute.close': 'Close the minutes',
  'work.minute.empty': 'Nothing has been recorded yet.',
  'work.minute.step': '{name} — {what}',
  'work.minute.step.ongoing': 'still going',
  'work.minute.at': 'at {time}',
  'work.minute.took': 'took {duration}',
  'work.minute.now': 'now',

  // Time. A dash is not a zero here either.
  'work.duration.label': 'time spent',
  'work.duration.total': 'Time spent on the job',
  'work.duration.overlap': 'The total is not the sum: whatever runs at the same time overlaps.',
  'work.duration.unknown': '—',
  'work.duration.unknown.reason': 'Time unknown: the start was recorded, the end was not.',

  // Money. Always an estimate, and it says so on the screen.
  'work.cost.label': 'estimated cost',
  'work.cost.total': 'Estimated cost of the job',
  'work.cost.person': 'Estimated cost per person',
  'work.cost.estimate': 'These amounts are estimates. Your subscription does not move: the figure is there to compare one job against another, not to pay.',
  'work.cost.unknown': '—',
  'work.cost.unknown.reason': 'This engine reports no amount: it runs on a subscription. A dash, not a zero.',
  'work.cost.idle': 'Someone standing still costs nothing: the meter only runs while they work.',

  // Confidence — binary, and the useful half is what it hesitates about.
  //
  // The `.masculine` twins carry no meaning in English and repeat the base
  // string. They exist because the French phrase agrees with the speaker's
  // gender, and five of the seven first names on screen are masculine. Without
  // them a component would have to build the agreement by hand, which is the
  // hard-coded label this file exists to prevent.
  'work.confidence.sure': 'I am sure',
  'work.confidence.sure.masculine': 'I am sure',
  'work.confidence.unsure': 'I am not sure',
  'work.confidence.unsure.masculine': 'I am not sure',
  'work.confidence.unsure.about': 'I am not sure about {target}.',
  'work.confidence.unsure.about.masculine': 'I am not sure about {target}.',
  'work.confidence.sure.detail': '{name} flags no doubt about this piece of work.',
  'work.confidence.unsure.detail': '{name} flags a doubt about {target}.',
  'work.confidence.rule': 'It is either sure or it is not. Never a percentage — what counts is what it is hesitating about.',

  // The delivery note — second reading depth.
  'work.delivery.title': 'The delivery note',
  'work.delivery.subtitle': 'What was handed in, by whom, at what estimated cost.',
  'work.delivery.open': 'See the delivery note',
  'work.delivery.close': 'Close the delivery note',
  'work.delivery.column.who': 'Who',
  'work.delivery.column.what': 'What was handed in',
  'work.delivery.column.level': 'Level',
  'work.delivery.column.duration': 'Time spent',
  'work.delivery.column.cost': 'Estimated cost',
  'work.delivery.empty': 'Nothing has been handed in yet.',
  'work.delivery.report.open': 'Read what was handed in',
  'work.delivery.report.close': 'Close it again',
  'work.delivery.report.empty': 'Nothing was written up for this task.',

  // The sentence — first reading depth. One line, no jargon, no numbers to parse.
  'work.phrase.running': '{count} teammates have been working for {duration}.',
  'work.phrase.running.one': 'One teammate has been working for {duration}.',
  'work.phrase.done': 'All {total} teammates handed in. Estimated cost: {amount}.',
  'work.phrase.partial': '{delivered} teammates out of {total} handed in; {stopped} stopped along the way.',
  'work.phrase.suspect': '{delivered} teammates out of {total} handed in, {suspect} of them worth a second look.',
  'work.phrase.waiting': '{name} raised a hand: the job is waiting on you.',

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

  // Le chantier. Vocabulaire verrouille par la passation de design : aucun mot
  // technique a l'ecran. Le detail du raisonnement est en tete du bloc anglais.
  'work.title': 'Le chantier',
  'work.subtitle': 'Qui travaille, sur quoi, et ce que ça coûte, à peu près.',
  'work.aria': 'Le travail en cours',
  'work.open': 'Voir le chantier',
  'work.close': 'Replier le chantier',
  'work.phase': 'Étape {index} sur {total} — {name}',
  'work.phase.current': 'On en est là',
  'work.phase.done': 'Étape terminée',
  'work.phase.pending': 'Pas encore commencée',

  'work.shape.parallel': 'en même temps',
  'work.shape.parallel.detail': "Ces personnes travaillent en même temps. On ne passe à la suite que lorsque tout le monde a rendu.",
  'work.shape.chained': 'à la suite',
  'work.shape.chained.detail': "Chacun reprend là où le précédent s'est arrêté.",

  'work.people.title': 'Qui a travaillé',
  'work.people.one': 'collaborateur',
  'work.people.many': 'collaborateurs',
  'work.people.count': '{count} collaborateurs',
  'work.people.count.one': 'Un collaborateur',
  'work.people.notBilled': "n'est pas facturé",
  'work.people.notBilled.detail': "Hermes et BYAN répartissent le travail et tiennent le cap. Ils ne comptent pas dans le coût estimé.",
  'work.people.winston.name': 'Winston',
  'work.people.winston.role': 'Dessine le plan avant que la première pierre soit posée.',
  'work.people.amelia.name': 'Amelia',
  'work.people.amelia.role': 'Écrit le code.',
  'work.people.quinn.name': 'Quinn',
  'work.people.quinn.role': "Essaie de casser ce qui vient d'être fait.",
  'work.people.barry.name': 'Barry',
  'work.people.barry.role': 'Prend un petit chantier et le mène seul de bout en bout.',
  'work.people.murat.name': 'Murat',
  'work.people.murat.role': "Monte le banc d'essai et décide de ce qu'on mesure.",
  'work.people.carmack.name': 'Carmack',
  'work.people.carmack.role': 'Enlève le gras : moins de gestes, moins de dépense.',
  'work.people.rachid.name': 'Rachid',
  'work.people.rachid.role': 'Emballe et met en ligne.',
  // DECISION EN ATTENTE: prenom du relecteur adverse — defaut propose
  // "Cassandre", celle qui voit le probleme et qu'on n'ecoute pas.
  'work.people.reviewer.name': 'Cassandre',
  'work.people.reviewer.role': "Cherche ce qui cloche, même quand tout a l'air d'aller.",
  'work.people.hermes.name': 'Hermes',
  'work.people.hermes.role': 'Répartit le travail. Ne le fait pas.',
  'work.people.byan.name': 'BYAN',
  'work.people.byan.role': 'Tient le cap du chantier du début à la fin.',

  'work.state.running.badge': 'au travail',
  'work.state.running.sentence': '{name} travaille en ce moment.',
  'work.state.delivered.badge': 'a rendu',
  'work.state.delivered.sentence': '{name} a rendu son travail.',
  'work.state.stopped.badge': "s'est arrêté en route",
  'work.state.stopped.sentence': "Le travail de {name} s'est arrêté en route. Ce qui avait été fait avant est gardé.",
  'work.state.suspect.badge': 'rendu mais suspect',
  'work.state.suspect.sentence': "{name} a rendu, mais un signal demande une relecture avant qu'on s'appuie dessus.",
  'work.state.legend': "Quatre états, et pas un de plus : au travail, a rendu, s'est arrêté en route, rendu mais suspect.",

  'work.level.title': 'Niveau',
  'work.level.junior': 'junior',
  'work.level.junior.hint': "Pour lire, chercher, repérer. C'est l'heure la moins chère.",
  'work.level.confirmed': 'confirmé',
  'work.level.confirmed.hint': 'Pour comparer, trier, vérifier ce qui se vérifie sans discussion.',
  'work.level.senior': 'senior',
  'work.level.senior.hint': 'Pour écrire, décider, et relire ce qui compte.',
  'work.level.expert': 'expert',
  'work.level.expert.hint': "Pour les cas où tout le reste a calé. C'est l'heure la plus chère.",
  'work.level.scale': "Du junior à l'expert : plus on monte, plus l'heure est chère. C'est le premier levier sur le coût estimé.",
  'work.level.assigned': '{name}, {level}',

  'work.doubt.title': 'Trois choses à revérifier',
  'work.doubt.open': 'Voir ce qui est à revérifier',
  'work.doubt.none': 'Rien à signaler sur ce chantier.',
  'work.doubt.disclaimer': "Aucun de ces trois signaux ne juge la qualité du travail. Ils disent seulement où regarder en premier.",
  'work.doubt.empty': 'les mains vides',
  'work.doubt.empty.detail': "{name} a cherché dans {target} et n'a rien rapporté. Une étape de repérage qui ne trouve rien laisse tout ce qui suit travailler à l'aveugle.",
  'work.doubt.duration': 'temps inhabituel',
  'work.doubt.duration.detail': '{name} a mis {duration}, là où les tâches voisines du même genre tiennent en {reference}.',
  'work.doubt.downstream': "tout le reste s'appuie dessus",
  'work.doubt.downstream.detail': "{count} personnes ont repris ce rendu tel quel. S'il est faux, tout ce qui suit l'est aussi.",

  'work.rewind.title': 'Ce que coûterait un retour en arrière',
  'work.rewind.open': 'Voir ce que coûterait un retour en arrière',
  'work.rewind.from': 'Reprendre à partir de {name}',
  'work.rewind.cost': 'Coût estimé du retour : {amount}',
  'work.rewind.people': '{count} collaborateurs seraient à relancer',
  'work.rewind.people.one': 'Un collaborateur serait à relancer',
  'work.rewind.duration': 'Temps déjà passé qui serait perdu : {duration}',
  'work.rewind.nothing': "Rien à refaire : ce travail n'a encore servi à personne.",
  'work.rewind.all': 'Tout reprendre depuis le début',
  'work.rewind.confirm': 'Reprendre ici',
  'work.rewind.cancel': 'Laisser comme ça',
  'work.rewind.warning': 'Ce qui a été fait après {name} serait à refaire aussi.',
  'work.rewind.estimate': "Ce montant est une estimation, comme tous les autres montants à l'écran.",

  'work.hand.title': "Quelqu'un a levé la main",
  'work.hand.body': '{name} attend ton feu vert pour {action}.',
  'work.hand.since': 'La main est levée depuis {duration}.',
  'work.hand.idle': 'Tant que la main est levée, {name} ne consomme rien.',
  'work.hand.allow': 'Vas-y',
  'work.hand.deny': 'Non, laisse',
  'work.hand.allowAlways': 'Vas-y, et ne me redemande plus pour ça',
  'work.hand.none': "Personne n'attend de réponse.",
  'work.hand.answered': 'Réponse enregistrée.',
  'work.hand.count': '{count} mains levées',
  'work.hand.count.one': 'Une main levée',

  'work.permissions.title': 'Ce que tu as autorisé',
  'work.permissions.open': 'Voir ce que tu as autorisé',
  'work.permissions.subtitle': "Chaque réponse que tu as donnée, dans l'ordre.",
  'work.permissions.empty': "Tu n'as encore rien eu à autoriser.",
  'work.permissions.allowed': 'Tu as dit oui à {name} pour {action}.',
  'work.permissions.denied': 'Tu as dit non à {name} pour {action}.',
  'work.permissions.always': 'Tu as dit oui une fois pour toutes pour {action}.',
  'work.permissions.revoke': 'Revenir sur cette autorisation',
  'work.permissions.revoked': 'Autorisation retirée. On te redemandera la prochaine fois.',

  'work.minute.title': 'La minute',
  'work.minute.subtitle': "Chaque geste, dans l'ordre où il a eu lieu.",
  'work.minute.open': 'Voir la minute',
  'work.minute.close': 'Replier la minute',
  'work.minute.empty': "Rien n'a encore été enregistré.",
  'work.minute.step': '{name} — {what}',
  'work.minute.step.ongoing': 'toujours en cours',
  'work.minute.at': 'à {time}',
  'work.minute.took': 'a pris {duration}',
  'work.minute.now': 'maintenant',

  'work.duration.label': 'temps passé',
  'work.duration.total': 'Temps passé sur le chantier',
  'work.duration.overlap': "Le total n'est pas la somme : ce qui se fait en même temps se recouvre.",
  'work.duration.unknown': '—',
  'work.duration.unknown.reason': 'Temps inconnu : le début a été enregistré, la fin non.',

  'work.cost.label': 'coût estimé',
  'work.cost.total': 'Coût estimé du chantier',
  'work.cost.person': 'Coût estimé par personne',
  'work.cost.estimate': "Ces montants sont des estimations. Ton abonnement ne bouge pas : le chiffre sert à comparer deux chantiers entre eux, pas à payer.",
  'work.cost.unknown': '—',
  'work.cost.unknown.reason': "Ce moteur ne rapporte aucun montant : il est sur abonnement. Un tiret, pas un zéro.",
  'work.cost.idle': "Une personne à l'arrêt ne consomme rien : le compteur ne tourne que pendant qu'elle travaille.",

  // La forme feminine est celle qu'a tranchee la passation ; la masculine
  // l'accompagne parce que cinq des sept prenoms a l'ecran sont masculins.
  'work.confidence.sure': 'je suis sûre',
  'work.confidence.sure.masculine': 'je suis sûr',
  'work.confidence.unsure': 'je ne suis pas sûre',
  'work.confidence.unsure.masculine': 'je ne suis pas sûr',
  'work.confidence.unsure.about': "Je ne suis pas sûre de {target}.",
  'work.confidence.unsure.about.masculine': 'Je ne suis pas sûr de {target}.',
  'work.confidence.sure.detail': '{name} ne signale aucun doute sur ce rendu.',
  'work.confidence.unsure.detail': '{name} signale un doute sur {target}.',
  'work.confidence.rule': "C'est sûr ou ça ne l'est pas. Jamais un chiffre — ce qui compte, c'est sur quoi ça hésite.",

  'work.delivery.title': 'Le bon de livraison',
  'work.delivery.subtitle': 'Ce qui a été rendu, par qui, à quel coût estimé.',
  'work.delivery.open': 'Voir le bon de livraison',
  'work.delivery.close': 'Replier le bon de livraison',
  'work.delivery.column.who': 'Qui',
  'work.delivery.column.what': 'Ce qui a été rendu',
  'work.delivery.column.level': 'Niveau',
  'work.delivery.column.duration': 'Temps passé',
  'work.delivery.column.cost': 'Coût estimé',
  'work.delivery.empty': "Rien n'a encore été rendu.",
  'work.delivery.report.open': 'Lire le rendu',
  'work.delivery.report.close': 'Replier le rendu',
  'work.delivery.report.empty': 'Rien de rédigé pour cette tâche.',

  'work.phrase.running': '{count} collaborateurs travaillent depuis {duration}.',
  'work.phrase.running.one': 'Un collaborateur travaille depuis {duration}.',
  'work.phrase.done': 'Les {total} collaborateurs ont rendu. Coût estimé : {amount}.',
  'work.phrase.partial': "{delivered} collaborateurs sur {total} ont rendu ; {stopped} se sont arrêtés en route.",
  'work.phrase.suspect': '{delivered} collaborateurs sur {total} ont rendu, dont {suspect} à revoir.',
  'work.phrase.waiting': '{name} a levé la main : le chantier attend ta réponse.',

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
