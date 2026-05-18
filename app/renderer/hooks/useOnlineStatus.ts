// useOnlineStatus — F8: tracks app connectivity to both the network and the
// byan_web API.
//
// State machine:
//   'online'   — navigator.onLine === true AND the most recent API ping succeeded
//   'unstable' — navigator.onLine === true BUT the last API ping failed
//                (network is up, but byan_web is unreachable or unauthenticated)
//   'offline'  — navigator.onLine === false (no network at all)
//
// Detection sources:
//   1. window 'online' / 'offline' events (instant transitions)
//   2. periodic ping via window.byanApi.byanWeb.me() every PING_INTERVAL_MS,
//      gated on auth — if me() throws AUTH_REQUIRED we treat it as 'online'
//      (the network is fine; the user just is not logged in).

import { useEffect, useRef, useState } from 'react';

export type OnlineStatus = 'online' | 'offline' | 'unstable';

const PING_INTERVAL_MS = 30_000;
const FAIL_THRESHOLD = 2;

interface UseOnlineStatusOpts {
  // Override the interval (test injection only).
  intervalMs?: number;
  // Override the ping fn (test injection only). Default uses byanApi.byanWeb.me.
  ping?: () => Promise<unknown>;
}

export function useOnlineStatus(opts: UseOnlineStatusOpts = {}): OnlineStatus {
  const intervalMs = opts.intervalMs ?? PING_INTERVAL_MS;
  const pingFn = opts.ping ?? (() => window.byanApi?.byanWeb?.me?.() ?? Promise.reject(new Error('no api')));

  const [status, setStatus] = useState<OnlineStatus>(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'
  );
  const consecutiveFailures = useRef(0);

  useEffect(() => {
    const handleOnline = () => {
      consecutiveFailures.current = 0;
      setStatus('online');
    };
    const handleOffline = () => {
      setStatus('offline');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Skip the ping when the OS already reports offline; the event listener
        // above keeps the state up to date.
        return;
      }
      try {
        await pingFn();
        if (cancelled) return;
        consecutiveFailures.current = 0;
        setStatus('online');
      } catch (err) {
        if (cancelled) return;
        // AUTH_REQUIRED is fine — the network reaches byan_web, only the token
        // is missing. Treat it as 'online' so the user is not nagged with a
        // false connectivity warning on the login screen.
        const code = (err as { code?: string }).code;
        if (code === 'AUTH_REQUIRED') {
          consecutiveFailures.current = 0;
          setStatus('online');
          return;
        }
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= FAIL_THRESHOLD) {
          setStatus('unstable');
        }
      }
    };

    const timer = setInterval(() => { void tick(); }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs, pingFn]);

  return status;
}
