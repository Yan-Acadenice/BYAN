// App — Electron renderer root component.
//
// Routing: lightweight manual router (no react-router dep in this package).
//   - On mount: checks if _byan/config.yaml exists in the current project root.
//   - If missing → /onboarding
//   - If present → /login
//
// Project root discovery:
//   The app does not know the project root at renderer start. We read it from
//   the persistent store (written by Onboarding after the user picks a folder).
//   If no stored root, we show Onboarding and let the user pick.

import React, { useEffect, useState } from 'react';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';

type Route = 'loading' | 'onboarding' | 'login';

export default function App() {
  const [route, setRoute] = useState<Route>('loading');

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

  const handleOnboardingComplete = async () => {
    // After onboarding, go directly to login.
    setRoute('login');
  };

  const handleAuthenticated = () => {
    // F7/F8 will implement the main dashboard route.
    // For now: authenticated state is persisted by auth handler; this noop is intentional.
  };

  if (route === 'loading') {
    return null;
  }

  if (route === 'onboarding') {
    return <Onboarding onComplete={() => void handleOnboardingComplete()} />;
  }

  return <Login onAuthenticated={handleAuthenticated} />;
}
