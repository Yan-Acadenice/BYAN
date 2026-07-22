// ModeSwitcher — the F1 live toggle between Local (this PC) and Cloud (byan_web).
//
// Why it lives in the StatusStrip : the user asked to switch "depuis n'importe
// où". The status bar is on every app screen, so one control there is reachable
// everywhere without cluttering each page. Clicking the mode chip opens a small
// menu ; picking a different mode calls auth.switchMode. On success the main
// process broadcasts 'byan:auth:changed', AuthSessionContext re-reads the session
// and the whole UI re-routes live — no relaunch, no re-login.
//
// Local target : the local server must be up for the switch to land, so we probe
// server.status and spawn it first when it is down (mirrors the Login local
// flow). Cloud target : switchMode reuses the stored token ; if none is usable
// the switch returns invalid_token and we point the user to Réglages to sign in.

import React, { useState, useRef, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { AuthMode } from '../../shared/ipc-contract';
import { useAuthSession, modeLabel } from '../context/AuthSessionContext';
import { useToast } from './toast/ToastContext';

// The two real toggle targets. Custom mode (a hand-typed URL) stays a Login-time
// setup, not a one-click target — it cannot be resolved without asking for a URL.
const TARGETS: { mode: AuthMode; label: string; hint: string }[] = [
  { mode: 'local', label: 'Local', hint: 'Ce PC' },
  { mode: 'cloud', label: 'Cloud', hint: 'byan_web' },
];

function labelFor(mode: AuthMode): string {
  return TARGETS.find((t) => t.mode === mode)?.label ?? mode;
}

export default function ModeSwitcher() {
  const { session } = useAuthSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<AuthMode | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const current: AuthMode = session?.mode ?? 'cloud';
  const isLocal = current === 'local';
  const shownLabel = modeLabel(session);

  // Close the menu on an outside click so it behaves like a normal popover.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Ensure the embedded local server is running before switching to local mode.
  // Returns true when the server is up (already or freshly spawned).
  const ensureLocalServer = async (): Promise<boolean> => {
    try {
      const status = await window.byanApi.server.status();
      if (status.running) return true;
      await window.byanApi.server.spawn();
      return true;
    } catch {
      return false;
    }
  };

  const select = async (mode: AuthMode) => {
    setOpen(false);
    if (mode === current) return;
    setBusy(mode);
    try {
      if (mode === 'local') {
        const up = await ensureLocalServer();
        if (!up) {
          toast.error('Serveur local inaccessible — impossible de démarrer sur ce PC.');
          return;
        }
      }
      const res = await window.byanApi.auth.switchMode({ mode });
      if (res.ok) {
        toast.success(`Mode ${labelFor(mode)} actif.`);
        // AuthSessionContext re-reads the session on the broadcast — nothing else.
      } else if (res.reason === 'invalid_token') {
        toast.error(`Mode ${labelFor(mode)} : connexion requise. Ouvre Réglages pour te connecter.`);
      } else {
        toast.error(res.message || `Passage en mode ${labelFor(mode)} impossible.`);
      }
    } catch {
      toast.error('Bascule impossible (erreur interne).');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        data-testid="mode-switcher-trigger"
        onClick={() => setOpen((o) => !o)}
        title={session?.url || undefined}
        className="flex items-center gap-xs hover:text-ink-200 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? (
          <Loader2 size={10} className="animate-spin text-ink-400" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${isLocal ? 'bg-acadenice-teal' : 'bg-emerald'}`} />
        )}
        <span>{shownLabel}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-1 min-w-[140px] bg-ink-900 border border-ink-700 rounded shadow-lg py-1 z-50"
        >
          {TARGETS.map((t) => {
            const active = t.mode === current;
            return (
              <button
                key={t.mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                data-testid={`mode-option-${t.mode}`}
                onClick={() => void select(t.mode)}
                className="w-full flex items-center justify-between px-md py-1 text-left hover:bg-ink-800 transition-colors"
              >
                <span className="flex items-center gap-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.mode === 'local' ? 'bg-acadenice-teal' : 'bg-emerald'}`} />
                  <span className="text-ink-100">{t.label}</span>
                  <span className="text-ink-500 text-[10px]">{t.hint}</span>
                </span>
                {active && <Check size={11} className="text-acadenice-teal" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
