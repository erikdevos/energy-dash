import { HOURS, type Calendar } from './calendar';
import type { Boiler, Timing } from './types';

/*
 * Synthetische verbruiksprofielen voor een all-electric huishouden.
 * Vormen zijn aannames (geïnspireerd op standaard huishoudprofielen), geen meetdata.
 * Zodra er Chargee-historie is, kunnen deze vormen daarop worden gekalibreerd.
 */

const WEEKDAY = [
  0.55, 0.48, 0.45, 0.44, 0.44, 0.48, 0.7, 0.95, 0.9, 0.8, 0.75, 0.78, 0.85, 0.8, 0.75, 0.78, 0.9, 1.25, 1.55, 1.5,
  1.35, 1.2, 0.98, 0.72,
];
const WEEKEND = [
  0.6, 0.52, 0.47, 0.45, 0.44, 0.45, 0.5, 0.65, 0.9, 1.05, 1.1, 1.1, 1.15, 1.05, 0.95, 0.95, 1.0, 1.3, 1.55, 1.45,
  1.3, 1.2, 1.0, 0.75,
];
/** meer verlichting en binnenleven in de winter */
const SEASON = [1.18, 1.12, 1.03, 0.95, 0.9, 0.86, 0.86, 0.9, 0.95, 1.03, 1.12, 1.18];

const WINDOWS: Record<Exclude<Timing, 'naGebruik'>, [number, number]> = {
  nacht: [1, 4],
  zon: [11, 15],
  avond: [19, 22],
};

function normalize(arr: Float64Array, annualKwh: number): Float64Array {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const f = sum > 0 ? annualKwh / sum : 0;
  for (let i = 0; i < arr.length; i++) arr[i] *= f;
  return arr;
}

const isWeekend = (dow: number) => dow === 0 || dow === 6;
const inWindow = (h: number, [a, b]: [number, number]) => h >= a && h < b;

export function basisProfile(cal: Calendar, annualKwh: number): Float64Array {
  const out = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) {
    const shape = isWeekend(cal.dow[i]) ? WEEKEND : WEEKDAY;
    out[i] = shape[cal.hour[i]] * SEASON[cal.month[i]];
  }
  return normalize(out, annualKwh);
}

/** Wasmachine, droger, vaatwasser: standaard 's avonds (weekend overdag), deels verschuifbaar naar zonuren. */
export function flexProfile(cal: Calendar, annualKwh: number, shareToSun: number): Float64Array {
  const fixed = new Float64Array(HOURS);
  const sun = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) {
    const h = cal.hour[i];
    fixed[i] = isWeekend(cal.dow[i]) ? (inWindow(h, [10, 14]) ? 1 : 0) : inWindow(h, [19, 22]) ? 1 : 0;
    sun[i] = inWindow(h, WINDOWS.zon) ? 1 : 0;
  }
  normalize(fixed, annualKwh * (1 - shareToSun));
  normalize(sun, annualKwh * shareToSun);
  for (let i = 0; i < HOURS; i++) fixed[i] += sun[i];
  return fixed;
}

/*
 * Verwarming. De elektrische radiatoren hebben een thermostaat: overdag (7-23 uur) springen ze aan onder
 * 18 °C, 's nachts staan ze lager (het huis zakt dan naar 12-14 °C). Zon, mensen en apparaten leveren
 * gratis zo'n 3 °C. De woning reageert traag: we rekenen met het gemiddelde van de laatste 6 uur buiten.
 *
 * De warmtevraag is afgestemd op je huidige thermostaatgedrag (REFERENTIE). Zet je de thermostaat anders,
 * dan schaalt de vraag mee met de graaduren: een graad hoger kost dus echt meer.
 */
export const THERMOSTAAT_REFERENTIE = { dag: 18, nacht: 14 };
const FREE_GAINS = 3;

function rawDemand(cal: Calendar, tempC: ArrayLike<number>, dag: number, nacht: number): Float64Array {
  const out = new Float64Array(HOURS);
  let sum = 0;
  const win = 6;
  for (let i = 0; i < HOURS; i++) {
    sum += tempC[i];
    if (i >= win) sum -= tempC[i - win];
    const avg = sum / Math.min(i + 1, win);
    const h = cal.hour[i];
    const setpoint = h >= 7 && h < 23 ? dag : nacht;
    out[i] = Math.max(0, setpoint - FREE_GAINS - avg);
  }
  return out;
}

/**
 * Warmtevraag per uur (kWh warmte). `annualKwh` geldt bij de referentiethermostaat; met een andere
 * thermostaat schaalt het totaal mee met de verhouding van de graaduren.
 */
export function heatDemandProfile(
  cal: Calendar,
  tempC: ArrayLike<number>,
  annualKwh: number,
  thermostaat: { dag: number; nacht: number } = THERMOSTAAT_REFERENTIE,
): Float64Array {
  const ref = rawDemand(cal, tempC, THERMOSTAAT_REFERENTIE.dag, THERMOSTAAT_REFERENTIE.nacht);
  let refSum = 0;
  for (let i = 0; i < HOURS; i++) refSum += ref[i];
  const same = thermostaat.dag === THERMOSTAAT_REFERENTIE.dag && thermostaat.nacht === THERMOSTAAT_REFERENTIE.nacht;
  const out = same ? ref : rawDemand(cal, tempC, thermostaat.dag, thermostaat.nacht);
  const f = refSum > 0 ? annualKwh / refSum : 0;
  for (let i = 0; i < HOURS; i++) out[i] *= f;
  return out;
}

export interface PelletSettings {
  aan: boolean;
  /** brandt op dagen waarop het gemiddeld kouder is dan dit (°C) */
  onderTemp: number;
  /** deel van de warmtevraag dat hij overneemt zolang hij brandt (1 = radiatoren staan uit) */
  aandeel: number;
  /** ook overdag op werkdagen thuis; anders alleen 's ochtends (7-9) en vanaf 16 uur */
  overdagWerkdagen: boolean;
}

/**
 * Pelletkachel: brandt op koude dagen als jullie thuis zijn (weekend 8-22 uur, werkdagen 7-9 en 16-22 uur),
 * nooit 's nachts. Zolang hij brandt, neemt hij (een deel van) de warmtevraag over van de radiatoren.
 */
export function pelletProfile(cal: Calendar, tempC: ArrayLike<number>, demand: Float64Array, pellet: PelletSettings): Float64Array {
  const out = new Float64Array(HOURS);
  if (!pellet.aan) return out;
  // Daggemiddelde temperatuur bepaalt of de kachel die dag aan gaat.
  const days = cal.dayStart.length;
  const mean = new Float64Array(days);
  const count = new Float64Array(days);
  for (let i = 0; i < HOURS; i++) {
    mean[cal.day[i]] += tempC[i];
    count[cal.day[i]] += 1;
  }
  for (let d = 0; d < days; d++) mean[d] /= Math.max(1, count[d]);
  for (let i = 0; i < HOURS; i++) {
    if (mean[cal.day[i]] >= pellet.onderTemp) continue;
    const h = cal.hour[i];
    const weekend = cal.dow[i] === 0 || cal.dow[i] === 6;
    const home = weekend || pellet.overdagWerkdagen ? h >= 8 && h < 22 : (h >= 7 && h < 9) || (h >= 16 && h < 22);
    if (home) out[i] = demand[i] * pellet.aandeel;
  }
  return out;
}

/** Ongeveer 4,8 kWh warmte per kg pellets, kachelrendement ~88% (gangbare waarden, aanname). */
export const PELLET_KWH_PER_KG = 4.8 * 0.88;

/** Relatief rendement van een lucht-lucht warmtepomp: ca. 2,5% lager per graad kouder (vereenvoudigd). */
function copShape(tempC: number): number {
  return Math.min(1.5, Math.max(0.4, 1 + 0.025 * (tempC - 7)));
}

/**
 * Stroom voor verwarming: radiatoren 1 op 1, het airco-deel gedeeld door de COP van dat uur.
 * De COP volgt de buitentemperatuur, geschaald zodat het gemiddelde over het stookseizoen
 * (gewogen naar warmtevraag) gelijk is aan de opgegeven SCOP.
 */
export function heatingElectric(
  demand: Float64Array,
  tempC: ArrayLike<number>,
  aircoShare: number,
  scop: number,
  aircoKw = Infinity,
): Float64Array {
  const out = new Float64Array(HOURS);
  let heat = 0;
  let weighted = 0;
  for (let i = 0; i < HOURS; i++) {
    heat += demand[i];
    weighted += demand[i] / copShape(tempC[i]);
  }
  // scale zodat sum(demand) / sum(demand / cop) = scop
  const scale = heat > 0 ? (scop * weighted) / heat : scop;
  for (let i = 0; i < HOURS; i++) {
    const cop = scale * copShape(tempC[i]);
    // De airco levert zijn deel tot zijn maximale vermogen (kWh per uur = kW); de radiatoren doen de rest.
    const airco = Math.min(aircoShare * demand[i], aircoKw);
    out[i] = demand[i] - airco + (airco > 0 ? airco / cop : 0);
  }
  return out;
}

/** Koelen: alleen als het buiten warmer is dan 24 °C, tussen 10 en 23 uur. */
export function coolingProfile(cal: Calendar, tempC: ArrayLike<number>, annualKwh: number): Float64Array {
  const out = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) {
    const h = cal.hour[i];
    if (h >= 10 && h < 23) out[i] = Math.max(0, tempC[i] - 24);
  }
  return normalize(out, annualKwh);
}

/*
 * Warm water uit een elektrische boiler. Aannames: bij de huidige oude boiler is een kwart van de stroom
 * stilstandsverlies; een nieuwe boiler halveert dat verlies; een warmtepompboiler levert dezelfde warmte
 * met een COP van ca. 2,8.
 */
const STANDBY_SHARE = 0.25;
const NEW_BOILER_STANDBY = 0.5;
const HEATPUMP_BOILER_COP = 2.8;

/** Stroom per jaar voor warm water bij een ander type boiler, uitgaande van het huidige verbruik. */
export function boilerKwh(currentKwh: number, boiler: Boiler): number {
  const use = currentKwh * (1 - STANDBY_SHARE);
  const standby = currentKwh * STANDBY_SHARE;
  if (boiler === 'huidig') return currentKwh;
  if (boiler === 'nieuw') return use + standby * NEW_BOILER_STANDBY;
  return (use + standby * NEW_BOILER_STANDBY) / HEATPUMP_BOILER_COP;
}

/**
 * Warm water per uur. Met een tijdklok (nacht, zon, avond) warmt de boiler alles in dat venster op.
 * Zonder klok ("na gebruik") warmt hij na het douchen 's ochtends en 's avonds op, en vult hij het
 * stilstandsverlies de hele dag door aan. Winter iets meer (kouder leidingwater).
 */
export function hotWaterProfile(cal: Calendar, currentKwh: number, timing: Timing, boiler: Boiler): Float64Array {
  const annual = boilerKwh(currentKwh, boiler);
  const season = (i: number) => 1 + 0.12 * Math.cos((2 * Math.PI * (cal.day[i] - 15)) / 365);
  if (timing !== 'naGebruik') {
    const out = new Float64Array(HOURS);
    const win = WINDOWS[timing];
    for (let i = 0; i < HOURS; i++) if (inWindow(cal.hour[i], win)) out[i] = season(i);
    return normalize(out, annual);
  }
  const standbyKwh = boiler === 'huidig' ? currentKwh * STANDBY_SHARE : currentKwh * STANDBY_SHARE * NEW_BOILER_STANDBY;
  const standbyPart = Math.min(annual, boiler === 'warmtepomp' ? standbyKwh / HEATPUMP_BOILER_COP : standbyKwh);
  const use = new Float64Array(HOURS);
  const standby = new Float64Array(HOURS).fill(1);
  for (let i = 0; i < HOURS; i++) {
    const h = cal.hour[i];
    // 55% na het ochtendgebruik (3 uur), 45% 's avonds (4 uur), per uur gelijk verdeeld
    if (inWindow(h, [7, 10])) use[i] = (0.55 / 3) * season(i);
    else if (inWindow(h, [19, 23])) use[i] = (0.45 / 4) * season(i);
  }
  normalize(use, annual - standbyPart);
  normalize(standby, standbyPart);
  for (let i = 0; i < HOURS; i++) use[i] += standby[i];
  return use;
}

