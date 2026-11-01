import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Meter } from './p1store.ts';

/*
 * Fijne opslag van de P1-meter voor het herkennen van apparaten: één regel per minuut, per fase, in een JSONL-bestand
 * per lokale dag in <map>/minuut/jjjj-mm-dd.jsonl. Elke regel is een array (kort, want dit loopt het hele jaar door):
 *
 *   [t, n, i1, i2, i3, e1, e2, e3, v1, v2, v3, pm, em, afnameT1, afnameT2, terugT1, terugT2]
 *
 *   t                begin van de minuut, seconden sinds 1 januari 1970 (UTC)
 *   n                aantal metingen in die minuut (normaal 6 bij elke 10 seconden)
 *   i1..i3, e1..e3   gemiddelde afname en teruglevering per fase in die minuut (W)
 *   v1..v3           gemiddelde spanning per fase (V), 0 als de Sparky die niet meldt
 *   pm, em           hoogste totale afname en teruglevering in één meting (W)
 *   laatste vier     meterstanden aan het eind van de minuut (kWh, dal = tarief 1)
 *
 * Valt de collector uit, dan ontbreken die minuten simpelweg; de meterstanden vullen de energie later aan.
 */

interface Sample {
  ts: number;
  importW: number;
  exportW: number;
  phases?: Array<{ importW: number; exportW: number; voltage?: number }>;
  meter: Meter;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class MinuteStore {
  private readonly dir: string;
  private minute = -1;
  private n = 0;
  private imp = [0, 0, 0];
  private exp = [0, 0, 0];
  private volt = [0, 0, 0];
  private voltN = [0, 0, 0];
  private pm = 0;
  private em = 0;
  private meter: Meter | null = null;

  constructor(dir: string) {
    this.dir = join(dir, 'minuut');
  }

  /** Neem een meting op; sluit de vorige minuut af zodra een nieuwe begint. */
  add(s: Sample): void {
    const minute = Math.floor(s.ts / 60_000);
    if (minute !== this.minute) {
      this.flush();
      this.minute = minute;
    }
    this.n++;
    s.phases?.slice(0, 3).forEach((p, k) => {
      this.imp[k] += p.importW;
      this.exp[k] += p.exportW;
      if (p.voltage !== undefined) {
        this.volt[k] += p.voltage;
        this.voltN[k]++;
      }
    });
    this.pm = Math.max(this.pm, s.importW);
    this.em = Math.max(this.em, s.exportW);
    this.meter = s.meter;
  }

  /** Schrijf de lopende minuut weg (ook bij afsluiten). */
  flush(): void {
    if (this.minute < 0 || this.n === 0 || !this.meter) return;
    const d = new Date(this.minute * 60_000);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const m = this.meter;
    const line = [
      this.minute * 60,
      this.n,
      ...this.imp.map((v) => Math.round(v / this.n)),
      ...this.exp.map((v) => Math.round(v / this.n)),
      ...this.volt.map((v, k) => (this.voltN[k] ? r1(v / this.voltN[k]) : 0)),
      Math.round(this.pm),
      Math.round(this.em),
      r3(m.importT1),
      r3(m.importT2),
      r3(m.exportT1),
      r3(m.exportT2),
    ];
    try {
      mkdirSync(this.dir, { recursive: true });
      appendFileSync(join(this.dir, `${day}.jsonl`), `${JSON.stringify(line)}\n`);
    } catch (err) {
      console.error('Minuutwaarden opslaan mislukt:', err instanceof Error ? err.message : err);
    }
    this.n = 0;
    this.imp = [0, 0, 0];
    this.exp = [0, 0, 0];
    this.volt = [0, 0, 0];
    this.voltN = [0, 0, 0];
    this.pm = 0;
    this.em = 0;
    this.meter = null;
  }
}
