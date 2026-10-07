import type { Scenario } from './types';

/*
 * Tarieven en regels met bron (stand 7 oktober 2026). Alles incl. 21% BTW tenzij anders vermeld.
 * Waarden met "aanname" of "mock" zijn géén feiten: vervang ze door je eigen gegevens.
 */

export const BELASTING = {
  2026: {
    // Rijksoverheid / ANWB: EB schijf 1 2026 € 0,09161 excl. BTW
    energiebelasting: 0.11085,
    vermindering: 628.96,
    bron: 'Energiebelasting 2026 (rijksoverheid.nl, anwb.nl)',
  },
  2027: {
    // Belastingplan 2027 (Prinsjesdag 2026), nog niet aangenomen door het parlement
    energiebelasting: 0.1065,
    vermindering: 628.69,
    bron: 'Belastingplan 2027, voorstel (rijksfinancien.nl), nog niet definitief',
  },
} as const;

export const NETBEHEER = {
  Liander: 478.04, // liander.nl tarievenblad 2026, 3x25A
  Stedin: 476.76, // via keuze.nl, niet geverifieerd bij Stedin zelf
  Enexis: 475.84, // via keuze.nl, niet geverifieerd bij Enexis zelf
} as const;

export type Netbeheerder = keyof typeof NETBEHEER;

/** Greenchoice 1 jaar vast (keuze.nl, 7-10-2026): € 0,29411 all-in, dus kaal = all-in minus EB 2026. */
const GC_ALLIN_2026 = 0.29411;
const GC_KAAL = Math.round((GC_ALLIN_2026 - BELASTING[2026].energiebelasting) * 1e5) / 1e5;

export const BASE_SCENARIO: Scenario = {
  regime: 'saldering',
  contract: {
    type: 'vast',
    tariefNormaal: GC_KAAL,
    tariefDal: GC_KAAL,
    terugleververgoeding: 0.15, // Greenchoice vast, keuze.nl
    opslag: 0.018, // Tibber inkoopvergoeding incl. BTW
    terugleverOpslag: 0.018, // Tibber verkoopvergoeding
    prijsSchaal: 1,
    vasteLeveringskostenPerMaand: 9.32, // Greenchoice, gaslicht.com
    terugleverkostenAan: true,
    terugleverkostenPerKwh: 0.136, // Greenchoice volgens keuze.nl, niet bevestigd door Greenchoice zelf
    afschakelenBijNegatief: true,
  },
  belasting: {
    energiebelasting: BELASTING[2026].energiebelasting,
    vermindering: BELASTING[2026].vermindering,
    netbeheerPerJaar: NETBEHEER.Liander,
    minVergoedingFractie: 0.5, // Wet beëindiging salderingsregeling, art. 2.34 lid 9, t/m 2029
    dalVanafUur: 23,
  },
  zon: {
    panelen: 20,
    wpPerPaneel: 405,
    opbrengstFactor: 1,
  },
  verbruik: {
    basisKwh: 2800, // aanname: gezin van 5, wordt geschaald op de jaarnota's
    flexKwh: 800, // aanname: wassen/drogen voor 5 personen
    flexNaarZon: 0.2,
    verwarmingKwh: 1800, // aanname: elektrische radiatoren, wordt geschaald op de jaarnota's
    isolatieBesparing: 0,
    aircoAandeel: 0,
    aircoScop: 4.5, // Daikin Perfera FTXM35R: SCOP 5,0 volgens Daikin; in de praktijk iets lager
    aircoVermogenKw: 4.0, // Perfera 3,5 kW (koelen) levert 4,0 kW verwarming
    // Pelletkachel op dagen onder 10 °C als jullie thuis zijn; radiatoren staan dan uit. Prijs is een aanname.
    pellet: { aan: true, onderTemp: 10, aandeel: 1, overdagWerkdagen: false, prijsPerKg: 0.4 },
    thermostaatDag: 18,
    thermostaatNacht: 14,
    koelenKwh: 0,
    aircoPrijs: 3000, // aanname, indicatief incl. installatie
    warmwaterKwh: 2600, // aanname: oude boiler 80 L / 2,5 kW, 5 personen, wordt geschaald op de jaarnota's
    warmwaterTiming: 'naGebruik',
    boiler: 'huidig',
    boilerPrijs: 2500, // aanname, indicatief voor een warmtepompboiler incl. installatie
  },
  ev: {
    aan: false,
    kmPerJaar: 15000,
    kwhPer100km: 17,
    laadvermogenKw: 11,
    strategie: 'goedkoop',
    thuisWerkdagen: 1,
  },
  batterij: {
    aan: false,
    capaciteitKwh: 10,
    vermogenKw: 5,
    rendement: 0.9,
    strategie: 'dynamisch',
    aanschafprijs: 5000, // aanname, indicatief incl. installatie
  },
};

export interface ContractPreset {
  id: string;
  label: string;
  short: string;
  apply: (s: Scenario) => Scenario;
}

function withTax(s: Scenario, year: 2026 | 2027): Scenario['belasting'] {
  return { ...s.belasting, energiebelasting: BELASTING[year].energiebelasting, vermindering: BELASTING[year].vermindering };
}

/** Dynamisch contract: Tibber-tarieven als referentie (tibber.com/nl, september 2026). */
export const DYNAMISCH = { opslag: 0.018, terugleverOpslag: 0.018, vasteLeveringskostenPerMaand: 6.99 };

/**
 * Contract- en regelpakketten. Ze laten je huishouden (zon, verbruik, auto, batterij) ongemoeid.
 * "huidig" is je eigen contract zoals het op de laatste jaarnota staat.
 */
export function makePresets(huidig: Scenario['contract']): ContractPreset[] {
  const eigenVast = {
    type: 'vast' as const,
    tariefNormaal: huidig.tariefNormaal,
    tariefDal: huidig.tariefDal,
    vasteLeveringskostenPerMaand: huidig.vasteLeveringskostenPerMaand,
  };
  const dynamisch = { type: 'dynamisch' as const, ...DYNAMISCH, terugleverkostenAan: false };
  return [
    {
      id: 'nu',
      label: '2026 · huidig vast contract (t/m 31-12) · met saldering',
      short: 'Nu',
      apply: (s) => ({
        ...s,
        regime: 'saldering',
        belasting: withTax(s, 2026),
        contract: {
          ...s.contract,
          ...eigenVast,
          terugleververgoeding: huidig.terugleververgoeding,
          terugleverkostenAan: huidig.terugleverkostenAan,
          terugleverkostenPerKwh: huidig.terugleverkostenPerKwh,
        },
      }),
    },
    {
      id: 'dyn2026',
      label: '2026 · dynamisch · met saldering',
      short: 'Dynamisch nu',
      apply: (s) => ({ ...s, regime: 'saldering', belasting: withTax(s, 2026), contract: { ...s.contract, ...dynamisch } }),
    },
    {
      id: 'vast2027',
      label: '2027 · nieuw vast contract Greenchoice · zonder saldering',
      short: 'Vast 2027',
      apply: (s) => ({
        ...s,
        regime: 'geenSaldering',
        belasting: withTax(s, 2027),
        contract: {
          ...s.contract,
          // Je huidige contract loopt af op 1-1-2027: reken met het actuele aanbod (1 jaar vast, keuze.nl 7-10-2026)
          type: 'vast',
          tariefNormaal: GC_KAAL,
          tariefDal: GC_KAAL,
          vasteLeveringskostenPerMaand: 9.32,
          // Greenchoice rekenvoorbeeld, verwachte waarden 2027 (door Greenchoice zelf als schatting gemarkeerd)
          terugleververgoeding: 0.05434,
          terugleverkostenAan: true,
          terugleverkostenPerKwh: 0.05184,
        },
      }),
    },
    {
      id: 'dyn2027',
      label: '2027 · dynamisch · zonder saldering',
      short: 'Dynamisch 2027',
      apply: (s) => ({ ...s, regime: 'geenSaldering', belasting: withTax(s, 2027), contract: { ...s.contract, ...dynamisch } }),
    },
  ];
}

export const DEFAULT_LOCATION = { lat: 52.09, lon: 5.12, angle: 35, orientation: 'zuid' };
export const DEFAULT_PRICE_YEAR = 2025;
/**
 * Weerjaar voor zon en temperatuur. 2020 en 2022 passen even goed bij de gemeten maanden; 2020 geeft de
 * middelste schatting voor de verwarming (2022 de laagste, 2021 de hoogste).
 */
export const DEFAULT_WEATHER_YEAR = 2020;

export function clone<T>(v: T): T {
  return structuredClone(v);
}
