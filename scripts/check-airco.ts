// Gevoeligheid: hoeveel van de warmte neemt de airco over, en wat doet dat met de kosten in 2027 (dynamisch, met kozijnen)?
import { readFileSync } from 'node:fs';
import { calibrationTargets, startFromNotas } from '../src/model/calibrate';
import { run } from '../src/model/costs';
import { makePresets } from '../src/model/defaults';
import type { JaarnotaSet } from '../src/lib/api';
import { LOC } from './locatie';

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8'));
const w = JSON.parse(readFileSync(`data/cache/pvgis-2023-${LOC}-10-oost-west.json`, 'utf8'));
const data = { priceYear: 2025, epex: prices.prices, weatherYear: 2023, pvPerKwp: w.pvPerKwp, tempC: w.tempC };
const start = startFromNotas(set, calibrationTargets(set).find((t) => t.id === '2025-2026')!, data);
const presets = makePresets(start);
const dyn = presets.find((p) => p.id === 'dyn2027')!;
const vast = presets.find((p) => p.id === 'vast2027')!;
const base = { ...start, verbruik: { ...start.verbruik, isolatieBesparing: 0.45, flexNaarZon: 0.7, aircoScop: 4.5, aircoVermogenKw: 4 } };
for (const share of [0, 0.5, 0.6, 0.75, 0.9]) {
  const s = { ...base, verbruik: { ...base.verbruik, aircoAandeel: share } };
  const d = run(dyn.apply(s), data);
  const v = run(vast.apply(s), data);
  const heat = d.components.verwarming.reduce((a, b) => a + b, 0);
  console.log(`airco ${Math.round(share * 100)}%: elektrische verwarming ${Math.round(heat)} kWh | 2027 dynamisch €${Math.round(d.total)} | vast €${Math.round(v.total)}`);
}

console.log('\nZonder pelletkachel (airco neemt de dagwarmte over):');
for (const [label, extra] of [['pellet aan, airco 75%', {}], ['pellet uit, airco 0%', { pellet: { ...base.verbruik.pellet, aan: false }, aircoAandeel: 0 }], ['pellet uit, airco 75%', { pellet: { ...base.verbruik.pellet, aan: false }, aircoAandeel: 0.75 }], ['pellet uit, airco 90%', { pellet: { ...base.verbruik.pellet, aan: false }, aircoAandeel: 0.9 }]] as const) {
  const s = { ...base, verbruik: { ...base.verbruik, aircoAandeel: 0.75, ...extra } };
  const d = run(dyn.apply(s), data);
  const heat = d.components.verwarming.reduce((a, b) => a + b, 0);
  const pel = s.verbruik.pellet.aan ? '+ ca. €144 pellets' : '';
  console.log(`${label}: elektrische verwarming ${Math.round(heat)} kWh | 2027 dynamisch €${Math.round(d.total)} ${pel}`);
}
