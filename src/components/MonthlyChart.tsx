import { useState } from 'react';
import { MONTHS } from '../model/calendar';
import type { Outcome } from '../model/types';
import { Card } from './Card';
import { StackedColumns } from './charts/StackedColumns';
import { fmt } from './charts/scale';
import { FLOW_SERIES } from './charts/series';
import { Segmented } from './controls';

const FULL_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export interface MeasuredYear {
  year: number;
  /** per maand, null = geen (volledige) meting */
  imp: Array<number | null>;
  exp: Array<number | null>;
}

interface Props {
  outcome: Outcome;
  measured: MeasuredYear[];
  /** jaar dat standaard als gemeten wordt getoond (bv. het jaar waarop is afgestemd) */
  defaultYear?: number;
}

export function MonthlyChart({ outcome, measured, defaultYear }: Props) {
  const fallback = defaultYear ?? measured[measured.length - 1]?.year;
  const [yearSel, setYearSel] = useState<string>(fallback ? String(fallback) : 'geen');
  const m = outcome.monthly;
  const meas = measured.find((y) => String(y.year) === yearSel) ?? null;
  const values = {
    zon: m.map((r) => r.pvDirect),
    bat: m.map((r) => r.batDischarge),
    imp: m.map((r) => r.imp),
    exp: m.map((r) => r.exp),
  };
  const cell = (v: number | null) => (v === null ? '-' : fmt.int(v));
  const table = (
    <table className="data-table">
      <thead>
        <tr>
          <th>Maand</th>
          <th>Verbruik</th>
          <th>Opwek</th>
          <th>Direct van zon</th>
          <th>Uit batterij</th>
          <th>Van het net</th>
          <th>Teruggeleverd</th>
          {meas && <th>Gemeten afname {meas.year}</th>}
          {meas && <th>Gemeten terug {meas.year}</th>}
        </tr>
      </thead>
      <tbody>
        {m.map((r) => (
          <tr key={r.month}>
            <td>{FULL_MONTHS[r.month]}</td>
            <td>{fmt.int(r.load)}</td>
            <td>{fmt.int(r.pv)}</td>
            <td>{fmt.int(r.pvDirect)}</td>
            <td>{fmt.int(r.batDischarge)}</td>
            <td>{fmt.int(r.imp)}</td>
            <td>{fmt.int(r.exp)}</td>
            {meas && <td>{cell(meas.imp[r.month])}</td>}
            {meas && <td>{cell(meas.exp[r.month])}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <Card
      title="Stroom per maand"
      subtitle="Kolommen: model. Streepjes: gemeten bij Greenchoice. Boven de lijn waar je verbruik vandaan komt, eronder wat je teruglevert (kWh)."
      table={table}
      actions={
        measured.length > 0 ? (
          <Segmented
            value={yearSel}
            options={[...measured.map((y) => ({ value: String(y.year), label: String(y.year) })), { value: 'geen', label: 'Geen' }]}
            onChange={setYearSel}
          />
        ) : undefined
      }
    >
      <StackedColumns
        ariaLabel="Gestapelde kolommen per maand: verbruik uit zon, batterij en net, en teruglevering, met gemeten waarden als streepjes"
        categories={MONTHS}
        categoryTitles={FULL_MONTHS}
        up={[FLOW_SERIES.imp, FLOW_SERIES.bat, FLOW_SERIES.zon]}
        down={[FLOW_SERIES.exp]}
        values={values}
        height={280}
        markers={meas ? { label: `Gemeten ${meas.year}`, up: meas.imp, down: meas.exp } : undefined}
        extraRows={(i) => [
          { label: 'Totaal verbruik (model)', value: fmt.kwh(m[i].load), strong: true },
          { label: 'Opwek zonnepanelen (model)', value: fmt.kwh(m[i].pv), strong: true },
        ]}
      />
    </Card>
  );
}
