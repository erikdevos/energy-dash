// Vergelijk het model met een persoonlijk aanbod van Zonneplan: zelfde contract, welke volumes en kosten rekent het model?
import { readFileSync } from 'node:fs';
import { calibrationTargets, startFromNotas } from '../src/model/calibrate';
import { run } from '../src/model/costs';
import { applySupplier, type SupplierData } from '../src/model/suppliers';
import type { JaarnotaSet } from '../src/lib/api';
import { LOC } from './locatie';

const set: JaarnotaSet = JSON.parse(readFileSync('data/jaarnotas.json', 'utf8'));
const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8'));
const w = JSON.parse(readFileSync(`data/cache/pvgis-2023-${LOC}-10-oost-west.json`, 'utf8'));
const data = { priceYear: 2025, epex: prices.prices, weatherYear: 2023, pvPerKwp: w.pvPerKwp, tempC: w.tempC };
const sup: SupplierData = JSON.parse(readFileSync('data/leveranciers.json', 'utf8'));
const offer = (JSON.parse(readFileSync('data/aanbiedingen.json', 'utf8')) as { aanbiedingen: Array<{ leverancier: string; contractId: string; afnameKwh: number; terugKwh: number; perMaand: number; regels: Record<string, number> }> }).aanbiedingen[0];
const zp = sup.contracten.find((c) => c.id === offer.contractId)!;
for (const t of calibrationTargets(set)) {
  const start = startFromNotas(set, t, data);
  const o = run(applySupplier(start, zp, sup.vasteKostenAanname), data);
  console.log(`${t.id.padEnd(10)} afname ${Math.round(o.totals.imp)} teruglevering ${Math.round(o.totals.exp)} (afgeschakeld ${Math.round(o.totals.curtailed)}) kosten €${Math.round(o.total)} = €${Math.round(o.total / 12)} p/m`);
}
console.log(`aanbod ${offer.leverancier}: afname ${offer.afnameKwh}, teruglevering ${offer.terugKwh}, € ${offer.perMaand} p/m`);

// Opbouw per regel, om met het aanbod te vergelijken (data/aanbiedingen.json)
const start = startFromNotas(set, calibrationTargets(set).find((t) => t.id === '2025-2026')!, data);
const o = run(applySupplier(start, zp, sup.vasteKostenAanname), data);
const regel = (k: string) => o.costs.find((l) => l.key === k)?.eur ?? 0;
const imp = o.totals.imp;
const exp = o.totals.exp;
const r = offer.regels;
console.log(`model: stroom (markt + opslag) ${(regel('levering') / imp).toFixed(4)} €/kWh over ${Math.round(imp)} kWh; aanbod ${((r.verbruik + r.inkoopvergoeding) / offer.afnameKwh).toFixed(4)}`);
console.log(`model: teruglevering ${(-regel('terug') / exp).toFixed(4)} €/kWh over ${Math.round(exp)} kWh (incl. bonus); aanbod ${(-(r.terugleververgoeding + r.zonnebonus) / offer.terugKwh).toFixed(4)}`);
console.log(`model: energiebelasting ${regel('eb').toFixed(0)} | vast ${regel('vast').toFixed(0)} | netbeheer+verm ${(regel('net') + regel('verm')).toFixed(0)}; aanbod: EB ${r.energiebelasting} | vast ${r.vasteKosten} | netbeheer+verm ${(r.netbeheer + r.verminderingEB).toFixed(0)}`);

// Gevoeligheid voor het prijsniveau: alle beursprijzen van 2025 met een factor vermenigvuldigd
console.log('\nprijsniveau (factor op de beurs van 2025): Zonneplan | Tibber | Eneco (vast, hangt niet van de beurs af)');
const tibber = sup.contracten.find((c) => c.id === 'tibber')!;
const eneco = sup.contracten.find((c) => c.leverancier === 'Eneco')!;
for (const f of [0.8, 1, 1.25, 1.5, 1.75, 2]) {
  const cost = (c: typeof zp) => {
    const s = applySupplier(start, c, sup.vasteKostenAanname);
    return Math.round(run({ ...s, contract: { ...s.contract, prijsSchaal: f } }, data).total);
  };
  console.log(`  x${f.toFixed(2)}: € ${cost(zp)} | € ${cost(tibber)} | € ${cost(eneco)}`);
}
