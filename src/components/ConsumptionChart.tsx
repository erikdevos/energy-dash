import { MONTHS } from '../model/calendar';
import type { Outcome } from '../model/types';
import { Card } from './Card';
import { PELLET_KWH_PER_KG } from '../model/profiles';
import { StackedColumns, type StackSeries } from './charts/StackedColumns';
import { fmt } from './charts/scale';

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
  const c = outcome.components;
  const series = SERIES.filter((s) => c[s.key as keyof typeof c].some((v) => v > 0.5));
  if (c.auto.some((v) => v > 0.5)) series.push({ key: 'auto', label: 'Elektrische auto', color: 'var(--series-4)' });
  const sumWinter = (k: keyof typeof c) => WINTER.reduce((a, m) => a + c[k][m], 0);
  const winterTotal = series.reduce((a, s) => a + sumWinter(s.key as keyof typeof c), 0);
  const heat = sumWinter('verwarming');
  const boiler = sumWinter('boiler');
  const winterImp = WINTER.reduce((a, m) => a + outcome.monthly[m].imp, 0);
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
        {MONTHS.map((_, m) => (
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
    >
      <div className="winter-summary">
        <div className="stat">
          <span className="stat-label">November t/m maart</span>
          <span className="stat-value">{fmt.kwh(winterTotal)}</span>
          <span className="stat-note">waarvan {fmt.kwh(winterImp)} van het net</span>
        </div>
        <div className="stat">
          <span className="stat-label">Verwarming nov-mrt</span>
          <span className="stat-value">{fmt.kwh(heat)}</span>
          <span className="stat-note">
            {fmt.pct(winterTotal ? heat / winterTotal : 0)} van je wintergebruik · ca. {fmt.eur(heat * pricePerKwh)} van het net
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Boiler nov-mrt</span>
          <span className="stat-value">{fmt.kwh(boiler)}</span>
          <span className="stat-note">ca. {fmt.eur(boiler * pricePerKwh)} van het net</span>
        </div>
        {pelletKwh > 0.5 && (
          <div className="stat">
            <span className="stat-label">Pelletkachel (geen stroom)</span>
            <span className="stat-value">{fmt.kwh(pelletKwh)} warmte</span>
            <span className="stat-note">
              ca. {fmt.int(pelletKg)} kg pellets · {fmt.eur(pelletKg * pelletPrijsPerKg)} per jaar
            </span>
          </div>
        )}
        <div className="stat">
          <span className="stat-label">Verwarming heel jaar</span>
          <span className="stat-value">{fmt.kwh(c.verwarming.reduce((a, b) => a + b, 0))}</span>
          <span className="stat-note">boiler {fmt.kwh(c.boiler.reduce((a, b) => a + b, 0))}</span>
        </div>
      </div>
      <StackedColumns
        ariaLabel="Gestapelde kolommen: verbruik per maand per onderdeel"
        categories={MONTHS}
        categoryTitles={FULL_MONTHS}
        up={series}
        down={[]}
        values={c}
        height={260}
        extraRows={(m) => [{ label: 'Totaal', value: fmt.kwh(series.reduce((a, s) => a + c[s.key as keyof typeof c][m], 0)), strong: true }]}
      />
      <p className="hint">
        Euro's zijn een indicatie tegen je stroomprijs incl. energiebelasting ({fmt.perKwh(pricePerKwh)} per kWh). Met
        saldering wordt een deel weggestreept tegen je zomerse teruglevering, vanaf 2027 niet meer. Hoe groot de verwarming
        precies is, hangt af van het weer in het model: met andere weerjaren ligt hij tussen ~1.700 en ~2.600 kWh per jaar.
      </p>
    </Card>
  );
}
