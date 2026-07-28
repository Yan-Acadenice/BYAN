// ByanLogo — inline SVG monogram for BYAN.
//
// Two things were inverted here, and the second one was illegible.
//
// The gradient was byan-500 (#5c7cfa) -> cyan-glow (#06b6d4): the old blue, on a
// hue AcadeNice does not have. Decided with Yan: a MONO-HUE teal gradient
// (teal-300 -> teal-600). The alternative, teal -> amber, is more expressive but
// spends both allowed accents and bets on a warm/cold pair over a dark ground —
// a logo is not where you take that bet.
//
// And the square carried the gradient with the letter in white, which is the
// inverse of what DESIGN-BRIEF.md specifies. It is also the unreadable way round:
// white over the light end of a teal gradient measures ~1.6:1. So the square is
// dark and the LETTER carries the gradient — which happens to be both the brief's
// version and the only legible one.

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
          <stop offset="0%" stopColor="#6ADDD0" />
          <stop offset="100%" stopColor="#1E8E7E" />
        </linearGradient>
      </defs>
      {/* Dark card surface, with the teal-tinted hairline the rest of the app uses
          so the mark sits on the same material as every other surface. */}
      <rect width="48" height="48" rx="13" fill="#131E1D" />
      <rect
        x="0.5"
        y="0.5"
        width="47"
        height="47"
        rx="12.5"
        fill="none"
        stroke="rgba(208, 245, 240, 0.12)"
      />
      {/* The letter carries the gradient. Josefin Sans to match the titles it
          sits next to; it stops at 700, so 700 is the weight. */}
      <text
        x="14"
        y="34"
        fontFamily="'Josefin Sans', Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        fontSize="26"
        fill={`url(#${id})`}
        letterSpacing="-1"
      >
        B
      </text>
    </svg>
  );
}
