import { calendarFor, HOURS, type Calendar } from './calendar';
import { basisProfile, coolingProfile, flexProfile, heatDemandProfile, heatingElectric, hotWaterProfile, pelletProfile } from './profiles';
import type { Scenario, SimResult, YearData } from './types';

const BTW = 1.21;
/** laadverlies tussen stopcontact en accu van de auto */
const EV_LAADRENDEMENT = 0.9;

/** Dal: werkdagen vanaf 21 of 23 uur tot 07 uur en het hele weekend (verschilt per netbeheerder). */
export function isDal(cal: Calendar, i: number, dalVanafUur: number): boolean {
  const dow = cal.dow[i];
  const h = cal.hour[i];
  return dow === 0 || dow === 6 || h >= dalVanafUur || h < 7;
}

export function evAnnualKwh(s: Scenario): number {
  return s.ev.aan ? (s.ev.kmPerJaar * s.ev.kwhPer100km) / 100 / EV_LAADRENDEMENT : 0;
}

export function kwp(s: Scenario): number {
  return (s.zon.panelen * s.zon.wpPerPaneel) / 1000;
}

/** Prijs per kWh afname en teruglevering, per uur, zonder het effect van saldering. */
export function hourlyPrices(s: Scenario, data: YearData, cal: Calendar) {
  const c = s.contract;
  const eb = s.belasting.energiebelasting;
  const importPrice = new Float64Array(HOURS);
  const exportPrice = new Float64Array(HOURS);
  const fixedFeedIn = effectiveFixedFeedIn(s);
  for (let i = 0; i < HOURS; i++) {
    if (c.type === 'dynamisch') {
      const epex = data.epex[i] * c.prijsSchaal;
      importPrice[i] = epex * BTW + c.opslag + eb;
      // Teruglevering: marktprijs min een eventuele opslag; een bonus (Zonneplan: 10%) telt over dat bedrag zolang het positief is.
      const base = epex * (s.regime === 'saldering' ? BTW : 1) - c.terugleverOpslag;
      exportPrice[i] = base > 0 ? base * (1 + (c.terugleverBonus ?? 0)) : base;
    } else {
      importPrice[i] = (isDal(cal, i, s.belasting.dalVanafUur) ? c.tariefDal : c.tariefNormaal) + eb;
      exportPrice[i] = fixedFeedIn;
    }
  }
  return { importPrice, exportPrice };
}

/**
 * Vergoeding per teruggeleverde kWh bij een vast contract. Na saldering geldt de
 * wettelijke ondergrens als fractie van het kale leveringstarief (excl. BTW).
 */
export function effectiveFixedFeedIn(s: Scenario): number {
  const c = s.contract;
  if (s.regime === 'saldering') return c.terugleververgoeding;
  const kaalExcl = c.tariefNormaal / BTW;
  return Math.max(c.terugleververgoeding, s.belasting.minVergoedingFractie * kaalExcl);
}

/**
 * Plan voor de prijsgestuurde batterij: dynamisch programmeren over het hele jaar.
 * Per uur kiest het plan hoeveel de lading verandert (in stappen van de capaciteit), met als doel de laagste netto kosten:
 * afname tegen de uurprijs, teruglevering tegen de waarde van dat uur. Laden gaat eerst uit zonne-overschot, de rest van het net.
 * Ontladen kan alleen tot de vraag van dat uur. Het rendement zit in de stappen verwerkt, dus een cyclus loont pas als het
 * prijsverschil de verliezen overstijgt. Aanname: alle prijzen en de opbrengst van de zon zijn vooraf bekend (optimistisch).
 */
function planBattery(
  demand: Float64Array,
  solar: Float64Array,
  importPrice: Float64Array,
  exportValue: Float64Array,
  cap: number,
  pmax: number,
  eff1: number,
): { charge: Float64Array; discharge: Float64Array; startSoc: number } {
  const K = Math.min(96, Math.max(24, Math.round(cap / 0.06)));
  const step = cap / K;
  const up = Math.floor((pmax * eff1) / step + 1e-9);
  const down = Math.floor(pmax / (eff1 * step) + 1e-9);
  const width = K + 1;
  const next = new Int16Array(HOURS * width);
  let V = new Float64Array(width);
  let W = new Float64Array(width);
  for (let i = HOURS - 1; i >= 0; i--) {
    const D = Math.max(demand[i] - solar[i], 0);
    const S = Math.max(solar[i] - demand[i], 0);
    const ip = importPrice[i];
    const xv = exportValue[i];
    const stay = ip * D - xv * S;
    for (let k = 0; k <= K; k++) {
      let best = V[k] + stay;
      let bestN = k;
      // De kosten zijn convex in de nieuwe lading: vanaf de huidige stand zoeken we in beide richtingen tot het niet meer beter wordt.
      for (let nk = k + 1; nk <= Math.min(K, k + up); nk++) {
        const c = ((nk - k) * step) / eff1;
        const fromPv = Math.min(S, c);
        const cost = ip * (D + c - fromPv) - xv * (S - fromPv) + V[nk];
        if (cost < best - 1e-9) {
          best = cost;
          bestN = nk;
        } else break;
      }
      if (bestN === k) {
        for (let nk = k - 1; nk >= Math.max(0, k - down); nk--) {
          const d = (k - nk) * step * eff1;
          if (d > D + 1e-9) break;
          const cost = ip * (D - d) - xv * S + V[nk];
          if (cost < best - 1e-9) {
            best = cost;
            bestN = nk;
          } else break;
        }
      }
      W[k] = best;
      next[i * width + k] = bestN;
    }
    const swap = V;
    V = W;
    W = swap;
  }
  const charge = new Float64Array(HOURS);
  const discharge = new Float64Array(HOURS);
  let k = Math.round(0.2 * K);
  const startSoc = k * step;
  for (let i = 0; i < HOURS; i++) {
    const nk = next[i * width + k];
    if (nk > k) charge[i] = ((nk - k) * step) / eff1;
    else if (nk < k) discharge[i] = (k - nk) * step * eff1;
    k = nk;
  }
  return { charge, discharge, startSoc };
}
/**
 * Vast huishoudverbruik per uur (zonder auto en batterij), ook per onderdeel. Gecachet op de laatste
 * invoer, omdat de contractvergelijking hetzelfde huishouden vaak achter elkaar doorrekent.
 */
export type ComponentKey = 'huishouden' | 'boiler' | 'was' | 'verwarming' | 'koelen';

export interface HouseholdLoad {
  load: Float64Array;
  components: Record<ComponentKey, Float64Array>;
  /** warmte uit de pelletkachel (kWh warmte, geen stroom) */
  pelletHeat: Float64Array;
}

let loadCache: { key: string; data: YearData; value: HouseholdLoad } | null = null;

export function householdLoad(s: Scenario, data: YearData, cal: Calendar): HouseholdLoad {
  const v = s.verbruik;
  const key = JSON.stringify(v);
  if (loadCache && loadCache.key === key && loadCache.data === data) return loadCache.value;
  // Warmtevraag van het huis; wat de pelletkachel levert hoeft niet elektrisch.
  const demand = heatDemandProfile(cal, data.tempC, v.verwarmingKwh * (1 - v.isolatieBesparing), { dag: v.thermostaatDag, nacht: v.thermostaatNacht }, data.pvPerKwp);
  const pelletHeat = pelletProfile(cal, data.tempC, demand, v.pellet);
  const electricDemand = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) electricDemand[i] = demand[i] - pelletHeat[i];
  const components: Record<ComponentKey, Float64Array> = {
    huishouden: basisProfile(cal, v.basisKwh),
    was: flexProfile(cal, v.flexKwh, v.flexNaarZon),
    verwarming: heatingElectric(electricDemand, data.tempC, v.aircoAandeel, v.aircoScop, v.aircoVermogenKw),
    koelen: coolingProfile(cal, data.tempC, v.koelenKwh),
    boiler: hotWaterProfile(cal, v.warmwaterKwh, v.warmwaterTiming, v.boiler),
  };
  const load = new Float64Array(HOURS);
  for (const arr of Object.values(components)) for (let i = 0; i < HOURS; i++) load[i] += arr[i];
  const value = { load, components, pelletHeat };
  loadCache = { key, data, value };
  return value;
}

export function simulate(s: Scenario, data: YearData): SimResult {
  const cal = calendarFor(data.priceYear);

  const baseLoad = householdLoad(s, data, cal).load;
  const peak = kwp(s) * s.zon.opbrengstFactor;
  const { importPrice, exportPrice } = hourlyPrices(s, data, cal);
  const solarArr = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) solarArr[i] = data.pvPerKwp[i] * peak;

  const load = new Float64Array(HOURS);
  const pv = new Float64Array(HOURS);
  const pvDirect = new Float64Array(HOURS);
  const batCharge = new Float64Array(HOURS);
  const batDischarge = new Float64Array(HOURS);
  const batGridCharge = new Float64Array(HOURS);
  const imp = new Float64Array(HOURS);
  const exp = new Float64Array(HOURS);
  const soc = new Float64Array(HOURS);
  const curtailed = new Float64Array(HOURS);
  const evPlanned = new Float64Array(HOURS);
  const evLoad = new Float64Array(HOURS);

  const ev = s.ev;
  const evDaily = evAnnualKwh(s) / 365;
  let evChargedToday = 0;

  // Eerst de vraag per uur (huishouden plus auto): die hangt niet af van de batterij.
  const demandArr = new Float64Array(HOURS);
  let currentDay = -1;
  for (let i = 0; i < HOURS; i++) {
    const d = cal.day[i];
    const h = cal.hour[i];
    if (d !== currentDay) {
      currentDay = d;
      evChargedToday = 0;
    }

    // EV: om 18:00 de resterende dagbehoefte inplannen.
    if (ev.aan && h === 18 && evDaily > evChargedToday) {
      let need = evDaily - evChargedToday;
      if (ev.strategie === 'avond') {
        for (let j = i; j < HOURS && need > 1e-9; j++) {
          const e = Math.min(ev.laadvermogenKw, need);
          evPlanned[j] += e;
          need -= e;
        }
      } else {
        // goedkoopste uren tussen 18:00 en 07:00
        const window: number[] = [];
        for (let j = i; j < Math.min(HOURS, i + 13); j++) window.push(j);
        window.sort((a, b) => importPrice[a] - importPrice[b] || b - a);
        for (const j of window) {
          if (need <= 1e-9) break;
          const e = Math.min(ev.laadvermogenKw, need);
          evPlanned[j] += e;
          need -= e;
        }
      }
      evChargedToday = evDaily;
    }

    const solar = solarArr[i];
    let demand = baseLoad[i] + evPlanned[i];

    // EV op zonne-overschot als de auto overdag thuis staat.
    const dow = cal.dow[i];
    const autoThuis = dow === 0 || dow === 6 || (dow >= 1 && dow <= ev.thuisWerkdagen);
    if (ev.aan && ev.strategie === 'zon' && autoThuis && h >= 9 && h < 17 && evChargedToday < evDaily) {
      const surplus = solar - demand;
      if (surplus > 0) {
        const e = Math.min(surplus, ev.laadvermogenKw, evDaily - evChargedToday);
        evChargedToday += e;
        demand += e;
        evLoad[i] += e;
      }
    }
    evLoad[i] += evPlanned[i];
    demandArr[i] = demand;
  }

  const bat = s.batterij;
  const cap = bat.aan ? bat.capaciteitKwh : 0;
  const pmax = bat.aan ? bat.vermogenKw : 0;
  const eff1 = Math.sqrt(Math.max(0.5, bat.rendement));
  const curtail = s.contract.type === 'dynamisch' && s.contract.afschakelenBijNegatief;
  const feedIn = s.contract.terugleverkostenAan ? s.contract.terugleverkostenPerKwh : 0;
  const saldering = s.regime === 'saldering';

  // Waarde van een teruggeleverde kWh, zoals de uurlus hieronder hem behandelt.
  const exportValue = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) {
    const v = exportPrice[i] + (saldering ? s.belasting.energiebelasting : 0);
    exportValue[i] = curtail && v < 0 ? 0 : v - feedIn;
  }

  // Prijsgestuurde strategie: vooraf een plan voor het hele jaar (perfecte voorspelling, dus optimistisch).
  const plan = cap > 0 && pmax > 0 && bat.strategie === 'dynamisch' ? planBattery(demandArr, solarArr, importPrice, exportValue, cap, pmax, eff1) : null;
  let socNow = plan ? plan.startSoc : cap * 0.2;

  for (let i = 0; i < HOURS; i++) {
    const solar = solarArr[i];
    const demand = demandArr[i];

    const direct = Math.min(solar, demand);
    let surplus = solar - direct;
    const deficit = demand - direct;

    let charge = 0;
    let gridCharge = 0;
    let discharge = 0;
    if (cap > 0) {
      if (plan) {
        const total = Math.min(plan.charge[i], (cap - socNow) / eff1);
        charge = Math.min(surplus, total);
        gridCharge = total - charge;
        surplus -= charge;
        discharge = Math.min(plan.discharge[i], deficit, socNow * eff1);
      } else {
        // Eigen verbruik: laden uit overschot, ontladen zodra er een tekort is.
        charge = Math.min(surplus, pmax, (cap - socNow) / eff1);
        surplus -= charge;
        discharge = Math.min(deficit, pmax, socNow * eff1);
      }
      socNow += (charge + gridCharge) * eff1 - discharge / eff1;
    }

    // Onder saldering levert teruggeleverde stroom ook verrekende energiebelasting op,
    // dus pas afschakelen als de uurprijs dieper negatief is dan die belasting.
    const exportNow = exportPrice[i] + (saldering ? s.belasting.energiebelasting : 0);
    let exported = surplus;
    if (curtail && exportNow < 0) {
      curtailed[i] = exported;
      exported = 0;
    }

    load[i] = demand;
    pv[i] = solar;
    pvDirect[i] = direct;
    batCharge[i] = charge + gridCharge;
    batGridCharge[i] = gridCharge;
    batDischarge[i] = discharge;
    imp[i] = deficit - discharge + gridCharge;
    exp[i] = exported;
    soc[i] = socNow;
  }

  return {
    load,
    pv,
    pvDirect,
    batCharge,
    batDischarge,
    batGridCharge,
    imp,
    exp,
    soc,
    curtailed,
    evLoad,
    importPrice,
    exportPrice,
  };
}
