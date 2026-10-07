import { cached } from './cache.ts';
import { hourOfYear } from './prices.ts';

/**
 * Uurlijkse zonne-opwek per kWp en buitentemperatuur via PVGIS (EU JRC).
 * PVGIS rekent met echte satellietmetingen (SARAH3) voor het gekozen jaar.
 */
export interface WeatherYear {
  year: number;
  source: string;
  lat: number;
  lon: number;
  angle: number;
  orientation: string;
  /** kWh per kWp per uur (UTC-index, 8760) */
  pvPerKwp: number[];
  /** buitentemperatuur op 2 m in graden Celsius */
  tempC: number[];
}

export interface PvQuery {
  lat: number;
  lon: number;
  angle: number;
  /** 'zuid' | 'oost-west' | azimut in graden (0 = zuid, -90 = oost, 90 = west) */
  orientation: string;
  year: number;
}

const HOURS = 8760;

async function fetchSeries(q: PvQuery, aspect: number) {
  const url =
    'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc' +
    `?lat=${q.lat}&lon=${q.lon}&peakpower=1&loss=14&angle=${q.angle}&aspect=${aspect}` +
    `&pvcalculation=1&startyear=${q.year}&endyear=${q.year}&outputformat=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PVGIS ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    outputs: { hourly: Array<{ time: string; P: number; T2m: number }> };
  };
  const pv = new Array<number>(HOURS).fill(0);
  const temp = new Array<number>(HOURS).fill(10);
  for (const row of body.outputs.hourly) {
    const t = row.time; // 'YYYYMMDD:HHMM' in UTC
    const ts = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(9, 11));
    const h = hourOfYear(ts, q.year);
    if (h === null) continue;
    pv[h] = row.P / 1000; // W bij 1 kWp gedurende een uur -> kWh
    temp[h] = row.T2m;
  }
  return { pv, temp };
}

function aspects(orientation: string): number[] {
  if (orientation === 'zuid') return [0];
  if (orientation === 'oost-west') return [-90, 90];
  const deg = Number(orientation);
  return Number.isFinite(deg) ? [deg] : [0];
}

export async function getWeatherYear(q: PvQuery): Promise<WeatherYear> {
  const key = `pvgis-${q.year}-${q.lat}-${q.lon}-${q.angle}-${q.orientation}.json`;
  return cached(key, async () => {
    const list = aspects(q.orientation);
    const series = [];
    for (const a of list) series.push(await fetchSeries(q, a));
    const pvPerKwp = new Array<number>(HOURS).fill(0);
    for (const s of series) for (let i = 0; i < HOURS; i++) pvPerKwp[i] += s.pv[i] / list.length;
    return {
      year: q.year,
      source: 'PVGIS 5.3 (SARAH3/ERA5), 14% systeemverlies',
      lat: q.lat,
      lon: q.lon,
      angle: q.angle,
      orientation: q.orientation,
      pvPerKwp: pvPerKwp.map((v) => Math.round(v * 1e5) / 1e5),
      tempC: series[0].temp.map((v) => Math.round(v * 10) / 10),
    };
  });
}
