import type { YearData } from '../model/types';

export interface PriceYear {
  year: number;
  source: string;
  prices: number[];
}

export interface WeatherYear {
  year: number;
  source: string;
  lat: number;
  lon: number;
  orientation: string;
  pvPerKwp: number[];
  tempC: number[];
}

export interface Location {
  lat: number;
  lon: number;
  angle: number;
  orientation: string;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  prices: (year: number) => get<PriceYear>(`/api/prices?year=${year}`),
  weather: (loc: Location, year: number) =>
    get<WeatherYear>(
      `/api/pv?lat=${loc.lat}&lon=${loc.lon}&angle=${loc.angle}&orientation=${encodeURIComponent(loc.orientation)}&year=${year}`,
    ),
  live: () => get<LiveReading>('/api/live'),
  history: (days: number, res: number) => get<HistoryResponse>(`/api/history?days=${days}&res=${res}`),
  jaarnotas: () => get<JaarnotaSet>('/api/jaarnotas'),
  maanden: () => get<MaandData>('/api/maanden'),
  leveranciers: () => get<import('../model/suppliers').SupplierData>('/api/leveranciers'),
  weatherHourly: (from: number) => get<HourlyWeather>(`/api/weather?from=${from}`),
  dagen: () => get<{ dagen: DagMeting[] }>('/api/dagen'),
  aanbiedingen: () => get<{ aanbiedingen: Aanbieding[] }>('/api/aanbiedingen'),
  apparaten: () => get<ApparatenData>('/api/apparaten'),
  saveApparaten: async (apparaten: import('../model/appliances').Appliance[]) => {
    const res = await fetch('/api/apparaten', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apparaten }) });
    if (!res.ok) throw new Error(`apparaten opslaan: ${res.status}`);
    return (await res.json()) as ApparatenData;
  },
  adax: () => get<AdaxData>('/api/adax'),
  pricesToday: () => get<{ prices: Array<{ t: string; price: number }> }>('/api/prices/today'),
};

export function toYearData(p: PriceYear, w: WeatherYear): YearData {
  return {
    priceYear: p.year,
    epex: p.prices,
    weatherYear: w.year,
    pvPerKwp: w.pvPerKwp,
    tempC: w.tempC,
  };
}

/** Genormaliseerde momentopname van de P1-meter via Chargee. */
export interface LiveReading {
  ts: string;
  mode: 'live' | 'mock';
  device?: string;
  /** actueel vermogen in W */
  importW: number;
  exportW: number;
  phases?: Array<{ phase: string; importW: number; exportW: number; voltage?: number; currentA?: number }>;
  /** meterstanden in kWh */
  meter: { importT1: number; importT2: number; exportT1: number; exportT2: number };
  /** vandaag tot nu toe, kWh */
  today: { imp: number; exp: number; since?: string };
  error?: string;
}

export interface HistoryBucket {
  /** begin van het vak, ISO */
  t: string;
  /** kWh */
  imp: number;
  exp: number;
  /** waarvan in daltarief */
  impD: number;
  expD: number;
  /** hoogste vermogen in het vak (W) */
  pImpMax?: number;
  pExpMax?: number;
  /** (deels) geschat omdat de collector even niet draaide */
  gap?: boolean;
}

export interface HistoryResponse {
  mode: 'live' | 'mock';
  /** vakgrootte in minuten */
  res: number;
  buckets: HistoryBucket[];
  /** begin van de opgeslagen meetreeks */
  first?: string;
  records: number;
}

export interface Jaarnota {
  label: string;
  notanummer: string;
  notadatum: string;
  bron?: string;
  periode: { van: string; tot: string };
  /** kWh volgens de meterstanden */
  levering: { normaal: number; dal: number };
  teruglevering: { normaal: number; dal: number };
  nettoTeruglevering: number;
  /** opbrengst zonnepanelen volgens de omvormer, kWh (staat niet op de nota, optioneel zelf invullen) */
  opwekOmvormer?: number;
  tarieven: {
    /** kaal leveringstarief excl. BTW, null als het niet van de nota af te lezen is */
    leveringNormaalExcl: number | null;
    leveringDalExcl: number | null;
    terugleververgoeding: number;
    terugleverkostenPerKwh: number;
    vasteLeveringskostenPerDagExcl: number;
    netbeheerPerDagExcl: number;
    verminderingPerDagExcl: number;
  };
  /** bedragen incl. BTW zoals op de nota */
  bedragen: {
    stroomNaSaldering: number;
    energiebelasting: number;
    terugleverkosten: number;
    vasteLeveringskosten: number;
    netbeheer: number;
    vermindering: number;
    totaal: number;
  };
  prognose?: { afnameKwh: number; terugleveringKwh: number; termijnbedrag: number };
  /** meterstanden aan het eind van de notaperiode (kWh) */
  meterstandenEind?: { leveringNormaal: number; leveringDal: number; terugleveringNormaal: number; terugleveringDal: number };
}

export interface JaarnotaSet {
  mock: boolean;
  leverancier: string;
  product?: string;
  netbeheerder?: string;
  aansluiting?: string;
  /** start daltarief op werkdagen (Enexis Brabant/Limburg: 21, elders meestal 23) */
  dalVanafUur?: number;
  locatie?: { plaats: string; lat: number; lon: number };
  installatie?: {
    hoofdaansluiting?: string;
    dak?: string;
    panelen: number;
    wpPerPaneel: number;
    /** 'zuid' | 'oost-west' */
    orientatie: string;
    hellingshoek: number;
  };
  contract?: {
    type: 'vast' | 'variabel' | 'dynamisch';
    /** eerste dag na het contract, ISO-datum */
    einddatum?: string;
    /** maandelijks termijnbedrag incl. BTW */
    termijnbedrag?: number;
  };
  opmerkingen?: string[];
  /** oud naar nieuw */
  notas: Jaarnota[];
  /** gefactureerde termijnbedragen per maand (incl. BTW) */
  termijnen?: Array<{ maand: string; bedrag: number; notanummer?: string }>;
}

/** Gemeten afname en teruglevering per maand (Mijn Greenchoice). */
export interface MaandData {
  bron?: string;
  maanden: Array<{ maand: string; afname: number; teruglevering: number; deel?: boolean }>;
}

/** Verbruik per Adax-radiator (ruimte), per dag in Wh. */
export interface AdaxData {
  configured: boolean;
  lastSync: string | null;
  error: string | null;
  rooms: Array<{ id: string; naam: string; uren: Array<[number, number]> }>;
  /** verbruik per klokuur (begin van het uur in ms, Wh) per ruimte, vanaf het moment dat dit wordt bijgehouden; het lopende uur is nog niet compleet */
  uur: Array<{ id: string; naam: string; punten: Array<[number, number]> }>;
}

/** Uurweer: temperatuur (°C) en zonnestraling (W/m²). */
export interface HourlyWeather {
  t: number[];
  tempC: number[];
  rad: number[];
}

/** De apparatenlijst: eigen bestand (data/apparaten.json) of het voorbeeld. */
export interface ApparatenData {
  bron: 'eigen' | 'voorbeeld';
  apparaten: import('../model/appliances').Appliance[];
}

/** Verbruik per dag volgens Greenchoice (kWh, afgerond op hele kWh). */
export interface DagMeting {
  datum: string;
  afnameNormaal: number;
  afnameDal: number;
  terugNormaal: number;
  terugDal: number;
}

/** Een persoonlijk aanbod van een leverancier, met de prijsopbouw zoals die erin staat (€ per jaar). */
export interface Aanbieding {
  id: string;
  leverancier: string;
  /** id van het contract in leveranciers.json waarmee we vergelijken */
  contractId: string;
  datum: string;
  bron: string;
  afnameKwh: number;
  terugKwh: number;
  regels: Record<'verbruik' | 'energiebelasting' | 'inkoopvergoeding' | 'vasteKosten' | 'netbeheer' | 'verminderingEB' | 'terugleververgoeding' | 'ebTeruggave' | 'zonnebonus', number>;
  jaarkosten: number;
  perMaand: number;
  perMaandSlim?: number;
  voorwaarden: string[];
  opmerking?: string;
}
