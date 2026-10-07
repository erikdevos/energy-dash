import { lookup } from 'node:dns/promises';
import { unlinkSync } from 'node:fs';
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './cache.ts';
import { aggregate, P1Store, type Bucket, type Meter } from './p1store.ts';

/*
 * Chargee Sparky Local API v1 (officiële documentatie v1.1, bijlage bij
 * support.chargee.energy/en/articles/14525475):
 *   GET http://<host>/api              -> product_type, serial, firmware_version, api_version
 *   GET http://<host>/api/v1/data      -> laatste P1-meting als JSON (alle velden optioneel), poort 80, geen auth
 *   GET http://<host>/api/v1/telegram  -> laatste ruwe DSMR-telegram (checksum gevalideerd)
 * Vinden: mDNS `dns-sd -B _chargee_p1._tcp .` -> sparky-<serienummer>.local
 * Zet CHARGEE_HOST in .env. Zonder host draait alles op mock-data.
 */

interface SparkyData {
  active_tariff?: number;
  total_power_import_kwh?: number;
  total_power_import_t1_kwh?: number;
  total_power_import_t2_kwh?: number;
  total_power_export_kwh?: number;
  total_power_export_t1_kwh?: number;
  total_power_export_t2_kwh?: number;
  active_power_w?: number;
  active_power_l1_w?: number;
  active_power_l2_w?: number;
  active_power_l3_w?: number;
  active_voltage_l1_v?: number;
  active_voltage_l2_v?: number;
  active_voltage_l3_v?: number;
  active_current_l1_a?: number;
  active_current_l2_a?: number;
  active_current_l3_a?: number;
}

interface Reading {
  ts: string;
  mode: 'live' | 'mock';
  device?: string;
  importW: number;
  exportW: number;
  phases?: Array<{ phase: string; importW: number; exportW: number; voltage?: number; currentA?: number }>;
  meter: Meter;
  /** today.since = begin van de meting vandaag (later dan middernacht als de server pas draait) */
  today: { imp: number; exp: number; since?: string };
  error?: string;
}

const HOST = process.env.CHARGEE_HOST?.trim();
const POLL_MS = Number(process.env.CHARGEE_POLL_SECONDS ?? 10) * 1000;
const STORE_DIR = join(DATA_DIR, HOST ? 'p1' : 'p1-mock');
const LOCK = join(STORE_DIR, '.collector.lock');

// ---------- echte Sparky ----------

/**
 * Vermogens uit het DSMR-telegram. Daar staan afname en teruglevering apart
 * (1.7.0 / 2.7.0, per fase 21/41/61.7.0 en 22/42/62.7.0), dus geen twijfel over het teken.
 */
export function parseTelegramPower(telegram: string) {
  const kw = (obis: string) => {
    const m = telegram.match(new RegExp(`1-0:${obis.replace(/\./g, '\\.')}\\((\\d+\\.\\d+)\\*kW\\)`));
    return m ? Math.round(parseFloat(m[1]) * 1000) : undefined;
  };
  return {
    importW: kw('1.7.0'),
    exportW: kw('2.7.0'),
    phases: [
      { importW: kw('21.7.0'), exportW: kw('22.7.0') },
      { importW: kw('41.7.0'), exportW: kw('42.7.0') },
      { importW: kw('61.7.0'), exportW: kw('62.7.0') },
    ],
  };
}

type TelegramPower = ReturnType<typeof parseTelegramPower>;

/**
 * Zonder telegram valt het terug op active_power_w. De documentatie zegt niet of die negatief wordt
 * bij teruglevering; we nemen dat aan (zoals bij HomeWizard, waar het schema op lijkt).
 */
function toReading(d: SparkyData, device: string, tg?: TelegramPower): Omit<Reading, 'today'> {
  const net = d.active_power_w ?? 0;
  const useTelegram = tg?.importW !== undefined && tg.exportW !== undefined;
  const phase = (n: 1 | 2 | 3) => {
    const w = d[`active_power_l${n}_w`];
    const t = tg?.phases[n - 1];
    const fromTelegram = t?.importW !== undefined && t.exportW !== undefined;
    if (w === undefined && !fromTelegram) return null;
    return {
      phase: `L${n}`,
      importW: fromTelegram ? t!.importW! : Math.max(0, w ?? 0),
      exportW: fromTelegram ? t!.exportW! : Math.max(0, -(w ?? 0)),
      voltage: d[`active_voltage_l${n}_v`],
      currentA: d[`active_current_l${n}_a`],
    };
  };
  const phases = [phase(1), phase(2), phase(3)].filter((p) => p !== null);
  return {
    ts: new Date().toISOString(),
    mode: 'live',
    device,
    importW: useTelegram ? tg!.importW! : Math.max(0, net),
    exportW: useTelegram ? tg!.exportW! : Math.max(0, -net),
    phases: phases.length ? phases : undefined,
    meter: {
      importT1: d.total_power_import_t1_kwh ?? d.total_power_import_kwh ?? 0,
      importT2: d.total_power_import_t2_kwh ?? 0,
      exportT1: d.total_power_export_t1_kwh ?? d.total_power_export_kwh ?? 0,
      exportT2: d.total_power_export_t2_kwh ?? 0,
    },
  };
}

/**
 * mDNS-namen (.local) via IPv4 opzoeken en het adres onthouden: de standaardlookup wacht
 * op macOS eerst seconden op een IPv6-antwoord. Bij een fout wordt opnieuw opgezocht.
 */
let resolved: string | null = null;
async function sparkyAddress(): Promise<string> {
  if (!HOST) throw new Error('geen CHARGEE_HOST');
  if (/^[\d.]+$/.test(HOST)) return HOST;
  resolved ??= (await lookup(HOST, { family: 4 })).address;
  return resolved;
}

async function fetchSparky(): Promise<Omit<Reading, 'today'>> {
  const addr = await sparkyAddress();
  const [data, telegram] = await Promise.all([
    fetch(`http://${addr}/api/v1/data`, { signal: AbortSignal.timeout(4000) }).catch((err: unknown) => {
      resolved = null;
      throw err;
    }),
    fetch(`http://${addr}/api/v1/telegram`, { signal: AbortSignal.timeout(4000) }).catch(() => null),
  ]);
  if (!data.ok) throw new Error(`Sparky antwoordde ${data.status}`);
  const tg = telegram?.ok ? parseTelegramPower(await telegram.text()) : undefined;
  return toReading((await data.json()) as SparkyData, `Chargee Sparky (${HOST})`, tg);
}

// ---------- mock ----------

const MOCK_KWP = 8.2;
const MOCK_START = Date.UTC(2026, 0, 1);
const MOCK_METER: Meter = { importT1: 18250.4, importT2: 21310.9, exportT1: 9120.7, exportT2: 15890.2 };

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Vermogen (W) van opwek en verbruik op een tijdstip, grof gemodelleerd op seizoen en uur. */
function mockPower(t: number): { pv: number; load: number } {
  const d = new Date(t);
  const month = d.getUTCMonth();
  const hourLocal = (d.getUTCHours() + (month > 2 && month < 10 ? 2 : 1) + d.getUTCMinutes() / 60) % 24;
  const peak = [0.22, 0.38, 0.55, 0.72, 0.8, 0.82, 0.8, 0.74, 0.6, 0.42, 0.26, 0.18][month];
  const daylen = [8, 10, 12, 13.5, 15.5, 16.5, 16, 14.5, 12.5, 10.5, 8.5, 7.5][month];
  const rise = 13.5 - daylen / 2;
  const x = (hourLocal - rise) / daylen;
  const dayCloud = 0.35 + 0.65 * noise(Math.floor(t / 86_400_000));
  const flicker = 0.85 + 0.15 * noise(Math.floor(t / 600_000));
  const pv = x > 0 && x < 1 ? MOCK_KWP * 1000 * peak * Math.sin(Math.PI * x) ** 1.3 * dayCloud * flicker : 0;
  const evening = hourLocal >= 17 && hourLocal < 22 ? 900 : 0;
  const morning = hourLocal >= 7 && hourLocal < 9 ? 500 : 0;
  const heat = month < 3 || month > 9 ? 700 * (1 - Math.abs(hourLocal - 6) / 18) : 0;
  const spike = noise(Math.floor(t / 120_000)) > 0.9 ? 2200 : 0;
  const load = 320 + evening + morning + Math.max(0, heat) + spike + 120 * noise(Math.floor(t / 30_000));
  return { pv, load };
}

/** Meterstand op tijdstip t: integreer het mock-profiel vanaf 1 januari in stappen van 5 minuten. */
const meterCache = new Map<number, Meter>();
function mockMeter(t: number): Meter {
  const step = 300_000;
  const slot = Math.floor(t / step) * step;
  let start = MOCK_START;
  let m = { ...MOCK_METER };
  for (const [k, v] of meterCache) {
    if (k <= slot && k > start) {
      start = k;
      m = { ...v };
    }
  }
  for (let s = start; s < slot; s += step) {
    const { pv, load } = mockPower(s);
    const net = (load - pv) / 1000 / 12; // kWh in 5 minuten
    // DSMR: tarief 1 = dal, tarief 2 = normaal
    const dal = isDalMock(s);
    if (net > 0) {
      if (dal) m.importT1 += net;
      else m.importT2 += net;
    } else if (dal) m.exportT1 -= net;
    else m.exportT2 -= net;
  }
  meterCache.set(slot, { ...m });
  return m;
}

function isDalMock(t: number): boolean {
  const month = new Date(t).getUTCMonth();
  const local = new Date(t + (month > 2 && month < 10 ? 2 : 1) * 3_600_000);
  const h = local.getUTCHours();
  const dow = local.getUTCDay();
  return dow === 0 || dow === 6 || h >= 23 || h < 7;
}

function mockReading(): Omit<Reading, 'today'> {
  const now = Date.now();
  const { pv, load } = mockPower(now);
  const net = Math.round(load - pv);
  const split = [0.42, 0.31, 0.27];
  return {
    ts: new Date(now).toISOString(),
    mode: 'mock',
    device: 'Mock Sparky (geen CHARGEE_HOST ingesteld)',
    importW: Math.max(0, net),
    exportW: Math.max(0, -net),
    phases: split.map((f, k) => {
      const w = Math.round(load * f - pv / 3);
      return { phase: `L${k + 1}`, importW: Math.max(0, w), exportW: Math.max(0, -w), voltage: 229 + k, currentA: Math.abs(w) / 230 };
    }),
    meter: mockMeter(now),
  };
}

// ---------- collector ----------

/*
 * Precies één proces verzamelt de meterdata (wie het lock-bestand heeft). Dat is de losse collector
 * (`npm run collect`) of, als die niet draait, de dashboardserver zelf. Een tweede proces leest dan
 * alleen mee: live waarden haalt het direct bij de Sparky, de historie uit de bestanden.
 */
const store = new P1Store(STORE_DIR);
let collecting = false;
let latest: Omit<Reading, 'today'> | null = null;
let latestAt = 0;
let lastError: string | undefined;
let startedAt = Date.now();
let lastReload = 0;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await open(LOCK, 'wx');
      await fh.writeFile(String(process.pid));
      await fh.close();
      const release = () => {
        try {
          unlinkSync(LOCK);
        } catch {
          /* al weg */
        }
      };
      process.on('exit', release);
      for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));
      return true;
    } catch {
      const pid = Number(await readFile(LOCK, 'utf8').catch(() => '0'));
      if (pid && pid !== process.pid && pidAlive(pid)) return false;
      await unlink(LOCK).catch(() => undefined); // verweesd lock van een gestopt proces
    }
  }
  return false;
}

/** Mock: vul de afgelopen 7 dagen per kwartier, zodat er direct iets te zien is. */
async function mockBackfill() {
  const q = 15 * 60_000;
  const end = Math.floor(Date.now() / q) * q;
  const recs = [];
  for (let t = end - 7 * 86_400_000; t < end; t += q) {
    const a = mockMeter(t);
    const b = mockMeter(t + q);
    recs.push({
      t: new Date(t).toISOString(),
      min: 15,
      impN: b.importT2 - a.importT2,
      impD: b.importT1 - a.importT1,
      expN: b.exportT2 - a.exportT2,
      expD: b.exportT1 - a.exportT1,
      m: [b.importT1, b.importT2, b.exportT1, b.exportT2] as [number, number, number, number],
    });
  }
  await store.importRecords(recs);
}

async function poll() {
  try {
    const r = HOST ? await fetchSparky() : mockReading();
    latest = r;
    latestAt = Date.now();
    lastError = undefined;
    if (collecting) await store.add(Date.parse(r.ts), r.meter, r.importW, r.exportW);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

function localMidnight(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Lezend proces: bestanden af en toe opnieuw inlezen, want de collector schrijft ze. */
async function freshStore() {
  if (!collecting && Date.now() - lastReload > 60_000) {
    await store.load();
    lastReload = Date.now();
  }
}

function today(): Reading['today'] {
  const from = localMidnight();
  const day = aggregate(store.all, from, 1440).find((b) => Date.parse(b.t) >= from);
  const sum: Reading['today'] = { imp: day?.imp ?? 0, exp: day?.exp ?? 0 };
  const part = store.openPart();
  if (part && part.t >= from) {
    sum.imp += part.impN + part.impD;
    sum.exp += part.expN + part.expD;
  }
  const first = store.all.find((r) => Date.parse(r.t) >= from);
  const since = first ? Date.parse(first.t) : part ? part.t : startedAt;
  if (since > from + 30 * 60_000) sum.since = new Date(since).toISOString();
  return { ...sum, imp: Math.round(sum.imp * 1000) / 1000, exp: Math.round(sum.exp * 1000) / 1000 };
}

/** Het verzamelen overnemen als niemand anders het doet. */
async function tryBecomeCollector(): Promise<boolean> {
  if (!(await acquireLock())) return false;
  collecting = true;
  await store.load(); // verder waar de vorige collector was gebleven
  if (!HOST && store.isEmpty) await mockBackfill();
  await poll();
  setInterval(poll, POLL_MS);
  setInterval(() => void store.saveState(), 60_000);
  process.on('exit', () => void store.saveState());
  await store.saveState();
  return true;
}

export const chargee = {
  describe: () => (HOST ? `live via ${HOST}` : 'mock (zet CHARGEE_HOST in .env voor live data)'),
  get collecting() {
    return collecting;
  },
  /**
   * Start het verzamelen. Verzamelt er al een ander proces, dan leest dit proces mee en
   * probeert het elke 30 seconden het verzamelen over te nemen (bijv. als het dashboard stopt).
   */
  async startCollector() {
    await store.load();
    startedAt = Date.now();
    lastReload = Date.now();
    if (await tryBecomeCollector()) return;
    const retry = setInterval(async () => {
      if (await tryBecomeCollector()) {
        clearInterval(retry);
        console.log('Verzamelen overgenomen.');
      }
    }, 30_000);
  },
  async live(): Promise<Reading> {
    // Lezend proces: niet vaker dan eens per 3 seconden bij de Sparky langs.
    if (!collecting && Date.now() - latestAt > 3000) await poll();
    if (!latest) await poll();
    await freshStore();
    if (!latest) {
      return {
        ts: new Date().toISOString(),
        mode: HOST ? 'live' : 'mock',
        importW: 0,
        exportW: 0,
        meter: { importT1: 0, importT2: 0, exportT1: 0, exportT2: 0 },
        today: { imp: 0, exp: 0 },
        error: lastError ?? 'nog geen meting',
      };
    }
    return { ...latest, today: today(), error: lastError };
  },
  async history(days: number, res: number): Promise<{ mode: 'live' | 'mock'; res: number; buckets: Bucket[]; first?: string; records: number }> {
    await freshStore();
    const from = res >= 1440 ? localMidnight() - (days - 1) * 86_400_000 : Date.now() - days * 86_400_000;
    const buckets = aggregate(store.all, from, res);
    // Het nog open kwartier meetellen in het laatste vak.
    const part = store.openPart();
    if (part && part.t >= from) {
      const last = buckets[buckets.length - 1];
      const key = res >= 1440 ? localMidnight() : Math.floor(part.t / (res * 60_000)) * res * 60_000;
      const r3 = (v: number) => Math.round(v * 1000) / 1000;
      if (last && Date.parse(last.t) === key) {
        last.imp = r3(last.imp + part.impN + part.impD);
        last.exp = r3(last.exp + part.expN + part.expD);
        last.impD = r3(last.impD + part.impD);
        last.expD = r3(last.expD + part.expD);
      } else {
        buckets.push({ t: new Date(key).toISOString(), imp: r3(part.impN + part.impD), exp: r3(part.expN + part.expD), impD: r3(part.impD), expD: r3(part.expD) });
      }
    }
    return { mode: HOST ? 'live' : 'mock', res, buckets, first: store.all[0]?.t, records: store.all.length };
  },
};
