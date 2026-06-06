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

      {/* ₵ Cedis mark on right page */}
      <path
        d="M31.2 12.4C28.8 12.4 26.7 13.4 25.2 15.2C23.8 16.8 23 18.9 23 21.1C23 23.3 23.8 25.4 25.2 27C26.7 28.8 28.8 29.8 31.2 29.8"
        stroke="#C8962E" strokeOpacity="0.95"
        strokeWidth="2.6" strokeLinecap="round" fill="none"
      />
      <line
        x1="27.9" y1="11.2" x2="27.9" y2="31"
        stroke="#C8962E" strokeOpacity="0.95"
        strokeWidth="1.9" strokeLinecap="round"
      />
    </svg>
  );
}
