import { useMemo, useState } from 'react';
import { monthlyCosts } from '../model/costs';
import type { SupplierRow } from '../model/suppliers';
import type { YearData } from '../model/types';
import { Card } from './Card';
import { Segmented } from './controls';
import { StackedColumns } from './charts/StackedColumns';
import { fmt } from './charts/scale';
import { TermijnInput } from './Summary';

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const FULL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

type Pick = 'dyn' | 'vast' | 'mijn';

interface Props {
  rows: SupplierRow[];
  year: YearData;
  current: string;
  /** huidig termijnbedrag, als beginwaarde */
  termijnbedrag: number;
}

/**
 * Wat betekent een contract per maand? Maandkosten volgen de seizoenen: veel in de winter, in de zomer ga je terug
 * in de min. Het termijnbedrag bepaalt hoe vaak je bijbetaalt of terugkrijgt.
 */
export function MonthlyBill({ rows, year, current, termijnbedrag }: Props) {
  const [pick, setPick] = useState<Pick>('dyn');
  const [termijn, setTermijn] = useState<number | null>(null);

  const options = useMemo(() => {
    const dyn = rows.find((r) => r.contract.type === 'dynamisch');
    const vast = rows.find((r) => r.contract.type === 'vast');
    const mijn = rows.find((r) => r.contract.leverancier === current && r.contract.type === 'vast');
    return { dyn, vast, mijn };
  }, [rows, current]);
  const row = (pick === 'dyn' ? options.dyn : pick === 'vast' ? options.vast : options.mijn) ?? options.dyn ?? options.vast;
  const months = useMemo(() => (row ? monthlyCosts(row.scenario, row.outcome, year) : null), [row, year]);
  if (!row || !months) return null;

  const total = months.reduce((a, b) => a + b, 0);
  const evenly = Math.round(total / 12 / 5) * 5; // eerlijk gemiddelde, op 5 euro afgerond
  const t = termijn ?? (Number.isFinite(evenly) ? Math.max(0, evenly) : termijnbedrag);
  // reserve: wat je betaald hebt min wat het kost, per maand opgeteld
  const reserve = months.map((_, i) => t * (i + 1) - months.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const lowest = Math.min(...reserve);
  const worst = reserve.indexOf(lowest);
  const noArrears = Math.max(...months.map((_, i) => months.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1)));
  const winter = [10, 11, 0, 1, 2].reduce((a, m) => a + months[m], 0);
  const peak = Math.max(...months);
  const peakMonth = months.indexOf(peak);

  const values = {
    kosten: months.map((m) => Math.max(0, m)),
    terug: months.map((m) => Math.max(0, -m)),
  };
  const label = (r: SupplierRow | undefined) => (r ? `${r.contract.leverancier}, ${r.contract.type === 'dynamisch' ? 'dynamisch' : 'vast'}` : '');

  return (
    <Card
      title="Wat betekent dat per maand?"
      subtitle={`${row.contract.leverancier} (${row.contract.naam}): kosten per maand in 2027, zoals het model ze uitrekent. Onder de lijn krijg je geld terug.`}
      className="span-2"
      actions={
        <Segmented
          value={pick}
          options={[
            ...(options.dyn ? [{ value: 'dyn' as const, label: 'Beste dynamisch' }] : []),
            ...(options.vast ? [{ value: 'vast' as const, label: 'Beste vast' }] : []),
            ...(options.mijn ? [{ value: 'mijn' as const, label: current }] : []),
          ]}
          onChange={setPick}
        />
      }
    >
      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Zwaarste maand</span>
          <span className="kpi-value">{fmt.eur(peak)}</span>
          <span className="kpi-sub">in {FULL[peakMonth]}. Winter (nov t/m mrt) samen {fmt.eur(winter)}.</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Eerlijk termijnbedrag</span>
          <span className="kpi-value">{fmt.eur(Math.max(0, total / 12))}</span>
          <span className="kpi-sub">per maand, een twaalfde van {fmt.eur(total)} per jaar.</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Nooit achterlopen</span>
          <span className="kpi-value">{fmt.eur(Math.max(0, noArrears))}</span>
          <span className="kpi-sub">per maand: dan sta je nooit in het rood, maar krijg je aan het eind veel terug.</span>
        </div>
      </div>

      <div className="termijn-line">
        <span>Jouw termijnbedrag per maand:</span>
        <TermijnInput value={t} onChange={setTermijn} />
        <span className="hint">
          {lowest < 0
            ? `Laagste stand: ${fmt.eur(lowest)} eind ${FULL[worst]} (je loopt dan achter). Eind december staat je saldo op ${fmt.eur(reserve[11])}.`
            : `Je loopt nooit achter. Eind december staat je saldo op ${fmt.eur(reserve[11])}.`}
        </span>
      </div>

      <StackedColumns
        ariaLabel={`Kosten per maand in 2027 voor ${label(row)}, met je termijnbedrag als streep`}
        categories={MONTHS}
        categoryTitles={FULL}
        up={[{ key: 'kosten', label: 'Kosten', color: 'var(--series-1)' }]}
        down={[{ key: 'terug', label: 'Terug (je krijgt geld)', color: 'var(--series-4)' }]}
        values={values}
        height={240}
        format={(v) => fmt.eur(v)}
        markers={{ label: 'Jouw termijnbedrag', up: months.map(() => t) }}
        extraRows={(i) => [
          { label: 'Kosten deze maand', value: fmt.eur(months[i]), strong: true },
          { label: 'Saldo na termijn', value: fmt.eur(reserve[i]) },
        ]}
      />
      <p className="hint">
        Dit zijn de kosten volgens het model, gebaseerd op beursprijzen van {year.priceYear} en jouw verbruiksprofiel. Vaste kosten,
        netbeheer en de vermindering energiebelasting zijn gelijk over de maanden verdeeld. Een leverancier rekent zelf met een
        voorschot en past dat meestal na een paar maanden aan op je werkelijke verbruik.
      </p>
    </Card>
  );
}
