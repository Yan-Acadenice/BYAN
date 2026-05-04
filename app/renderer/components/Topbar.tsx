// Topbar — 48px fixed top bar for the AppShell.
// Left: breadcrumb. Right: search (Cmd+K visual), notifications placeholder,
// Acadenice monogram link (20px, teal, opens acadenice.fr).

import React from 'react';
import { Search, User } from 'lucide-react';
import AcadeniceBadge from './AcadeniceBadge';

interface TopbarProps {
  breadcrumb: string;
}

function openAcadenice() {
  void window.byanApi.app.openExternal('https://acadenice.fr');
}

export default function Topbar({ breadcrumb }: TopbarProps) {
  return (
    <header
      className="flex justify-between items-center px-6 w-full z-40 bg-ink-900 border-b border-ink-800 sticky top-0"
      style={{ height: '48px' }}
    >
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-xs font-body text-body-sm text-ink-400">
        <span className="text-ink-500">BYAN</span>
        <span className="text-ink-600 mx-1">/</span>
        <span className="text-ink-100 font-medium">{breadcrumb}</span>
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-md">
        {/* Search (visual only — Cmd+K handled elsewhere) */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-sm top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="text"
            readOnly
            placeholder="Search..."
            className="bg-ink-950 border border-ink-700 rounded h-8 pl-8 pr-md font-body-sm text-body-sm text-ink-100 focus:outline-none focus:ring-2 focus:ring-byan-500/30 w-48 cursor-pointer placeholder:text-ink-500"
          />
          <span className="absolute right-sm top-1/2 -translate-y-1/2 font-mono-code text-[10px] text-ink-500 border border-ink-700 rounded px-1 bg-ink-900">
            Cmd+K
          </span>
        </div>

        {/* Profile avatar */}
        <div className="w-8 h-8 rounded bg-ink-800 border border-ink-700 flex items-center justify-center cursor-pointer hover:-translate-y-px hover:border-ink-500 transition-all">
          <User size={14} className="text-ink-300" />
        </div>

        {/* Acadenice monogram — rightmost element */}
        <button
          type="button"
          onClick={openAcadenice}
          title="AcadéNice — Open in browser"
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-ink-800 transition-colors"
          aria-label="AcadéNice"
        >
          <AcadeniceBadge size={20} />
        </button>
      </div>
    </header>
  );
}
