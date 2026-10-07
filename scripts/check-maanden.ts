// Greenchoice-maandbedragen (incl. BTW) omrekenen naar kWh en vergelijken met het afgestemde model.
import { readFileSync } from 'node:fs';
import { calibrationTargets, startFromNotas } from '../src/model/calibrate';
import { run } from '../src/model/costs';
import type { JaarnotaSet } from '../src/lib/api';

const EUR = {
  stroom: [269.46, 160.95, 128.15, 73.02, 86.55, 64.83, 49.5, 56.23, 81.93, 14.92],
  terug: [16.83, 46.69, 161.21, 245.04, 254.99, 284.61, 316.82, 250.96, 181.51, 36.6],
};
const EB = 0.11085;
const N = 0.19423 * 1.21 + EB;
const D = 0.1731 * 1.21 + EB;
const pImp = 0.6 * D + 0.4 * N;
const pExp = 0.28 * D + 0.72 * N;
const imp = EUR.stroom.map((e) => e / pImp);
const exp = EUR.terug.map((e) => e / pExp);

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8'));
const w = JSON.parse(readFileSync('data/cache/pvgis-2023-50.86-5.87-10-oost-west.json', 'utf8'));
const data = { priceYear: 2025, epex: prices.prices, weatherYear: 2023, pvPerKwp: w.pvPerKwp, tempC: w.tempC };
const start = startFromNotas(set, calibrationTargets(set).find((t) => t.id === '2025-2026')!, data);
const o = run(start, data);
const M = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt'];
const r = Math.round;
console.log(`prijs afname ${pImp.toFixed(4)}, teruglevering ${pExp.toFixed(4)} €/kWh`);
console.log('maand  gemeten afname/terug   model afname/terug');
M.forEach((m, i) => console.log(`${m}    ${String(r(imp[i])).padStart(5)} / ${String(r(exp[i])).padStart(5)}      ${String(r(o.monthly[i].imp)).padStart(5)} / ${String(r(o.monthly[i].exp)).padStart(5)}`));
const sum = (a: number[], n = 9) => a.slice(0, n).reduce((x, y) => x + y, 0);
console.log(`jan-sep gemeten ${r(sum(imp))} / ${r(sum(exp))}, model ${r(sum(o.monthly.map((x) => x.imp)))} / ${r(sum(o.monthly.map((x) => x.exp)))}`);
console.log(`mei-okt gemeten ${r(imp.slice(4).reduce((a, b) => a + b))} / ${r(exp.slice(4).reduce((a, b) => a + b))} (meter sinds 1 mei: 1086 / 3936)`);
