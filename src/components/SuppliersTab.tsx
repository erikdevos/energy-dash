import { useState } from 'react';
import type { SupplierData, SupplierRow } from '../model/suppliers';
import { Card } from './Card';
import { Segmented } from './controls';
import { fmt } from './charts/scale';

interface Props {
  data: SupplierData;
  /** ranglijst voor je huishouden zoals nu, en met de plannen die aan staan */
  nowRows: SupplierRow[];
  planRows: SupplierRow[];
  plansActive: boolean;
  /** je huidige leverancier, om te markeren */
  current: string;
  priceYear: number;
}

type Filter = 'alles' | 'vast' | 'dynamisch';

export function SuppliersTab({ data, nowRows, planRows, plansActive, current, priceYear }: Props) {
  const [household, setHousehold] = useState<'nu' | 'plannen'>(plansActive ? 'plannen' : 'nu');
  const [filter, setFilter] = useState<Filter>('alles');
  const [open, setOpen] = useState<string | null>(null);
  const all = household === 'plannen' ? planRows : nowRows;
  const rows = all.filter((r) => filter === 'alles' || r.contract.type === filter);
  const best = rows[0];
  const bestVast = all.find((r) => r.contract.type === 'vast');
  const bestDyn = all.find((r) => r.contract.type === 'dynamisch');
  const mine = all.find((r) => r.contract.leverancier === current && r.contract.type === 'vast');
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <>
      <section className="kpi-row span-2" aria-label="Beste keuzes">
        <div className="kpi">
          <span className="kpi-label">Goedkoopst voor jou in 2027</span>
          <span className="kpi-value good">{best ? best.contract.leverancier : '-'}</span>
          <span className="kpi-sub">
            {best && `${best.contract.naam}: ${fmt.eur(best.total)} per jaar, ${fmt.eur(best.total / 12)} per maand.`}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Beste vaste contract</span>
          <span className="kpi-value">{bestVast ? bestVast.contract.leverancier : '-'}</span>
          <span className="kpi-sub">
            {bestVast && `${fmt.eur(bestVast.total)} per jaar${bestDyn ? `, ${fmt.eur(bestVast.total - bestDyn.total)} meer dan het beste dynamische` : ''}.`}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Blijven bij {current} (vast)</span>
          <span className="kpi-value">{mine ? `${fmt.eur(mine.total)} per jaar` : '-'}</span>
          <span className="kpi-sub">{mine && best ? `${fmt.eur(mine.total - best.total)} per jaar duurder dan de goedkoopste optie.` : ''}</span>
        </div>
      </section>

      <Card
        title="Leveranciers voor 2027"
        subtitle="Verwachte stroomkosten per jaar zonder saldering, op jouw verbruik per uur. Klik een regel voor de opbouw."
        className="span-2"
        actions={
          <div className="supplier-filters">
            <Segmented
              value={household}
              options={[
                { value: 'nu', label: 'Zoals nu' },
                { value: 'plannen', label: 'Met plannen' },
              ]}
              onChange={setHousehold}
            />
            <Segmented
              value={filter}
              options={[
                { value: 'alles', label: 'Alles' },
                { value: 'vast', label: 'Vast' },
                { value: 'dynamisch', label: 'Dynamisch' },
              ]}
              onChange={setFilter}
            />
          </div>
        }
      >
        {household === 'plannen' && !plansActive && (
          <p className="hint">Er staan nog geen plannen aan. Zet ze aan op het Overzicht om het effect te zien.</p>
        )}
        <div className="supplier-list" role="list">
          {rows.map((r, i) => {
            const id = r.contract.id;
            const isMine = r.contract.leverancier === current && r.contract.type === 'vast';
            return (
              <div key={id} role="listitem" className={`supplier ${isMine ? 'mine' : ''}`}>
                <button type="button" className="supplier-row" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
                  <span className="supplier-rank">{i + 1}</span>
                  <span className="supplier-name">
                    <strong>{r.contract.leverancier}</strong>
                    <span className="supplier-sub">
                      {r.contract.naam}
                      {isMine && ' · je huidige leverancier'}
                    </span>
                  </span>
                  <span className="supplier-track" aria-hidden="true">
                    <span className={`supplier-bar ${r.contract.type}`} style={{ width: `${(r.total / max) * 100}%` }} />
                  </span>
                  <span className="supplier-total">
                    <strong>{fmt.eur(r.total)}</strong>
                    <span className="supplier-sub">{fmt.eur(r.total / 12)} p/m</span>
                  </span>
                  <span className="supplier-delta">{i === 0 ? 'goedkoopst' : `+${fmt.eur(r.total - rows[0].total)}`}</span>
                </button>
                {open === id && (
                  <div className="supplier-detail">
                    <div>
                      <span className="k">Stroom en energiebelasting</span>
                      <span className="v small">{fmt.eur(r.stroom)}</span>
                    </div>
                    <div>
                      <span className="k">Teruglevering (vergoeding min kosten)</span>
                      <span className="v small">{fmt.eur(r.teruglevering)}</span>
                    </div>
                    <div>
                      <span className="k">Vaste leveringskosten{r.vasteKostenGeschat ? ' (aanname)' : ''}</span>
                      <span className="v small">{fmt.eur(r.vast)}</span>
                    </div>
                    <div>
                      <span className="k">Netbeheer en vermindering EB</span>
                      <span className="v small">{fmt.eur(r.overig)}</span>
                    </div>
                    <p className="hint">
                      {r.contract.type === 'vast'
                        ? `Stroom ${fmt.perKwh(r.contract.stroomAllIn2026 ?? 0)} per kWh nu (incl. belasting 2026); teruglevering ${fmt.perKwh(r.contract.tlv2027 ?? 0)} vergoeding, ${fmt.perKwh(r.contract.tlk2027 ?? 0)} kosten.`
                        : `Beursprijs + ${fmt.perKwh(r.contract.opslag ?? 0)} per kWh; teruglevering beursprijs${r.contract.terugleverBonus ? ` + ${fmt.pct(r.contract.terugleverBonus)} bonus` : ''}${
                            r.contract.terugleverOpslag ? ` ${r.contract.terugleverOpslag > 0 ? '−' : '+'} ${fmt.perKwh(Math.abs(r.contract.terugleverOpslag))}` : ''
                          }. Panelen afschakelen bij negatieve prijs.`}{' '}
                      {r.contract.opmerking ?? ''} Bron: {r.contract.bron}.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="hint">
          Aannames: het kale stroomtarief van vaste contracten blijft in 2027 gelijk aan het aanbod van nu; energiebelasting 2027
          volgens het Belastingplan (voorstel). Dynamisch rekent met de beursprijzen van {priceYear}. Vaste leveringskosten die een
          leverancier niet publiceert, staan op {fmt.eur2(data.vasteKostenAanname)} per maand (aanname). Welkomstkortingen tellen niet
          mee. Bijgewerkt: {data.bijgewerkt}.
        </p>
        <p className="hint">
          Bronnen:{' '}
          {data.bronnen.map((b, i) => (
            <span key={b.url}>
              {i > 0 && ', '}
              <a href={b.url} target="_blank" rel="noreferrer">
                {b.naam}
              </a>
            </span>
          ))}
        </p>
      </Card>
    </>
  );
}
