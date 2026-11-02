import type { Aanbieding } from '../lib/api';
import { run } from '../model/costs';
import type { SupplierRow } from '../model/suppliers';
import type { YearData } from '../model/types';
import { Card } from './Card';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

interface Props {
  offer: Aanbieding;
  /** ranglijst voor jouw huishouden (zoals nu of met plannen) */
  rows: SupplierRow[];
  year: YearData;
}

const FACTORS = [0.8, 1, 1.25, 1.5, 2];

/** Een persoonlijk aanbod naast het model: dezelfde regels, en hoe gevoelig het is voor het prijsniveau. */
export function OfferCard({ offer, rows, year }: Props) {
  const mine = rows.find((r) => r.contract.id === offer.contractId);
  const fixedTotal = rows.find((r) => r.contract.type === 'vast')?.total ?? null;
  const line = (k: string) => mine?.outcome.costs.find((l) => l.key === k)?.eur ?? 0;
  const imp = mine?.outcome.totals.imp ?? 0;
  const exp = mine?.outcome.totals.exp ?? 0;

  // vijf doorrekeningen (ca. 30 ms); alleen zichtbaar op dit tabblad
  const sens = mine
    ? FACTORS.map((f) => ({ f, own: run({ ...mine.scenario, contract: { ...mine.scenario.contract, prijsSchaal: f } }, year).total, fixed: fixedTotal }))
    : [];

  if (!mine) return null;
  const r = offer.regels;
  // gemiddelde prijzen per kWh in het aanbod, zonder energiebelasting
  const offerBuy = (r.verbruik + r.inkoopvergoeding) / offer.afnameKwh;
  const offerSell = -(r.terugleververgoeding + r.zonnebonus) / offer.terugKwh;
  const modelBuy = imp ? line('levering') / imp : 0;
  const modelSell = exp ? -line('terug') / exp : 0;

  return (
    <Card
      title={`Jouw aanbod van ${offer.leverancier}`}
      subtitle={`Opgeslagen op ${new Date(offer.datum).toLocaleDateString('nl-NL')}. Zo verhoudt het zich tot wat het model voor hetzelfde contract rekent.`}
      className="span-2"
    >
      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Aanbod</span>
          <span className="kpi-value">{fmt.eur(offer.jaarkosten)}</span>
          <Rich as="span" className="kpi-sub">
            per jaar, {fmt.eur(offer.perMaand)} per maand{offer.perMaandSlim ? `, ${fmt.eur(offer.perMaandSlim)} met slim verbruik` : ''}.
          </Rich>
        </div>
        <div className="kpi">
          <span className="kpi-label">Model</span>
          <span className="kpi-value">{fmt.eur(mine.total)}</span>
          <Rich as="span" className="kpi-sub">per jaar voor hetzelfde contract, {fmt.eur(mine.total - offer.jaarkosten)} meer dan het aanbod.</Rich>
        </div>
        <div className="kpi">
          <span className="kpi-label">Waar het verschil zit</span>
          <span className="kpi-value small">Prijsniveau op zonuren</span>
          <Rich as="span" className="kpi-sub">
            Aanbod: {fmt.perKwh(offerSell)} per kWh teruglevering; model: {fmt.perKwh(modelSell)} (incl. bonus).
          </Rich>
        </div>
      </div>

      <div className="supplier-list" role="list">
        {[
          ['Afname', `${fmt.int(offer.afnameKwh)} kWh`, `${fmt.int(imp)} kWh`],
          ['Teruglevering', `${fmt.int(offer.terugKwh)} kWh`, `${fmt.int(exp)} kWh`],
          ['Gemiddelde afnameprijs (zonder belasting)', `${fmt.perKwh(offerBuy)} per kWh`, `${fmt.perKwh(modelBuy)} per kWh`],
          ['Gemiddelde terugleverprijs (met bonus)', `${fmt.perKwh(offerSell)} per kWh`, `${fmt.perKwh(modelSell)} per kWh`],
          ['Energiebelasting', fmt.eur(r.energiebelasting), fmt.eur(line('eb'))],
          ['Vaste leveringskosten', fmt.eur(r.vasteKosten), fmt.eur(line('vast'))],
          ['Netbeheer en vermindering', fmt.eur(r.netbeheer + r.verminderingEB), fmt.eur(line('net') + line('verm'))],
        ].map(([label, o, m]) => (
          <div key={label} role="listitem" className="supplier">
            <div className="supplier-row">
              <span className="supplier-name">
                <strong>{label}</strong>
              </span>
              <span className="supplier-total">
                <strong>{o}</strong>
                <Rich as="span" className="supplier-sub">model: {m}</Rich>
              </span>
            </div>
          </div>
        ))}
      </div>

      <h3 className="card-subhead">Hoe gevoelig is dit voor de prijzen?</h3>
      <Rich as="p" className="hint">
        Alle beursprijzen van {year.priceYear} met een factor vermenigvuldigd. Een vast contract hangt niet van de beurs af.
      </Rich>
      <div className="supplier-list" role="list">
        {sens.map((s) => (
          <div key={s.f} role="listitem" className="supplier">
            <div className="supplier-row">
              <span className="supplier-name">
                <strong>Prijsniveau {s.f.toLocaleString('nl-NL')}×</strong>
              </span>
              <span className="supplier-total">
                <strong>{fmt.eur(s.own)}</strong>
                <Rich as="span" className="supplier-sub">
                  {s.fixed !== null ? `beste vast ${fmt.eur(s.fixed)}${s.own < s.fixed ? ' (dynamisch goedkoper)' : ' (vast goedkoper)'}` : ''}
                </Rich>
              </span>
            </div>
          </div>
        ))}
      </div>
      <Rich as="p" className="hint">
        Voorwaarden: {offer.voorwaarden.join('; ')}. {offer.opmerking ?? ''}
      </Rich>
    </Card>
  );
}
