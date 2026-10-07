import { useMemo } from 'react';
import { calendarFor, dayLabel, HOURS } from '../model/calendar';
import type { Outcome, Scenario } from '../model/types';
import { Card } from './Card';
import { StackedColumns } from './charts/StackedColumns';
import { StepLines } from './charts/StepLines';
import { fmt } from './charts/scale';
import { FLOW_SERIES } from './charts/series';

interface Props {
  outcome: Outcome;
  scenario: Scenario;
  priceYear: number;
  day: number;
  onDay: (d: number) => void;
}

function dayRange(year: number, d: number): [number, number] {
  const cal = calendarFor(year);
  return [cal.dayStart[d], d + 1 < cal.dayStart.length ? cal.dayStart[d + 1] : HOURS];
}

export function DayView({ outcome, scenario, priceYear, day, onDay }: Props) {
  const sim = outcome.sim;
  const cal = calendarFor(priceYear);

  // Snelkoppelingen naar opvallende dagen in dit jaar.
  const notable = useMemo(() => {
    const days = cal.dayStart.length;
    const found = { sunny: 0, dark: 0, negative: 0, spread: 0 };
    const best = { sunny: -1, dark: Infinity, negative: Infinity, spread: -1 };
    for (let d = 0; d < days; d++) {
      const [a, b] = dayRange(priceYear, d);
      let pv = 0;
      let min = Infinity;
      let max = -Infinity;
      for (let i = a; i < b; i++) {
        pv += sim.pv[i];
        min = Math.min(min, sim.importPrice[i]);
        max = Math.max(max, sim.importPrice[i]);
      }
      const winter = cal.month[a] <= 1 || cal.month[a] >= 10;
      if (pv > best.sunny) {
        best.sunny = pv;
        found.sunny = d;
      }
      if (winter && pv < best.dark) {
        best.dark = pv;
        found.dark = d;
      }
      if (min < best.negative) {
        best.negative = min;
        found.negative = d;
      }
      if (max - min > best.spread) {
        best.spread = max - min;
        found.spread = d;
      }
    }
    return found;
  }, [sim, cal, priceYear]);

  const [a, b] = dayRange(priceYear, day);
  const idx = Array.from({ length: b - a }, (_, k) => a + k);
  const hours = idx.map((i) => String(cal.hour[i]).padStart(2, '0'));
  const titles = idx.map((i) => `${String(cal.hour[i]).padStart(2, '0')}:00 - ${String((cal.hour[i] + 1) % 24).padStart(2, '0')}:00`);
  const pick = (arr: Float64Array) => idx.map((i) => arr[i]);
  const values = { zon: pick(sim.pvDirect), bat: pick(sim.batDischarge), imp: pick(sim.imp), exp: pick(sim.exp) };

  let dayImp = 0;
  let dayExp = 0;
  let dayCost = 0;
  let dayLoad = 0;
  let dayPv = 0;
  for (const i of idx) {
    dayImp += sim.imp[i];
    dayExp += sim.exp[i];
    dayLoad += sim.load[i];
    dayPv += sim.pv[i];
    dayCost += sim.imp[i] * sim.importPrice[i] - sim.exp[i] * sim.exportPrice[i];
  }
  const cap = scenario.batterij.aan ? scenario.batterij.capaciteitKwh : 0;

  const table = (
    <table className="data-table">
      <thead>
        <tr>
          <th>Uur</th>
          <th>Verbruik</th>
          <th>Opwek</th>
          <th>Van net</th>
          <th>Terug</th>
          <th>Batterij</th>
          <th>Afnameprijs</th>
          <th>Terugleverprijs</th>
        </tr>
      </thead>
      <tbody>
        {idx.map((i, k) => (
          <tr key={i}>
            <td>{titles[k]}</td>
            <td>{fmt.one(sim.load[i])}</td>
            <td>{fmt.one(sim.pv[i])}</td>
            <td>{fmt.one(sim.imp[i])}</td>
            <td>{fmt.one(sim.exp[i])}</td>
            <td>{cap ? fmt.pct(sim.soc[i] / cap) : '-'}</td>
            <td>{fmt.perKwh(sim.importPrice[i])}</td>
            <td>{fmt.perKwh(sim.exportPrice[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card
      title="Dagbeeld per uur"
      subtitle={`${dayLabel(priceYear, day)} · uurprijzen van die dag, zon en temperatuur uit het weerjaar`}
      table={table}
      className="span-2"
    >
      <div className="day-controls">
        <input
          type="range"
          min={0}
          max={cal.dayStart.length - 1}
          value={day}
          onChange={(e) => onDay(Number(e.target.value))}
          aria-label="Kies een dag"
          style={{ '--pct': `${(day / (cal.dayStart.length - 1)) * 100}%` } as React.CSSProperties}
        />
        <div className="chip-row">
          <button type="button" className="chip" onClick={() => onDay(notable.sunny)}>Zonnigste dag</button>
          <button type="button" className="chip" onClick={() => onDay(notable.dark)}>Donkerste winterdag</button>
          <button type="button" className="chip" onClick={() => onDay(notable.negative)}>Laagste uurprijs</button>
          <button type="button" className="chip" onClick={() => onDay(notable.spread)}>Grootste prijsverschil</button>
        </div>
      </div>
      <div className="day-stats">
        <div><span className="k">Verbruik</span><span className="v">{fmt.kwh(dayLoad)}</span></div>
        <div><span className="k">Opwek</span><span className="v">{fmt.kwh(dayPv)}</span></div>
        <div><span className="k">Van het net</span><span className="v">{fmt.kwh(dayImp)}</span></div>
        <div><span className="k">Teruggeleverd</span><span className="v">{fmt.kwh(dayExp)}</span></div>
        <div>
          <span className="k">Energiekosten dag</span>
          <span className="v">{fmt.eur2(dayCost)}</span>
          {scenario.regime === 'saldering' && <span className="hint">zonder saldering gerekend</span>}
        </div>
      </div>
      <StackedColumns
        ariaLabel="Stroom per uur op de gekozen dag"
        categories={hours}
        categoryTitles={titles}
        up={[FLOW_SERIES.imp, FLOW_SERIES.bat, FLOW_SERIES.zon]}
        down={[FLOW_SERIES.exp]}
        values={values}
        format={(v) => `${fmt.one(v)} kWh`}
        tickEvery={3}
        height={240}
        extraRows={(k) => {
          const i = idx[k];
          const rows = [{ label: 'Verbruik huis', value: `${fmt.one(sim.load[i])} kWh`, strong: true }];
          if (sim.evLoad[i] > 0) rows.push({ label: 'waarvan auto laden', value: `${fmt.one(sim.evLoad[i])} kWh`, strong: false });
          if (sim.batCharge[i] > 0) rows.push({ label: 'Batterij laden', value: `${fmt.one(sim.batCharge[i])} kWh`, strong: false });
          if (cap) rows.push({ label: 'Batterij vol', value: fmt.pct(sim.soc[i] / cap), strong: false });
          if (sim.curtailed[i] > 0) rows.push({ label: 'Afgeschakeld', value: `${fmt.one(sim.curtailed[i])} kWh`, strong: false });
          return rows;
        }}
      />
      <h3 className="mini-title">Prijs per kWh dit uur (incl. belasting en BTW)</h3>
      <StepLines
        ariaLabel="Afname- en terugleverprijs per uur"
        categories={hours}
        categoryTitles={titles}
        series={[
          { key: 'imp', label: 'Afnameprijs', color: 'var(--series-1)', values: pick(sim.importPrice) },
          { key: 'exp', label: 'Terugleverprijs', color: 'var(--series-4)', values: pick(sim.exportPrice) },
        ]}
        format={fmt.perKwh}
        tickFormat={(v) => `€${fmt.one(v)}`}
        tickEvery={3}
        height={170}
      />
    </Card>
  );
}
