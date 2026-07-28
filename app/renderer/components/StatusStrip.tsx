// StatusStrip — 28px bottom status bar.
// Left: connection mode dot + label, version.
// Right: latency, logs link, AcadéNice hover label.
//
// Everything shown here is either MEASURED or absent. Three things used to be
// decoration presented as fact: the version was the literal 'v1.0' while the app
// shipped 1.4.0, the latency was the literal '12ms' with nothing behind it, and
// the Logs button had no handler at all. A status bar that invents its own
// readings is worse than one that shows nothing, because it is trusted.
//
// The wording comes from the locale layer, not from literals in this file. The
// bar sat in hardcoded French while Settings offered a language selector, so
// switching the language left the only permanently visible strip of the app
// untranslated. Numbers stay measured here; only their labels are translated.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, List } from 'lucide-react';
import ModeSwitcher from './ModeSwitcher';
import { useT } from '../i18n/I18nContext';

interface StatusStripProps {
  // Only tests pass this. In the app the version is read from main, so no
  // default literal can drift away from package.json.
  version?: string;
}

// How often the bridge round-trip is re-measured. Long enough to stay invisible
// in the process list, short enough that a hung bridge shows up on its own.
const PING_INTERVAL_MS = 15_000;

export default function StatusStrip({ version }: StatusStripProps) {
  const { t } = useT();
  const [hoverAcadenice, setHoverAcadenice] = useState(false);
  const [resolvedVersion, setResolvedVersion] = useState<string | null>(version ?? null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [logsNote, setLogsNote] = useState<string | null>(null);

  // A ref, not state: the interval callback must see the live value without
  // re-creating the timer on every measurement.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // One call does both jobs: it returns the real version AND its round-trip time
  // is the latency. Measuring with a call we already need avoids adding traffic
  // just to draw a number.
  const measure = useCallback(async () => {
    const t0 = performance.now();
    try {
      const v = await window.byanApi.app.version();
      if (!aliveRef.current) return;
      setLatencyMs(Math.round(performance.now() - t0));
      // An explicit prop wins: a test that pins a version must not see it
      // overwritten by the live value.
      if (version === undefined) setResolvedVersion(v);
    } catch {
      if (!aliveRef.current) return;
      // The bridge did not answer. Drop the previous reading rather than leave a
      // stale one standing next to a broken bridge.
      setLatencyMs(null);
    }
  }, [version]);

  useEffect(() => {
    void measure();
    const timer = setInterval(() => void measure(), PING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [measure]);

  const openLogs = useCallback(async () => {
    try {
      const res = await window.byanApi.app.openLogs();
      // Naming the folder is the fallback when the OS has nothing to open it
      // with — the click still tells the user where to look.
      setLogsNote(res.ok ? null : res.path);
    } catch {
      setLogsNote(t('status.logs.missing'));
    }
  }, [t]);

  return (
    <footer
      className="absolute bottom-0 left-0 w-full bg-surface-card border-t border-edge-subtle flex items-center justify-between px-md font-mono-code text-mono-code text-content-tertiary z-40"
      style={{ height: '28px' }}
    >
      {/* Left — live mode toggle (Local/Cloud) reachable from every screen */}
      <div className="flex items-center gap-lg">
        <ModeSwitcher />
        {/* Nothing until main answers: a placeholder number would be the very
            fabrication this strip is being fixed for. */}
        <span data-testid="status-version">
          {resolvedVersion ? (resolvedVersion.startsWith('v') ? resolvedVersion : `v${resolvedVersion}`) : ''}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-lg">
        <span
          className="flex items-center gap-xs"
          data-testid="status-latency"
          title={latencyMs === null
            ? t('status.latency.pending')
            : t('status.latency.measured', { seconds: PING_INTERVAL_MS / 1000 })}
        >
          <Gauge size={12} />
          {latencyMs === null ? '--' : `${latencyMs}ms`}
        </span>
        <button
          type="button"
          data-testid="status-logs"
          onClick={() => void openLogs()}
          title={logsNote ?? t('status.logs.open')}
          className="flex items-center gap-xs hover:text-content-body transition-colors"
        >
          <List size={12} />
          {logsNote ? logsNote : t('status.logs')}
        </button>
        {/* AcadéNice footer mention */}
        <button
          type="button"
          className="text-content-muted hover:text-acadenice-teal transition-colors text-[10px] font-mono-code"
          onMouseEnter={() => setHoverAcadenice(true)}
          onMouseLeave={() => setHoverAcadenice(false)}
          onClick={() => void window.byanApi.app.openExternal('https://acadenice.fr')}
        >
          {hoverAcadenice ? t('status.acadenice.hover') : t('status.acadenice')}
        </button>
      </div>
    </footer>
  );
}
