import { useMemo, useState } from 'react';
import { MONTHS } from '../model/calendar';
import type { Outcome } from '../model/types';
import { Card } from './Card';
import { PELLET_KWH_PER_KG } from '../model/profiles';
import { StackedColumns, type StackSeries } from './charts/StackedColumns';
import { Treemap } from './charts/Treemap';
import { Segmented } from './controls';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

const FULL_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// Stapelvolgorde (onder naar boven) en kleuren gevalideerd op kleurenblindheid; verwarming bovenop
// zodat het seizoenspatroon direct zichtbaar is.
const SERIES: StackSeries[] = [
  { key: 'huishouden', label: 'Huishouden', color: 'var(--comp-1)' },
  { key: 'boiler', label: 'Boiler', color: 'var(--comp-2)' },
  { key: 'was', label: 'Wassen, drogen, vaatwasser', color: 'var(--comp-3)' },
  { key: 'verwarming', label: 'Verwarming', color: 'var(--comp-4)' },
  { key: 'koelen', label: 'Koelen', color: 'var(--comp-5)' },
];

const WINTER = [10, 11, 0, 1, 2];

interface Props {
  outcome: Outcome;
  pelletPrijsPerKg: number;
  /** prijs per kWh die je betaalt als je het van het net haalt (incl. belasting), voor de euro-indicatie */
  pricePerKwh: number;
}

export function ConsumptionChart({ outcome, pricePerKwh, pelletPrijsPerKg }: Props) {
  const [view, setView] = useState<'maanden' | 'treemap'>('maanden');
  // gekozen periode: van t/m (mag over de jaarwisseling heen, bijvoorbeeld november t/m maart)
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(11);
  const months = useMemo(() => {
    const list: number[] = [];
    for (let m = from; ; m = (m + 1) % 12) {
      list.push(m);
      if (m === to) break;
    }
    return list;
  }, [from, to]);
  const fullYear = months.length === 12 && from === 0;
  const periodLabel = fullYear ? 'Heel jaar' : months.length === 1 ? FULL_MONTHS[from] : `${FULL_MONTHS[from]} t/m ${FULL_MONTHS[to]}`;
  const c = outcome.components;
  const series = SERIES.filter((s) => c[s.key as keyof typeof c].some((v) => v > 0.5));
  if (c.auto.some((v) => v > 0.5)) series.push({ key: 'auto', label: 'Elektrische auto', color: 'var(--series-4)' });
  const sumWinter = (k: keyof typeof c) => WINTER.reduce((a, m) => a + c[k][m], 0);
  const winterTotal = series.reduce((a, s) => a + sumWinter(s.key as keyof typeof c), 0);
  const heat = sumWinter('verwarming');
  const boiler = sumWinter('boiler');
  const winterImp = WINTER.reduce((a, m) => a + outcome.monthly[m].imp, 0);
  const sumPeriod = (k: keyof typeof c) => months.reduce((a, m) => a + c[k][m], 0);
  const periodTotal = series.reduce((a, s) => a + sumPeriod(s.key as keyof typeof c), 0);
  const periodImp = months.reduce((a, m) => a + outcome.monthly[m].imp, 0);
  const periodValues = Object.fromEntries(series.map((s) => [s.key, months.map((m) => c[s.key as keyof typeof c][m])]));
  const pelletKwh = outcome.pelletWarmte.reduce((a, b) => a + b, 0);
  const pelletKg = pelletKwh / PELLET_KWH_PER_KG;

  const table = (
    <table className="data-table">
      <thead>
        <tr>
          <th>Maand</th>
          {series.map((s) => (
            <th key={s.key}>{s.label}</th>
          ))}
          <th>Totaal</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={m}>
            <td>{FULL_MONTHS[m]}</td>
            {series.map((s) => (
              <td key={s.key}>{fmt.int(c[s.key as keyof typeof c][m])}</td>
            ))}
            <td>{fmt.int(series.reduce((a, s) => a + c[s.key as keyof typeof c][m], 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card
      title="Waar gaat je stroom naartoe"
      subtitle="Verbruik in huis per maand, per onderdeel (kWh). Schatting van het model, afgestemd op je metingen."
      table={table}
      className="span-2"
      actions={
        <Segmented
          label="Weergave"
          value={view}
          options={[
            { value: 'maanden', label: 'Per maand' },
            { value: 'treemap', label: 'Treemap' },
          ]}
          onChange={setView}
        />
      }
    >
      <div className="range-row">
        <label className="range-field">
          <span>Van</span>
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {FULL_MONTHS.map((n, m) => (
              <option key={n} value={m}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="range-field">
          <span>Tot en met</span>
          <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {FULL_MONTHS.map((n, m) => (
              <option key={n} value={m}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost-btn" onClick={() => { setFrom(10); setTo(2); }}>
          Winter
        </button>
        <button type="button" className="ghost-btn" onClick={() => { setFrom(3); setTo(9); }}>
          Zomer
        </button>
        <button type="button" className="ghost-btn" disabled={fullYear} onClick={() => { setFrom(0); setTo(11); }}>
          Heel jaar
        </button>
      </div>
      <div className="winter-summary">
        <div className="stat">
          <span className="stat-label">{periodLabel}</span>
          <span className="stat-value">{fmt.kwh(periodTotal)}</span>
          <Rich as="span" className="stat-note">waarvan {fmt.kwh(periodImp)} van het net · ca. {fmt.eur(periodImp * pricePerKwh)}</Rich>
        </div>
        <div className="stat">
          <span className="stat-label">November t/m maart</span>
          <span className="stat-value">{fmt.kwh(winterTotal)}</span>
          <Rich as="span" className="stat-note">waarvan {fmt.kwh(winterImp)} van het net</Rich>
        </div>
        <div className="stat">
          <span className="stat-label">Verwarming nov-mrt</span>
          <span className="stat-value">{fmt.kwh(heat)}</span>
          <Rich as="span" className="stat-note">
            {fmt.pct(winterTotal ? heat / winterTotal : 0)} van je wintergebruik · ca. {fmt.eur(heat * pricePerKwh)} van het net
          </Rich>
        </div>
        <div className="stat">
          <span className="stat-label">Boiler nov-mrt</span>
          <span className="stat-value">{fmt.kwh(boiler)}</span>
          <Rich as="span" className="stat-note">ca. {fmt.eur(boiler * pricePerKwh)} van het net</Rich>
        </div>
        {pelletKwh > 0.5 && (
          <div className="stat">
            <span className="stat-label">Pelletkachel (geen stroom)</span>
            <span className="stat-value">{fmt.kwh(pelletKwh)} warmte</span>
            <Rich as="span" className="stat-note">
              ca. {fmt.int(pelletKg)} kg pellets · {fmt.eur(pelletKg * pelletPrijsPerKg)} per jaar
            </Rich>
          </div>
        )}
        <div className="stat">
          <span className="stat-label">Verwarming heel jaar</span>
          <span className="stat-value">{fmt.kwh(c.verwarming.reduce((a, b) => a + b, 0))}</span>
          <Rich as="span" className="stat-note">boiler {fmt.kwh(c.boiler.reduce((a, b) => a + b, 0))}</Rich>
        </div>
      </div>
      {view === 'treemap' ? (
        <>
          <Treemap
            height={440}
            ariaLabel={`Treemap: verbruik ${periodLabel.toLowerCase()}, per onderdeel en per maand`}
            format={(v) => fmt.kwh(v)}
            items={series.flatMap((s) =>
              months.map((m) => ({
                id: `${s.key}-${m}`,
                label: FULL_MONTHS[m],
                value: c[s.key as keyof typeof c][m],
                group: s.key,
                groupLabel: s.label,
                color: s.color,
                detail: `ca. ${fmt.eur(c[s.key as keyof typeof c][m] * pricePerKwh)}`,
              })),
            )}
          />
          <Rich as="p" className="hint">
            De oppervlakte is het verbruik in de gekozen periode. Elk kader is een onderdeel, de vakken daarbinnen zijn de maanden.
          </Rich>
        </>
      ) : (
        <StackedColumns
          ariaLabel="Gestapelde kolommen: verbruik per maand per onderdeel"
          categories={months.map((m) => MONTHS[m])}
          categoryTitles={months.map((m) => FULL_MONTHS[m])}
          up={series}
          down={[]}
          values={periodValues}
          height={260}
          extraRows={(i) => [{ label: 'Totaal', value: fmt.kwh(series.reduce((a, s) => a + periodValues[s.key][i], 0)), strong: true }]}
        />
      )}
      <Rich as="p" className="hint">
        Euro's zijn een indicatie tegen je stroomprijs incl. energiebelasting ({fmt.perKwh(pricePerKwh)} per kWh). Met
        saldering wordt een deel weggestreept tegen je zomerse teruglevering, vanaf 2027 niet meer. Hoe groot de verwarming
        precies is, hangt af van het weer in het model: met andere weerjaren ligt hij tussen ~1.700 en ~2.600 kWh per jaar.
      </Rich>
    </Card>
  );
}
