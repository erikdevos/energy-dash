import type { Outcome } from '../model/types';
import { Card } from './Card';
import { fmt } from './charts/scale';

/** Kostenopbouw als lijst: kosten naar rechts, opbrengsten naar links vanaf één nullijn. */
export function CostBreakdown({ outcome, reference }: { outcome: Outcome; reference: Outcome }) {
  const lines = outcome.costs.filter((l) => Math.abs(l.eur) >= 0.5 || l.key === 'levering');
  const max = Math.max(...outcome.costs.map((l) => Math.abs(l.eur)), 1);
  const refByKey = new Map(reference.costs.map((l) => [l.key, l.eur]));
  return (
    <Card title="Kostenopbouw" subtitle="Per jaar, incl. BTW. Rechts betaal je, links krijg je terug.">
      <div className="breakdown">
        {lines.map((l) => {
          const w = (Math.abs(l.eur) / max) * 50;
          const ref = refByKey.get(l.key) ?? 0;
          const diff = l.eur - ref;
          return (
            <div key={l.key} className="breakdown-row">
              <span className="breakdown-label">{l.label}</span>
              <span className="breakdown-track" aria-hidden="true">
                <span className="breakdown-zero" />
                <span
                  className={l.eur >= 0 ? 'breakdown-bar cost' : 'breakdown-bar credit'}
                  style={l.eur >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                />
              </span>
              <span className="breakdown-value">{fmt.eur(l.eur)}</span>
              <span className={`breakdown-diff ${Math.abs(diff) < 1 ? '' : diff < 0 ? 'good' : 'bad'}`}>
                {Math.abs(diff) < 1 ? '' : `${diff > 0 ? '+' : '-'}${fmt.eur(Math.abs(diff)).replace('€ ', '€')}`}
              </span>
            </div>
          );
        })}
        <div className="breakdown-row total">
          <span className="breakdown-label">Totaal</span>
          <span />
          <span className="breakdown-value">{fmt.eur(outcome.total)}</span>
          <span className="breakdown-diff muted">t.o.v. start</span>
        </div>
      </div>
    </Card>
  );
}
