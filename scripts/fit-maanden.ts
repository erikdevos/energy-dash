// Welke dakligging en welk weerjaar verklaren het maandpatroon van 2025 het best?
// Per combinatie: opwekfactor, warmtevraag en overig verbruik fitten op afname + teruglevering per maand.
import { readFileSync } from 'node:fs';
import { calibrationTargets, startFromNotas } from '../src/model/calibrate';
import { run } from '../src/model/costs';
import { kwp } from '../src/model/simulate';
import type { Scenario } from '../src/model/types';
import type { JaarnotaSet } from '../src/lib/api';

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const maanden = JSON.parse(readFileSync('data/maanden.json', 'utf8')).maanden.filter((m: { maand: string }) => m.maand.startsWith('2025'));
const IMP = maanden.map((m: { afname: number }) => m.afname);
const EXP = maanden.map((m: { teruglevering: number }) => m.teruglevering);
const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8'));
const r = Math.round;

function sse(s: Scenario, data: Parameters<typeof run>[1]) {
  const o = run(s, data);
  let e = 0;
  for (let m = 0; m < 12; m++) e += (o.monthly[m].imp - IMP[m]) ** 2 + (o.monthly[m].exp - EXP[m]) ** 2;
  return { e, o };
}

function golden(f: (x: number) => number, lo: number, hi: number, iters = 14) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  for (let k = 0; k < iters; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

const combos = [] as Array<[string, number]>;
for (const a of (process.argv[2] ?? '10,20,25,30,35').split(',').map(Number)) combos.push(['zuid', a]);
const results = [];
for (const [orientation, angle] of combos) {
  for (const year of [2019, 2020, 2021, 2022, 2023]) {
    const w = JSON.parse(readFileSync(`data/cache/pvgis-${year}-50.86-5.87-${angle}-${orientation}.json`, 'utf8'));
    const data = { priceYear: 2025, epex: prices.prices, weatherYear: year, pvPerKwp: w.pvPerKwp, tempC: w.tempC };
    const t = calibrationTargets(set).find((x) => x.id === '2025-2026')!;
    let s = startFromNotas(set, t, data);
    s = { ...s, regime: 'saldering' };
    const base = s.verbruik;
    const other = (k: number): Scenario['verbruik'] => ({ ...s.verbruik, basisKwh: base.basisKwh * k, flexKwh: base.flexKwh * k, warmwaterKwh: base.warmwaterKwh * k });
    let f = s.zon.opbrengstFactor, H = s.verbruik.verwarmingKwh, B = 1;
    const make = () => ({ ...s, zon: { ...s.zon, opbrengstFactor: f }, verbruik: { ...other(B), verwarmingKwh: H } });
    for (let round = 0; round < 4; round++) {
      f = golden((x) => { f = x; return sse(make(), data).e; }, 0.4, 2.0);
      H = golden((x) => { H = x; return sse(make(), data).e; }, 0, 8000);
      B = golden((x) => { B = x; return sse(make(), data).e; }, 0.3, 2.5);
    }
    const best = make();
    const { e, o } = sse(best, data);
    const pvgis = w.pvPerKwp.reduce((a: number, b: number) => a + b, 0) * kwp(best);
    results.push({ orientation, angle, year, rmse: Math.sqrt(e / 24), f, pv: o.totals.pv, pvgis, H, other: (base.basisKwh + base.flexKwh + base.warmwaterKwh) * B, load: o.totals.load, o });
  }
}
results.sort((a, b) => a.rmse - b.rmse);
for (const x of results) {
  console.log(`${x.orientation.padEnd(9)} ${String(x.angle).padStart(2)}° weer ${x.year}: rmse ${r(x.rmse)} kWh/mnd | opwek ${r(x.pv)} (factor ${x.f.toFixed(2)} op PVGIS ${r(x.pvgis)}) | warmte ${r(x.H)} | overig ${r(x.other)} | verbruik ${r(x.load)}`);
}
const b = results[0];
console.log('\nbeste per maand (gemeten vs model):');
for (let m = 0; m < 12; m++) console.log(`  ${m + 1}: afname ${IMP[m]} / ${r(b.o.monthly[m].imp)}   terug ${EXP[m]} / ${r(b.o.monthly[m].exp)}   opwek ${r(b.o.monthly[m].pv)}  verbruik ${r(b.o.monthly[m].load)}`);
