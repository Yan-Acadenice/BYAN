// StatusStrip — 28px bottom status bar.
// Left: connection mode dot + label, version.
// Right: latency, logs link, Acadenice hover label.

import React, { useState } from 'react';
import { Gauge, List } from 'lucide-react';
import { useAuthSession, modeLabel } from '../context/AuthSessionContext';

interface StatusStripProps {
  // Optional override (tests / storybook). When absent the live session mode wins.
  mode?: string;
  version?: string;
}

export default function StatusStrip({ mode, version = 'v1.0' }: StatusStripProps) {
  const [hoverAcadenice, setHoverAcadenice] = useState(false);
  const { session } = useAuthSession();
  // Live mode from the shared session; a `mode` prop still overrides for tests.
  const shownMode = mode ?? modeLabel(session);
  const isLocal = shownMode === 'Local';

  return (
    <footer
      className="absolute bottom-0 left-0 w-full bg-ink-900 border-t border-ink-800 flex items-center justify-between px-md font-mono-code text-mono-code text-ink-400 z-40"
      style={{ height: '28px' }}
    >
      {/* Left */}
      <div className="flex items-center gap-lg">
        <div className="flex items-center gap-xs" title={session?.url || undefined}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLocal ? 'bg-acadenice-teal' : 'bg-emerald'}`} />
          <span>{shownMode}</span>
        </div>
        <span>{version}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-lg">
        <span className="flex items-center gap-xs">
          <Gauge size={12} />
          12ms
        </span>
        <button
          type="button"
          className="flex items-center gap-xs hover:text-ink-200 transition-colors"
        >
          <List size={12} />
          Logs
        </button>
        {/* Acadenice footer mention */}
        <button
          type="button"
          className="text-ink-600 hover:text-acadenice-teal transition-colors text-[10px] font-mono-code"
          onMouseEnter={() => setHoverAcadenice(true)}
          onMouseLeave={() => setHoverAcadenice(false)}
          onClick={() => void window.byanApi.app.openExternal('https://acadenice.fr')}
        >
          {hoverAcadenice ? 'Un produit AcadéNice — formations à Nice' : 'AcadéNice'}
        </button>
      </div>
    </footer>
  );
}
