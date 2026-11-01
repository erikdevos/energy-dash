import { join } from 'node:path';
import { DATA_DIR, readJson, writeJson } from './cache.ts';

/*
 * Adax Wi-Fi radiatoren via de Remote Client API (cloud).
 * Docs: https://adax.no/?p=43872. Credentials maak je in de Adax-app onder Account, "Remote user client API".
 * De API geeft per ruimte het verbruik per dag (04:00 tot 04:00) van de afgelopen week. We bewaren dat lokaal, zodat
 * de geschiedenis groeit en een paar dagen dat de server uit stond, vanzelf worden bijgevuld.
 */

const BASE = 'https://api-1.adax.no/client-api';
const STORE = join(DATA_DIR, 'adax', 'hourly.json');
const RAW = join(DATA_DIR, 'adax', 'last-content.json');
const SYNC_MS = 6 * 3600_000;

interface Stored {
  rooms: Record<string, { naam: string; uren: Record<string, number> }>;
  lastSync: string | null;
}

export interface AdaxResponse {
  configured: boolean;
  lastSync: string | null;
  error: string | null;
  rooms: Array<{ id: string; naam: string; uren: Array<[number, number]> }>;
}

let token: { access: string; expires: number } | null = null;
let error: string | null = null;
let syncing: Promise<void> | null = null;

const creds = () => ({ id: process.env.ADAX_CLIENT_ID?.trim(), secret: process.env.ADAX_CLIENT_SECRET?.trim() });
const configured = () => Boolean(creds().id && creds().secret);

async function authenticate(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.access;
  const { id, secret } = creds();
  const body = new URLSearchParams({ grant_type: 'password', username: id ?? '', password: secret ?? '' });
  // de documentatie noemt zowel /auth/ als /auth/token; we proberen beide
  let res = await fetch(`${BASE}/auth/token`, { method: 'POST', body });
  if (res.status === 404) res = await fetch(`${BASE}/auth/`, { method: 'POST', body });
  if (!res.ok) throw new Error(`Adax inloggen mislukt (${res.status}). Controleer ADAX_CLIENT_ID en ADAX_CLIENT_SECRET.`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('Adax gaf geen token terug.');
  token = { access: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.access;
}

async function call<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${await authenticate()}` } });
    if (res.status === 401 && attempt === 0) {
      token = null;
      continue;
    }
    if (!res.ok) throw new Error(`Adax ${path}: ${res.status}`);
    return (await res.json()) as T;
  }
  throw new Error(`Adax ${path}: niet toegestaan`);
}

interface Room {
  id: string | number;
  name?: string;
}

/** De vorm van /content is niet in detail gedocumenteerd, dus lees ruimtes defensief. */
function parseRooms(content: unknown): Room[] {
  const c = content as { rooms?: Room[] } | undefined;
  return Array.isArray(c?.rooms) ? c.rooms.filter((r) => r && r.id !== undefined) : [];
}

const toMs = (t: number) => (t < 1e11 ? t * 1000 : t);

async function sync(): Promise<void> {
  const stored = (await readJson<Stored>(STORE)) ?? { rooms: {}, lastSync: null };
  const content = await call<unknown>('/rest/v1/content/?withEnergy=1');
  await writeJson(RAW, content); // alleen voor het controleren van de structuur; staat in .gitignore
  for (const room of parseRooms(content)) {
    const id = String(room.id);
    const log = await call<{ points?: Array<{ fromTime: number; energyWh: number }> }>(`/rest/v1/energy_log/${id}`);
    const entry = (stored.rooms[id] ??= { naam: room.name ?? `Ruimte ${id}`, uren: {} });
    entry.naam = room.name ?? entry.naam;
    for (const p of log.points ?? []) {
      if (typeof p.fromTime === 'number' && typeof p.energyWh === 'number') entry.uren[String(toMs(p.fromTime))] = p.energyWh;
    }
  }
  stored.lastSync = new Date().toISOString();
  await writeJson(STORE, stored);
}

function runSync(): Promise<void> {
  syncing ??= sync()
    .then(() => {
      error = null;
    })
    .catch((e: unknown) => {
      error = e instanceof Error ? e.message : String(e);
      console.error(error);
    })
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

export const adax = {
  configured,
  start() {
    if (!configured()) return;
    void runSync();
    setInterval(() => void runSync(), SYNC_MS).unref();
  },
  async read(): Promise<AdaxResponse> {
    const stored = await readJson<Stored>(STORE);
    return {
      configured: configured(),
      lastSync: stored?.lastSync ?? null,
      error,
      rooms: Object.entries(stored?.rooms ?? {}).map(([id, r]) => ({
        id,
        naam: r.naam,
        uren: Object.entries(r.uren)
          .map(([t, wh]) => [Number(t), wh] as [number, number])
          .sort((a, b) => a[0] - b[0]),
      })),
    };
  },
};
