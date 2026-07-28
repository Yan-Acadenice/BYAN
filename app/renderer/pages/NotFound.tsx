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
      <div className="w-16 h-16 rounded-full bg-surface-hover border border-edge-strong flex items-center justify-center mb-lg">
        <Compass size={28} className="text-content-tertiary" />
      </div>
      <h1 className="font-h1 text-h1 text-content-body mb-xs">Il n'y a rien ici</h1>
      <p className="font-body text-body text-content-tertiary mb-xl max-w-sm">
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
