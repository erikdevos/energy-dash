import type { StackSeries } from './StackedColumns';

/**
 * Vaste kleur per energiestroom, in alle grafieken gelijk. Stapelvolgorde van onder naar boven:
 * teruglevering (onder de nullijn), net, batterij, zon. Die volgorde is gevalideerd op kleurenblindheid.
 */
export const FLOW_SERIES = {
  imp: { key: 'imp', label: 'Van het net', color: 'var(--series-1)' },
  bat: { key: 'bat', label: 'Uit batterij', color: 'var(--series-3)' },
  zon: { key: 'zon', label: 'Direct van zon', color: 'var(--series-2)' },
  exp: { key: 'exp', label: 'Teruggeleverd', color: 'var(--series-4)' },
} satisfies Record<string, StackSeries>;
