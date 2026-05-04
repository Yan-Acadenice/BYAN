// StatusStrip — 28px bottom status bar.
// Left: connection mode dot + label, version.
// Right: latency, logs link, Acadenice hover label.

import React, { useState } from 'react';
import { Gauge, List } from 'lucide-react';

interface StatusStripProps {
  mode?: string;
  version?: string;
}

export default function StatusStrip({ mode = 'Cloud', version = 'v1.0' }: StatusStripProps) {
  const [hoverAcadenice, setHoverAcadenice] = useState(false);

  return (
    <footer
      className="absolute bottom-0 left-0 w-full bg-ink-900 border-t border-ink-800 flex items-center justify-between px-md font-mono-code text-mono-code text-ink-400 z-40"
      style={{ height: '28px' }}
    >
      {/* Left */}
      <div className="flex items-center gap-lg">
        <div className="flex items-center gap-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
          <span>{mode}</span>
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
