// Snelle sanity-check van het model met de gecachte prijzen en het weer.
import { readFileSync } from 'node:fs';
import { run, selfConsumption, selfSufficiency } from '../src/model/costs';
import { BASE_SCENARIO, clone, makePresets } from '../src/model/defaults';

const PRESETS = makePresets(BASE_SCENARIO.contract);
import type { YearData } from '../src/model/types';

const priceYear = Number(process.argv[2] ?? 2025);
const prices = JSON.parse(readFileSync(`data/cache/prices-${priceYear}.json`, 'utf8'));
const weather = JSON.parse(readFileSync('data/cache/pvgis-2023-52.09-5.12-35-zuid.json', 'utf8'));
const data: YearData = { priceYear, epex: prices.prices, weatherYear: 2023, pvPerKwp: weather.pvPerKwp, tempC: weather.tempC };

const r0 = (v: number) => Math.round(v);
for (const bat of [false, true]) {
  for (const p of PRESETS) {
    const s = p.apply(clone(BASE_SCENARIO));
    s.batterij.aan = bat;
    const t0 = performance.now();
    const o = run(s, data);
    const ms = performance.now() - t0;
    const t = o.totals;
    console.log(
      `${p.label.padEnd(38)} bat=${bat ? 'ja ' : 'nee'} totaal €${r0(o.total)} | verbruik ${r0(t.load)} opwek ${r0(t.pv)} afname ${r0(t.imp)} terug ${r0(t.exp)} afgeschakeld ${r0(t.curtailed)} | eigen ${(selfConsumption(t) * 100).toFixed(0)}% zelfv ${(selfSufficiency(t, s.batterij.rendement) * 100).toFixed(0)}% | ${ms.toFixed(1)}ms`,
    );
    if (!bat) console.log('   ', o.costs.map((c) => `${c.key}:${r0(c.eur)}`).join(' '));
  }
}

console.log('\nBatterijstrategie bij 2027 dynamisch:');
for (const strat of ['eigenVerbruik', 'dynamisch'] as const) {
  for (const curtail of [true, false]) {
    const s = PRESETS[3].apply(clone(BASE_SCENARIO));
    s.batterij.aan = true;
    s.batterij.strategie = strat;
    s.contract.afschakelenBijNegatief = curtail;
    const o = run(s, data);
    console.log(`  ${strat.padEnd(14)} afschakelen=${curtail} totaal €${r0(o.total)} afname ${r0(o.totals.imp)} terug ${r0(o.totals.exp)} afgeschakeld ${r0(o.totals.curtailed)}`);
  }
}
