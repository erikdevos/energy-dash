import { join } from 'node:path';
import { DATA_DIR, readJson } from './cache.ts';

/*
 * Echt weer per uur (temperatuur en zonnestraling) van Open-Meteo, voor de dagen waarover we Adax-gegevens hebben.
 * Gratis en zonder sleutel. Oudere dagen komen uit het archief, de laatste dagen uit de verwachting-API.
 * Er gaan alleen afgeronde coördinaten van je woonplaats mee, geen andere gegevens.
 */

export interface HourlyWeather {
  /** ms sinds epoch (UTC), begin van het uur */
  t: number[];
  tempC: number[];
  /** zonnestraling op een vlak (W/m², gemiddeld over het uur) */
  rad: number[];
}

let cache: { key: string; at: number; value: HourlyWeather } | null = null;

async function location(): Promise<{ lat: number; lon: number } | null> {
  const lat = Number(process.env.WEATHER_LAT);
  const lon = Number(process.env.WEATHER_LON);
  if (Number.isFinite(lat) && Number.isFinite(lon) && process.env.WEATHER_LAT) return { lat, lon };
  const set = await readJson<{ locatie?: { lat: number; lon: number } }>(join(DATA_DIR, 'jaarnotas.json'));
  return set?.locatie ?? null;
}

async function fetchHourly(url: string): Promise<HourlyWeather> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo: ${res.status}`);
  const j = (await res.json()) as { hourly: { time: string[]; temperature_2m: Array<number | null>; shortwave_radiation: Array<number | null> } };
  return {
    t: j.hourly.time.map((x) => Date.parse(`${x}:00Z`)),
    tempC: j.hourly.temperature_2m.map((v) => v ?? NaN),
    rad: j.hourly.shortwave_radiation.map((v) => v ?? NaN),
  };
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Uurweer vanaf `fromMs` tot nu. */
export async function getWeather(fromMs: number): Promise<HourlyWeather | null> {
  const loc = await location();
  if (!loc) return null;
  const key = `${iso(fromMs)}`;
  if (cache && cache.key === key && Date.now() - cache.at < 3600_000) return cache.value;
  const lat = loc.lat.toFixed(2);
  const lon = loc.lon.toFixed(2);
  const vars = 'hourly=temperature_2m,shortwave_radiation&timezone=UTC';
  const now = Date.now();
  const recentFrom = now - 7 * 86_400_000;
  const parts: HourlyWeather[] = [];
  // archief tot en met 8 dagen terug, daarna de verwachting-API met de laatste dagen
  if (iso(fromMs) <= iso(recentFrom - 86_400_000)) {
    parts.push(await fetchHourly(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${iso(fromMs)}&end_date=${iso(recentFrom - 86_400_000)}&${vars}`));
  }
  parts.push(await fetchHourly(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=8&forecast_days=1&${vars}`));
  const byTime = new Map<number, [number, number]>();
  for (const p of parts) p.t.forEach((t, i) => byTime.set(t, [p.tempC[i], p.rad[i]]));
  const times = [...byTime.keys()].filter((t) => t >= fromMs).sort((a, b) => a - b);
  const value: HourlyWeather = { t: times, tempC: times.map((t) => byTime.get(t)![0]), rad: times.map((t) => byTime.get(t)![1]) };
  cache = { key, at: now, value };
  return value;
}
