import type { ReactNode } from 'react';

/** Kleine lijn-iconen (24x24, streek volgt de tekstkleur). */
const PATHS: Record<string, ReactNode> = {
  overzicht: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.8" />
      <rect x="14" y="3" width="7" height="5" rx="1.8" />
      <rect x="14" y="12" width="7" height="9" rx="1.8" />
      <rect x="3" y="16" width="7" height="5" rx="1.8" />
    </>
  ),
  doel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  nu: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  verbruik: <path d="M5 20v-7M12 20V5M19 20V10" />,
  scenarios: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  leveranciers: <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" />,
  apparaten: <path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5" />,
  gegevens: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.overzicht}
    </svg>
  );
}
