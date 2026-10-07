import { useEffect, useRef, useState } from 'react';

/** Mooie, ronde tick-waarden voor een as. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    max = min + 1;
  }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

export function linear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Breedte van een element volgen, voor responsieve SVG-grafieken. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfSmall = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const fmt = {
  int: (v: number) => nf0.format(v),
  one: (v: number) => nf1.format(v),
  kwh: (v: number) => `${Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)} kWh`,
  eur: (v: number) => `€ ${nf0.format(v)}`,
  eur2: (v: number) => `€ ${nf2.format(v)}`,
  perKwh: (v: number) => `€ ${nf3.format(v)}`,
  pct: (v: number) => `${nf0.format(v * 100)}%`,
  /** automatisch compact voor ticks */
  tick: (v: number) => (Math.abs(v) >= 1000 ? `${nf1.format(v / 1000)}k` : Math.abs(v) < 1 ? nfSmall.format(v) : nf1.format(v)),
};
