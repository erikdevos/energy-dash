import { calendarFor, HOURS } from './calendar';
import { householdLoad, isDal, simulate } from './simulate';
import type { CostLine, MonthRow, Outcome, Scenario, SimResult, Totals, YearData } from './types';

const BTW = 1.21;

function sum(a: Float64Array): number {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i];
  return t;
}

export function feedInCosts(s: Scenario, exportKwh: number): number {
  const c = s.contract;
  return c.terugleverkostenAan ? exportKwh * c.terugleverkostenPerKwh : 0;
}

export interface FlowSums {
  impN: number;
  impD: number;
  expN: number;
  expD: number;
}

/** Afname en teruglevering per tariefperiode (normaal/dal) over een reeks uren. */
export function flowSums(s: Scenario, sim: SimResult, year: number, from = 0, to = HOURS): FlowSums {
  const cal = calendarFor(year);
  const sums = { impN: 0, impD: 0, expN: 0, expD: 0 };
  for (let i = from; i < to; i++) {
    if (isDal(cal, i, s.belasting.dalVanafUur)) {
      sums.impD += sim.imp[i];
      sums.expD += sim.exp[i];
    } else {
      sums.impN += sim.imp[i];
      sums.expN += sim.exp[i];
    }
  }
  return sums;
}

/** Leveringskosten vast contract mét saldering: eerst per tariefperiode, dan kruiselings. */
export function salderen(s: Scenario, { impN, impD, expN, expD }: FlowSums) {
  let netN = impN - expN;
  let netD = impD - expD;
  if (netN < 0 && netD > 0) {
    const shift = Math.min(-netN, netD);
    netN += shift;
    netD -= shift;
  } else if (netD < 0 && netN > 0) {
    const shift = Math.min(-netD, netN);
    netD += shift;
    netN -= shift;
  }
  const c = s.contract;
  const levering = Math.max(0, netN) * c.tariefNormaal + Math.max(0, netD) * c.tariefDal;
  const netTotal = impN + impD - expN - expD;
  return {
    levering,
    netTotal,
    energiebelasting: Math.max(0, netTotal) * s.belasting.energiebelasting,
    vergoeding: Math.max(0, -netTotal) * c.terugleververgoeding,
  };
}

export function costLines(s: Scenario, sim: SimResult, data: YearData, totals: Totals): CostLine[] {
  const c = s.contract;
  const b = s.belasting;
  const eb = b.energiebelasting;
  const lines: CostLine[] = [];

  if (c.type === 'vast') {
    if (s.regime === 'saldering') {
      const n = salderen(s, flowSums(s, sim, data.priceYear));
      lines.push({ key: 'levering', label: 'Stroom (na saldering)', eur: n.levering });
      lines.push({ key: 'eb', label: 'Energiebelasting', eur: n.energiebelasting });
      lines.push({ key: 'terug', label: 'Terugleververgoeding overschot', eur: -n.vergoeding });
    } else {
      const cal = calendarFor(data.priceYear);
      let levering = 0;
      let terug = 0;
      for (let i = 0; i < HOURS; i++) {
        levering += sim.imp[i] * (isDal(cal, i, s.belasting.dalVanafUur) ? c.tariefDal : c.tariefNormaal);
        terug += sim.exp[i] * sim.exportPrice[i];
      }
      lines.push({ key: 'levering', label: 'Stroom', eur: levering });
      lines.push({ key: 'eb', label: 'Energiebelasting', eur: totals.imp * eb });
      lines.push({ key: 'terug', label: 'Terugleververgoeding', eur: -terug });
    }
  } else {
    let levering = 0;
    let terug = 0;
    for (let i = 0; i < HOURS; i++) {
      levering += sim.imp[i] * (data.epex[i] * c.prijsSchaal * BTW + c.opslag);
      terug += sim.exp[i] * sim.exportPrice[i];
    }
    const ebKwh = s.regime === 'saldering' ? Math.max(0, totals.imp - totals.exp) : totals.imp;
    lines.push({ key: 'levering', label: 'Stroom (uurprijs + opslag)', eur: levering });
    lines.push({ key: 'eb', label: s.regime === 'saldering' ? 'Energiebelasting (gesaldeerd)' : 'Energiebelasting', eur: ebKwh * eb });
    lines.push({ key: 'terug', label: 'Teruglevering (uurprijs)', eur: -terug });
  }

  lines.push({ key: 'terugkosten', label: 'Terugleverkosten', eur: feedInCosts(s, totals.exp) });
  lines.push({ key: 'vast', label: 'Vaste leveringskosten', eur: c.vasteLeveringskostenPerMaand * 12 });
  lines.push({ key: 'net', label: 'Netbeheerkosten', eur: b.netbeheerPerJaar });
  lines.push({ key: 'verm', label: 'Vermindering energiebelasting', eur: -b.vermindering });
  return lines;
}

export function run(s: Scenario, data: YearData): Outcome {
  const sim = simulate(s, data);
  const totals: Totals = {
    load: sum(sim.load),
    pv: sum(sim.pv),
    pvDirect: sum(sim.pvDirect),
    batDischarge: sum(sim.batDischarge),
    batPvCharge: sum(sim.batCharge) - sum(sim.batGridCharge),
    imp: sum(sim.imp),
    exp: sum(sim.exp),
    curtailed: sum(sim.curtailed),
    ev: sum(sim.evLoad),
  };
  const costs = costLines(s, sim, data, totals);
  const total = costs.reduce((t, l) => t + l.eur, 0);

  const cal = calendarFor(data.priceYear);
  const monthly: MonthRow[] = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    load: 0,
    pv: 0,
    pvDirect: 0,
    batDischarge: 0,
    imp: 0,
    exp: 0,
  }));
  const household = householdLoad(s, data, cal);
  const parts = household.components;
  const pelletWarmte = Array<number>(12).fill(0);
  const components: Outcome['components'] = {
    huishouden: Array(12).fill(0),
    boiler: Array(12).fill(0),
    was: Array(12).fill(0),
    verwarming: Array(12).fill(0),
    koelen: Array(12).fill(0),
    auto: Array(12).fill(0),
  };
  for (let i = 0; i < HOURS; i++) {
    const mo = cal.month[i];
    components.huishouden[mo] += parts.huishouden[i];
    components.boiler[mo] += parts.boiler[i];
    components.was[mo] += parts.was[i];
    components.verwarming[mo] += parts.verwarming[i];
    components.koelen[mo] += parts.koelen[i];
    components.auto[mo] += sim.evLoad[i];
    pelletWarmte[mo] += household.pelletHeat[i];
    const r = monthly[mo];
    r.load += sim.load[i];
    r.pv += sim.pv[i];
    r.pvDirect += sim.pvDirect[i];
    r.batDischarge += sim.batDischarge[i];
    r.imp += sim.imp[i];
    r.exp += sim.exp[i];
  }
  return { sim, totals, costs, total, monthly, components, pelletWarmte };
}

/** Aandeel zonnestroom dat je zelf gebruikt (direct of via de batterij). */
export function selfConsumption(t: Totals): number {
  return t.pv > 0 ? (t.pv - t.exp - t.curtailed) / t.pv : 0;
}

/** Aandeel van je verbruik dat uit eigen zonnestroom komt. */
export function selfSufficiency(t: Totals, rendement: number): number {
  return t.load > 0 ? Math.min(1, (t.pvDirect + t.batPvCharge * rendement) / t.load) : 0;
}
