// Wat kost een kWh per uur van de dag in 2027 (dynamisch, zonder saldering)? Beursprijzen 2025.
import { readFileSync } from 'node:fs';
import { calendarFor } from '../src/model/calendar';
import { BELASTING, DYNAMISCH } from '../src/model/defaults';

const prices = JSON.parse(readFileSync('data/cache/prices-2025.json', 'utf8')).prices as number[];
const cal = calendarFor(2025);
const eb = BELASTING[2027].energiebelasting;
const importPrice = (i: number) => prices[i] * 1.21 + DYNAMISCH.opslag + eb;
const exportPrice = (i: number) => prices[i] - DYNAMISCH.terugleverOpslag;
const seasons: Array<[string, (m: number) => boolean]> = [['winter (nov-mrt)', (m) => m >= 10 || m <= 2], ['zomerhalfjaar (apr-sep)', (m) => m >= 3 && m <= 8]];
for (const [name, inSeason] of seasons) {
  console.log(name);
  for (const h of [0, 7, 12, 13, 14, 19, 20, 21]) {
    let imp = 0, exp = 0, n = 0;
    for (let i = 0; i < prices.length; i++) if (cal.hour[i] === h && inSeason(cal.month[i])) { imp += importPrice(i); exp += exportPrice(i); n++; }
    console.log(`  ${String(h).padStart(2)}:00  afname ${(imp / n).toFixed(3)} €/kWh | teruglevering ${(exp / n).toFixed(3)} €/kWh`);
  }
}
