/*
 * Slim inplannen: wat scheelt het als je een apparaat op een ander moment start?
 *
 * Gerekend met de gemiddelde uurprijs (EPEX incl. BTW) over de wintermaanden van het prijsjaar. Opslag en energiebelasting zijn
 * vaste bedragen per kWh en vallen weg in het verschil. Een programma verbruikt gelijkmatig over zijn duur (aanname); in werkelijkheid
 * zit het meeste in de verwarmingsfase. De waarden per beurt zijn typische aannames, geen metingen.
 */
import { hourlyKwh, yearlyKwh, type Appliance } from './appliances';

export interface FlexSpec {
  /** welke apparaten uit de lijst bij deze regel horen */
  match: RegExp;
  label: string;
  /** kWh per beurt (aanname) */
  kwh: number;
  /** duur van het programma in uren */
  uren: number;
  /** vroegste en laatste starttijd (lokaal uur) die je realistisch vindt */
  vanaf: number;
  totStart: number;
  /** uitleg bij de grenzen */
  waarom: string;
}

export const FLEX: FlexSpec[] = [
  { match: /vaatwas/i, label: 'Vaatwasser', kwh: 1.0, uren: 4, vanaf: 7, totStart: 23, waarom: 'Hij mag ook met een starttijd-timer in de nacht draaien.' },
  { match: /wasmachine/i, label: 'Wasmachine', kwh: 0.8, uren: 2, vanaf: 8, totStart: 19, waarom: 'Liever niet onbeheerd in de nacht.' },
  { match: /droger/i, label: 'Droger', kwh: 2.0, uren: 5, vanaf: 8, totStart: 18, waarom: 'Liever niet onbeheerd in de nacht.' },
];

/** Gemiddelde prijs per uur van de dag (0-23, lokale tijd) over november t/m maart, in EUR per kWh incl. BTW (excl. opslag en belasting). */
export function winterProfile(epex: ArrayLike<number>, year: number): number[] {
  const parts = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hourCycle: 'h23', hour: 'numeric', month: 'numeric' });
  const sum = new Array(24).fill(0);
  const n = new Array(24).fill(0);
  const start = Date.UTC(year, 0, 1);
  for (let i = 0; i < epex.length; i++) {
    const p = parts.formatToParts(new Date(start + i * 3_600_000));
    const month = Number(p.find((x) => x.type === 'month')!.value);
    if (month > 3 && month < 11) continue;
    const hour = Number(p.find((x) => x.type === 'hour')!.value);
    sum[hour] += epex[i] * 1.21;
    n[hour]++;
  }
  return sum.map((s, h) => (n[h] ? s / n[h] : 0));
}

/** Kosten van één beurt van `kwh` die op `start` begint en `uren` duurt, bij uurprijzen `price` (lengte 24 = cyclisch, anders lineair). */
export function sessionCost(price: ArrayLike<number>, start: number, uren: number, kwh: number): number {
  const cyclic = price.length === 24;
  let sum = 0;
  for (let k = 0; k < uren; k++) {
    const i = start + k;
    const p = cyclic ? price[i % 24] : price[i];
    if (p === undefined) return NaN;
    sum += p;
  }
  return (sum / uren) * kwh;
}

export interface FlexTip {
  spec: FlexSpec;
  /** apparaten uit de lijst die hierbij horen */
  items: Appliance[];
  /** kWh per jaar die de lijst aan deze apparaten toekent */
  kwhPerJaar: number;
  /** gemiddelde prijs per kWh bij het huidige gebruikspatroon */
  prijsNu: number;
  /** beste starttijd (uur) en de gemiddelde prijs per kWh daarbij */
  besteStart: number;
  prijsBest: number;
  /** besparing per beurt en per jaar, 0 als het huidige patroon al goed is */
  perBeurt: number;
  perJaarBesparing: number;
  /** zelfde berekening voor elk startuur, voor de weergave */
  perStart: Array<{ uur: number; perKwh: number }>;
}

export function flexTips(list: Appliance[], profile: number[]): FlexTip[] {
  const tips: FlexTip[] = [];
  for (const spec of FLEX) {
    const items = list.filter((a) => spec.match.test(`${a.id} ${a.naam}`));
    if (items.length === 0) continue;
    // gemiddelde prijs per kWh zoals de lijst het gebruik over de dag verdeelt
    const dist = new Array(24).fill(0);
    for (const a of items) hourlyKwh(a).forEach((v, h) => (dist[h] += v));
    const tot = dist.reduce((a, b) => a + b, 0);
    const prijsNu = tot > 0 ? dist.reduce((a, v, h) => a + v * profile[h], 0) / tot : profile.reduce((a, b) => a + b, 0) / 24;
    const perStart: FlexTip['perStart'] = [];
    for (let s = spec.vanaf; s <= spec.totStart; s++) perStart.push({ uur: s, perKwh: sessionCost(profile, s, spec.uren, 1) });
    const best = perStart.reduce((a, b) => (b.perKwh < a.perKwh ? b : a));
    const kwhPerJaar = items.reduce((a, x) => a + yearlyKwh(x), 0);
    const perBeurt = Math.max(0, (prijsNu - best.perKwh) * spec.kwh);
    tips.push({
      spec,
      items,
      kwhPerJaar,
      prijsNu,
      besteStart: best.uur,
      prijsBest: best.perKwh,
      perBeurt,
      perJaarBesparing: Math.max(0, prijsNu - best.perKwh) * kwhPerJaar,
      perStart,
    });
  }
  return tips;
}

/** Beste startuur binnen de vooruitgekeken uurprijzen (index 0 = nu), voor een beurt van `uren` uur. */
export function bestStartAhead(prices: number[], uren: number, from: number, to: number): { index: number; perKwh: number } | null {
  let best: { index: number; perKwh: number } | null = null;
  for (let s = from; s <= to && s + uren <= prices.length; s++) {
    const c = sessionCost(prices, s, uren, 1);
    if (Number.isNaN(c)) continue;
    if (!best || c < best.perKwh) best = { index: s, perKwh: c };
  }
  return best;
}
