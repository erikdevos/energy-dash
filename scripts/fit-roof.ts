// Welke dakligging past het best bij de jaarnota's? Vergelijk de afgestemde opbrengstfactor per ligging.
import { readFileSync } from 'node:fs';
import { calibrate, calibrationTargets, startFromNotas } from '../src/model/calibrate';
import { kwp } from '../src/model/simulate';
import type { JaarnotaSet } from '../src/lib/api';

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8'));
for (const target of calibrationTargets(set)) {
  for (const orientation of ['zuid', 'oost-west']) {
    for (const angle of [10, 15]) {
      const w = JSON.parse(readFileSync(`data/cache/pvgis-2023-50.86-5.87-${angle}-${orientation}.json`, 'utf8'));
      const data = { priceYear: 2025, epex: prices.prices, weatherYear: 2023, pvPerKwp: w.pvPerKwp, tempC: w.tempC };
      const pvgis = w.pvPerKwp.reduce((a: number, b: number) => a + b, 0);
      const start = startFromNotas(set, target, data);
      const res = calibrate({ ...start, zon: { ...start.zon, panelen: 20, wpPerPaneel: 405 } }, target, data);
      const pv = pvgis * kwp(res) * res.zon.opbrengstFactor;
      console.log(
        `${target.label.padEnd(10)} ${orientation.padEnd(9)} ${angle}°: PVGIS ${Math.round(pvgis)} kWh/kWp = ${Math.round(pvgis * kwp(res))} kWh | afgestemd ${Math.round(pv)} kWh (factor ${res.zon.opbrengstFactor}), verbruik ${Math.round(res.verbruik.basisKwh + res.verbruik.flexKwh + res.verbruik.warmtepompKwh + res.verbruik.warmwaterKwh)} kWh`,
      );
    }
  }
}
