import { useState } from 'react';
import { selfConsumption, selfSufficiency } from '../model/costs';
import type { Settlement } from '../model/settlement';
import type { Outcome, Scenario } from '../model/types';
import { fmt } from './charts/scale';

export interface Investment {
  label: string;
  /** besparing per jaar t.o.v. dezelfde situatie zonder deze maatregel */
  savings: number;
  price: number;
}

interface Props {
  outcome: Outcome;
  reference: Outcome;
  scenario: Scenario;
  scenarioLabel: string;
  investments: Investment[];
  termijnbedrag: number;
  onTermijnbedrag: (v: number) => void;
  settlement: Settlement | null;
}

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 1) return <span className="delta neutral">gelijk aan je startpunt</span>;
  const lower = value < 0;
  return (
    <span className={`delta ${lower ? 'good' : 'bad'}`}>
      <span aria-hidden="true">{lower ? '▼' : '▲'}</span> {fmt.eur(Math.abs(value))} {lower ? 'goedkoper' : 'duurder'} dan je startpunt
    </span>
  );
}

export function TermijnInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'));
    if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * 100) / 100);
    setDraft(null);
  };
  return (
    <span className="termijn-input">
      <button type="button" className="icon-btn" onClick={() => onChange(Math.max(0, value - 5))} aria-label="Termijnbedrag 5 euro lager">
        −
      </button>
      <span className="euro">€</span>
      <input
        className="num-input"
        inputMode="decimal"
        aria-label="Termijnbedrag per maand"
        value={draft ?? String(value).replace('.', ',')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button type="button" className="icon-btn" onClick={() => onChange(value + 5)} aria-label="Termijnbedrag 5 euro hoger">
        +
      </button>
    </span>
  );
}

export function Summary({ outcome, reference, scenario, scenarioLabel, investments, termijnbedrag, onTermijnbedrag, settlement }: Props) {
  const t = outcome.totals;
  const advies = Math.max(0, outcome.total / 12);
  return (
    <section className="card hero-card span-2" aria-live="polite">
      <div className="hero">
        <div>
          <p className="hero-label">Verwachte energiekosten per jaar</p>
          <p className="hero-value">{fmt.eur(outcome.total)}</p>
          <p className="hero-sub">
            ongeveer {fmt.eur(outcome.total / 12)} per maand · {scenarioLabel}
          </p>
          <Delta value={outcome.total - reference.total} />
          <div className="termijn">
            <div className="termijn-row">
              <span className="k">Termijnbedrag Greenchoice per maand</span>
              <TermijnInput value={termijnbedrag} onChange={onTermijnbedrag} />
            </div>
            <p className="hint">
              Bij dit scenario past ongeveer {fmt.eur(advies)} per maand
              {settlement &&
                ` · eindnota huidig contract: ${settlement.saldo <= 0 ? `ca. ${fmt.eur(-settlement.saldo)} terug` : `ca. ${fmt.eur(settlement.saldo)} bijbetalen`}`}
            </p>
          </div>
        </div>
        <div className="stat-grid">
          <Stat label="Verbruik" value={fmt.kwh(t.load)} note={t.ev > 0 ? `waarvan auto ${fmt.kwh(t.ev)}` : undefined} />
          <Stat label="Opwek zonnepanelen" value={fmt.kwh(t.pv)} note={t.curtailed > 1 ? `${fmt.kwh(t.curtailed)} afgeschakeld` : undefined} />
          <Stat label="Van het net" value={fmt.kwh(t.imp)} />
          <Stat label="Teruggeleverd" value={fmt.kwh(t.exp)} />
          <Stat label="Eigen verbruik zonnestroom" value={fmt.pct(selfConsumption(t))} />
          <Stat label="Zelfvoorzienend" value={fmt.pct(selfSufficiency(t, scenario.batterij.rendement))} />
          {investments.map((inv) => (
            <Stat
              key={inv.label}
              label={`${inv.label} bespaart`}
              value={`${fmt.eur(inv.savings)} per jaar`}
              note={
                inv.savings > 0 && inv.price > 0
                  ? `terugverdiend in ${fmt.one(inv.price / inv.savings)} jaar bij ${fmt.eur(inv.price)}`
                  : inv.savings > 0
                    ? 'vul een aanschafprijs in voor de terugverdientijd'
                    : 'verdient zich in dit scenario niet terug'
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
