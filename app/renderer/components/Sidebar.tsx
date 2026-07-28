// Sidebar — 240px fixed left nav for the AppShell.
// Design: Stitch a._app_shell_template translated to React + lucide icons.
// Active state: bg-white/5 + left 2px bar byan-500.
// Bottom: Acadenice co-branding block + user profile.

import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  Bot,
  BrainCircuit,
  BookOpen,
  History,
  Terminal,
  Settings,
  ExternalLink,
} from 'lucide-react';
import AcadeniceBadge from './AcadeniceBadge';
import { useT } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/locales';

export type NavPage =
  | 'dashboard'
  | 'chat'
  | 'projects'
  | 'agents'
  | 'memory'
  | 'knowledge'
  | 'sessions'
  | 'mcp'
  | 'settings';

interface NavItem {
  id: NavPage;
  labelKey: MessageKey;
  Icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', Icon: LayoutDashboard },
  { id: 'chat', labelKey: 'nav.chat', Icon: MessageSquare },
  { id: 'projects', labelKey: 'nav.projects', Icon: FolderOpen },
  { id: 'agents', labelKey: 'nav.agents', Icon: Bot },
  { id: 'memory', labelKey: 'nav.memory', Icon: BrainCircuit },
  { id: 'knowledge', labelKey: 'nav.knowledge', Icon: BookOpen },
  { id: 'sessions', labelKey: 'nav.sessions', Icon: History },
  { id: 'mcp', labelKey: 'nav.mcp', Icon: Terminal },
];

interface SidebarProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
}

function openAcadenice() {
  void window.byanApi.app.openExternal('https://acadenice.fr');
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { t } = useT();
  return (
    <nav
      className="fixed left-0 top-0 h-full flex flex-col py-4 z-50 bg-surface-card border-r border-edge-subtle"
      style={{ width: '240px' }}
      aria-label="Sidebar Navigation"
    >
      {/* Brand header */}
      <div className="px-md mb-lg">
        <h1 className="font-h1 text-h1 text-accent-action font-black tracking-tight">BYAN</h1>
        <span className="font-mono-code text-mono-code text-content-tertiary">Orchestrator</span>
      </div>

      {/* Navigation links */}
      <ul className="flex flex-col gap-base flex-1 px-sm">
        {NAV_ITEMS.map(({ id, labelKey, Icon }) => {
          const isActive = activePage === id;
          return (
            <li key={id}>
              <button
                type="button"
                data-testid={`nav-${id}`}
                onClick={() => onNavigate(id)}
                className={[
                  'w-full flex items-center gap-sm px-sm py-sm rounded transition-all duration-150 border-l-2',
                  isActive
                    ? 'bg-white/5 text-accent-action border-accent-action'
                    : 'text-content-tertiary border-transparent hover:bg-surface-hover hover:text-content-body',
                ].join(' ')}
              >
                <Icon size={16} />
                <span className="font-label text-label uppercase">{t(labelKey)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Settings + bottom */}
      <ul className="flex flex-col gap-base px-sm">
        <li>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={[
              'w-full flex items-center gap-sm px-sm py-sm rounded transition-all duration-150 border-l-2',
              activePage === 'settings'
                ? 'bg-white/5 text-accent-action border-accent-action'
                : 'text-content-tertiary border-transparent hover:bg-surface-hover hover:text-content-body',
            ].join(' ')}
          >
            <Settings size={16} />
            <span className="font-label text-label uppercase">{t('nav.settings')}</span>
          </button>
        </li>
      </ul>

      {/* Acadenice co-branding block */}
      <div className="mx-sm mt-sm border-t border-edge-subtle pt-sm">
        <button
          type="button"
          onClick={openAcadenice}
          title="AcadéNice — Former avec rigueur. Accompagner avec humanité."
          className="w-full flex items-center gap-xs px-xs py-xs rounded hover:bg-surface-hover transition-colors group"
        >
          <AcadeniceBadge size={16} />
          <div className="flex flex-col items-start leading-tight">
            <span className="font-medium text-[11px] text-content-secondary group-hover:text-acadenice-teal transition-colors">
              AcadéNice
            </span>
            <span className="text-[10px] italic text-content-tertiary">Former avec rigueur</span>
          </div>
          <ExternalLink size={10} className="ml-auto text-content-muted group-hover:text-content-tertiary" />
        </button>
      </div>
    </nav>
  );
}
