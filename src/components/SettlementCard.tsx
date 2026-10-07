import type { Settlement } from '../model/settlement';
import { Card } from './Card';
import { fmt } from './charts/scale';

const datum = (iso: string) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
const imp = (f: { impN: number; impD: number }) => f.impN + f.impD;
const exp = (f: { expN: number; expD: number }) => f.expN + f.expD;

/** Verwachte eindnota van het lopende contract, met saldering tot de einddatum. */
export function SettlementCard({ s, termijnbedrag }: { s: Settlement; termijnbedrag: number }) {
  const laatsteDag = new Date(new Date(s.tot).getTime() - 86_400_000).toISOString();
  const netto = exp(s.totaal) - imp(s.totaal);
  const rows: Array<[string, number]> = [
    ['Stroom na saldering', s.stroom],
    ['Energiebelasting', s.energiebelasting],
    ['Terugleververgoeding', -s.vergoeding],
    [`Vaste leveringskosten (${s.maanden} mnd)`, s.vast],
    ['Netbeheerkosten', s.netbeheer],
    ['Vermindering energiebelasting', -s.vermindering],
  ];
  const rest = s.maanden - s.maandenGefactureerd;
  // Termijnbedrag voor de resterende maanden waarbij de eindnota op nul uitkomt.
  const quitte = rest > 0 ? Math.max(0, (s.kosten - s.termijnenGefactureerd) / rest) : null;
  return (
    <Card
      title="Afrekening huidig contract"
      subtitle={`${datum(s.van)} t/m ${datum(laatsteDag)} · ${s.gemeten ? 'gemeten tot nu + verwachting model' : 'verwachting model'}`}
    >
      <p className={`settle-result ${s.saldo <= 0 ? 'good' : 'bad'}`}>
        {s.saldo <= 0 ? `Je krijgt ongeveer ${fmt.eur(-s.saldo)} terug` : `Je betaalt ongeveer ${fmt.eur(s.saldo)} bij`}
      </p>
      <p className="settle-sub">
        Netto lever je in deze periode ~{fmt.int(Math.max(0, exp(s.totaal) - imp(s.totaal)))} kWh meer terug dan je afneemt. Je
        betaalt {fmt.eur2(termijnbedrag)} per maand{quitte !== null && quitte < termijnbedrag ? '; dat mag de laatste maanden ook € 0 zijn' : ''}.
      </p>
      <details className="details">
        <summary>Hoe komt dit bedrag tot stand?</summary>
      <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>kWh</th>
                {s.gemeten && <th>Gemeten</th>}
                <th>{s.gemeten ? 'Verwacht rest' : 'Verwacht'}</th>
                <th>Totaal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Afname</td>
                {s.gemeten && <td>{fmt.int(imp(s.gemeten))}</td>}
                <td>{fmt.int(imp(s.verwacht))}</td>
                <td>{fmt.int(imp(s.totaal))}</td>
              </tr>
              <tr>
                <td>Teruglevering</td>
                {s.gemeten && <td>{fmt.int(exp(s.gemeten))}</td>}
                <td>{fmt.int(exp(s.verwacht))}</td>
                <td>{fmt.int(exp(s.totaal))}</td>
              </tr>
              <tr>
                <td>{netto >= 0 ? 'Netto teruglevering' : 'Netto afname'}</td>
                {s.gemeten && <td />}
                <td />
                <td>{fmt.int(Math.abs(netto))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="breakdown settle-lines">
          {rows
            .filter(([, v]) => Math.abs(v) >= 0.5)
            .map(([label, v]) => (
              <div key={label} className="settle-line">
                <span>{label}</span>
                <span>{fmt.eur2(v)}</span>
              </div>
            ))}
          <div className="settle-line total">
            <span>Kosten periode</span>
            <span>{fmt.eur2(s.kosten)}</span>
          </div>
          <div className="settle-line">
            <span>Termijnen (gefactureerd + nog te gaan)</span>
            <span>{fmt.eur2(-s.termijnen)}</span>
          </div>
          <div className="settle-line total">
            <span>Verwachte eindnota</span>
            <span>{fmt.eur2(s.saldo)}</span>
          </div>
        </div>
      </details>
      <p className="hint">
        Je vaste contract loopt af op {datum(s.tot)}, op dezelfde dag dat de saldering stopt. Daarna kies je een nieuw
        contract: zie "Contracten vergeleken".
      </p>
    </Card>
  );
}
