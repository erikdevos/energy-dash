import { useState } from 'react';
import type { Insight } from '../../model/insights';
import { PLAN_LABELS, PLAN_ORDER, type PlanId, type Step } from '../../model/overview';
import type { Settlement } from '../../model/settlement';
import type { Outcome } from '../../model/types';
import { Card } from '../Card';
import { Segmented } from '../controls';
import { fmt } from '../charts/scale';
import { TermijnInput } from '../Summary';
import { EnergySplit } from './EnergySplit';
import { Waterfall } from './Waterfall';
import { Rich } from '../Rich';

export type Tab = 'overzicht' | 'doel' | 'nu' | 'verbruik' | 'scenarios' | 'leveranciers' | 'apparaten' | 'gegevens';

interface Props {
  settlement: Settlement | null;
  termijnbedrag: number;
  onTermijnbedrag: (v: number) => void;
  /** kosten nu (huidig contract) */
  now: number;
  /** 2027 met het gekozen contract, zonder en met plannen */
  statusQuo2027: number;
  withPlans2027: number;
  contract: 'dyn2027' | 'vast2027';
  onContract: (c: 'dyn2027' | 'vast2027') => void;
  steps: Step[];
  plansOn: Record<PlanId, boolean>;
  onTogglePlan: (id: PlanId) => void;
  insights: Insight[];
  onTab: (t: Tab) => void;
  /** huidig vermogen in W (positief = afname), null zonder meting */
  liveW: number | null;
  nowOutcome: Outcome;
  plannedOutcome: Outcome | null;
}

const contractName = { dyn2027: 'dynamisch contract', vast2027: 'vast contract' };

export function Overview(p: Props) {
  const anyPlan = Object.values(p.plansOn).some(Boolean);
  const [splitView, setSplitView] = useState<'balken' | 'treemap'>('balken');
  const s = p.settlement;
  const delta = p.statusQuo2027 - p.now;
  // het plan dat het meest oplevert, van de plannen die aanstaan
  const bestPlan = p.steps.filter((x) => x.kind === 'delta' && x.toggle?.on && x.value < 0).sort((a, b) => a.value - b.value)[0];
  return (
    <>
      <section className="sit span-2" aria-label="Jouw situatie">
        <div className="sit-top">
          <div className="sit-main">
            <span className="eyebrow">Jouw situatie</span>
            <h2 className="sit-title">Vanaf 2027 betaal je zo'n {fmt.eur(p.statusQuo2027)} per jaar voor stroom.</h2>
            <Rich as="p" className="sit-sub">
              {delta > 0
                ? `Dat is ${fmt.eur(delta)} meer dan nu, vooral doordat de saldering stopt.`
                : `Dat is ${fmt.eur(-delta)} minder dan nu.`}{' '}
              {anyPlan
                ? `Met jouw plannen blijft er ${fmt.eur(p.withPlans2027)} over${bestPlan ? `, met ${bestPlan.label.toLowerCase()} als grootste besparing (${fmt.eur(-bestPlan.value)} per jaar)` : ''}.`
                : 'Zet hieronder je plannen aan om te zien wat ze opleveren.'}
            </Rich>
          </div>
          <div className="sit-aside">
            {p.liveW !== null && (
              <span className="sit-live">
                <span className="live-dot" aria-hidden="true" />
                {p.liveW >= 0 ? 'Nu van het net' : 'Nu terug aan het net'} <strong>{fmt.one(Math.abs(p.liveW) / 1000)} kW</strong>
              </span>
            )}
            <button type="button" className="primary-btn" onClick={() => p.onTab('doel')}>
              Bekijk het plan
            </button>
          </div>
        </div>
        <div className="sit-stats">
          <div className="stat-block">
            <span className="kpi-label">Dit jaar · eindnota 31 december</span>
            {s ? (
              <span className={`kpi-value ${s.saldo <= 0 ? 'good' : 'bad'}`}>
                {s.saldo <= 0 ? `${fmt.eur(-s.saldo)} terug` : `${fmt.eur(s.saldo)} bijbetalen`}
              </span>
            ) : (
              <span className="kpi-value">-</span>
            )}
            <Rich as="span" className="kpi-sub">Je vaste contract én de saldering stoppen op 1 januari 2027.</Rich>
            <div className="kpi-inline">
              <span className="k">Termijnbedrag per maand</span>
              <TermijnInput value={p.termijnbedrag} onChange={p.onTermijnbedrag} />
            </div>
          </div>
          <div className="stat-block">
            <span className="kpi-label">Vanaf 2027 · zonder plannen</span>
            <span className="kpi-value bad">{fmt.eur(p.statusQuo2027)} per jaar</span>
            <Rich as="span" className="kpi-sub">
              met een {contractName[p.contract]}. Nu is dat {fmt.eur(p.now)}: zo'n {fmt.eur(p.statusQuo2027 - p.now)} per jaar meer, vooral
              doordat de saldering stopt.
            </Rich>
          </div>
          <div className="stat-block highlight">
            <span className="kpi-label">Vanaf 2027 · met jouw plannen</span>
            <span className={`kpi-value ${anyPlan ? 'good' : ''}`}>{fmt.eur(p.withPlans2027)} per jaar</span>
            <Rich as="span" className="kpi-sub">
              {anyPlan
                ? `Je plannen schelen zo'n ${fmt.eur(p.statusQuo2027 - p.withPlans2027)} per jaar.`
                : 'Zet hieronder je plannen aan om te zien wat ze opleveren.'}
            </Rich>
          </div>
        </div>
      </section>

      <Card
        title="De weg naar 2027"
        subtitle="Wat er met je jaarlijkse stroomkosten gebeurt als de saldering stopt, en wat elk plan terugwint."
        className="span-2"
        actions={
          <div className="chip-row" role="radiogroup" aria-label="Contract in 2027">
            {(['dyn2027', 'vast2027'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={p.contract === c}
                className={`chip ${p.contract === c ? 'chip-on' : ''}`}
                onClick={() => p.onContract(c)}
              >
                {c === 'dyn2027' ? 'Dynamisch' : 'Vast'}
              </button>
            ))}
          </div>
        }
      >
        <div className="plan-toggles" aria-label="Jouw plannen">
          <span className="k">Jouw plannen:</span>
          {PLAN_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`plan-toggle ${p.plansOn[id] ? 'on' : ''}`}
              aria-pressed={p.plansOn[id]}
              onClick={() => p.onTogglePlan(id)}
            >
              <span className="plan-dot" aria-hidden="true" />
              {PLAN_LABELS[id]}
            </button>
          ))}
        </div>
        <Waterfall steps={p.steps} />
        <Rich as="p" className="hint">
          Bedragen zijn verwachte stroomkosten per jaar, incl. vaste kosten, netbeheer en vermindering energiebelasting. Pellets
          vallen erbuiten. De aannames per plan pas je aan onder <button type="button" className="link-btn" onClick={() => p.onTab('scenarios')}>Scenario's</button>.
        </Rich>
      </Card>

      <section className="insights span-2" aria-label="Inzichten">
        {p.insights.map((i) => (
          <article key={i.id} className={`insight tone-${i.tone}`}>
            <h3>{i.title}</h3>
            <p>
              <strong className="insight-value">{i.value}</strong> {i.text}
            </p>
            {i.tab && (
              <button type="button" className="link-btn" onClick={() => p.onTab(i.tab!)}>
                Bekijk details
              </button>
            )}
          </article>
        ))}
      </section>

      <Card
        title="Waar gaat je stroom naartoe"
        subtitle="Je verbruik in huis per jaar, per onderdeel. Verwarming en boiler zijn samen de helft."
        className="span-2"
        actions={
          <>
            <Segmented
              label="Weergave"
              value={splitView}
              options={[
                { value: 'balken', label: 'Balken' },
                { value: 'treemap', label: 'Treemap' },
              ]}
              onChange={setSplitView}
            />
            <button type="button" className="ghost-btn" onClick={() => p.onTab('verbruik')}>
              Per maand
            </button>
          </>
        }
      >
        <EnergySplit now={p.nowOutcome} planned={anyPlan ? p.plannedOutcome : null} view={splitView} />
      </Card>
    </>
  );
}
