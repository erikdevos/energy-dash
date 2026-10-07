// Controleert de kalibratie op de echte jaarnota's: past het model afname, teruglevering, dal-aandeel en bedrag?
// Gebruik: npx tsx scripts/check-notas.ts [orientatie] [hellingshoek]
import { readFileSync } from 'node:fs';
import { calendarFor, HOURS } from '../src/model/calendar';
import { calibrate, calibrationTargets, notaScenario, notaTotals, startFromNotas } from '../src/model/calibrate';
import { run } from '../src/model/costs';
import { isDal } from '../src/model/simulate';
import type { Timing } from '../src/model/types';
import type { JaarnotaSet } from '../src/lib/api';

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const loc = set.locatie!;
const orientation = process.argv[2] ?? set.installatie?.orientatie ?? 'zuid';
const angle = Number(process.argv[3] ?? set.installatie?.hellingshoek ?? 35);
const priceYear = 2025;
const prices = JSON.parse(readFileSync(`data/cache/prices-${priceYear}.json`, 'utf8'));
const weather = JSON.parse(readFileSync(`data/cache/pvgis-2023-${loc.lat}-${loc.lon}-${angle}-${orientation}.json`, 'utf8'));
const data = { priceYear, epex: prices.prices, weatherYear: 2023, pvPerKwp: weather.pvPerKwp, tempC: weather.tempC };
const cal = calendarFor(priceYear);
const r = Math.round;

console.log(`dak ${orientation} ${angle}°`);
for (const n of set.notas) {
  const t = notaTotals(n);
  console.log(`nota ${n.label}: dal-aandeel afname ${r(t.dalShareImp * 100)}%, teruglevering ${r(t.dalShareExp * 100)}%`);
}
for (const timing of ['naGebruik', 'nacht', 'zon', 'avond'] as Timing[]) {
  for (const target of calibrationTargets(set)) {
    const base = startFromNotas(set, target, data);
    const start = calibrate({ ...base, verbruik: { ...base.verbruik, warmwaterTiming: timing } }, target, data);
    const o = run(start, data);
    let impD = 0;
    let expD = 0;
    for (let i = 0; i < HOURS; i++) {
      if (isDal(cal, i, start.belasting.dalVanafUur)) {
        impD += o.sim.imp[i];
        expD += o.sim.exp[i];
      }
    }
    const v = start.verbruik;
    console.log(
      `  boiler ${timing.padEnd(9)} doel ${target.label.padEnd(9)}: afname ${r(o.totals.imp)}/${target.imp} terug ${r(o.totals.exp)}/${target.exp} | opwek ${r(o.totals.pv)} | dal-aandeel afname ${r((impD / o.totals.imp) * 100)}% terug ${r((expD / o.totals.exp) * 100)}% | verwarming ${v.verwarmingKwh} boiler ${v.warmwaterKwh} basis ${v.basisKwh}`,
    );
  }
}
for (const n of set.notas) {
  const start = startFromNotas(set, calibrationTargets(set).find((c) => c.id === n.label)!, data);
  const o = run(notaScenario(start, set, n), data);
  console.log(`nota ${n.label}: werkelijk €${n.bedragen.totaal}, model €${r(o.total)}`);
}
