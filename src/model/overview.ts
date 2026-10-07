import { run } from './costs';
import type { ContractPreset } from './defaults';
import { revertAll } from './plans';
import type { Outcome, Scenario, YearData } from './types';

/*
 * Het verhaal achter het overzicht: van je kosten nu, via het einde van de saldering, naar 2027,
 * en wat elk van je plannen daarvan terugwint.
 */

export type PlanId = 'kozijnen' | 'airco' | 'overdag' | 'batterij';

export const PLAN_LABELS: Record<PlanId, string> = {
  kozijnen: 'Nieuwe kozijnen en garagedeur',
  airco: 'Daikin Perfera',
  overdag: 'Apparaten overdag',
  batterij: 'Thuisbatterij',
};

/** Standaardwaarden als je een plan aanzet en het nog niet was ingesteld. */
const PLAN_DEFAULTS = { aircoAandeel: 0.6, aircoScop: 4.5, aircoVermogenKw: 4.0, isolatieBesparing: 0.45, flexNaarZon: 0.7 };

export function planOn(s: Scenario, start: Scenario, id: PlanId): boolean {
  const v = s.verbruik;
  const b = start.verbruik;
  if (id === 'kozijnen') return v.isolatieBesparing > b.isolatieBesparing;
  if (id === 'airco') return v.aircoAandeel > b.aircoAandeel;
  if (id === 'overdag') return v.flexNaarZon > b.flexNaarZon;
  return s.batterij.aan && !start.batterij.aan;
}

/** Eén plan aan- of uitzetten. Aanzetten gebruikt de standaardwaarden; uitzetten zet terug naar het startpunt. */
export function setPlan(s: Scenario, start: Scenario, id: PlanId, on: boolean): Scenario {
  const v = s.verbruik;
  const b = start.verbruik;
  if (id === 'batterij') return { ...s, batterij: { ...s.batterij, aan: on ? true : start.batterij.aan } };
  if (id === 'kozijnen') return { ...s, verbruik: { ...v, isolatieBesparing: on ? Math.max(b.isolatieBesparing, PLAN_DEFAULTS.isolatieBesparing) : b.isolatieBesparing } };
  if (id === 'overdag') return { ...s, verbruik: { ...v, flexNaarZon: on ? Math.max(b.flexNaarZon, PLAN_DEFAULTS.flexNaarZon) : b.flexNaarZon } };
  return {
    ...s,
    verbruik: on
      ? { ...v, aircoAandeel: Math.max(b.aircoAandeel, PLAN_DEFAULTS.aircoAandeel), aircoScop: PLAN_DEFAULTS.aircoScop, aircoVermogenKw: PLAN_DEFAULTS.aircoVermogenKw }
      : { ...v, aircoAandeel: b.aircoAandeel },
  };
}

/** Neem de instellingen van één plan over uit `from` (zodat je eigen fijnafstemming meetelt). */
function copyPlan(to: Scenario, from: Scenario, id: PlanId): Scenario {
  const v = from.verbruik;
  if (id === 'batterij') return { ...to, batterij: { ...from.batterij } };
  if (id === 'kozijnen') return { ...to, verbruik: { ...to.verbruik, isolatieBesparing: v.isolatieBesparing } };
  if (id === 'overdag') return { ...to, verbruik: { ...to.verbruik, flexNaarZon: v.flexNaarZon } };
  return { ...to, verbruik: { ...to.verbruik, aircoAandeel: v.aircoAandeel, aircoScop: v.aircoScop, aircoVermogenKw: v.aircoVermogenKw } };
}

export interface Step {
  label: string;
  detail?: string;
  /** totaal (stand) of verandering t.o.v. de vorige stand, € per jaar */
  value: number;
  kind: 'total' | 'delta';
}

export const PLAN_ORDER: PlanId[] = ['kozijnen', 'airco', 'overdag', 'batterij'];

/**
 * Van "nu" naar 2027 met het gekozen contract: einde saldering, daarna je plannen één voor één
 * (kozijnen eerst: die verlagen de warmtevraag waar de airco daarna mee werkt).
 */
export function roadTo2027(s: Scenario, start: Scenario, nu: ContractPreset, contract: ContractPreset, data: YearData) {
  const statusQuo = { ...revertAll(s, start), batterij: { ...start.batterij } };
  const cost = (sc: Scenario, p: ContractPreset) => run(p.apply(sc), data).total;
  const steps: Step[] = [];
  const now = cost(statusQuo, nu);
  steps.push({ label: 'Nu', detail: 'huidig contract, met saldering', value: now, kind: 'total' });
  let cur = statusQuo;
  let prev = cost(cur, contract);
  steps.push({ label: 'Einde saldering', detail: `${contract.label.replace(/^2027 · /, '')}`, value: prev - now, kind: 'delta' });
  for (const id of PLAN_ORDER) {
    if (!planOn(s, start, id)) continue;
    cur = copyPlan(cur, s, id);
    const c = cost(cur, contract);
    steps.push({ label: PLAN_LABELS[id], value: c - prev, kind: 'delta' });
    prev = c;
  }
  // Overige aanpassingen uit de speeltuin (boiler, thermostaat, zonnepanelen, ...)
  const all = cost(s, contract);
  if (Math.abs(all - prev) >= 1) steps.push({ label: 'Overige aanpassingen', detail: 'uit Scenario\'s', value: all - prev, kind: 'delta' });
  steps.push({ label: '2027', detail: 'met deze keuzes', value: all, kind: 'total' });
  return { steps, now, end: all, statusQuo2027: cost(statusQuo, contract) };
}

/** Kosten per jaar van een huishouden onder elke contractvorm. */
export function costsPerContract(s: Scenario, presets: ContractPreset[], data: YearData): Record<string, Outcome> {
  return Object.fromEntries(presets.map((p) => [p.id, run(p.apply(s), data)]));
}
