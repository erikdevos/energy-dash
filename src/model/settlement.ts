import type { Jaarnota, LiveReading } from '../lib/api';
import { calendarFor, HOURS } from './calendar';
import { flowSums, salderen, type FlowSums } from './costs';
import type { Outcome, Scenario } from './types';

/**
 * Verwachte afrekening van het lopende contract: van het eind van de laatste jaarnota tot de einddatum
 * (hier 1-1-2027, tegelijk met het einde van de saldering). Gemeten meterstanden tot nu,
 * aangevuld met het model voor de rest van de periode.
 */
export interface Settlement {
  van: string;
  tot: string;
  dagen: number;
  maanden: number;
  /** gemeten sinds de laatste nota (alleen met live meter) */
  gemeten?: FlowSums;
  /** modelverwachting voor de rest van de periode */
  verwacht: FlowSums;
  totaal: FlowSums;
  stroom: number;
  energiebelasting: number;
  vergoeding: number;
  vast: number;
  netbeheer: number;
  vermindering: number;
  kosten: number;
  termijnen: number;
  /** waarvan al gefactureerd volgens de termijnnota's */
  termijnenGefactureerd: number;
  maandenGefactureerd: number;
  /** positief = bijbetalen, negatief = terugkrijgen */
  saldo: number;
}

const DAY = 86_400_000;

/** ISO-datum (YYYY-MM-DD) als lokale middernacht, niet als UTC. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getFullYear(), 0, 1);
  const leap = d.getFullYear() % 4 === 0;
  let n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / DAY);
  if (leap && n >= 59) n -= 1;
  return Math.max(0, Math.min(364, n));
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

const add = (a: FlowSums, b: FlowSums): FlowSums => ({
  impN: a.impN + b.impN,
  impD: a.impD + b.impD,
  expN: a.expN + b.expN,
  expD: a.expD + b.expD,
});

/** Model-uren voor een datumbereik binnen één kalenderjaar (het model kent één jaar). */
function modelRange(s: Scenario, o: Outcome, year: number, from: Date, to: Date): FlowSums {
  const cal = calendarFor(year);
  const startDay = dayOfYear(from);
  const endDay = dayOfYear(new Date(to.getTime() - 1));
  let a = cal.dayStart[startDay];
  if (from.getHours() > 0) a += from.getHours();
  const b = endDay + 1 < cal.dayStart.length ? cal.dayStart[endDay + 1] : HOURS;
  return flowSums(s, o.sim, year, Math.min(a, b), b);
}

export function projectSettlement(
  s: Scenario,
  outcome: Outcome,
  priceYear: number,
  nota: Jaarnota,
  einddatum: string,
  termijnbedrag: number,
  live: LiveReading | null,
  gefactureerd: Array<{ maand: string; bedrag: number }> = [],
  now = new Date(),
): Settlement | null {
  const van = localDate(nota.periode.tot);
  const tot = localDate(einddatum);
  if (!(tot > van)) return null;
  const dagen = Math.round((tot.getTime() - van.getTime()) / DAY);
  const maanden = monthsBetween(van, tot);

  // Gemeten: verschil tussen live meterstand en de eindstand van de nota (DSMR: tarief 1 = dal, 2 = normaal).
  const m = nota.meterstandenEind;
  let gemeten: FlowSums | undefined;
  let vanaf = van;
  if (live && live.mode === 'live' && m && now > van && now < tot) {
    gemeten = {
      impN: live.meter.importT2 - m.leveringNormaal,
      impD: live.meter.importT1 - m.leveringDal,
      expN: live.meter.exportT2 - m.terugleveringNormaal,
      expD: live.meter.exportT1 - m.terugleveringDal,
    };
    vanaf = now;
  }
  const verwacht = modelRange(s, outcome, priceYear, vanaf, tot);
  const totaal = gemeten ? add(gemeten, verwacht) : verwacht;

  const n = salderen(s, totaal);
  const fractie = dagen / 365;
  const vast = s.contract.vasteLeveringskostenPerMaand * 12 * fractie;
  const netbeheer = s.belasting.netbeheerPerJaar * fractie;
  const vermindering = s.belasting.vermindering * fractie;
  const kosten = n.levering + n.energiebelasting - n.vergoeding + vast + netbeheer - vermindering;
  // Gefactureerde termijnen binnen de periode tellen echt; voor de overige maanden het ingestelde bedrag.
  const inPeriode = gefactureerd.filter((t) => {
    const d = localDate(`${t.maand}-01`);
    return d >= van && d < tot;
  });
  const termijnenGefactureerd = inPeriode.reduce((a, t) => a + t.bedrag, 0);
  const termijnen = termijnenGefactureerd + termijnbedrag * Math.max(0, maanden - inPeriode.length);
  return {
    van: nota.periode.tot,
    tot: einddatum,
    dagen,
    maanden,
    gemeten,
    verwacht,
    totaal,
    stroom: n.levering,
    energiebelasting: n.energiebelasting,
    vergoeding: n.vergoeding,
    vast,
    netbeheer,
    vermindering,
    kosten,
    termijnen,
    termijnenGefactureerd,
    maandenGefactureerd: inPeriode.length,
    saldo: kosten - termijnen,
  };
}
