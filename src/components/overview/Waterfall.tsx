import { useState } from 'react';
import type { Step } from '../../model/overview';
import { fmt } from '../charts/scale';

/**
 * Horizontale watervalgrafiek: per rij een stand (totaal) of een stap omhoog/omlaag in € per jaar.
 * Stappen dragen hun teken in het label, zodat kleur nooit de enige drager is.
 */
export function Waterfall({ steps }: { steps: Step[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // lopende stand per rij
  const rows = steps.reduce<Array<Step & { from: number; to: number }>>((acc, s) => {
    const running = acc.length ? acc[acc.length - 1].to : 0;
    acc.push(s.kind === 'total' ? { ...s, from: 0, to: s.value } : { ...s, from: running, to: running + s.value });
    return acc;
  }, []);
  const lo = Math.min(0, ...rows.map((r) => Math.min(r.from, r.to)));
  const hi = Math.max(0, ...rows.map((r) => Math.max(r.from, r.to)));
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="waterfall" role="table" aria-label="Van je kosten nu naar 2027, stap voor stap">
      {rows.map((r, i) => {
        const left = pos(Math.min(r.from, r.to));
        const width = Math.max(0.6, Math.abs(pos(r.to) - pos(r.from)));
        const cls = r.kind === 'total' ? 'total' : r.value > 0 ? 'up' : 'down';
        const value =
          r.kind === 'total'
            ? `${fmt.eur(r.value)} per jaar`
            : `${r.value > 0 ? '+' : '−'} ${fmt.eur(Math.abs(r.value)).replace('€ ', '€ ')}`;
        return (
          <div
            key={i}
            className={`wf-row ${cls} ${hover === i ? 'hover' : ''}`}
            role="row"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="wf-label" role="rowheader">
              <span>{r.label}</span>
              {r.detail && <span className="wf-detail">{r.detail}</span>}
            </div>
            <div className="wf-track" role="cell" aria-hidden="true">
              <span className="wf-zero" style={{ left: `${pos(0)}%` }} />
              <span className={`wf-bar ${cls}`} style={{ left: `${left}%`, width: `${width}%` }} />
              {i > 0 && <span className="wf-link" style={{ left: `${pos(r.from)}%` }} />}
            </div>
            <div className={`wf-value ${cls}`} role="cell">
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
