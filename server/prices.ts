import { cached } from './cache.ts';

/**
 * Day-ahead (EPEX) uurprijzen via de publieke EnergyZero API.
 * Resultaat: 8760 uurprijzen in EUR/kWh excl. BTW, index = uur van het jaar in UTC.
 * Schrikkeldag 29 februari wordt overgeslagen zodat elk jaar dezelfde lengte heeft.
 */
export interface PriceYear {
  year: number;
  source: string;
  unit: string;
  prices: number[];
}

const HOURS = 8760;
const QUARTERS: Array<[string, string]> = [
  ['01-01', '03-31'],
  ['04-01', '06-30'],
  ['07-01', '09-30'],
  ['10-01', '12-31'],
];

export function hourOfYear(ts: number, year: number): number | null {
  const start = Date.UTC(year, 0, 1);
  let h = Math.floor((ts - start) / 3_600_000);
  const leap = year % 4 === 0;
  if (leap) {
    const feb29 = Date.UTC(year, 1, 29);
    const mar1 = Date.UTC(year, 2, 1);
    if (ts >= feb29 && ts < mar1) return null;
    if (ts >= mar1) h -= 24;
  }
  return h >= 0 && h < HOURS ? h : null;
}

async function fetchQuarter(year: number, from: string, till: string) {
  const url =
    'https://api.energyzero.nl/v1/energyprices' +
    `?fromDate=${year}-${from}T00:00:00.000Z&tillDate=${year}-${till}T23:59:59.999Z` +
    '&interval=4&usageType=1&inclBtw=false';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EnergyZero ${res.status} voor ${year} ${from}`);
  const body = (await res.json()) as { Prices: Array<{ readingDate: string; price: number }> };
  return body.Prices;
}

export async function getPriceYear(year: number): Promise<PriceYear> {
  return cached(`prices-${year}.json`, async () => {
    const prices = new Array<number>(HOURS).fill(Number.NaN);
    for (const [from, till] of QUARTERS) {
      for (const p of await fetchQuarter(year, from, till)) {
        const h = hourOfYear(Date.parse(p.readingDate), year);
        if (h !== null) prices[h] = p.price;
      }
    }
    // Gaten (zomertijdwissel, ontbrekende uren) opvullen met het vorige uur.
    let last = prices.find((p) => !Number.isNaN(p)) ?? 0;
    for (let i = 0; i < HOURS; i++) {
      if (Number.isNaN(prices[i])) prices[i] = last;
      else last = prices[i];
    }
    return {
      year,
      source: 'EnergyZero (EPEX day-ahead NL)',
      unit: 'EUR/kWh excl. BTW',
      prices: prices.map((p) => Math.round(p * 1e5) / 1e5),
    };
  });
}

/** Uurprijzen van vandaag en (na ca. 13 uur) morgen, lokale tijd. Een uur gecachet in geheugen. */
let todayCache: { at: number; value: Array<{ t: string; price: number }> } | null = null;

export async function getPricesToday(): Promise<Array<{ t: string; price: number }>> {
  if (todayCache && Date.now() - todayCache.at < 3_600_000) return todayCache.value;
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const till = new Date(from.getTime() + 2 * 86_400_000 - 1);
  const url =
    'https://api.energyzero.nl/v1/energyprices' +
    `?fromDate=${from.toISOString()}&tillDate=${till.toISOString()}&interval=4&usageType=1&inclBtw=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`EnergyZero ${res.status}`);
  const body = (await res.json()) as { Prices: Array<{ readingDate: string; price: number }> };
  const value = body.Prices.map((p) => ({ t: p.readingDate, price: p.price }));
  todayCache = { at: Date.now(), value };
  return value;
}
