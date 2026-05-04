// Sidebar — 240px fixed left nav for the AppShell.
// Design: Stitch a._app_shell_template translated to React + lucide icons.
// Active state: bg-white/5 + left 2px bar byan-500.
// Bottom: Acadenice co-branding block + user profile.

import React from 'react';
import {
  LayoutDashboard,
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

export type NavPage =
  | 'dashboard'
  | 'projects'
  | 'agents'
  | 'memory'
  | 'knowledge'
  | 'sessions'
  | 'mcp'
  | 'settings';

interface NavItem {
  id: NavPage;
  label: string;
  Icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', Icon: FolderOpen },
  { id: 'agents', label: 'Agents', Icon: Bot },
  { id: 'memory', label: 'Memory', Icon: BrainCircuit },
  { id: 'knowledge', label: 'Knowledge', Icon: BookOpen },
  { id: 'sessions', label: 'Sessions', Icon: History },
  { id: 'mcp', label: 'MCP Servers', Icon: Terminal },
];

interface SidebarProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
}

function openAcadenice() {
  void window.byanApi.app.openExternal('https://acadenice.fr');
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <nav
      className="fixed left-0 top-0 h-full flex flex-col py-4 z-50 bg-ink-900 border-r border-ink-800"
      style={{ width: '240px' }}
      aria-label="Sidebar Navigation"
    >
      {/* Brand header */}
      <div className="px-md mb-lg">
        <h1 className="font-h1 text-h1 text-byan-500 font-black tracking-tight">BYAN</h1>
        <span className="font-mono-code text-mono-code text-ink-400">Orchestrator</span>
      </div>

      {/* Navigation links */}
      <ul className="flex flex-col gap-base flex-1 px-sm">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activePage === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onNavigate(id)}
                className={[
                  'w-full flex items-center gap-sm px-sm py-sm rounded transition-all duration-150 border-l-2',
                  isActive
                    ? 'bg-white/5 text-byan-400 border-byan-500'
                    : 'text-ink-400 border-transparent hover:bg-ink-800 hover:text-ink-100',
                ].join(' ')}
              >
                <Icon size={16} />
                <span className="font-label text-label uppercase">{label}</span>
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
                ? 'bg-white/5 text-byan-400 border-byan-500'
                : 'text-ink-400 border-transparent hover:bg-ink-800 hover:text-ink-100',
            ].join(' ')}
          >
            <Settings size={16} />
            <span className="font-label text-label uppercase">Settings</span>
          </button>
        </li>
      </ul>

      {/* Acadenice co-branding block */}
      <div className="mx-sm mt-sm border-t border-ink-800 pt-sm">
        <button
          type="button"
          onClick={openAcadenice}
          title="AcadéNice — Former avec rigueur. Accompagner avec humanité."
          className="w-full flex items-center gap-xs px-xs py-xs rounded hover:bg-ink-800 transition-colors group"
        >
          <AcadeniceBadge size={16} />
          <div className="flex flex-col items-start leading-tight">
            <span className="font-medium text-[11px] text-ink-300 group-hover:text-acadenice-teal transition-colors">
              AcadéNice
            </span>
            <span className="text-[10px] italic text-ink-500">Former avec rigueur</span>
          </div>
          <ExternalLink size={10} className="ml-auto text-ink-600 group-hover:text-ink-400" />
        </button>
      </div>
    </nav>
  );
}
