// Controle op de voor/na-berekening: synthetische dagen met een bekende besparing moeten die terugvinden.
import { windowEffect, type Day } from '../src/model/windows';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
const DAY = 24 * 3600_000;
const start = Date.UTC(2026, 10, 1);
const days: Day[] = [];
for (let i = 0; i < 40; i++) {
  const temp = 6 + 6 * Math.sin(i / 4) + rnd() * 2;
  const rad = Math.max(0, 1.5 + 1.2 * Math.sin(i / 3 + 1) + rnd() * 0.3);
  const base = Math.max(0, 14 - 0.6 * temp - 3 * rad + rnd() * 0.5);
  days.push({ from: start + i * DAY, kwh: i >= 20 ? base * 0.55 : base, temp, rad });
}
const fx = windowEffect(days, start + 20 * DAY);
console.log(`gevonden besparing ${(fx.savingPct! * 100).toFixed(0)}% (echt 45%), ± ${fx.margin!.toFixed(1)} kWh, coëfficiënten ${fx.coef!.map((c) => c.toFixed(2)).join(', ')} (echt 14, -0.6, -3)`);
