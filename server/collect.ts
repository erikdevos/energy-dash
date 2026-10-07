/*
 * Losse collector: leest de Sparky uit en slaat kwartierwaarden op in data/p1/, zonder dashboard.
 * Bedoeld om altijd op de achtergrond te draaien (bijv. via launchd of op een Raspberry Pi).
 * Verzamelt het dashboard al, dan wacht deze collector en neemt hij het over zodra dat stopt.
 * Start: npm run collect
 */
import { chargee } from './chargee.ts';

await chargee.startCollector();
console.log(
  chargee.collecting
    ? `Collector actief (${chargee.describe()}). Stoppen met Ctrl+C.`
    : 'Er verzamelt al een ander proces (waarschijnlijk het dashboard). Deze collector neemt het over zodra dat stopt.',
);
