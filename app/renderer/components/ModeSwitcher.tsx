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
//
// CONSEQUENCE (handoff lot 1.3) — stated before, observed after.
// The switch used to be silent about the local chat: the conversation simply left
// the screen with nothing said. It now names what happens first, and the toast
// afterwards reports what actually became of the session.
//
// DECISION, and a correction to the handoff's premise. The handoff (lot 1.3) says
// this switch "arrête la session en cours" — it does not. Verified in the code:
// switchMode calls login(), which broadcasts byan:auth:changed with reason
// 'login' ; LocalChatContext only wipes on 'logout', LocalChatBridge stops
// nothing, and LocalChatProvider is mounted above the router, so the thread, the
// session id and the CLI child all survive and come back on the way in. So the
// dialog says THAT, and its forward action is not dressed in danger: the
// destructive treatment belongs to the act that really destroys a thread, which
// is /new in LocalChatView. Making this switch stop the session instead would
// have been possible, but the provider exposes no way to clear its session id
// afterwards, so the app would then display a live identity for a dead process —
// trading a silence for a lie.

import React, { useState, useRef, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { AuthMode } from '../../shared/ipc-contract';
import { useAuthSession, modeLabel } from '../context/AuthSessionContext';
import { useLocalChat, type UseLocalChat } from '../hooks/useLocalChat';
import { useToast } from './toast/ToastContext';
import ConsequenceDialog from './chat/ConsequenceDialog';
import { folderLabel, pluralS } from './chat/session-facts';

// The two real toggle targets. Custom mode (a hand-typed URL) stays a Login-time
// setup, not a one-click target — it cannot be resolved without asking for a URL.
const TARGETS: { mode: AuthMode; label: string; hint: string }[] = [
  { mode: 'local', label: 'Local', hint: 'Ce PC' },
  { mode: 'cloud', label: 'Cloud', hint: 'byan_web' },
];

function labelFor(mode: AuthMode): string {
  return TARGETS.find((t) => t.mode === mode)?.label ?? mode;
}

// The local chat state, read WITHOUT requiring its provider. This control lives
// in the StatusStrip, which is also mounted on surfaces (and in tests) that carry
// no LocalChatProvider ; useLocalChat throws there by design, and taking the
// whole status bar down over a detail it can live without would be the wrong
// trade. With no provider there is simply no local session to describe, and the
// switch says nothing rather than guessing at one.
//
// useContext still runs on every render inside useLocalChat, so the hook order is
// unchanged — the try only catches the assertion that follows it.
function useOptionalLocalChat(): UseLocalChat | null {
  try {
    return useLocalChat();
  } catch {
    return null;
  }
}

export default function ModeSwitcher() {
  const { session } = useAuthSession();
  const toast = useToast();
  const localChat = useOptionalLocalChat();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<AuthMode | null>(null);
  // A target whose consequence has been stated and not yet answered.
  const [pendingTarget, setPendingTarget] = useState<AuthMode | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const current: AuthMode = session?.mode ?? 'cloud';
  const isLocal = current === 'local';
  const shownLabel = modeLabel(session);

  // Only meaningful while local mode is the live one: a session id left over in
  // the provider after the app moved to cloud is not what this switch is about.
  const localSessionId = isLocal ? (localChat?.sessionId ?? null) : null;
  const localFolder = localChat?.sessionCwd ?? null;
  const localTurns = localChat?.messages.length ?? 0;

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

  // The observation AFTER. "Mode Cloud actif." on its own left the user to work
  // out for themselves that the local conversation was no longer on screen — and
  // to guess whether it had been stopped. It had not, so the sentence says so.
  const afterMessage = (mode: AuthMode, leftSession: string | null, folder: string | null): string => {
    const head = `Mode ${labelFor(mode)} actif.`;
    if (mode === 'local' || !leftSession) return head;
    const where = folder ? ` sur ${folderLabel(folder)}` : '';
    return `${head} La session locale ${leftSession.slice(0, 8)}${where} n'est plus à l'écran : elle continue de tourner et revient si tu repasses en Local.`;
  };

  const applySwitch = async (mode: AuthMode) => {
    // Captured before the switch: once the mode has flipped, `localSessionId` is
    // null by construction and the sentence would lose the id it must name.
    const leftSession = localSessionId;
    const leftFolder = localFolder;
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
        toast.success(afterMessage(mode, leftSession, leftFolder));
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

  const select = (mode: AuthMode) => {
    setOpen(false);
    if (mode === current) return;
    // Leaving local with a session running is the one switch that changes
    // something the user cannot see afterwards: the chat surface goes away while
    // the engine keeps running. State it BEFORE. With no local session there is
    // nothing at stake, and a dialog over nothing is the ceremony that teaches
    // people to click through dialogs.
    if (isLocal && mode !== 'local' && localSessionId) {
      setPendingTarget(mode);
      return;
    }
    void applySwitch(mode);
  };

  const pendingFacts = () => {
    const target = pendingTarget ?? 'cloud';
    return [
      {
        label: 'Dossier',
        value: localFolder ?? 'non résolu',
      },
      {
        label: 'Ce qui quitte l\'écran',
        value: `le chat local (session ${localSessionId?.slice(0, 8) ?? '—'}, ${localTurns} message${pluralS(localTurns)}) : le chat ${labelFor(target)} prend sa place.`,
      },
      {
        label: 'Ce qui est gardé',
        value: 'la session locale continue de tourner sur ce PC, avec son contexte. Repasse en Local et le fil est là.',
      },
      {
        label: 'Ce qui change aussi',
        value: `Projets, Mémoires et Connaissance liront ${labelFor(target)} au lieu du disque de ce PC.`,
      },
    ];
  };

  return (
    <div ref={rootRef} className="relative flex items-center">
      <ConsequenceDialog
        open={pendingTarget !== null}
        testId="mode-switch-dialog"
        title={`Passer en ${labelFor(pendingTarget ?? 'cloud')} enlève le chat local de l'écran`}
        facts={pendingFacts()}
        cancel={{
          label: `Rester en ${labelFor(current)}`,
          onClick: () => setPendingTarget(null),
        }}
        confirm={{
          label: `Passer en ${labelFor(pendingTarget ?? 'cloud')}`,
          onClick: () => {
            const target = pendingTarget;
            setPendingTarget(null);
            if (target) void applySwitch(target);
          },
        }}
      />

      <button
        type="button"
        data-testid="mode-switcher-trigger"
        onClick={() => setOpen((o) => !o)}
        title={session?.url || undefined}
        className="flex items-center gap-xs hover:text-content-body transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? (
          <Loader2 size={10} className="animate-spin text-content-tertiary" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${isLocal ? 'bg-acadenice-teal' : 'bg-emerald'}`} />
        )}
        <span>{shownLabel}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-1 min-w-[140px] bg-surface-card border border-edge-strong rounded shadow-lg py-1 z-50"
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
                onClick={() => select(t.mode)}
                className="w-full flex items-center justify-between px-md py-1 text-left hover:bg-surface-hover transition-colors"
              >
                <span className="flex items-center gap-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.mode === 'local' ? 'bg-acadenice-teal' : 'bg-emerald'}`} />
                  <span className="text-content-body">{t.label}</span>
                  <span className="text-content-tertiary text-[10px]">{t.hint}</span>
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
