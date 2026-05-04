// AcadeniceBadge — inline SVG monogram "A" for Acadenice co-branding.
// Color: acadenice-teal (#4cccb8). Used in Topbar and Sidebar bottom.

import React from 'react';

interface AcadeniceBadgeProps {
  size?: number;
  className?: string;
}

export default function AcadeniceBadge({ size = 20, className = '' }: AcadeniceBadgeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AcadéNice"
    >
      {/* Stylized "A" with a teal curve at the baseline */}
      <path
        d="M12 3L4 20h3.5l1.5-3.5h6l1.5 3.5H20L12 3z"
        fill="#4cccb8"
        fillOpacity="0.15"
      />
      <path
        d="M12 5.5L6 19h2.5l1.2-2.8h4.6l1.2 2.8H18L12 5.5z"
        stroke="#4cccb8"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="8.5"
        y1="14"
        x2="15.5"
        y2="14"
        stroke="#4cccb8"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
