/*
 * Dagtabel van Greenchoice inlezen in data/dagen.json (privé, niet in git).
 *
 * Gebruik: kopieer in Mijn Greenchoice de tabel met de dagwaarden van een maand (de HTML van de tabel, of de tekst),
 * bewaar dat in een bestand en draai:
 *   npm run import-dagen -- 2026-11 pad/naar/bestand.html
 * Bestaande dagen van dezelfde datum worden overschreven, de rest blijft staan.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [maand, bestand] = process.argv.slice(2);
if (!maand || !/^\d{4}-\d{2}$/.test(maand) || !bestand) {
  console.error('Gebruik: npm run import-dagen -- jjjj-mm pad/naar/bestand');
  process.exit(1);
}
const raw = readFileSync(bestand, 'utf8');
// HTML naar platte tekst: elke cel op een eigen regel
const text = raw
  .replace(/<\/(td|th)>/gi, '\n')
  .replace(/<\/tr>/gi, '\n#\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/ /g, ' ');
const rows = text.split('#').map((r) => r.split('\n').map((c) => c.trim()).filter(Boolean));

const dagen: Array<{ datum: string; afnameNormaal: number; afnameDal: number; terugNormaal: number; terugDal: number }> = [];
for (const cells of rows) {
  const m = /^[a-z]{2}\s+(\d{1,2})$/i.exec(cells[0] ?? '');
  if (!m) continue;
  const n = cells.slice(1, 5).map((c) => Number(c.replace(/kWh/i, '').replace(',', '.').trim()));
  if (n.length < 4 || n.some((v) => !Number.isFinite(v))) continue;
  dagen.push({ datum: `${maand}-${m[1].padStart(2, '0')}`, afnameNormaal: n[0], afnameDal: n[1], terugNormaal: Math.abs(n[2]), terugDal: Math.abs(n[3]) });
}
if (!dagen.length) {
  console.error('Geen dagrijen gevonden. Plak de tabel met kolommen Maand, Stroom Normaal, Stroom Dal, Teruglevering Normaal, Teruglevering Dal.');
  process.exit(1);
}

const pad = 'data/dagen.json';
let bestaand: { bron?: string; dagen: typeof dagen } = { bron: 'Greenchoice, verbruik per dag (kWh, afgerond)', dagen: [] };
try {
  bestaand = JSON.parse(readFileSync(pad, 'utf8'));
} catch {
  /* nieuw bestand */
}
const map = new Map(bestaand.dagen.map((d) => [d.datum, d]));
for (const d of dagen) map.set(d.datum, d);
bestaand.dagen = [...map.values()].sort((a, b) => a.datum.localeCompare(b.datum));
writeFileSync(pad, JSON.stringify(bestaand, null, 1));
console.log(`${dagen.length} dagen van ${maand} verwerkt; ${bestaand.dagen.length} dagen in totaal in ${pad}.`);
