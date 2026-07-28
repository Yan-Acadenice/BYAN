// Settings — l._settings ported to React, extends existing IPC logic.
// Sections: Connection / Appearance / Language / API Authentication / About /
// Powered by Acadenice.
//
// Every colour on this page goes through the commutable role tokens
// (surface-*, content-*, edge-*, accent-*) rather than the ink-*/byan-* aliases.
// Those aliases are FIXED DARK values: a light-theme selector sitting on a page
// that stays dark would be the one screen in the app guaranteed to contradict
// itself.

import React, { useCallback, useRef, useState } from 'react';
import {
  LogOut,
  KeyRound,
  Info,
  ArrowLeftRight,
  ExternalLink,
  Languages,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { LOCALES, type Locale } from '../i18n/locales';
import { useAppVersion, formatVersion } from '../hooks/useAppVersion';
import { useTheme, type ThemeChoice, type ResolvedTheme } from '../hooks/useTheme';

interface SettingsProps {
  onLogout?: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {/* The floor, not below it: this label is informative, so it stops at
          content-tertiary. text-content-tertiary mapped to the sub-floor rung. */}
      <p className="text-[10px] uppercase tracking-[0.15em] text-content-tertiary mb-1.5">{label}</p>
      <div className="text-sm text-content-strong">{children}</div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-xs mb-md">
      <Icon size={14} className="text-accent-action" />
      <h3 className="font-h3 text-h3 text-content-strong">{title}</h3>
    </div>
  );
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
};

// ---------------------------------------------------------------------------
// Appearance — the three-state selector
// ---------------------------------------------------------------------------

const THEME_OPTIONS: readonly { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'dark', label: 'Sombre', hint: 'La surface sombre. Le défaut de l’application.' },
  { value: 'light', label: 'Clair', hint: 'La rampe AcadéNice lue par l’autre bout.' },
  { value: 'system', label: 'Système', hint: 'Suit le système, même en pleine réponse.' },
];

// The miniatures are the ONE place on this page that must NOT use the role
// tokens. A preview of the light theme has to look light while the dark theme is
// active, so its values are literals pinned to the spec. This is also why the
// screen is worth a preview at all: Paramètres -> Apparence is the only place
// the two themes meet, so it is the only place a side-by-side has meaning.
const PREVIEW: Record<ResolvedTheme, {
  page: string; card: string; border: string; ink: string; muted: string; accent: string;
}> = {
  dark: {
    page: '#0C1312',   // neutral-1000
    card: '#131E1D',   // neutral-975
    border: 'rgba(208, 245, 240, 0.12)',
    ink: '#DCE8E7',    // neutral-200, body
    muted: '#6B9190',  // neutral-500, the floor in dark
    accent: '#4CCCB8', // primary
  },
  light: {
    page: '#F7FAFA',   // neutral-50
    card: '#FFFFFF',
    border: '#BDD0CF', // neutral-300
    ink: '#1A2827',    // neutral-950, body
    muted: '#527472',  // neutral-600, the floor in light (swapped)
    accent: '#1C7269', // teal-700, one rung down for a light ground
  },
};

function ThemeMiniature({ theme, half = false }: { theme: ResolvedTheme; half?: boolean }) {
  const p = PREVIEW[theme];
  return (
    <span
      aria-hidden="true"
      className={`block h-full ${half ? 'w-1/2' : 'w-full'} p-1.5`}
      style={{ background: p.page }}
    >
      <span
        className="flex h-full w-full flex-col justify-center gap-1 rounded-[3px] border p-1.5"
        style={{ background: p.card, borderColor: p.border }}
      >
        <span className="block h-1 w-3/4 rounded-full" style={{ background: p.ink }} />
        <span className="block h-1 w-1/2 rounded-full" style={{ background: p.muted }} />
        <span className="mt-0.5 block h-1.5 w-2/5 rounded-full" style={{ background: p.accent }} />
      </span>
    </span>
  );
}

function ThemeOptionPreview({ choice }: { choice: ThemeChoice }) {
  return (
    <span className="flex h-12 w-full overflow-hidden rounded-md border border-edge-subtle">
      {choice === 'system' ? (
        // Literally side by side: the two themes meeting, which is what
        // "système" means.
        <>
          <ThemeMiniature theme="dark" half />
          <ThemeMiniature theme="light" half />
        </>
      ) : (
        <ThemeMiniature theme={choice} />
      )}
    </span>
  );
}

const RESOLVED_LABEL: Record<ResolvedTheme, string> = {
  dark: 'sombre',
  light: 'clair',
};

function AppearanceSection() {
  const { choice, resolved, system, deferred, setChoice } = useTheme();
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Roving tabindex plus arrow keys: a three-state selector is a radiogroup, and
  // a radiogroup that only answers to the mouse is a radiogroup in name only.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const count = THEME_OPTIONS.length;
      const current = THEME_OPTIONS.findIndex((o) => o.value === choice);
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % count;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + count) % count;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      if (next < 0) return;
      e.preventDefault();
      setChoice(THEME_OPTIONS[next].value);
      radioRefs.current[next]?.focus();
    },
    [choice, setChoice]
  );

  return (
    <div className="bg-surface-card border border-edge-strong rounded-lg p-md">
      <SectionHeader icon={Palette} title="Apparence" />
      <p className="font-body-sm text-body-sm text-content-secondary mb-md leading-relaxed">
        Le thème de l&rsquo;interface. Trois choix, pas deux : « Système » laisse le système
        d&rsquo;exploitation décider, et le thème peut donc changer sans que tu agisses.
      </p>

      <div
        role="radiogroup"
        aria-label="Thème de l&rsquo;interface"
        className="grid grid-cols-3 gap-sm"
        onKeyDown={onKeyDown}
        data-testid="theme-selector"
      >
        {THEME_OPTIONS.map((option, index) => {
          const checked = option.value === choice;
          return (
            <button
              key={option.value}
              ref={(el) => {
                radioRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              // Roving tabindex: one stop for the whole group.
              tabIndex={checked ? 0 : -1}
              onClick={() => setChoice(option.value)}
              data-testid={`theme-option-${option.value}`}
              className={[
                'flex flex-col gap-xs rounded-lg border p-sm text-left transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                checked
                  ? 'border-accent-action bg-wash-action'
                  : 'border-edge-strong bg-surface-fill hover:bg-surface-fill-hover',
              ].join(' ')}
            >
              <ThemeOptionPreview choice={option.value} />
              <span
                className={`font-h3 text-h3 ${checked ? 'text-on-wash-action' : 'text-content-body'}`}
              >
                {option.label}
              </span>
              <span className="font-caption text-caption text-content-tertiary leading-snug">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* No mute command: "Système" has to say what it resolved to, otherwise the
          user picks a setting and sees nothing change. */}
      {choice === 'system' && (
        <p
          className="font-caption text-caption text-content-tertiary mt-md"
          data-testid="theme-resolved-note"
        >
          Le système demande le thème {RESOLVED_LABEL[system]}
          {resolved === system
            ? ` — c’est celui qui est appliqué.`
            : ` — le changement est retenu, il s’appliquera à la fermeture.`}
        </p>
      )}

      {/* The held flip, stated. A background that changed while the user reads
          "this will overwrite three files" is the worst possible instant, so the
          flip waits — but waiting silently would look like a broken setting. */}
      {deferred && (
        <p
          className="font-caption text-caption text-on-wash-change bg-wash-change border border-edge-change rounded-md px-sm py-xs mt-sm"
          role="status"
          data-testid="theme-deferred-note"
        >
          Le système est passé en thème {RESOLVED_LABEL[system]}. Le changement s&rsquo;applique
          dès que la fenêtre de confirmation ouverte est fermée.
        </p>
      )}
    </div>
  );
}

export default function Settings({ onLogout }: SettingsProps) {
  // A version literal cannot stay true; read the running binary.
  const appVersion = useAppVersion();
  const [loggingOut, setLoggingOut] = useState(false);
  const { locale, setLocale } = useT();

  const handleSwitchMode = async () => {
    setLoggingOut(true);
    try {
      await window.byanApi.auth.logout();
    } catch {
      // Ignore — logout clears local state even if server call fails.
    } finally {
      setLoggingOut(false);
      onLogout?.();
    }
  };

  const openAcadenice = () => void window.byanApi.app.openExternal('https://acadenice.fr');
  const openContact = () => void window.byanApi.app.openExternal('https://acadenice.fr/contact');

  return (
    <div className="space-y-lg max-w-2xl">
      {/* Page header */}
      <div>
        <p className="section-title">System</p>
        <h1 className="page-title mt-0.5">Settings</h1>
        <p className="font-body-sm text-body-sm text-content-secondary mt-xs">Connection, appearance, API, security</p>
      </div>

      {/* Connection mode switch */}
      <div className="bg-surface-card border border-edge-strong rounded-lg p-md">
        <SectionHeader icon={ArrowLeftRight} title="Connection mode" />
        <p className="font-body-sm text-body-sm text-content-secondary mb-md leading-relaxed">
          Switch between Cloud, Local, and Custom modes without reinstalling the application.
        </p>
        <button
          type="button"
          onClick={() => void handleSwitchMode()}
          disabled={loggingOut}
          className="btn-secondary btn-sm flex items-center gap-xs"
          data-testid="switch-mode-btn"
        >
          {loggingOut ? (
            <>
              <LogOut size={13} className="animate-pulse" />
              Signing out...
            </>
          ) : (
            <>
              <ArrowLeftRight size={13} />
              Switch login mode
            </>
          )}
        </button>
      </div>

      {/* Appearance — the three-state theme selector */}
      <AppearanceSection />

      {/* Language */}
      <div className="bg-surface-card border border-edge-strong rounded-lg p-md">
        <SectionHeader icon={Languages} title="Language" />
        <p className="font-body-sm text-body-sm text-content-secondary mb-md leading-relaxed">
          Interface language. Changes apply instantly across the app.
        </p>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="bg-surface-hover border border-edge-strong rounded px-sm py-xs text-content-body font-body-sm focus:outline-none focus:border-accent-action"
          aria-label="Interface language"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
          ))}
        </select>
      </div>

      {/* API Authentication */}
      <div className="bg-surface-card border border-edge-strong rounded-lg p-md">
        <SectionHeader icon={KeyRound} title="API Authentication" />
        <div className="space-y-md">
          <Field label="Bearer token">
            {/* A path-shaped value: opaque surface, never glass (section 3.4). */}
            <code className="inline-flex items-center px-sm py-xs rounded bg-surface-raised border border-edge-subtle font-mono-code text-mono-code text-content-body">
              Authorization: Bearer &lt;token&gt;
            </code>
          </Field>
          <Field label="API Key">
            <code className="inline-flex items-center px-sm py-xs rounded bg-surface-raised border border-edge-subtle font-mono-code text-mono-code text-content-body">
              Authorization: ApiKey &lt;key&gt;
            </code>
          </Field>
        </div>
      </div>

      {/* About */}
      <div className="bg-surface-card border border-edge-strong rounded-lg p-md">
        <SectionHeader icon={Info} title="About" />
        <div className="space-y-xs">
          <p className="font-body text-body text-content-body">
            <span className="text-gradient-primary font-semibold">BYAN</span>
            {' — '}Builder of YAN · Agent Orchestration Platform
          </p>
          <p className="font-body-sm text-body-sm text-content-secondary">
            Merise Agile + TDD &middot; 64 Mantras{appVersion ? ` · ${formatVersion(appVersion)}` : ''}
          </p>
        </div>
      </div>

      {/* Powered by Acadenice */}
      <div className="bg-surface-card border border-edge-strong rounded-lg p-md">
        <div className="flex items-start gap-md">
          {/* Wordmark placeholder — SVG import via img */}
          <img
            src="/assets/branding/logo-acadenice_2coul.svg"
            alt="AcadéNice"
            style={{ width: '120px' }}
            className="mt-xs flex-shrink-0"
          />
          <div className="flex-1">
            <p className="font-body-sm text-body-sm text-content-secondary italic mb-xs">
              Former avec rigueur. Accompagner avec humanité.
            </p>
            {/* Informative prose stops at the floor. It was on the sub-floor rung
                (ink-500), which is reserved for a dash and for decoration. */}
            <p className="font-body-sm text-body-sm text-content-tertiary mb-md leading-relaxed">
              BYAN est un produit du CFA AcadéNice à Nice — formations digital, dev et design en alternance.
            </p>
            <div className="flex items-center gap-md">
              <button
                type="button"
                onClick={openAcadenice}
                // A link is the action role, so it takes the action token. The
                // literal acadenice-teal is 1.9:1 on a white ground; the token is
                // teal-700 there and teal-400 in dark.
                className="flex items-center gap-xs font-caption text-caption text-accent-action hover:brightness-110 transition-[filter]"
              >
                <ExternalLink size={12} />
                acadenice.fr
              </button>
              <button
                type="button"
                onClick={openContact}
                className="flex items-center gap-xs font-caption text-caption text-content-secondary hover:text-content-strong transition-colors"
              >
                Contact
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
