// Doel 2027: welke maatregelen halen de extra kosten het meest terug?
import { readFileSync } from 'node:fs';
import { calibrationTargets, startFromNotas } from '../src/model/calibrate';
import { makePresets } from '../src/model/defaults';
import { batterySweep, computeGoal } from '../src/model/goal';
import { applyMyPlans } from '../src/model/plans';
import type { JaarnotaSet } from '../src/lib/api';

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8'));
const w = JSON.parse(readFileSync(`data/cache/pvgis-2023-${LOC}-10-oost-west.json`, 'utf8'));
const data = { priceYear: 2025, epex: prices.prices, weatherYear: 2023, pvPerKwp: w.pvPerKwp, tempC: w.tempC };
const start = startFromNotas(set, calibrationTargets(set).find((t) => t.id === '2025-2026')!, data);
const p = Object.fromEntries(makePresets(start.contract).map((x) => [x.id, x])) as never;
const g = computeGoal(start, p, data);
console.log(`nu €${Math.round(g.now)} | 2027 vast €${Math.round(g.vast)} | dynamisch €${Math.round(g.dyn)} | extra €${Math.round(g.extra)} | eind €${Math.round(g.end)}`);
for (const s of g.steps) console.log(`${s.lever.label.padEnd(40)} ${s.lever.soort.padEnd(11)} volgorde ${Math.round(s.saving).toString().padStart(4)} | alleen ${Math.round(s.savingAlone).toString().padStart(4)} | als laatste ${Math.round(s.savingLast).toString().padStart(4)} | stand €${Math.round(s.total)}`);
const planned = applyMyPlans(start, start);
for (const r of batterySweep(start, planned, (p as Record<string, never>).dyn2027, data, [5, 10, 15, 20])) console.log(`batterij ${r.kwh} kWh: nu €${Math.round(r.savingNow)} | met plannen €${Math.round(r.savingPlanned)}`);

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
import { run } from '../src/model/costs';
const nu = run((p as Record<string, { apply: (s: typeof start) => typeof start }>).dyn2027.apply(start), data);
const koz = run((p as Record<string, { apply: (s: typeof start) => typeof start }>).dyn2027.apply({ ...start, verbruik: { ...start.verbruik, isolatieBesparing: 0.45 } }), data);
console.log(`pelletwarmte per jaar: nu ${Math.round(sum(nu.pelletWarmte))} kWh warmte, met kozijnen ${Math.round(sum(koz.pelletWarmte))} kWh (${Math.round((1 - sum(koz.pelletWarmte) / sum(nu.pelletWarmte)) * 100)}% minder)`);

import { monthlyCosts } from '../src/model/costs';
import { LOC } from './locatie';
const dynP = (p as Record<string, { apply: (s: typeof start) => typeof start }>).dyn2027;
const kozStart = { ...start, verbruik: { ...start.verbruik, isolatieBesparing: 0.45 } };
const zonder = dynP.apply(kozStart);
const met = dynP.apply({ ...kozStart, verbruik: { ...kozStart.verbruik, aircoAandeel: 0.75, aircoScop: 4.5, aircoVermogenKw: 4 } });
const mz = monthlyCosts(zonder, run(zonder, data), data)!;
const mm = monthlyCosts(met, run(met, data), data)!;
console.log('Daikin-besparing per maand (€):', mz.map((x, i) => `${['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][i]} ${Math.round(x - mm[i])}`).join(', '));
