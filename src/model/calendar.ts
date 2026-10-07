/**
 * Alle reeksen in het model hebben 8760 uren, index = uur van het jaar in UTC
 * (29 februari overgeslagen). Gedrag in huis (koken, laden, dal/normaal) volgt
 * de lokale Nederlandse tijd, dus hier zetten we UTC-uren om naar lokale tijd.
 */
export const HOURS = 8760;

export interface Calendar {
  year: number;
  /** lokaal uur 0-23 */
  hour: Uint8Array;
  /** dag van de week, 0 = zondag */
  dow: Uint8Array;
  /** lokale maand 0-11 */
  month: Uint8Array;
  /** lokale dag van het jaar 0-364 */
  day: Uint16Array;
  /** eerste uur-index van elke lokale dag */
  dayStart: number[];
}

function lastSundayUtc(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month + 1, 0, 1)); // laatste dag van de maand, 01:00 UTC
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

export function utcTimestamp(year: number, i: number): number {
  const leap = year % 4 === 0;
  const skip = leap && i >= 59 * 24 ? 24 * 3_600_000 : 0;
  return Date.UTC(year, 0, 1) + i * 3_600_000 + skip;
}

const cache = new Map<number, Calendar>();

export function calendarFor(year: number): Calendar {
  const hit = cache.get(year);
  if (hit) return hit;
  const dstStart = lastSundayUtc(year, 2);
  const dstEnd = lastSundayUtc(year, 9);
  const hour = new Uint8Array(HOURS);
  const dow = new Uint8Array(HOURS);
  const month = new Uint8Array(HOURS);
  const day = new Uint16Array(HOURS);
  const dayStart: number[] = [];
  const jan1 = Date.UTC(year, 0, 1);
  const leap = year % 4 === 0;
  for (let i = 0; i < HOURS; i++) {
    const ts = utcTimestamp(year, i);
    const offset = ts >= dstStart && ts < dstEnd ? 2 : 1;
    const local = new Date(ts + offset * 3_600_000);
    hour[i] = local.getUTCHours();
    dow[i] = local.getUTCDay();
    month[i] = Math.min(local.getUTCFullYear() > year ? 11 : local.getUTCMonth(), 11);
    let d = Math.floor((Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - jan1) / 86_400_000);
    if (leap && d >= 59) d -= 1;
    d = Math.max(0, Math.min(364, d));
    day[i] = d;
    if (dayStart.length <= d) dayStart.push(i);
  }
  const cal = { year, hour, dow, month, day, dayStart };
  cache.set(year, cal);
  return cal;
}

export const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function dayLabel(year: number, dayIndex: number): string {
  const leap = year % 4 === 0;
  const d = new Date(Date.UTC(year, 0, 1 + dayIndex + (leap && dayIndex >= 59 ? 1 : 0)));
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
