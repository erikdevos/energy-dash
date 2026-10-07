/** Externe jaarreeksen waarop het model draait (8760 uren, UTC-index). */
export interface YearData {
  /** kalenderjaar van de EPEX-prijzen */
  priceYear: number;
  /** EPEX day-ahead, EUR/kWh excl. BTW */
  epex: ArrayLike<number>;
  /** jaar van het weer (zon + temperatuur) */
  weatherYear: number;
  /** kWh per kWp per uur */
  pvPerKwp: ArrayLike<number>;
  tempC: ArrayLike<number>;
}

export type Regime = 'saldering' | 'geenSaldering';
export type ContractType = 'vast' | 'dynamisch';
export type Timing = 'nacht' | 'zon' | 'avond' | 'naGebruik';
export type Boiler = 'huidig' | 'nieuw' | 'warmtepomp';
export type EvStrategy = 'avond' | 'goedkoop' | 'zon';
export type BatteryStrategy = 'eigenVerbruik' | 'dynamisch';

export interface Scenario {
  regime: Regime;
  contract: {
    type: ContractType;
    /** vast/variabel: kale leveringsprijs incl. BTW, excl. energiebelasting */
    tariefNormaal: number;
    tariefDal: number;
    /** vergoeding per teruggeleverde kWh (bij saldering: alleen voor het netto overschot) */
    terugleververgoeding: number;
    /** dynamisch: inkoopvergoeding/opslag per kWh incl. BTW */
    opslag: number;
    /** dynamisch: kosten per teruggeleverde kWh (wordt afgetrokken van de EPEX-prijs) */
    terugleverOpslag: number;
    /** dynamisch: bonus als fractie van de marktprijs op teruglevering bij een positieve prijs (bv. Zonneplan 10%) */
    terugleverBonus: number;
    /** schaal op EPEX-prijzen om duurdere/goedkopere jaren te testen (1 = historisch) */
    prijsSchaal: number;
    vasteLeveringskostenPerMaand: number;
    terugleverkostenAan: boolean;
    /** terugleverkosten per teruggeleverde kWh incl. BTW (Greenchoice rekent per kWh over alle teruglevering) */
    terugleverkostenPerKwh: number;
    /** zonnepanelen afschakelen zodra de terugleverprijs negatief is (alleen dynamisch) */
    afschakelenBijNegatief: boolean;
  };
  belasting: {
    /** energiebelasting per kWh incl. BTW */
    energiebelasting: number;
    /** vermindering energiebelasting per jaar incl. BTW */
    vermindering: number;
    netbeheerPerJaar: number;
    /** wettelijke minimumvergoeding teruglevering na saldering, als fractie van de kale leveringsprijs */
    minVergoedingFractie: number;
    /** start daltarief op werkdagen, lokaal uur (Enexis Brabant/Limburg: 21, elders meestal 23) */
    dalVanafUur: number;
  };
  zon: {
    panelen: number;
    wpPerPaneel: number;
    /** correctie op het PVGIS-model (kalibratie op echte opbrengst) */
    opbrengstFactor: number;
  };
  verbruik: {
    /** huishouden: koken, verlichting, apparaten, ventilatie, sluipverbruik */
    basisKwh: number;
    /** wasmachine, droger, vaatwasser */
    flexKwh: number;
    /** deel van het flexibele verbruik dat je naar zonuren verplaatst (0-1) */
    flexNaarZon: number;
    /** warmtevraag ruimteverwarming per jaar in kWh warmte; met elektrische radiatoren is dat ook de stroom */
    verwarmingKwh: number;
    /** besparing op de warmtevraag door isolatie (0-1) */
    isolatieBesparing: number;
    /** deel van de warmtevraag dat de airco (lucht-lucht warmtepomp) levert (0-1), de rest gaat via de radiatoren */
    aircoAandeel: number;
    /** seizoensrendement van de airco bij verwarmen (SCOP): gemiddelde kWh warmte per kWh stroom */
    aircoScop: number;
    /** maximaal verwarmingsvermogen van de airco (kW); de rest komt van de radiatoren */
    aircoVermogenKw: number;
    /** pelletkachel: neemt bij kou een deel van de warmte over als jullie thuis zijn (kost geen stroom) */
    pellet: { aan: boolean; onderTemp: number; aandeel: number; overdagWerkdagen: boolean; prijsPerKg: number };
    /** thermostaat van de elektrische radiatoren (°C), overdag 7-23 uur en 's nachts */
    thermostaatDag: number;
    thermostaatNacht: number;
    /** stroom voor koelen met de airco per jaar */
    koelenKwh: number;
    /** aanschafprijs airco incl. installatie, voor de terugverdientijd */
    aircoPrijs: number;
    /** stroom van de huidige boiler per jaar, incl. stilstandsverlies */
    warmwaterKwh: number;
    warmwaterTiming: Timing;
    /** huidige (oude) elektrische boiler, een nieuwe elektrische, of een warmtepompboiler */
    boiler: Boiler;
    /** aanschafprijs nieuwe boiler incl. installatie, voor de terugverdientijd */
    boilerPrijs: number;
  };
  ev: {
    aan: boolean;
    kmPerJaar: number;
    kwhPer100km: number;
    laadvermogenKw: number;
    strategie: EvStrategy;
    /** werkdagen per week dat de auto overdag thuis staat (weekend telt altijd mee) */
    thuisWerkdagen: number;
  };
  batterij: {
    aan: boolean;
    capaciteitKwh: number;
    vermogenKw: number;
    /** round-trip rendement (0-1) */
    rendement: number;
    strategie: BatteryStrategy;
    aanschafprijs: number;
  };
}

export interface SimResult {
  load: Float64Array;
  pv: Float64Array;
  /** zonnestroom die direct in huis gebruikt wordt */
  pvDirect: Float64Array;
  batCharge: Float64Array;
  batDischarge: Float64Array;
  /** deel van batterijlading dat van het net komt */
  batGridCharge: Float64Array;
  imp: Float64Array;
  exp: Float64Array;
  soc: Float64Array;
  curtailed: Float64Array;
  /** laadstroom elektrische auto (zit ook in load) */
  evLoad: Float64Array;
  /** prijs die je per kWh afname betaalt (incl. alles) */
  importPrice: Float64Array;
  /** prijs die je per kWh teruglevering krijgt (exclusief saldering-effect) */
  exportPrice: Float64Array;
}

export interface CostLine {
  key: string;
  label: string;
  eur: number;
}

export interface Totals {
  load: number;
  pv: number;
  pvDirect: number;
  batDischarge: number;
  /** zonnestroom die in de batterij is geladen */
  batPvCharge: number;
  imp: number;
  exp: number;
  curtailed: number;
  ev: number;
}

export interface Outcome {
  sim: SimResult;
  totals: Totals;
  costs: CostLine[];
  total: number;
  monthly: MonthRow[];
  /** verbruik per onderdeel per maand (kWh), incl. auto */
  components: Record<'huishouden' | 'boiler' | 'was' | 'verwarming' | 'koelen' | 'auto', number[]>;
  /** warmte uit de pelletkachel per maand (kWh warmte, geen stroom) */
  pelletWarmte: number[];
}

export interface MonthRow {
  month: number;
  load: number;
  pv: number;
  pvDirect: number;
  batDischarge: number;
  imp: number;
  exp: number;
}
