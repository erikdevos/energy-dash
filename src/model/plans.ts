import { run } from './costs';
import type { ContractPreset } from './defaults';
import type { Scenario, YearData } from './types';

/**
 * Maatregelen in huis. Een maatregel is "aan" als het scenario afwijkt van het startpunt; het effect
 * is het verschil met hetzelfde scenario waarin alleen die maatregel is teruggedraaid. Zo tellen
 * maatregelen die elkaar beïnvloeden (airco en kozijnen verlagen allebei de verwarming) niet dubbel.
 */
export interface Measure {
  id: string;
  label: string;
  describe: (s: Scenario) => string;
  active: (s: Scenario, start: Scenario) => boolean;
  revert: (s: Scenario, start: Scenario) => Scenario;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const withVerbruik = (s: Scenario, v: Partial<Scenario['verbruik']>): Scenario => ({ ...s, verbruik: { ...s.verbruik, ...v } });

export const MEASURES: Measure[] = [
  {
    id: 'airco',
    label: 'Daikin Perfera airco',
    describe: (s) =>
      `${pct(s.verbruik.aircoAandeel)} van de warmte, SCOP ${s.verbruik.aircoScop.toLocaleString('nl-NL')}, max ${s.verbruik.aircoVermogenKw.toLocaleString('nl-NL')} kW`,
    active: (s, b) => s.verbruik.aircoAandeel > b.verbruik.aircoAandeel,
    revert: (s, b) => withVerbruik(s, { aircoAandeel: b.verbruik.aircoAandeel }),
  },
  {
    id: 'kozijnen',
    label: 'Nieuwe kozijnen en isolatie',
    describe: (s) => `${pct(s.verbruik.isolatieBesparing)} minder warmtevraag`,
    active: (s, b) => s.verbruik.isolatieBesparing > b.verbruik.isolatieBesparing,
    revert: (s, b) => withVerbruik(s, { isolatieBesparing: b.verbruik.isolatieBesparing }),
  },
  {
    id: 'thermostaat',
    label: 'Thermostaat radiatoren',
    describe: (s) => `${s.verbruik.thermostaatDag.toLocaleString('nl-NL')} °C overdag, ${s.verbruik.thermostaatNacht.toLocaleString('nl-NL')} °C 's nachts`,
    active: (s, b) => s.verbruik.thermostaatDag !== b.verbruik.thermostaatDag || s.verbruik.thermostaatNacht !== b.verbruik.thermostaatNacht,
    revert: (s, b) => withVerbruik(s, { thermostaatDag: b.verbruik.thermostaatDag, thermostaatNacht: b.verbruik.thermostaatNacht }),
  },
  {
    id: 'verschuiven',
    label: 'Wassen, drogen en vaatwasser overdag',
    describe: (s) => `${pct(s.verbruik.flexNaarZon)} tussen 11 en 15 uur`,
    active: (s, b) => s.verbruik.flexNaarZon > b.verbruik.flexNaarZon,
    revert: (s, b) => withVerbruik(s, { flexNaarZon: b.verbruik.flexNaarZon }),
  },
  {
    id: 'boiler',
    label: 'Boiler',
    describe: (s) =>
      `${s.verbruik.boiler === 'warmtepomp' ? 'warmtepompboiler' : s.verbruik.boiler === 'nieuw' ? 'nieuwe elektrische boiler' : 'huidige boiler'}, opwarmen ${
        { naGebruik: 'na gebruik', nacht: "'s nachts", zon: 'op zonuren', avond: "'s avonds" }[s.verbruik.warmwaterTiming]
      }`,
    active: (s, b) => s.verbruik.boiler !== b.verbruik.boiler || s.verbruik.warmwaterTiming !== b.verbruik.warmwaterTiming,
    revert: (s, b) => withVerbruik(s, { boiler: b.verbruik.boiler, warmwaterTiming: b.verbruik.warmwaterTiming }),
  },
  {
    id: 'koelen',
    label: 'Koelen met de airco',
    describe: (s) => `${Math.round(s.verbruik.koelenKwh)} kWh per jaar extra`,
    active: (s, b) => s.verbruik.koelenKwh > b.verbruik.koelenKwh,
    revert: (s, b) => withVerbruik(s, { koelenKwh: b.verbruik.koelenKwh }),
  },
];

/**
 * Jouw plannen (najaar 2026): Perfera 3,5 kW neemt de centrale ruimte over (nu de Adax van 2000 W,
 * de grootste stookpost), nieuwe kozijnen en garagedeur (jouw verwachting: 40-50% minder stoken),
 * apparaten overdag.
 */
export function applyMyPlans(s: Scenario, start: Scenario): Scenario {
  return withVerbruik(s, {
    aircoAandeel: Math.max(start.verbruik.aircoAandeel, 0.6),
    aircoScop: 4.5,
    aircoVermogenKw: 4.0,
    isolatieBesparing: Math.max(start.verbruik.isolatieBesparing, 0.45),
    flexNaarZon: Math.max(start.verbruik.flexNaarZon, 0.7),
  });
}

export function revertAll(s: Scenario, start: Scenario): Scenario {
  return MEASURES.reduce((acc, m) => m.revert(acc, start), s);
}

export interface PlanRow {
  id: string;
  label: string;
  detail: string;
  /** minder afname van het net per jaar (kWh) */
  kwh: number;
  /** besparing per jaar per contractvorm (positief = goedkoper) */
  eur: number[];
}

export function planImpact(s: Scenario, start: Scenario, presets: ContractPreset[], data: YearData) {
  const cost = (sc: Scenario) => presets.map((p) => run(p.apply(sc), data));
  const withAll = cost(s);
  const rowFor = (id: string, label: string, detail: string, without: Scenario): PlanRow => {
    const w = cost(without);
    return {
      id,
      label,
      detail,
      kwh: w[0].totals.imp - withAll[0].totals.imp,
      eur: w.map((o, k) => o.total - withAll[k].total),
    };
  };
  const rows = MEASURES.filter((m) => m.active(s, start)).map((m) => rowFor(m.id, m.label, m.describe(s), m.revert(s, start)));
  const total = rows.length > 1 ? rowFor('totaal', 'Alles samen', '', revertAll(s, start)) : null;
  return { rows, total };
}
