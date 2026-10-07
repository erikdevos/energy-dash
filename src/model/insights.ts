import { run } from './costs';
import type { ContractPreset } from './defaults';
import type { Settlement } from './settlement';
import type { Outcome, Scenario, YearData } from './types';

/*
 * Slimme inzichten: korte, concrete conclusies uit het model, in gewone taal.
 * Elk inzicht heeft één kerngetal en verwijst waar nodig naar het tabblad met de details.
 */

export interface Insight {
  id: string;
  tone: 'good' | 'bad' | 'info';
  title: string;
  value: string;
  text: string;
  tab?: 'nu' | 'verbruik' | 'scenarios' | 'leveranciers' | 'gegevens';
}

const eur = (v: number) => `€ ${Math.round(Math.abs(v)).toLocaleString('nl-NL')}`;
const kwh = (v: number) => `${Math.round(v).toLocaleString('nl-NL')} kWh`;

interface Input {
  /** jouw scenario (met de plannen die aan staan) */
  scenario: Scenario;
  /** je huidige situatie */
  start: Scenario;
  /** status quo onder het huidige contract */
  nowOutcome: Outcome;
  presets: Record<'nu' | 'dyn2026' | 'vast2027' | 'dyn2027', ContractPreset>;
  data: YearData;
  settlement: Settlement | null;
  /** prijs per kWh van het net (incl. belasting) voor euro-indicaties */
  pricePerKwh: number;
}

export function buildInsights({ scenario, start, nowOutcome, presets, data, settlement, pricePerKwh }: Input): Insight[] {
  const out: Insight[] = [];
  const cost = (s: Scenario, p: ContractPreset) => run(p.apply(s), data).total;

  // 1. Nu overstappen?
  const now = nowOutcome.total;
  const dynNow = cost(start, presets.dyn2026);
  if (dynNow > now + 20) {
    out.push({
      id: 'blijven',
      tone: 'good',
      title: 'Blijf tot 1 januari bij je huidige contract',
      value: `${eur(dynNow - now)} per jaar`,
      text: 'zou een dynamisch contract je nu méér kosten. Met saldering en zonder terugleverkosten is je huidige contract voordelig.',
    });
  }

  // 2. Keuze voor 2027, met de plannen die aan staan
  const vast = cost(scenario, presets.vast2027);
  const dyn = cost(scenario, presets.dyn2027);
  const best = dyn < vast ? 'dynamisch' : 'vast';
  out.push({
    id: 'contract2027',
    tone: 'info',
    title: `Vanaf 2027 lijkt ${best} het voordeligst`,
    value: `${eur(Math.abs(vast - dyn))} per jaar`,
    text: `verschil tussen vast (${eur(vast)}) en dynamisch (${eur(dyn)}). Vergelijk dit straks met de echte aanbiedingen.`,
    tab: 'scenarios',
  });

  // 3. Winterverbruik: verwarming
  const winter = [10, 11, 0, 1, 2];
  const heatWinter = winter.reduce((a, m) => a + nowOutcome.components.verwarming[m], 0);
  const winterTotal = winter.reduce((a, m) => a + Object.values(nowOutcome.components).reduce((x, arr) => x + arr[m], 0), 0);
  out.push({
    id: 'stoken',
    tone: 'bad',
    title: 'Elektrisch stoken is je grootste winterpost',
    value: kwh(heatWinter),
    text: `van november t/m maart, ${Math.round((heatWinter / Math.max(1, winterTotal)) * 100)}% van je winterstroom (ca. ${eur(heatWinter * pricePerKwh)} als je het van het net haalt).`,
    tab: 'verbruik',
  });

  // 4. Boiler
  const boilerYear = nowOutcome.components.boiler.reduce((a, b) => a + b, 0);
  const withHpBoiler: Scenario = { ...scenario, verbruik: { ...scenario.verbruik, boiler: 'warmtepomp', warmwaterTiming: 'zon' } };
  const boilerSaving = dyn - cost(withHpBoiler, presets.dyn2027);
  out.push({
    id: 'boiler',
    tone: 'info',
    title: 'Je oude boiler is een stille grootverbruiker',
    value: kwh(boilerYear),
    text: `per jaar. Een warmtepompboiler die op zonuren opwarmt, scheelt vanaf 2027 ca. ${eur(boilerSaving)} per jaar (dynamisch).`,
    tab: 'scenarios',
  });

  // 5. Verschuiven naar overdag
  const shifted = { ...scenario, verbruik: { ...scenario.verbruik, flexNaarZon: Math.max(scenario.verbruik.flexNaarZon, 0.7) } };
  const notShifted = { ...scenario, verbruik: { ...scenario.verbruik, flexNaarZon: start.verbruik.flexNaarZon } };
  const shiftNow = cost(notShifted, presets.nu) - cost(shifted, presets.nu);
  const shift2027 = cost(notShifted, presets.dyn2027) - cost(shifted, presets.dyn2027);
  out.push({
    id: 'verschuiven',
    tone: 'good',
    title: 'Was, droger en vaatwasser overdag: vooral vanaf 2027',
    value: `${eur(shift2027)} per jaar`,
    text: `vanaf 2027 als 70% overdag draait. Nu levert het ${shiftNow < 5 ? 'nog bijna niets' : `ca. ${eur(shiftNow)}`} op, omdat saldering terugleveren even zwaar laat tellen. Wen er alvast aan.`,
    tab: 'nu',
  });

  // 6. Batterij
  if (!scenario.batterij.aan) {
    const withBat = { ...scenario, batterij: { ...scenario.batterij, aan: true } };
    const batSaving = dyn - cost(withBat, presets.dyn2027);
    const years = batSaving > 0 ? scenario.batterij.aanschafprijs / batSaving : Infinity;
    out.push({
      id: 'batterij',
      tone: years < 10 ? 'good' : 'info',
      title: `Thuisbatterij (${scenario.batterij.capaciteitKwh.toLocaleString('nl-NL')} kWh): pas interessant vanaf 2027`,
      value: `${eur(batSaving)} per jaar`,
      text:
        batSaving > 0
          ? `besparing met dynamisch contract; terugverdiend in ca. ${Math.round(years)} jaar bij ${eur(scenario.batterij.aanschafprijs)} (prijs is een aanname).`
          : 'levert in jouw situatie niets op.',
      tab: 'scenarios',
    });
  }

  // 7. Eindnota
  if (settlement) {
    out.push({
      id: 'eindnota',
      tone: settlement.saldo <= 0 ? 'good' : 'bad',
      title: settlement.saldo <= 0 ? 'Je termijnbedrag is ruim genoeg' : 'Je termijnbedrag is te laag',
      value: settlement.saldo <= 0 ? `${eur(settlement.saldo)} terug` : `${eur(settlement.saldo)} bijbetalen`,
      text: 'verwacht op de eindnota van je huidige contract (31 december).',
      tab: 'nu',
    });
  }
  return out;
}
