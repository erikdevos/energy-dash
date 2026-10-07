import type { Outcome } from '../../model/types';
import { fmt } from '../charts/scale';

const PARTS = [
  { key: 'verwarming', label: 'Verwarming', color: 'var(--comp-4)', ink: '#fff' },
  { key: 'boiler', label: 'Boiler', color: 'var(--comp-2)', ink: 'var(--on-comp-2)' },
  { key: 'huishouden', label: 'Huishouden', color: 'var(--comp-1)', ink: '#fff' },
  { key: 'was', label: 'Was en vaat', color: 'var(--comp-3)', ink: '#fff' },
  { key: 'koelen', label: 'Koelen', color: 'var(--comp-5)', ink: '#fff' },
] as const;

type Key = (typeof PARTS)[number]['key'];

function totals(o: Outcome): Record<Key, number> {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    verwarming: sum(o.components.verwarming),
    boiler: sum(o.components.boiler),
    huishouden: sum(o.components.huishouden),
    was: sum(o.components.was),
    koelen: sum(o.components.koelen),
  };
}

/** Twee balken op dezelfde schaal: je verbruik nu en met je plannen, per onderdeel. */
export function EnergySplit({ now, planned }: { now: Outcome; planned: Outcome | null }) {
  const rows = [
    { label: 'Nu', t: totals(now) },
    ...(planned ? [{ label: 'Met jouw plannen', t: totals(planned) }] : []),
  ];
  const max = Math.max(...rows.map((r) => Object.values(r.t).reduce((a, b) => a + b, 0)));
  const parts = PARTS.filter((p) => rows.some((r) => r.t[p.key] > 1));
  return (
    <div className="split">
      {rows.map((r) => {
        const total = Object.values(r.t).reduce((a, b) => a + b, 0);
        return (
          <div className="split-row" key={r.label}>
            <span className="split-label">{r.label}</span>
            <div className="split-track" role="img" aria-label={`${r.label}: ${parts.map((p) => `${p.label} ${fmt.kwh(r.t[p.key])}`).join(', ')}`}>
              {parts.map((p) => {
                const w = (r.t[p.key] / max) * 100;
                if (w < 0.2) return null;
                return (
                  <span
                    key={p.key}
                    className="split-seg"
                    style={{ width: `${w}%`, background: p.color, color: p.ink }}
                    title={`${p.label}: ${fmt.kwh(r.t[p.key])}`}
                  >
                    {w > 9 && <span className="split-seg-label">{fmt.int(r.t[p.key])}</span>}
                  </span>
                );
              })}
            </div>
            <span className="split-total">{fmt.kwh(total)}</span>
          </div>
        );
      })}
      <div className="legend split-legend">
        {parts.map((p) => (
          <span key={p.key} className="legend-item">
            <span className="swatch" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
        <span className="legend-item muted">kWh stroom per jaar</span>
      </div>
    </div>
  );
}
