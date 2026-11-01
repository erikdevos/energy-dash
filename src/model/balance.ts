import { yearlyKwh, type Appliance } from './appliances';

/*
 * Dagbalans: uit de meter volgt het totale verbruik van een dag (afname min teruglevering plus wat de panelen opwekten),
 * en daarvan halen we af wat we kennen: de Adax-radiatoren (gemeten), de apparaten (schatting) en de boiler (model).
 * Wat overblijft is onverklaard: dat zijn verwarming buiten Adax, de pelletkachel, afwijkingen in schattingen en meetfouten.
 */

export interface DayInput {
  /** lokale datum jjjj-mm-dd */
  datum: string;
  /** kWh van het net en teruggeleverd, volgens de meter */
  imp: number;
  exp: number;
  /** zonnestraling die dag (kWh/m²) */
  rad: number;
  /** gemeten verbruik van de Adax-radiatoren (kWh), null als niet gemeten */
  adax: number | null;
}

export interface DayBalance {
  datum: string;
  /** totaal verbruik van het huis (kWh) */
  load: number;
  pv: number;
  adax: number | null;
  apparaten: number;
  boiler: number;
  /** wat overblijft; negatief = meer verklaard dan er verbruikt is */
  rest: number;
}

const WINTER = new Set([10, 11, 0, 1, 2]);
const SUMMER = new Set([5, 6, 7, 8]);

/** Gemiddeld verbruik van de apparaten op een dag in een bepaalde maand (0 = jan). Winter- en zomerapparaten tellen alleen in hun seizoen mee. */
export function applianceDay(list: Appliance[], month: number): number {
  let kwh = 0;
  for (const a of list) {
    const y = yearlyKwh(a);
    if (a.winter) kwh += WINTER.has(month) ? y / 151 : 0;
    else if (a.zomer) kwh += SUMMER.has(month) ? y / 122 : 0;
    else kwh += y / 365;
  }
  return kwh;
}

export function dayBalance(d: DayInput, apparaten: Appliance[], boilerMonthly: number[], kwp: number, pr: number): DayBalance {
  const month = Number(d.datum.slice(5, 7)) - 1;
  const days = new Date(Number(d.datum.slice(0, 4)), month + 1, 0).getDate();
  const pv = d.rad * kwp * pr;
  const load = d.imp - d.exp + pv;
  const app = applianceDay(apparaten, month);
  const boiler = (boilerMonthly[month] ?? 0) / days;
  return { datum: d.datum, load, pv, adax: d.adax, apparaten: app, boiler, rest: load - (d.adax ?? 0) - app - boiler };
}
