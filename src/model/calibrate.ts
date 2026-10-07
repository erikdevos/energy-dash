import type { Jaarnota, JaarnotaSet, MaandData } from '../lib/api';
import { HOURS } from './calendar';
import { BASE_SCENARIO, BELASTING, clone } from './defaults';
import { run } from './costs';
import { calendarFor } from './calendar';
import { THERMOSTAAT_REFERENTIE } from './profiles';
import { householdLoad, kwp, simulate } from './simulate';
import type { Scenario, YearData } from './types';

const BTW = 1.21;
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Waar het model op wordt afgestemd: jaartotalen afname en teruglevering, en zo mogelijk de opwek. */
export interface CalibrationTarget {
  id: string;
  label: string;
  imp: number;
  exp: number;
  pv?: number;
  /** toelichting, bv. de periode */
  detail?: string;
  /** gemeten per maand (12 waarden, kalenderjaar): dan wordt ook het seizoenspatroon gefit */
  monthly?: { year: number; imp: number[]; exp: number[] };
}

export function notaTotals(n: Jaarnota) {
  const imp = n.levering.normaal + n.levering.dal;
  const exp = n.teruglevering.normaal + n.teruglevering.dal;
  return { imp, exp, dalShareImp: imp ? n.levering.dal / imp : 0, dalShareExp: exp ? n.teruglevering.dal / exp : 0 };
}

/** Volledige kalenderjaren uit de maanddata (12 maanden, geen deelmaand). */
export function monthlyTargets(data: MaandData | null): CalibrationTarget[] {
  if (!data) return [];
  const byYear = new Map<number, Map<number, { afname: number; teruglevering: number; deel?: boolean }>>();
  for (const m of data.maanden) {
    const [y, mo] = m.maand.split('-').map(Number);
    if (!byYear.has(y)) byYear.set(y, new Map());
    byYear.get(y)!.set(mo - 1, m);
  }
  const out: CalibrationTarget[] = [];
  for (const [year, months] of [...byYear].sort((a, b) => a[0] - b[0])) {
    const list = Array.from({ length: 12 }, (_, i) => months.get(i));
    if (list.some((m) => !m || m.deel)) continue;
    const imp = list.map((m) => m!.afname);
    const exp = list.map((m) => m!.teruglevering);
    out.push({
      id: `maanden-${year}`,
      label: `Maanden ${year}`,
      imp: imp.reduce((a, b) => a + b, 0),
      exp: exp.reduce((a, b) => a + b, 0),
      monthly: { year, imp, exp },
    });
  }
  // De 12 meest recente volledige maanden (over de jaargrens heen), per kalendermaand gezet.
  const complete = data.maanden.filter((m) => !m.deel).sort((a, b) => a.maand.localeCompare(b.maand));
  const recent = complete.slice(-12);
  const months = new Set(recent.map((m) => Number(m.maand.slice(5)) - 1));
  if (recent.length === 12 && months.size === 12) {
    const imp = Array<number>(12).fill(0);
    const exp = Array<number>(12).fill(0);
    for (const m of recent) {
      const mo = Number(m.maand.slice(5)) - 1;
      imp[mo] = m.afname;
      exp[mo] = m.teruglevering;
    }
    const label = (k: string) => new Date(`${k}-01T12:00:00`).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' });
    out.push({
      id: 'laatste-12',
      label: 'Laatste 12 mnd',
      detail: `${label(recent[0].maand)} t/m ${label(recent[11].maand)}`,
      imp: imp.reduce((a, b) => a + b, 0),
      exp: exp.reduce((a, b) => a + b, 0),
      monthly: { year: Number(recent[11].maand.slice(0, 4)), imp, exp },
    });
  }
  return out;
}

export function calibrationTargets(set: JaarnotaSet, maanden: MaandData | null = null): CalibrationTarget[] {
  const list: CalibrationTarget[] = set.notas.map((n) => ({ id: n.label, label: n.label, ...notaTotals(n), pv: n.opwekOmvormer }));
  if (list.length > 1) {
    const avg = (f: (t: CalibrationTarget) => number) => list.reduce((a, t) => a + f(t), 0) / list.length;
    const pvs = list.map((t) => t.pv).filter((v): v is number => v !== undefined);
    list.push({
      id: 'gemiddeld',
      label: 'Gemiddeld',
      imp: Math.round(avg((t) => t.imp)),
      exp: Math.round(avg((t) => t.exp)),
      pv: pvs.length === list.length ? Math.round(pvs.reduce((a, b) => a + b, 0) / pvs.length) : undefined,
    });
  }
  return [...list, ...monthlyTargets(maanden)];
}

/** Gouden-snedezoektocht naar het minimum van f op [lo, hi]. */
function golden(f: (x: number) => number, lo: number, hi: number, iters = 12): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let k = 0; k < iters; k++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}


/** Laatste nota waarop het kale leveringstarief af te lezen is. */
function notaWithTariffs(set: JaarnotaSet): Jaarnota | undefined {
  return [...set.notas].reverse().find((n) => n.tarieven.leveringNormaalExcl !== null);
}

/** Je contract en vaste kosten zoals op de jaarnota, omgerekend naar bedragen incl. BTW. */
export function contractFromNotas(s: Scenario, set: JaarnotaSet): Scenario {
  const latest = set.notas[set.notas.length - 1];
  const priced = notaWithTariffs(set);
  const t = latest.tarieven;
  return {
    ...s,
    contract: {
      ...s.contract,
      type: 'vast',
      tariefNormaal: priced?.tarieven.leveringNormaalExcl ? r5(priced.tarieven.leveringNormaalExcl * BTW) : s.contract.tariefNormaal,
      tariefDal: priced?.tarieven.leveringDalExcl ? r5(priced.tarieven.leveringDalExcl * BTW) : s.contract.tariefDal,
      terugleververgoeding: t.terugleververgoeding,
      terugleverkostenAan: t.terugleverkostenPerKwh > 0,
      terugleverkostenPerKwh: t.terugleverkostenPerKwh,
      vasteLeveringskostenPerMaand: r2((t.vasteLeveringskostenPerDagExcl * 365 * BTW) / 12),
    },
    belasting: {
      ...s.belasting,
      netbeheerPerJaar: r2(t.netbeheerPerDagExcl * 365 * BTW),
      dalVanafUur: set.dalVanafUur ?? s.belasting.dalVanafUur,
    },
  };
}

/** Scenario dat een notaperiode nabootst: vast contract met saldering, tarieven en heffingen van die nota. */
export function notaScenario(s: Scenario, set: JaarnotaSet, n: Jaarnota): Scenario {
  const base = contractFromNotas(s, { ...set, notas: [n] });
  const t = n.tarieven;
  const vanJaar = Number(n.periode.van.slice(0, 4));
  return {
    ...base,
    regime: 'saldering',
    // EB telt bij saldering alleen op een netto afname; vermindering zoals op de nota
    belasting: { ...base.belasting, energiebelasting: vanJaar >= 2026 ? BELASTING[2026].energiebelasting : 0.12286, vermindering: -r2(t.verminderingPerDagExcl * 365 * BTW) },
    ev: { ...s.ev, aan: false },
    batterij: { ...s.batterij, aan: false },
  };
}

/** Alle verbruiksposten even hard schalen zodat het stroomverbruik van het huishouden `total` wordt. */
function scaleLoad(s: Scenario, total: number, data: YearData): Scenario {
  const v = s.verbruik;
  // Echt stroomverbruik uitrekenen: daarin zitten pelletkachel, airco en boilertype al verwerkt.
  const load = householdLoad(s, data, calendarFor(data.priceYear)).load;
  let current = 0;
  for (let i = 0; i < HOURS; i++) current += load[i];
  const f = Math.max(0.05, total) / Math.max(1, current);
  const r = (x: number) => Math.round((x * f) / 10) * 10;
  return {
    ...s,
    verbruik: { ...v, basisKwh: r(v.basisKwh), flexKwh: r(v.flexKwh), verwarmingKwh: r(v.verwarmingKwh), warmwaterKwh: r(v.warmwaterKwh) },
  };
}

function pvPerKwpYear(data: YearData): number {
  let t = 0;
  for (let i = 0; i < HOURS; i++) t += data.pvPerKwp[i];
  return t;
}

function sumExp(s: Scenario, data: YearData): number {
  const sim = simulate(s, data);
  let t = 0;
  for (let i = 0; i < HOURS; i++) t += sim.exp[i];
  return t;
}

/**
 * Stem zonopbrengst en verbruik af op een jaartotaal.
 * - Met omvormeropbrengst: opwek gelijkzetten, verbruik = afname + opwek - teruglevering.
 * - Zonder: opwek en verbruik samen zoeken zodat het model zowel de afname als de teruglevering raakt.
 *   Die schatting leunt op de aangenomen verbruiksvormen, dus behandel de opwek als indicatie.
 */
/**
 * Jaartotalen exact laten kloppen: opwekfactor zoeken zodat afname én teruglevering kloppen,
 * met het verbruik geschaald naar afname + opwek - teruglevering. De onderlinge verhouding van
 * de verbruiksposten blijft gelijk.
 */
function fitAnnual(plain: Scenario, target: CalibrationTarget, data: YearData, iterations = 22): Scenario {
  const pvAt1 = pvPerKwpYear(data) * kwp(plain);
  const withFactor = (f: number) => {
    const pv = pvAt1 * f;
    return scaleLoad({ ...plain, zon: { ...plain.zon, opbrengstFactor: f } }, target.imp + pv - target.exp, data);
  };
  if (target.pv) return withFactor(Math.round((target.pv / pvAt1) * 1000) / 1000);
  let lo = 0.3;
  let hi = 2.5;
  for (let k = 0; k < iterations; k++) {
    const mid = (lo + hi) / 2;
    if (sumExp(withFactor(mid), data) < target.exp) lo = mid;
    else hi = mid;
  }
  return withFactor(Math.round(((lo + hi) / 2) * 1000) / 1000);
}

/**
 * Met maanddata: de jaartotalen kloppen exact (fitAnnual), en het seizoenspatroon bepaalt welk deel
 * van het verbruik verwarming is. Veel verwarming geeft een hoge winterafname, weinig verwarming een vlak jaar.
 */
function fitMonthly(plain: Scenario, target: CalibrationTarget, data: YearData): Scenario {
  const monthly = target.monthly!;
  const v0 = plain.verbruik;
  const otherTotal = v0.basisKwh + v0.flexKwh + v0.warmwaterKwh;
  const total = otherTotal + v0.verwarmingKwh * (1 - v0.isolatieBesparing);
  const withHeatShare = (h: number): Scenario => {
    const k = ((1 - h) * total) / otherTotal;
    return {
      ...plain,
      verbruik: {
        ...v0,
        verwarmingKwh: (h * total) / (1 - v0.isolatieBesparing),
        basisKwh: v0.basisKwh * k,
        flexKwh: v0.flexKwh * k,
        warmwaterKwh: v0.warmwaterKwh * k,
      },
    };
  };
  const error = (h: number) => {
    const o = run(fitAnnual(withHeatShare(h), target, data, 14), data);
    let e = 0;
    for (let m = 0; m < 12; m++) e += (o.monthly[m].imp - monthly.imp[m]) ** 2 + (o.monthly[m].exp - monthly.exp[m]) ** 2;
    return e;
  };
  const h = golden(error, 0.02, 0.6, 10);
  return fitAnnual(withHeatShare(h), target, data);
}

export function calibrate(s: Scenario, target: CalibrationTarget, data: YearData): Scenario {
  // Afstemmen gebeurt op de situatie van de metingen: geen auto, batterij of airco, wel saldering.
  const plain: Scenario = {
    ...s,
    regime: 'saldering',
    ev: { ...s.ev, aan: false },
    batterij: { ...s.batterij, aan: false },
    verbruik: { ...s.verbruik, aircoAandeel: 0, koelenKwh: 0, boiler: 'huidig', thermostaatDag: THERMOSTAAT_REFERENTIE.dag, thermostaatNacht: THERMOSTAAT_REFERENTIE.nacht },
  };
  if (pvPerKwpYear(data) * kwp(s) <= 0) return scaleLoad(s, target.imp - target.exp, data);
  const fitted = target.monthly ? fitMonthly(plain, target, data) : fitAnnual(plain, target, data);
  const v = s.verbruik;
  return {
    ...s,
    zon: fitted.zon,
    verbruik: { ...fitted.verbruik, thermostaatDag: v.thermostaatDag, thermostaatNacht: v.thermostaatNacht, aircoAandeel: v.aircoAandeel, aircoScop: v.aircoScop, aircoVermogenKw: v.aircoVermogenKw, koelenKwh: v.koelenKwh, boiler: v.boiler },
  };
}

/** Startpunt: basisscenario met je contract van de nota, 2026-belasting, afgestemd op de gekozen nota. */
export function startFromNotas(set: JaarnotaSet, target: CalibrationTarget, data: YearData): Scenario {
  const base = contractFromNotas(clone(BASE_SCENARIO), set);
  const inst = set.installatie;
  const withTax: Scenario = {
    ...base,
    zon: inst ? { ...base.zon, panelen: inst.panelen, wpPerPaneel: inst.wpPerPaneel } : base.zon,
    regime: 'saldering',
    belasting: { ...base.belasting, energiebelasting: BELASTING[2026].energiebelasting, vermindering: BELASTING[2026].vermindering },
  };
  return calibrate(withTax, target, data);
}
