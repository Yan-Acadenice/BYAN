// ByanLogo — inline SVG gradient logo for BYAN.
//
// Uses the platform gradient: byan-500 (#5c7cfa) → cyan-glow (#06b6d4).
// Size is controlled via the size prop (defaults to 48px).

import React from 'react';

interface ByanLogoProps {
  size?: number;
  className?: string;
}

export default function ByanLogo({ size = 48, className = '' }: ByanLogoProps) {
  const id = 'byan-logo-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="BYAN"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#91a7ff" />
          <stop offset="50%" stopColor="#5c7cfa" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Rounded square background */}
      <rect width="48" height="48" rx="13" fill={`url(#${id})`} />
      {/* Letter B — geometric, clean */}
      <text
        x="14"
        y="34"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        fontSize="26"
        fill="white"
        letterSpacing="-1"
      >
        B
      </text>
    </svg>
  );
}
