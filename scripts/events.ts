// Zoekt in de minuutdata per fase naar stappen in het vermogen (aan/uit van een apparaat) en toont ze als tijdlijn.
// Gebruik: npx tsx scripts/events.ts [JJJJ-MM-DD] [vanaf-uu:mm] [tot-uu:mm]
import { readFileSync } from 'node:fs';

const day = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const from = process.argv[3] ?? '00:00';
const to = process.argv[4] ?? '23:59';
const STEP = 350; // minimale sprong in W om als gebeurtenis te tellen

const hm = (t: number) => new Date(t * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
const rows = readFileSync(`data/p1/minuut/${day}.jsonl`, 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('['))
  .map((l) => JSON.parse(l) as number[])
  .filter((r) => hm(r[0]) >= from && hm(r[0]) <= to);

// "vloer" per fase: de laagste waarde van de minuut en de twee volgende (pulsen vallen daardoor weg)
for (let k = 0; k < 3; k++) {
  const floor = rows.map((_, i) => Math.min(...rows.slice(i, i + 3).map((r) => r[2 + k])));
  let prev = floor[0];
  for (let i = 1; i < rows.length; i++) {
    const d = floor[i] - prev;
    if (Math.abs(d) >= STEP) console.log(`${hm(rows[i][0])}  L${k + 1}  vloer ${d > 0 ? '+' : ''}${d} W  (nu ${floor[i]} W)`);
    if (Math.abs(d) >= STEP / 2) prev = floor[i];
  }
  // pulsen: minuten waarin de piek ver boven het gemiddelde ligt, per fase de hoogste piek van het totaal
}
const pulses = rows.filter((r) => r[11] - (r[2] + r[3] + r[4]) > 600);
console.log(`\nminuten met korte pieken (>600 W boven gemiddelde): ${pulses.length} van ${rows.length}`);
