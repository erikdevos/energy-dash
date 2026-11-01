/*
 * Apparatenprofiel: wat staat er in huis, hoeveel stroom kost het naar schatting en wanneer draait het.
 *
 * Alle vermogens en gebruiksduren zijn schattingen op basis van typische waarden en jouw opgave
 * (uren per dag). Ze zijn in het dashboard aan te passen; meet je een apparaat na, dan is dat beter.
 * Verwarming en boiler hebben hun eigen model en tellen hier niet mee in het huishouden.
 */

export type Category = 'koken' | 'koelen' | 'was' | 'media' | 'verlichting' | 'sluip' | 'comfort';

export type Shape = 'constant' | 'avond' | 'koken' | 'wasdag' | 'ochtendavond' | 'dag' | 'middag' | 'nacht';

export interface Appliance {
  id: string;
  naam: string;
  ruimte: string;
  categorie: Category;
  /** gemiddeld vermogen als het aan staat (W) */
  watt: number;
  /** uren per dag dat het aan staat (gemiddeld over de periode dat het gebruikt wordt) */
  urenPerDag: number;
  /** moment van de dag */
  vorm: Shape;
  /** alleen in de koude maanden (nov t/m mrt) */
  winter?: boolean;
  /** alleen op warme dagen in de zomer */
  zomer?: boolean;
  /** aantal dagen per jaar waarop het apparaat draait (default 365) */
  dagen?: number;
  /** hoe zeker is de schatting */
  zeker: 'goed' | 'redelijk' | 'ruw';
  opmerking?: string;
}

export const CATEGORIES: Record<Category, { label: string; color: string }> = {
  koken: { label: 'Koken', color: 'var(--comp-4)' },
  koelen: { label: 'Koelen en vriezen', color: 'var(--comp-5)' },
  was: { label: 'Wassen en vaat', color: 'var(--comp-3)' },
  media: { label: 'Beeld en geluid', color: 'var(--comp-1)' },
  verlichting: { label: 'Verlichting', color: 'var(--comp-2)' },
  sluip: { label: 'Altijd aan', color: 'var(--series-5, #8a8a8a)' },
  comfort: { label: 'Comfort', color: 'var(--series-6, #b58a00)' },
};

export const DEFAULT_APPLIANCES: Appliance[] = [
  // woonkamer
  { id: 'tv', naam: 'TV 55 inch', ruimte: 'Woonkamer', categorie: 'media', watt: 100, urenPerDag: 4, vorm: 'avond', zeker: 'redelijk' },
  { id: 'sonos', naam: 'Sonos Beam en 2 speakers', ruimte: 'Woonkamer', categorie: 'media', watt: 20, urenPerDag: 4, vorm: 'avond', zeker: 'redelijk' },
  { id: 'ps5', naam: 'PlayStation 5', ruimte: 'Woonkamer', categorie: 'media', watt: 200, urenPerDag: 1, vorm: 'avond', zeker: 'redelijk', opmerking: 'Gamen. Rusttand telt mee bij Altijd aan.' },
  { id: 'switch', naam: 'Nintendo Switch 2', ruimte: 'Woonkamer', categorie: 'media', watt: 15, urenPerDag: 1, vorm: 'avond', zeker: 'redelijk' },
  { id: 'lamp-woon', naam: '5 slimme ledlampen', ruimte: 'Woonkamer', categorie: 'verlichting', watt: 30, urenPerDag: 5, vorm: 'avond', zeker: 'redelijk' },
  { id: 'pellet', naam: 'Pelletkachel (ventilator en ontsteking)', ruimte: 'Woonkamer', categorie: 'comfort', watt: 40, urenPerDag: 10, vorm: 'dag', winter: true, zeker: 'ruw', opmerking: 'Alleen de elektronica; de warmte komt uit pellets.' },
  { id: 'mobiele-airco', naam: 'Mobiele airco (woonkamer)', ruimte: 'Woonkamer', categorie: 'comfort', watt: 1000, urenPerDag: 4, dagen: 40, vorm: 'middag', zomer: true, zeker: 'ruw', opmerking: 'Op warme dagen een paar uur, goedkoop en onzuinig model. Wordt straks vervangen door de Daikin. Aantal dagen en uren zijn een gok.' },
  // keuken
  { id: 'inductie', naam: 'Inductiekookplaat', ruimte: 'Keuken', categorie: 'koken', watt: 1200, urenPerDag: 1, vorm: 'koken', zeker: 'redelijk', opmerking: 'Gemiddeld vermogen over de kooktijd; pannen en standen wisselen.' },
  { id: 'afzuiging', naam: 'Afzuigkap met halogeenlamp', ruimte: 'Keuken', categorie: 'koken', watt: 135, urenPerDag: 1, vorm: 'koken', zeker: 'redelijk' },
  { id: 'oven', naam: 'Elektrische oven', ruimte: 'Keuken', categorie: 'koken', watt: 1500, urenPerDag: 0.4, vorm: 'koken', zeker: 'redelijk', opmerking: '15 tot 30 minuten, thermostaat schakelt tussendoor.' },
  { id: 'vaatwasser', naam: 'IKEA Torsboda inbouwvaatwasser', ruimte: 'Keuken', categorie: 'was', watt: 870, urenPerDag: 1.5, vorm: 'wasdag', zeker: 'goed', opmerking: '1,5 keer per dag, half Eco (0,736 kWh per beurt volgens het energielabel, 4:35 uur) en half Kort (1:05 uur, ca. 1,0 kWh, gok), gemiddeld 0,87 kWh per beurt. Standby 0 W; uitgestelde start 4 W.' },
  { id: 'magnetron', naam: 'Magnetron', ruimte: 'Keuken', categorie: 'koken', watt: 1000, urenPerDag: 0.083, vorm: 'koken', zeker: 'goed' },
  { id: 'airfryer', naam: 'Airfryer', ruimte: 'Keuken', categorie: 'koken', watt: 1500, urenPerDag: 0.083, vorm: 'koken', zeker: 'goed' },
  { id: 'led-keuken', naam: 'Inbouwledverlichting (3 delig)', ruimte: 'Keuken', categorie: 'verlichting', watt: 15, urenPerDag: 8, vorm: 'ochtendavond', zeker: 'goed' },
  { id: 'koelkast', naam: 'Hoge koelkast', ruimte: 'Keuken', categorie: 'koelen', watt: 20, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk' },
  // wasruimte
  { id: 'wasmachine', naam: 'Samsung wasmachine WW90T734AWH (Eco 40-60)', ruimte: 'Wasruimte', categorie: 'was', watt: 500, urenPerDag: 2.8, vorm: 'wasdag', zeker: 'redelijk', opmerking: '2 wasbeurten per dag, het hele jaar, 0,7 kWh per beurt. Het zustermodel met hetzelfde wasgedeelte heeft op het label 57 kWh per 100 cycli (0,57 kWh gemiddeld over vol en half geladen); 0,7 is een gok voor goed gevulde ladingen. Het exacte cijfer van dit model heb ik niet gevonden.' },
  { id: 'droger', naam: 'AEG warmtepompdroger TR869B4C', ruimte: 'Wasruimte', categorie: 'was', watt: 825, urenPerDag: 4, vorm: 'wasdag', winter: true, zeker: 'goed', opmerking: 'Volgens de productinformatie 1,65 kWh per volle katoenlading (kastdroog) en 194 kWh per jaar voor een gemiddeld gezin; bron is een webwinkel, controleer met het energielabel. Hier: 2 beurten per dag in de winter (nov t/m mrt), in lente en zomer buiten gedroogd.' },
  { id: 'vriezer', naam: 'Diepvries (1,60 m)', ruimte: 'Wasruimte', categorie: 'koelen', watt: 20, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk' },
  // slaapkamers
  { id: 'lamp-kind1', naam: 'Slimme ledlamp kind 1', ruimte: 'Slaapkamers', categorie: 'verlichting', watt: 6, urenPerDag: 12, vorm: 'avond', zeker: 'goed' },
  { id: 'lamp-kind23', naam: 'Slaaplampje en ledlamp kind 2 en 3', ruimte: 'Slaapkamers', categorie: 'verlichting', watt: 12, urenPerDag: 3, vorm: 'avond', zeker: 'redelijk' },
  // sanitair
  { id: 'vent', naam: 'Ventilatie gastentoilet', ruimte: 'Sanitair', categorie: 'sluip', watt: 5, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk' },
  { id: 'bad-led', naam: 'Badkamer ledstrips (3 m, extra fel)', ruimte: 'Sanitair', categorie: 'verlichting', watt: 30, urenPerDag: 3, vorm: 'ochtendavond', zeker: 'ruw' },
  { id: 'handdoek', naam: 'Elektrische handdoekradiator', ruimte: 'Sanitair', categorie: 'comfort', watt: 400, urenPerDag: 0.25, vorm: 'ochtendavond', zeker: 'redelijk', opmerking: 'Gemiddeld 15 minuten per dag. Vermogen is een gok; bij dit gebruik maakt het weinig uit.' },
  // buiten
  { id: 'buiten-deur', naam: 'Buitenlamp voordeur (bewegingssensor)', ruimte: 'Buiten', categorie: 'verlichting', watt: 10, urenPerDag: 0.3, vorm: 'nacht', zeker: 'goed' },
  { id: 'buiten-garage', naam: 'Buitenlamp garage (vrijwel altijd aan)', ruimte: 'Buiten', categorie: 'verlichting', watt: 10, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk', opmerking: 'Een gevoelige sensor houdt hem aan. Instellen scheelt bijna 90 kWh per jaar.' },
  // altijd aan
  { id: 'wifi', naam: 'Google Wifi mesh (3 access points)', ruimte: 'Overal', categorie: 'sluip', watt: 18, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk', opmerking: 'Ongeveer 6 W per punt, typisch.' },
  { id: 'nas', naam: 'Zyxel NSA325 v2 (NAS)', ruimte: 'Overal', categorie: 'sluip', watt: 15, urenPerDag: 24, vorm: 'constant', zeker: 'ruw', opmerking: 'Gemiddeld over de dag: slaapstand van 0 tot 9 uur (ongeveer 4 W), daarbuiten aan met schijven (ongeveer 22 W). Meten met een stekkermeter geeft zekerheid.' },
  { id: 'nest-max', naam: 'Google Nest Hub Max (keuken)', ruimte: 'Keuken', categorie: 'sluip', watt: 7, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk' },
  { id: 'nest-hubs', naam: '2 Google Nest Hubs (slaapkamers)', ruimte: 'Slaapkamers', categorie: 'sluip', watt: 8, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk', opmerking: 'Kind 1 en ouders, ongeveer 4 W per stuk.' },
  { id: 'dyson', naam: 'Dyson V11 (altijd aan de lader)', ruimte: 'Keuken', categorie: 'sluip', watt: 2, urenPerDag: 24, vorm: 'constant', zeker: 'redelijk', opmerking: 'Bijladen telt hier gemiddeld mee.' },
  { id: 'sluip', naam: 'Overige standby: Sonos, omvormer, Sparky, laders, slimme lampen', ruimte: 'Overal', categorie: 'sluip', watt: 20, urenPerDag: 24, vorm: 'constant', zeker: 'ruw', opmerking: 'Opgeteld overig sluipverbruik. Wifi, NAS, Nest en stofzuiger staan nu apart.' },
];

/** Verdeling over de uren van de dag (som 1). */
const SHAPES: Record<Shape, number[]> = (() => {
  const norm = (a: number[]) => {
    const s = a.reduce((x, y) => x + y, 0);
    return a.map((v) => v / s);
  };
  const w = (pairs: Array<[number, number, number]>) => {
    const a = new Array(24).fill(0);
    for (const [from, to, v] of pairs) for (let h = from; h < to; h++) a[h] += v;
    return norm(a);
  };
  return {
    constant: norm(new Array(24).fill(1)),
    avond: w([[17, 23, 1], [19, 22, 1]]),
    koken: w([[7, 9, 0.3], [12, 13, 0.4], [17, 20, 1.6]]),
    wasdag: w([[8, 12, 0.5], [12, 18, 0.7], [19, 23, 1.4]]),
    ochtendavond: w([[6, 9, 1], [17, 23, 1]]),
    dag: w([[7, 22, 1]]),
    middag: w([[12, 20, 1]]),
    nacht: w([[17, 24, 0.7], [0, 7, 0.3]]),
  };
})();

export const SHAPE_LABELS: Record<Shape, string> = {
  constant: 'de hele dag',
  avond: 'in de avond',
  koken: 'rond de maaltijden',
  wasdag: 'avond, deels overdag',
  ochtendavond: 'ochtend en avond',
  dag: 'overdag',
  middag: 'in de middag en avond',
  nacht: 'avond en nacht',
};

/** kWh per jaar */
export function yearlyKwh(a: Appliance): number {
  const days = a.winter ? 151 : (a.dagen ?? 365);
  return (a.watt * a.urenPerDag * days) / 1000;
}

/** kWh per uur op een gemiddelde dag in de periode dat het apparaat draait */
export function hourlyKwh(a: Appliance): number[] {
  const perDay = (a.watt * a.urenPerDag) / 1000;
  return SHAPES[a.vorm].map((f) => f * perDay);
}

export interface Profile {
  /** kWh per jaar per categorie */
  perCategory: Record<Category, number>;
  /** gemiddelde dag in de koude maanden (kWh per uur, per categorie) */
  winterDay: Record<Category, number[]>;
  zomerDay: Record<Category, number[]>;
  total: number;
}

export function profile(list: Appliance[]): Profile {
  const cats = Object.keys(CATEGORIES) as Category[];
  const zero = () => Object.fromEntries(cats.map((c) => [c, new Array(24).fill(0)])) as Record<Category, number[]>;
  const winterDay = zero();
  const zomerDay = zero();
  const perCategory = Object.fromEntries(cats.map((c) => [c, 0])) as Record<Category, number>;
  let total = 0;
  for (const a of list) {
    const y = yearlyKwh(a);
    perCategory[a.categorie] += y;
    total += y;
    const h = hourlyKwh(a);
    // een gemiddelde dag in de maanden waarin het draait; apparaten met winterstand tellen alleen in de winter mee
    for (let i = 0; i < 24; i++) {
      if (!a.zomer) winterDay[a.categorie][i] += h[i];
      if (!a.winter) zomerDay[a.categorie][i] += h[i];
    }
  }
  return { perCategory, winterDay, zomerDay, total };
}
