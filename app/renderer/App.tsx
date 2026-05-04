// App — Electron renderer root component.
//
// Routing: lightweight manual router (no react-router dep in this package).
//   - On mount: checks if _byan/config.yaml exists in the current project root.
//   - If missing → /onboarding
//   - If present → /login
//   - After login → /app (AppShell with dashboard)
//
// Project root discovery:
//   The app does not know the project root at renderer start. We read it from
//   the persistent store (written by Onboarding after the user picks a folder).
//   If no stored root, we show Onboarding and let the user pick.

import React, { useEffect, useState } from 'react';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Projects from './pages/Projects';
import Agents from './pages/Agents';
import Memory from './pages/Memory';
import Knowledge from './pages/Knowledge';
import Sessions from './pages/Sessions';
import McpServers from './pages/McpServers';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import AppShell from './components/AppShell';
import type { NavPage } from './components/Sidebar';

type Route = 'loading' | 'onboarding' | 'login' | 'app';

const PAGE_LABELS: Record<NavPage, string> = {
  dashboard: 'Dashboard',
  chat: 'Chat',
  projects: 'Projects',
  agents: 'Agents',
  memory: 'Memory',
  knowledge: 'Knowledge',
  sessions: 'Sessions',
  mcp: 'MCP Servers',
  settings: 'Settings',
};

export default function App() {
  const [route, setRoute] = useState<Route>('loading');
  const [activePage, setActivePage] = useState<NavPage>('dashboard');

  useEffect(() => {
    const init = async () => {
      try {
        // Retrieve the last project root the user configured (stored after onboarding).
        const storedRoot = await window.byanApi.store.get<string>('onboarding.projectRoot');
        if (storedRoot) {
          const configured = await window.byanApi.fs.pathExists(
            storedRoot + '/_byan/config.yaml'
          );
          if (configured) {
            setRoute('login');
            return;
          }
        }
        // No stored root or config.yaml missing — run onboarding.
        setRoute('onboarding');
      } catch {
        // API not available (test env without preload) — show onboarding.
        setRoute('onboarding');
      }
    };
    void init();
  }, []);

  // Listen for native menu actions pushed by main via webContents.send.
  // The menu emits { action: string } on channel 'byan:menu:action'.
  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;
    const unsub = window.byanEvents.on('byan:menu:action', (payload: unknown) => {
      const { action } = (payload as { action?: string }) ?? {};
      if (!action) return;
      if (action === 'newProject' || action === 'openProject' || action === 'import') {
        // Navigate to Projects page where these flows will eventually be wired.
        if (route === 'app') setActivePage('projects');
      }
      if (action === 'eloSummary') {
        if (route === 'app') setActivePage('settings');
      }
    });
    return unsub;
  });

  const handleOnboardingComplete = async () => {
    setRoute('login');
  };

  const handleAuthenticated = () => {
    setRoute('app');
  };

  const handleLogout = () => {
    setRoute('login');
  };

  if (route === 'loading') {
    return null;
  }

  if (route === 'onboarding') {
    return <Onboarding onComplete={() => void handleOnboardingComplete()} />;
  }

  if (route === 'login') {
    return <Login onAuthenticated={handleAuthenticated} />;
  }

  // App shell — post-login
  const breadcrumb = PAGE_LABELS[activePage] ?? 'Dashboard';

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard onNavigate={(p) => setActivePage(p as NavPage)} />;
      case 'chat':
        return <Chat />;
      case 'projects':
        return <Projects />;
      case 'agents':
        return <Agents />;
      case 'memory':
        return <Memory />;
      case 'knowledge':
        return <Knowledge />;
      case 'sessions':
        return <Sessions />;
      case 'mcp':
        return <McpServers />;
      case 'settings':
        return <Settings onLogout={handleLogout} />;
      default:
        return <NotFound onBackHome={() => setActivePage('dashboard')} />;
    }
  };

  return (
    <AppShell
      activePage={activePage}
      onNavigate={setActivePage}
      breadcrumb={breadcrumb}
    >
      {renderPage()}
    </AppShell>
  );
}
