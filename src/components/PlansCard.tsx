import type { PlanRow } from '../model/plans';
import { Card } from './Card';
import { fmt } from './charts/scale';

interface Props {
  rows: PlanRow[];
  total: PlanRow | null;
  /** kolomkoppen, in dezelfde volgorde als PlanRow.eur */
  columns: string[];
  onApplyPlans: () => void;
  onRevert: () => void;
}

function Eur({ v }: { v: number }) {
  if (Math.abs(v) < 1) return <span className="muted">€ 0</span>;
  return <span className={v > 0 ? 'good' : 'bad'}>{v > 0 ? `${fmt.eur(v)} minder` : `${fmt.eur(-v)} meer`}</span>;
}

export function PlansCard({ rows, total, columns, onApplyPlans, onRevert }: Props) {
  return (
    <Card
      title="Jouw plannen"
      subtitle="Wat elke maatregel per jaar scheelt, bovenop de andere. Vergeleken met je huidige situatie, per contractvorm."
      className="span-2"
      actions={
        <>
          <button type="button" className="primary-btn" onClick={onApplyPlans}>
            Zet mijn plannen aan
          </button>
          {rows.length > 0 && (
            <button type="button" className="ghost-btn" onClick={onRevert}>
              Alles uit
            </button>
          )}
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="hint">
          Nog geen maatregelen aan. "Zet mijn plannen aan" rekent met de Daikin Perfera 3,5 kW in de centrale ruimte
          (60% van de warmte, SCOP 4,5), nieuwe kozijnen en garagedeur (45% minder warmtevraag, jouw verwachting 40-50%)
          en 70% van wassen, drogen en vaatwasser overdag. Daarna kun je elk getal links bij de schuifjes aanpassen.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table plans">
            <thead>
              <tr>
                <th>Maatregel</th>
                <th>Minder afname</th>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows, ...(total ? [total] : [])].map((r) => (
                <tr key={r.id} className={r.id === 'totaal' ? 'total-row' : ''}>
                  <td>
                    <strong>{r.label}</strong>
                    {r.detail && <span className="plan-detail">{r.detail}</span>}
                  </td>
                  <td>{fmt.kwh(r.kwh)}</td>
                  {r.eur.map((v, k) => (
                    <td key={k}>
                      <Eur v={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        Met saldering (2026) levert verschuiven naar zonuren nauwelijks iets op: teruggeleverde stroom telt dan even zwaar als
        afgenomen stroom. Zonder saldering (2027) wel. Airco en kozijnen verlagen allebei de stookstroom, dus samen leveren ze
        minder op dan los opgeteld. De besparing door de kozijnen is jouw schatting; na deze winter laat de maanddata zien
        wat het echt was.
      </p>
    </Card>
  );
}
