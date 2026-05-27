import React from 'react';

/**
 * ₵ikaBuk Logo — Open ledger book with ₵ (cedis) symbol.
 * No background — transparent SVG that sits inside a styled container.
 * Enlarged to fill the viewBox edge-to-edge.
 */
export default function SikaBukLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-label="₵ikaBuk logo"
      role="img"
    >
      {/* Book spine shadow */}
      <line
        x1="20" y1="3" x2="20" y2="37"
        stroke="#C8962E" strokeOpacity="0.3"
        strokeWidth="1"
      />

      {/* Left page */}
      <path
        d="M1 4C8 3 17 3.5 20 5.5L20 37C17 35.5 8 35 1 36Z"
        fill="white"
        opacity="0.85"
      />
      {/* Right page */}
      <path
        d="M39 4C32 3 23 3.5 20 5.5L20 37C23 35.5 32 35 39 36Z"
        fill="white"
      />

      {/* Ledger lines on left page */}
      <line
        x1="5" y1="13" x2="17" y2="12.5"
        stroke="#C8962E" strokeOpacity="0.7"
        strokeWidth="1.4" strokeLinecap="round"
      />
      <line
        x1="5" y1="18" x2="17" y2="17.5"
        stroke="#C8962E" strokeOpacity="0.5"
        strokeWidth="1.4" strokeLinecap="round"
      />
      <line
        x1="5" y1="23" x2="16" y2="22.5"
        stroke="#C8962E" strokeOpacity="0.35"
        strokeWidth="1.4" strokeLinecap="round"
      />
      <line
        x1="5" y1="28" x2="15" y2="27.5"
        stroke="#C8962E" strokeOpacity="0.25"
        strokeWidth="1.4" strokeLinecap="round"
      />

      {/* ₵ Cedis curve on right page */}
      <path
        d="M31 12C27.5 12 25 15.5 25 20.5C25 25.5 27.5 29 31 29"
        stroke="#C8962E" strokeOpacity="0.9"
        strokeWidth="2.4" strokeLinecap="round" fill="none"
      />
      {/* ₵ Cedis horizontal stroke */}
      <line
        x1="23.5" y1="20.5" x2="33" y2="20.5"
        stroke="#C8962E" strokeOpacity="0.9"
        strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  );
}
