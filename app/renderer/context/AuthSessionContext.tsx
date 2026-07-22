// AuthSessionContext — the ONE place the renderer learns whether the app is on
// cloud (byan_web) or local (this PC). Before F1 no such shared state existed:
// StatusStrip hardcoded "Cloud" and every page was mode-blind. The provider
// reads the persisted session (main: auth.getSession) once on mount and again
// whenever main broadcasts 'byan:auth:changed' (login / logout / switchMode),
// so a runtime mode switch re-routes the whole UI without a reload.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthSession } from '../../shared/ipc-contract';

interface AuthSessionValue {
  session: AuthSession;
  // Re-read the persisted session from main. Call after a switchMode.
  refresh: () => Promise<void>;
}

const AuthSessionCtx = createContext<AuthSessionValue>({
  session: null,
  refresh: async () => {},
});

export function useAuthSession(): AuthSessionValue {
  return useContext(AuthSessionCtx);
}

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>(null);

  const refresh = useCallback(async () => {
    try {
      // getSession is absent in the test env (no preload) — degrade to null.
      const s = (await window.byanApi?.auth?.getSession?.()) ?? null;
      setSession(s);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A login / logout / switchMode in main pushes 'byan:auth:changed' — re-read
  // so the mode label and any mode-dependent routing update live.
  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;
    return window.byanEvents.on('byan:auth:changed', () => {
      void refresh();
    });
  }, [refresh]);

  return (
    <AuthSessionCtx.Provider value={{ session, refresh }}>
      {children}
    </AuthSessionCtx.Provider>
  );
}

// Human label for a mode, used by the status bar and any mode chip.
export function modeLabel(session: AuthSession): string {
  if (!session) return 'Cloud';
  if (session.mode === 'local') return 'Local';
  if (session.mode === 'custom') return 'Custom';
  return 'Cloud';
}
