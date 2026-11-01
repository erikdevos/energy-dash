// Controle: hangt de dagelijkse verwarming in het model af van de zon, zoals de Adax-metingen laten zien?
import { readFileSync } from 'node:fs';
import { calibrationTargets, startFromNotas } from '../src/model/calibrate';
import { calendarFor } from '../src/model/calendar';
import { householdLoad } from '../src/model/simulate';
import type { JaarnotaSet } from '../src/lib/api';
import { LOC } from './locatie';

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8'));
const w = JSON.parse(readFileSync(`data/cache/pvgis-2023-${LOC}-10-oost-west.json`, 'utf8'));
const data = { priceYear: 2025, epex: prices.prices, weatherYear: 2023, pvPerKwp: w.pvPerKwp, tempC: w.tempC };
const start = startFromNotas(set, calibrationTargets(set).find((t) => t.id === '2025-2026')!, data);
const heating = householdLoad(start, data, calendarFor(data.priceYear)).components.verwarming;
// dagen oktober (UTC-index is voor dit doel goed genoeg)
const first = Date.UTC(2023, 9, 1) / 3600_000 - Date.UTC(2023, 0, 1) / 3600_000;
const xs: number[] = [];
const ys: number[] = [];
for (let d = 0; d < 31; d++) {
  let pv = 0, heat = 0, t = 0;
  for (let h = 0; h < 24; h++) {
    const i = first + d * 24 + h;
    pv += data.pvPerKwp[i];
    heat += heating[i];
    t += data.tempC[i] / 24;
  }
  xs.push(pv * 8.1);
  ys.push(heat);
  if (d < 10) console.log(`okt ${d + 1}: zon ${(pv * 8.1).toFixed(1)} kWh, temp ${t.toFixed(1)} °C, verwarming ${heat.toFixed(1)} kWh`);
}
const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
const corr = slope * Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) / ys.reduce((s, y) => s + (y - my) ** 2, 0));
console.log(`model oktober: gemiddeld ${my.toFixed(1)} kWh/dag, helling ${slope.toFixed(2)} kWh verwarming per kWh zon, correlatie ${corr.toFixed(2)}`);
