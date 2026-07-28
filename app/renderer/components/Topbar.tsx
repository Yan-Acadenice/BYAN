// Topbar — 48px fixed top bar for the AppShell.
// Left: breadcrumb. Right: search (Cmd+K visual), notifications placeholder,
// Acadenice monogram link (20px, teal, opens acadenice.fr).

import React from 'react';
import { Search, User } from 'lucide-react';
import AcadeniceBadge from './AcadeniceBadge';
import OfflineIndicator from './OfflineIndicator';
import { useT } from '../i18n/I18nContext';

interface TopbarProps {
  breadcrumb: string;
}

function openAcadenice() {
  void window.byanApi.app.openExternal('https://acadenice.fr');
}

export default function Topbar({ breadcrumb }: TopbarProps) {
  const { t } = useT();
  return (
    <header
      className="flex justify-between items-center px-6 w-full z-40 bg-surface-card border-b border-edge-subtle sticky top-0"
      style={{ height: '48px' }}
    >
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-xs font-body text-body-sm text-content-tertiary">
        <span className="text-content-tertiary">{t('topbar.brand')}</span>
        <span className="text-content-muted mx-1">/</span>
        <span className="text-content-body font-medium">{breadcrumb}</span>
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-md">
        {/* Offline / unstable indicator (hidden when fully online) */}
        <OfflineIndicator />

        {/* Search (visual only — Cmd+K handled elsewhere) */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-sm top-1/2 -translate-y-1/2 text-content-tertiary"
          />
          <input
            type="text"
            readOnly
            placeholder={t('topbar.search.placeholder')}
            className="bg-surface-page border border-edge-strong rounded h-8 pl-8 pr-md font-body-sm text-body-sm text-content-body focus:outline-none focus:ring-2 focus:ring-teal-400/30 w-48 cursor-pointer placeholder:text-content-tertiary"
          />
          <span className="absolute right-sm top-1/2 -translate-y-1/2 font-mono-code text-[10px] text-content-tertiary border border-edge-strong rounded px-1 bg-surface-card">
            Cmd+K
          </span>
        </div>

        {/* Profile avatar */}
        <div className="w-8 h-8 rounded bg-surface-hover border border-edge-strong flex items-center justify-center cursor-pointer hover:-translate-y-px hover:border-edge-strong transition-all">
          <User size={14} className="text-content-secondary" />
        </div>

        {/* Acadenice monogram — rightmost element */}
        <button
          type="button"
          onClick={openAcadenice}
          title="AcadéNice — Open in browser"
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-surface-hover transition-colors"
          aria-label="AcadéNice"
        >
          <AcadeniceBadge size={20} />
        </button>
      </div>
    </header>
  );
}
