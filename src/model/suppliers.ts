import { run } from './costs';
import { BELASTING } from './defaults';
import type { Outcome, Scenario, YearData } from './types';

/*
 * Leveranciers vergelijken voor 2027 (zonder saldering) op jouw verbruiksprofiel.
 * Vaste contracten: de stroomprijs van nu (incl. EB 2026) min de EB 2026 geeft het kale tarief; daar komt
 * de EB van 2027 bij. Aanname: het kale tarief van een nieuw contract blijft gelijk aan het huidige aanbod.
 */

export interface SupplierContract {
  id: string;
  leverancier: string;
  type: 'vast' | 'dynamisch';
  /** bv. "1 jaar vast" of "dynamisch" */
  naam: string;
  /** vast: stroomprijs per kWh incl. EB 2026 en BTW (enkeltarief) */
  stroomAllIn2026?: number;
  /** vast: terugleververgoeding en -kosten per kWh in 2027 */
  tlv2027?: number;
  tlk2027?: number;
  /** dynamisch: opslag op afname, kosten (+) of bonus (-) per teruggeleverde kWh, bonus als fractie van de marktprijs */
  opslag?: number;
  terugleverOpslag?: number;
  terugleverBonus?: number;
  /** vaste leveringskosten stroom per maand incl. BTW; null = onbekend */
  vasteKostenPerMaand: number | null;
  bron: string;
  opmerking?: string;
}

export interface SupplierData {
  bijgewerkt: string;
  bronnen: Array<{ naam: string; url: string }>;
  /** gebruikt als een leverancier zijn vaste kosten niet publiceert */
  vasteKostenAanname: number;
  contracten: SupplierContract[];
}

export interface SupplierRow {
  contract: SupplierContract;
  outcome: Outcome;
  total: number;
  /** stroom + energiebelasting */
  stroom: number;
  /** vergoeding min kosten teruglevering (negatief = je krijgt geld) */
  teruglevering: number;
  vast: number;
  /** netbeheer en vermindering energiebelasting: voor iedereen gelijk */
  overig: number;
  vasteKostenGeschat: boolean;
}

export function applySupplier(s: Scenario, c: SupplierContract, vasteKostenAanname: number): Scenario {
  const vast = c.vasteKostenPerMaand ?? vasteKostenAanname;
  const belasting = { ...s.belasting, energiebelasting: BELASTING[2027].energiebelasting, vermindering: BELASTING[2027].vermindering };
  if (c.type === 'dynamisch') {
    return {
      ...s,
      regime: 'geenSaldering',
      belasting,
      contract: {
        ...s.contract,
        type: 'dynamisch',
        opslag: c.opslag ?? 0.02,
        terugleverOpslag: c.terugleverOpslag ?? 0,
        terugleverBonus: c.terugleverBonus ?? 0,
        terugleverkostenAan: false,
        vasteLeveringskostenPerMaand: vast,
        afschakelenBijNegatief: true,
      },
    };
  }
  const kaal = (c.stroomAllIn2026 ?? 0) - BELASTING[2026].energiebelasting;
  return {
    ...s,
    regime: 'geenSaldering',
    belasting,
    contract: {
      ...s.contract,
      type: 'vast',
      tariefNormaal: kaal,
      tariefDal: kaal,
      terugleververgoeding: c.tlv2027 ?? 0,
      terugleverkostenAan: (c.tlk2027 ?? 0) > 0,
      terugleverkostenPerKwh: c.tlk2027 ?? 0,
      vasteLeveringskostenPerMaand: vast,
    },
  };
}

export function rankSuppliers(s: Scenario, data: SupplierData, year: YearData): SupplierRow[] {
  const usable = data.contracten.filter((c) =>
    c.type === 'vast' ? c.stroomAllIn2026 !== undefined && c.tlv2027 !== undefined && c.tlk2027 !== undefined : true,
  );
  return usable
    .map((c) => {
      const outcome = run(applySupplier(s, c, data.vasteKostenAanname), year);
      const line = (k: string) => outcome.costs.find((l) => l.key === k)?.eur ?? 0;
      return {
        contract: c,
        outcome,
        total: outcome.total,
        stroom: line('levering') + line('eb'),
        teruglevering: line('terug') + line('terugkosten'),
        vast: line('vast'),
        overig: line('net') + line('verm'),
        vasteKostenGeschat: c.vasteKostenPerMaand === null,
      };
    })
    .sort((a, b) => a.total - b.total);
}
