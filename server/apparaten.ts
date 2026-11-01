import { join } from 'node:path';
import { CATEGORIES, SHAPE_KEYS, type Appliance } from '../src/model/appliances.ts';
import { DATA_DIR, readJson, writeJson } from './cache.ts';

/*
 * De apparatenlijst staat in data/apparaten.json (privé, niet in git). Ontbreekt dat bestand, dan geldt het voorbeeld
 * data/apparaten.mock.json. Opslaan controleert elke regel, want de inhoud komt van de browser.
 */

const OWN = join(DATA_DIR, 'apparaten.json');
const MOCK = join(DATA_DIR, 'apparaten.mock.json');

export interface ApparatenResponse {
  bron: 'eigen' | 'voorbeeld';
  apparaten: Appliance[];
}

const str = (v: unknown, max = 400): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

function clean(raw: unknown): Appliance | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const id = str(r.id, 80);
  const naam = str(r.naam, 120);
  const ruimte = str(r.ruimte, 60);
  const watt = num(r.watt, 0, 20000);
  const uren = num(r.urenPerDag, 0, 24);
  if (!id || !/^[\w.-]+$/.test(id) || !naam || !ruimte || watt === null || uren === null) return null;
  if (typeof r.categorie !== 'string' || !(r.categorie in CATEGORIES)) return null;
  if (typeof r.vorm !== 'string' || !(SHAPE_KEYS as readonly string[]).includes(r.vorm)) return null;
  const zeker = r.zeker === 'goed' || r.zeker === 'redelijk' || r.zeker === 'ruw' ? r.zeker : 'ruw';
  const dagen = r.dagen === undefined ? undefined : num(r.dagen, 0, 366);
  if (dagen === null) return null;
  return {
    id,
    naam,
    ruimte,
    categorie: r.categorie as Appliance['categorie'],
    watt,
    urenPerDag: uren,
    vorm: r.vorm as Appliance['vorm'],
    ...(r.winter === true ? { winter: true } : {}),
    ...(r.zomer === true ? { zomer: true } : {}),
    ...(dagen !== undefined ? { dagen } : {}),
    zeker,
    ...(str(r.opmerking, 2000) ? { opmerking: str(r.opmerking, 2000)! } : {}),
  };
}

export async function readApparaten(): Promise<ApparatenResponse> {
  const own = await readJson<{ apparaten?: unknown[] }>(OWN);
  if (own?.apparaten) return { bron: 'eigen', apparaten: own.apparaten.map(clean).filter((a): a is Appliance => a !== null) };
  const mock = await readJson<{ apparaten: Appliance[] }>(MOCK);
  return { bron: 'voorbeeld', apparaten: mock?.apparaten ?? [] };
}

export async function saveApparaten(body: unknown): Promise<ApparatenResponse> {
  const list = (body as { apparaten?: unknown[] } | null)?.apparaten;
  if (!Array.isArray(list) || list.length > 300) throw new Error('ongeldige lijst');
  const apparaten = list.map(clean);
  if (apparaten.some((a) => a === null)) throw new Error('een regel in de lijst is ongeldig');
  await writeJson(OWN, { apparaten }, true);
  return { bron: 'eigen', apparaten: apparaten as Appliance[] };
}
