/*
 * Apparatenprofiel: wat staat er in huis, hoeveel stroom kost het naar schatting en wanneer draait het.
 *
 * De lijst zelf staat niet in de code maar in data/apparaten.json (privé, niet in git). Staat dat bestand er niet, dan
 * toont het dashboard het voorbeeld uit data/apparaten.mock.json. Vermogens en gebruiksduren zijn schattingen op basis
 * van typische waarden en opgave van de bewoners; meet je een apparaat na, dan is dat beter.
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

export const SHAPE_KEYS = ['constant', 'avond', 'koken', 'wasdag', 'ochtendavond', 'dag', 'middag', 'nacht'] as const;

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
