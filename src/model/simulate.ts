import { calendarFor, HOURS, type Calendar } from './calendar';
import { basisProfile, coolingProfile, flexProfile, heatDemandProfile, heatingElectric, hotWaterProfile, pelletProfile } from './profiles';
import type { Scenario, SimResult, YearData } from './types';

const BTW = 1.21;
/** laadverlies tussen stopcontact en accu van de auto */
const EV_LAADRENDEMENT = 0.9;
/** minimale winst per kWh (na rendementsverlies) om van het net te laden */
const MIN_SPREAD = 0.02;

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
      const bonus = epex > 0 ? 1 + (c.terugleverBonus ?? 0) : 1;
      exportPrice[i] = epex * bonus * (s.regime === 'saldering' ? BTW : 1) - c.terugleverOpslag;
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

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
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
  const demand = heatDemandProfile(cal, data.tempC, v.verwarmingKwh * (1 - v.isolatieBesparing), { dag: v.thermostaatDag, nacht: v.thermostaatNacht });
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

  const bat = s.batterij;
  const cap = bat.aan ? bat.capaciteitKwh : 0;
  const pmax = bat.aan ? bat.vermogenKw : 0;
  const eff1 = Math.sqrt(Math.max(0.5, bat.rendement));
  let socNow = cap * 0.2;

  // Dagelijkse prijsdrempels voor de prijsgestuurde batterijstrategie.
  let dayLow = 0;
  let dayHigh = 0;
  let currentDay = -1;

  const curtail = s.contract.type === 'dynamisch' && s.contract.afschakelenBijNegatief;

  for (let i = 0; i < HOURS; i++) {
    const d = cal.day[i];
    const h = cal.hour[i];
    if (d !== currentDay) {
      currentDay = d;
      evChargedToday = 0;
      const start = cal.dayStart[d];
      const end = d + 1 < cal.dayStart.length ? cal.dayStart[d + 1] : HOURS;
      const prices = Array.from(importPrice.subarray(start, end)).sort((a, b) => a - b);
      dayLow = quantile(prices, 0.25);
      dayHigh = prices[prices.length - 1];
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

    const direct = Math.min(solar, demand);
    let surplus = solar - direct;
    const deficit = demand - direct;

    let charge = 0;
    let gridCharge = 0;
    let discharge = 0;
    if (cap > 0) {
      charge = Math.min(surplus, pmax, (cap - socNow) / eff1);
      surplus -= charge;
      if (bat.strategie === 'dynamisch') {
        const p = importPrice[i];
        // alleen "goedkoop" als er vandaag nog een duidelijk duurder uur komt (niet bij vlakke tarieven)
        const cheap = p <= dayLow && dayHigh - p > MIN_SPREAD;
        const room = Math.min(pmax - charge, (cap - socNow) / eff1 - charge);
        if (cheap && room > 0 && dayHigh * bat.rendement - p > MIN_SPREAD) {
          // Laad van het net tot er genoeg in zit om de duurdere uren te overbruggen
          // tot de zon het huis weer zelf voedt (perfecte voorspelling, dus optimistisch).
          let need = 0;
          for (let j = i + 1; j < Math.min(HOURS, i + 24); j++) {
            const net = baseLoad[j] - solarArr[j];
            if (net <= 0) break;
            if (importPrice[j] * bat.rendement - p > MIN_SPREAD) need += net;
          }
          const target = Math.min(cap, need / eff1);
          gridCharge = Math.min(room, Math.max(0, target - socNow) / eff1);
        }
        // In de goedkoopste uren bewaren we de lading voor later.
        if (!cheap) discharge = Math.min(deficit, pmax, socNow * eff1);
      } else {
        discharge = Math.min(deficit, pmax, socNow * eff1);
      }
      socNow += (charge + gridCharge) * eff1 - discharge / eff1;
    }

    // Onder saldering levert teruggeleverde stroom ook verrekende energiebelasting op,
    // dus pas afschakelen als de uurprijs dieper negatief is dan die belasting.
    const exportValue = exportPrice[i] + (s.regime === 'saldering' ? s.belasting.energiebelasting : 0);
    let exported = surplus;
    if (curtail && exportValue < 0) {
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
