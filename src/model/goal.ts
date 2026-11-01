import { run } from './costs';
import type { ContractPreset } from './defaults';
import type { Scenario, YearData } from './types';

/*
 * Doel: de extra kosten door het einde van de saldering zo klein mogelijk maken.
 * Vertrekpunt is het dynamische contract (jouw keuze). Daarna: welke maatregelen in gedrag of verbruik halen het meeste terug,
 * in welke volgorde, en wat voegt een thuisbatterij nog toe als alles al is gedaan?
 */

export interface Lever {
  id: string;
  label: string;
  /** besloten: staat al vast en kost niets extra; gedrag kost niets; een investering wel */
  soort: 'besloten' | 'gedrag' | 'investering';
  detail: string;
  apply: (s: Scenario) => Scenario;
}

const v = (s: Scenario, patch: Partial<Scenario['verbruik']>): Scenario => ({ ...s, verbruik: { ...s.verbruik, ...patch } });

export function levers(start: Scenario): Lever[] {
  const b = start.verbruik;
  return [
    {
      id: 'overdag',
      label: 'Was, droger en vaatwasser overdag',
      soort: 'gedrag',
      detail: '90% tussen 11 en 15 uur, als de zon schijnt',
      apply: (s) => v(s, { flexNaarZon: Math.max(b.flexNaarZon, 0.9) }),
    },
    {
      id: 'boilertimer',
      label: 'Boiler op zonuren laten opwarmen',
      soort: 'gedrag',
      detail: 'met een tijdschakelaar of slimme stekker, tussen 11 en 15 uur',
      apply: (s) => v(s, { warmwaterTiming: 'zon' }),
    },
    {
      id: 'thermostaat',
      label: 'Thermostaat een graad lager',
      soort: 'gedrag',
      detail: `${(b.thermostaatDag - 1).toLocaleString('nl-NL')} °C overdag en ${(b.thermostaatNacht - 1).toLocaleString('nl-NL')} °C 's nachts`,
      apply: (s) => v(s, { thermostaatDag: b.thermostaatDag - 1, thermostaatNacht: b.thermostaatNacht - 1 }),
    },
    {
      id: 'kozijnen',
      label: 'Nieuwe kozijnen en garagedeur',
      soort: 'besloten',
      detail: '45% minder warmtevraag (jouw verwachting 40 tot 50%)',
      apply: (s) => v(s, { isolatieBesparing: Math.max(b.isolatieBesparing, 0.45) }),
    },
    {
      id: 'airco',
      label: 'Daikin Perfera',
      soort: 'besloten',
      detail: 'neemt 75% van de warmte over, SCOP 4,5',
      apply: (s) => v(s, { aircoAandeel: Math.max(b.aircoAandeel, 0.75), aircoScop: 4.5, aircoVermogenKw: 4 }),
    },
    {
      id: 'wpboiler',
      label: 'Warmtepompboiler',
      soort: 'investering',
      detail: 'vervangt de oude elektrische boiler, een stuk zuiniger',
      apply: (s) => v(s, { boiler: 'warmtepomp' }),
    },
    {
      id: 'batterij',
      label: 'Thuisbatterij',
      soort: 'investering',
      detail: 'slim laden en ontladen op uurprijzen',
      apply: (s) => ({ ...s, batterij: { ...s.batterij, aan: true, strategie: 'dynamisch' } }),
    },
  ];
}

export interface GoalStep {
  lever: Lever;
  /** wat deze maatregel nog oplevert op het moment dat hij aan de beurt is (€ per jaar) */
  saving: number;
  /** wat hij oplevert als alle andere maatregelen al zijn gedaan */
  savingLast: number;
  /** wat hij alleen oplevert, los van de rest */
  savingAlone: number;
  /** stand na deze stap (€ per jaar) */
  total: number;
}

export interface Goal {
  /** kosten nu, met saldering */
  now: number;
  /** 2027 vast contract, niets veranderd */
  vast: number;
  /** 2027 dynamisch, niets veranderd */
  dyn: number;
  /** extra kosten door het einde van de saldering, met dynamisch contract en zonder maatregelen */
  extra: number;
  steps: GoalStep[];
  /** 2027 dynamisch met alle maatregelen */
  end: number;
  /** extra kosten die overblijven na alle maatregelen (kan negatief zijn: dan zit je lager dan nu) */
  remaining: number;
}

export function computeGoal(start: Scenario, presets: Record<'nu' | 'vast2027' | 'dyn2027', ContractPreset>, data: YearData): Goal {
  const cost = (s: Scenario) => run(presets.dyn2027.apply(s), data).total;
  const now = run(presets.nu.apply(start), data).total;
  const vast = run(presets.vast2027.apply(start), data).total;
  const dyn = cost(start);
  const all = levers(start);
  const everything = all.reduce((s, l) => l.apply(s), start);
  const end = cost(everything);

  const steps: GoalStep[] = [];
  let current = start;
  let currentCost = dyn;
  // eerst wat al vast staat, dan gedrag dat niets kost, dan de investeringen: zo zie je wat een investering nog toevoegt
  const order = { besloten: 0, gedrag: 1, investering: 2 } as const;
  let rest = [...all].sort((a, b) => order[a.soort] - order[b.soort]);
  while (rest.length) {
    const phase = (['besloten', 'gedrag', 'investering'] as const).find((p) => rest.some((l) => l.soort === p))!;
    const pool = rest.filter((l) => l.soort === phase);
    let best = pool[0];
    let bestCost = Infinity;
    for (const l of pool) {
      const c = cost(l.apply(current));
      if (c < bestCost) {
        best = l;
        bestCost = c;
      }
    }
    const savingLast = cost(all.filter((l) => l.id !== best.id).reduce((s, l) => l.apply(s), start)) - end;
    steps.push({ lever: best, saving: currentCost - bestCost, savingLast, savingAlone: dyn - cost(best.apply(start)), total: bestCost });
    current = best.apply(current);
    currentCost = bestCost;
    rest = rest.filter((l) => l.id !== best.id);
  }
  return { now, vast, dyn, extra: dyn - now, steps, end, remaining: end - now };
}

export interface BatteryRow {
  kwh: number;
  /** besparing per jaar t.o.v. geen batterij, zonder en met de overige maatregelen */
  savingNow: number;
  savingPlanned: number;
}

/** Wat levert een batterij van een bepaalde grootte op (dynamisch contract 2027)? */
export function batterySweep(start: Scenario, planned: Scenario, preset: ContractPreset, data: YearData, sizes: number[]): BatteryRow[] {
  const cost = (s: Scenario) => run(preset.apply(s), data).total;
  const off = (s: Scenario): Scenario => ({ ...s, batterij: { ...s.batterij, aan: false } });
  const withBat = (s: Scenario, kwh: number): Scenario => ({
    ...s,
    batterij: { ...s.batterij, aan: true, strategie: 'dynamisch', capaciteitKwh: kwh, vermogenKw: Math.min(5, Math.max(2.5, kwh / 2)) },
  });
  const baseNow = cost(off(start));
  const basePlanned = cost(off(planned));
  return sizes.map((kwh) => ({
    kwh,
    savingNow: baseNow - cost(withBat(start, kwh)),
    savingPlanned: basePlanned - cost(withBat(planned, kwh)),
  }));
}

export interface SequenceRow {
  lever: Lever;
  on: boolean;
  /** wat deze maatregel oplevert, gegeven de maatregelen die al aan staan (0 als hij uit staat) */
  saving: number;
  /** stand na deze stap */
  total: number;
}

/** Reken de maatregelen in vaste volgorde door, met alleen de aangezette. Zo zie je live wat aan- of uitzetten doet. */
export function sequence(start: Scenario, preset: ContractPreset, data: YearData, order: Lever[], on: (id: string) => boolean): { rows: SequenceRow[]; end: number; scenario: Scenario } {
  const cost = (s: Scenario) => run(preset.apply(s), data).total;
  let current = start;
  let currentCost = cost(start);
  const rows: SequenceRow[] = [];
  for (const lever of order) {
    if (!on(lever.id)) {
      rows.push({ lever, on: false, saving: 0, total: currentCost });
      continue;
    }
    const next = lever.apply(current);
    const c = cost(next);
    rows.push({ lever, on: true, saving: currentCost - c, total: c });
    current = next;
    currentCost = c;
  }
  return { rows, end: currentCost, scenario: current };
}
