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

import React, { useEffect, useState, Suspense, lazy } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AppShell from './components/AppShell';
import UpdateBanner from './components/UpdateBanner';
import DeepLinkRouter from './components/DeepLinkRouter';
import { ToastProvider } from './components/toast/ToastContext';
import { I18nProvider, useT } from './i18n/I18nContext';
import type { MessageKey } from './i18n/locales';
import type { NavPage } from './components/Sidebar';

// Lazy chunks — pages only paid for on demand. Onboarding runs once at most;
// the rest are post-login surfaces that the user navigates to one at a time.
const Onboarding = lazy(() => import('./pages/Onboarding'));

// Minimal Suspense fallback. Empty fallback would show a black canvas while
// a chunk is mid-fetch (BrowserWindow backgroundColor is #0a0f1e); this keeps
// the user oriented without pulling in a spinner library.
const PageLoader = () => (
  <div className="w-full h-screen flex items-center justify-center text-ink-400 text-sm">
    Loading…
  </div>
);
const Chat = lazy(() => import('./pages/Chat'));
const Projects = lazy(() => import('./pages/Projects'));
const Agents = lazy(() => import('./pages/Agents'));
const Memory = lazy(() => import('./pages/Memory'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const Sessions = lazy(() => import('./pages/Sessions'));
const McpServers = lazy(() => import('./pages/McpServers'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

type Route = 'loading' | 'onboarding' | 'login' | 'app';

const PAGE_LABEL_KEYS: Record<NavPage, MessageKey> = {
  dashboard: 'nav.dashboard',
  chat: 'nav.chat',
  projects: 'nav.projects',
  agents: 'nav.agents',
  memory: 'nav.memory',
  knowledge: 'nav.knowledge',
  sessions: 'nav.sessions',
  mcp: 'nav.mcp',
  settings: 'nav.settings',
};

// Inner component — has access to the i18n hooks because it renders inside
// <I18nProvider>. The outer App() is the provider boundary.
function AppRouter() {
  const { t } = useT();
  const [route, setRoute] = useState<Route>('loading');
  const [activePage, setActivePage] = useState<NavPage>('dashboard');

  useEffect(() => {
    performance.mark('byan:app:init-start');
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
      } finally {
        performance.mark('byan:app:init-end');
        performance.measure('byan:app:init', 'byan:app:init-start', 'byan:app:init-end');
        const m = performance.getEntriesByName('byan:app:init').pop();
        if (m) console.debug(`[perf] app init (route decided) ${m.duration.toFixed(1)}ms`);
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

  // Auth state mutations from main (logout via Settings, IPC, e2e harness)
  // need to flip the React route — otherwise the renderer happily keeps
  // showing the app shell with a now-empty token.
  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;
    const unsub = window.byanEvents.on('byan:auth:changed', (payload: unknown) => {
      const { reason } = (payload as { reason?: string }) ?? {};
      if (reason === 'logout') setRoute('login');
    });
    return unsub;
  }, []);

  const handleOnboardingComplete = async () => {
    setRoute('login');
  };

  const handleAuthenticated = () => {
    setRoute('app');
  };

  const handleLogout = () => {
    setRoute('login');
  };

  // App shell — post-login
  const breadcrumb = t(PAGE_LABEL_KEYS[activePage] ?? 'nav.dashboard');

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

  const renderRoute = () => {
    if (route === 'loading') return <PageLoader />;
    if (route === 'onboarding') {
      return (
        <Suspense fallback={<PageLoader />}>
          <Onboarding onComplete={() => void handleOnboardingComplete()} />
        </Suspense>
      );
    }
    if (route === 'login') {
      return <Login onAuthenticated={handleAuthenticated} />;
    }
    return (
      <>
        <UpdateBanner />
        <AppShell
          activePage={activePage}
          onNavigate={setActivePage}
          breadcrumb={breadcrumb}
        >
          <Suspense fallback={<PageLoader />}>{renderPage()}</Suspense>
        </AppShell>
      </>
    );
  };

  return (
    <ToastProvider>
      <DeepLinkRouter isAuthenticated={route === 'app'} onNavigate={setActivePage} />
      {renderRoute()}
    </ToastProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppRouter />
    </I18nProvider>
  );
}
