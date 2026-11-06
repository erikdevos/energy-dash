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
// De energy_log geeft in de praktijk alleen dagtotalen (04:00 tot 04:00), ondanks wat de documentatie zegt.
// Per uur zit er wel in /content?withEnergy=1: het verbruik van het huidige klokuur tot nu toe per radiator (energyWh bij energyTime).
// De waarde loopt dus op binnen het uur en begint op het hele uur opnieuw bij ongeveer 0. Wij vragen hem elk kwartier op en nemen per uur
// de hoogste waarde: dat mist alleen de laatste minuten van elk uur.
const HOURLY = join(DATA_DIR, 'adax', 'uur.json');
const HOURLY_MS = 15 * 60_000;

interface StoredHourly {
  /** per radiator (apparaat-id); optellen per ruimte gebeurt bij het lezen */
  devices: Record<string, { roomId: string; naam: string; uren: Record<string, number> }>;
}

interface Stored {
  rooms: Record<string, { naam: string; uren: Record<string, number> }>;
  lastSync: string | null;
}

export interface AdaxResponse {
  configured: boolean;
  lastSync: string | null;
  error: string | null;
  rooms: Array<{ id: string; naam: string; uren: Array<[number, number]> }>;
  /** verbruik per klokuur (begin van het uur in ms, Wh) per ruimte, vanaf de eerste keer dat we dit bijhouden; het lopende uur is nog niet compleet */
  uur: Array<{ id: string; naam: string; punten: Array<[number, number]> }>;
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

let hourlyBusy = false;

async function sampleHourly(): Promise<void> {
  if (hourlyBusy) return;
  hourlyBusy = true;
  try {
    const content = await call<{ rooms?: Room[]; devices?: Array<{ id: string | number; roomId: string | number; energyTime?: number; energyWh?: number }> }>(
      '/rest/v1/content/?withEnergy=1',
    );
    const rooms = parseRooms(content);
    const stored = (await readJson<StoredHourly>(HOURLY)) ?? { devices: {} };
    let changed = false;
    for (const d of content.devices ?? []) {
      if (typeof d.energyTime !== 'number' || typeof d.energyWh !== 'number') continue;
      const roomId = String(d.roomId);
      const naam = rooms.find((r) => String(r.id) === roomId)?.name ?? `Ruimte ${roomId}`;
      const entry = (stored.devices[String(d.id)] ??= { roomId, naam, uren: {} });
      entry.roomId = roomId;
      entry.naam = naam;
      const key = String(toMs(d.energyTime));
      if (entry.uren[key] !== d.energyWh) {
        entry.uren[key] = d.energyWh;
        changed = true;
      }
    }
    if (changed) await writeJson(HOURLY, stored);
  } catch (e) {
    console.error(`Adax uurverbruik: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    hourlyBusy = false;
  }
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

/** Per ruimte en klokuur: de hoogste waarde van de radiatoren in dat uur, opgeteld (begin van het uur in ms, Wh). */
function hourlyByRoom(h: StoredHourly | null): AdaxResponse['uur'] {
  const byRoom = new Map<string, { naam: string; punten: Map<number, number> }>();
  for (const d of Object.values(h?.devices ?? {})) {
    const room = byRoom.get(d.roomId) ?? { naam: d.naam, punten: new Map<number, number>() };
    // eerst per uur de hoogste waarde van dit apparaat (de waarde loopt op binnen het uur), dan optellen over de apparaten van de ruimte
    const perHour = new Map<number, number>();
    for (const [t, wh] of Object.entries(d.uren)) {
      const hour = Math.floor(Number(t) / 3_600_000) * 3_600_000;
      perHour.set(hour, Math.max(perHour.get(hour) ?? 0, wh));
    }
    for (const [hour, wh] of perHour) room.punten.set(hour, (room.punten.get(hour) ?? 0) + wh);
    byRoom.set(d.roomId, room);
  }
  return [...byRoom].map(([id, r]) => ({ id, naam: r.naam, punten: [...r.punten].sort((a, b) => a[0] - b[0]) }));
}

export const adax = {
  configured,
  start() {
    if (!configured()) return;
    void runSync();
    setInterval(() => void runSync(), SYNC_MS).unref();
    void sampleHourly();
    setInterval(() => void sampleHourly(), HOURLY_MS).unref();
  },
  async read(): Promise<AdaxResponse> {
    const stored = await readJson<Stored>(STORE);
    const hourly = await readJson<StoredHourly>(HOURLY);
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
      uur: hourlyByRoom(hourly),
    };
  },
};
