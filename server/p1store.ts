import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, writeJson } from './cache.ts';

/*
 * Langetermijnopslag van de P1-meter: per maand een JSONL-bestand met één regel per kwartier.
 * Elke regel bevat de energie in dat kwartier (uit het verschil in meterstanden, uitgesplitst naar
 * normaal/dal) en het hoogste gemeten vermogen. De eindmeterstanden staan erbij, zodat alles
 * altijd te herleiden is. Valt de collector een tijd uit, dan wordt het hele gat bij de eerste
 * nieuwe meting als één regel met gap=true vastgelegd: de kWh zijn dan compleet, alleen niet per kwartier.
 */

export interface Meter {
  importT1: number;
  importT2: number;
  exportT1: number;
  exportT2: number;
}

export interface P1Record {
  /** begin van het interval (UTC, ISO) */
  t: string;
  /** duur in minuten (15, of langer bij een gat) */
  min: number;
  /** kWh, DSMR: tarief 1 = dal, tarief 2 = normaal */
  impN: number;
  impD: number;
  expN: number;
  expD: number;
  /** hoogste afname- en terugleververmogen in het interval (W), uit de metingen */
  pImpMax?: number;
  pExpMax?: number;
  /** meterstanden aan het eind van het interval: [afname T1, afname T2, terug T1, terug T2] */
  m: [number, number, number, number];
  gap?: boolean;
}

interface OpenInterval {
  start: number;
  startMeter: Meter;
  lastTs: number;
  lastMeter: Meter;
  pImpMax: number;
  pExpMax: number;
}

const QUARTER = 15 * 60_000;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class P1Store {
  private open: OpenInterval | null = null;
  private records: P1Record[] = [];
  private readonly dir: string;
  private readonly statePath: string;

  constructor(dir: string) {
    this.dir = dir;
    this.statePath = join(dir, 'state.json');
  }

  private fileFor(t: number): string {
    const d = new Date(t);
    return join(this.dir, `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.jsonl`);
  }

  /** Alle opgeslagen regels inlezen (een jaar kwartierdata is ~35.000 regels, prima in geheugen). */
  async load(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.jsonl')).sort();
    const out: P1Record[] = [];
    for (const f of files) {
      for (const line of (await readFile(join(this.dir, f), 'utf8')).split('\n')) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line) as P1Record);
        } catch {
          /* kapotte regel (bv. stroomuitval tijdens schrijven) overslaan */
        }
      }
    }
    this.records = out.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    this.open = await readJson<OpenInterval>(this.statePath);
  }

  get all(): readonly P1Record[] {
    return this.records;
  }

  get isEmpty(): boolean {
    return this.records.length === 0 && !this.open;
  }

  private async write(rec: P1Record): Promise<void> {
    this.records.push(rec);
    await appendFile(this.fileFor(Date.parse(rec.t)), JSON.stringify(rec) + '\n');
  }

  /** Records die niet uit de collector komen (migratie, mock-backfill). */
  async importRecords(recs: P1Record[]): Promise<void> {
    for (const r of recs) await this.write(r);
  }

  private async close(iv: OpenInterval, endMeter: Meter, endTs: number, gap: boolean): Promise<void> {
    const d = {
      impN: endMeter.importT2 - iv.startMeter.importT2,
      impD: endMeter.importT1 - iv.startMeter.importT1,
      expN: endMeter.exportT2 - iv.startMeter.exportT2,
      expD: endMeter.exportT1 - iv.startMeter.exportT1,
    };
    // Meterwissel of onzin: niet opslaan.
    if (Object.values(d).some((v) => v < 0 || v > 500)) return;
    const min = Math.max(1, Math.round((endTs - iv.start) / 60_000));
    await this.write({
      t: new Date(iv.start).toISOString(),
      min: gap ? min : 15,
      impN: r3(d.impN),
      impD: r3(d.impD),
      expN: r3(d.expN),
      expD: r3(d.expD),
      pImpMax: iv.pImpMax || undefined,
      pExpMax: iv.pExpMax || undefined,
      m: [endMeter.importT1, endMeter.importT2, endMeter.exportT1, endMeter.exportT2],
      gap: gap || undefined,
    });
  }

  /** Een nieuwe meting verwerken. */
  async add(ts: number, meter: Meter, importW: number, exportW: number): Promise<void> {
    const slot = Math.floor(ts / QUARTER) * QUARTER;
    const iv = this.open;
    if (iv) {
      const missed = ts - iv.lastTs > 2 * QUARTER;
      if (missed) {
        // Collector lag stil: alles sinds het begin van het open interval als één gat-regel vastleggen.
        await this.close(iv, meter, slot, true);
        this.open = null;
      } else if (slot > iv.start) {
        // Meer dan één kwartier overgeslagen (korte hapering): echte duur vastleggen.
        await this.close(iv, meter, slot, slot - iv.start > QUARTER);
        this.open = null;
      }
    }
    if (!this.open) {
      this.open = { start: slot, startMeter: { ...meter }, lastTs: ts, lastMeter: { ...meter }, pImpMax: 0, pExpMax: 0 };
    }
    const o = this.open;
    o.lastTs = ts;
    o.lastMeter = { ...meter };
    o.pImpMax = Math.max(o.pImpMax, Math.round(importW));
    o.pExpMax = Math.max(o.pExpMax, Math.round(exportW));
  }

  /** Lopend interval bewaren, zodat een herstart naadloos aansluit. */
  async saveState(): Promise<void> {
    if (this.open) await writeJson(this.statePath, this.open);
  }

  /** Energie in het nog open interval (voor "vandaag" en de laatste staaf). */
  openPart(): { t: number; impN: number; impD: number; expN: number; expD: number } | null {
    const o = this.open;
    if (!o) return null;
    return {
      t: o.start,
      impN: o.lastMeter.importT2 - o.startMeter.importT2,
      impD: o.lastMeter.importT1 - o.startMeter.importT1,
      expN: o.lastMeter.exportT2 - o.startMeter.exportT2,
      expD: o.lastMeter.exportT1 - o.startMeter.exportT1,
    };
  }
}

export interface Bucket {
  t: string;
  imp: number;
  exp: number;
  impD: number;
  expD: number;
  pImpMax?: number;
  pExpMax?: number;
  /** (deels) geschat uit een gat-regel */
  gap?: boolean;
}

/**
 * Regels optellen tot vakken van `res` minuten (15, 60 of 1440). Vakken van een dag lopen van lokale
 * middernacht tot middernacht. Een gat-regel wordt gelijkmatig over zijn duur verdeeld.
 */
export function aggregate(records: readonly P1Record[], fromTs: number, res: number): Bucket[] {
  const buckets = new Map<number, Bucket>();
  const keyOf = (ts: number) => {
    if (res < 1440) return Math.floor(ts / (res * 60_000)) * res * 60_000;
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const addTo = (ts: number, f: number, rec: P1Record) => {
    const k = keyOf(ts);
    let b = buckets.get(k);
    if (!b) {
      b = { t: new Date(k).toISOString(), imp: 0, exp: 0, impD: 0, expD: 0 };
      buckets.set(k, b);
    }
    b.imp += (rec.impN + rec.impD) * f;
    b.exp += (rec.expN + rec.expD) * f;
    b.impD += rec.impD * f;
    b.expD += rec.expD * f;
    if (rec.pImpMax) b.pImpMax = Math.max(b.pImpMax ?? 0, rec.pImpMax);
    if (rec.pExpMax) b.pExpMax = Math.max(b.pExpMax ?? 0, rec.pExpMax);
    if (rec.gap) b.gap = true;
  };
  for (const rec of records) {
    const start = Date.parse(rec.t);
    const end = start + rec.min * 60_000;
    if (end <= fromTs) continue;
    if (rec.min <= 15 || rec.min <= res) {
      addTo(start, 1, rec);
      continue;
    }
    // Langer interval (gat of migratie): verdelen over stukjes van een kwartier.
    const steps = Math.ceil(rec.min / 15);
    for (let k = 0; k < steps; k++) addTo(start + k * QUARTER, 1 / steps, rec);
  }
  return [...buckets.entries()]
    .filter(([k]) => k + res * 60_000 > fromTs)
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => ({ ...b, imp: r3(b.imp), exp: r3(b.exp), impD: r3(b.impD), expD: r3(b.expD) }));
}
