// NotFound — m1._empty_state_404 ported to React.
// Centered empty state: icon + message + back home CTA.

import React from 'react';
import { Compass } from 'lucide-react';

interface NotFoundProps {
  onBackHome: () => void;
}

export default function NotFound({ onBackHome }: NotFoundProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-full bg-ink-800 border border-ink-700 flex items-center justify-center mb-lg">
        <Compass size={28} className="text-ink-500" />
      </div>
      <h1 className="font-h1 text-h1 text-ink-100 mb-xs">Nothing here</h1>
      <p className="font-body text-body text-ink-400 mb-xl max-w-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <button
        type="button"
        onClick={onBackHome}
        className="btn-primary flex items-center gap-xs py-2 px-lg"
      >
        Back home
      </button>
    </div>
  );
}
