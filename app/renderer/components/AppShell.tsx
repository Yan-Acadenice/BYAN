// AppShell — full layout wrapper: Sidebar (240px) + Topbar (48px) + content + StatusStrip (28px).
// Composes Sidebar, Topbar, StatusStrip and provides a scrollable content slot.
// The parent (App.tsx) controls which page is active via activePage / onNavigate.

import React from 'react';
import Sidebar, { type NavPage } from './Sidebar';
import Topbar from './Topbar';
import StatusStrip from './StatusStrip';

interface AppShellProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  breadcrumb: string;
  children: React.ReactNode;
}

export default function AppShell({ activePage, onNavigate, breadcrumb, children }: AppShellProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-surface-page">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />

      {/* Main content wrapper — offset left by sidebar width. `relative` makes
          this column the positioned ancestor of the absolute StatusStrip:
          without it the footer anchored to the WINDOW and its left side (the
          Local/Cloud mode chip) sat unreachable UNDER the fixed sidebar
          (z-50 > z-40) — caught by the switch-mode E2E on the packaged build. */}
      <div className="relative flex-1 flex flex-col" style={{ marginLeft: '240px' }}>
        <Topbar breadcrumb={breadcrumb} />

        {/* Scrollable content area — subtract topbar (48px) + status strip (28px) */}
        <main
          className="flex-1 overflow-y-auto bg-surface-page p-lg pb-xxl relative"
          style={{ height: 'calc(100vh - 48px - 28px)' }}
        >
          <div className="max-w-container-max mx-auto w-full">
            {children}
          </div>
        </main>

        <StatusStrip />
      </div>
    </div>
  );
}
