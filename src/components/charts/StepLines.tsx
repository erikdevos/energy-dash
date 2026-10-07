import { useState } from 'react';
import { linear, niceTicks, useWidth } from './scale';
import { Tooltip } from './Tooltip';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: ArrayLike<number>;
}

interface Props {
  ariaLabel: string;
  categories: string[];
  categoryTitles?: string[];
  series: LineSeries[];
  format: (v: number) => string;
  tickFormat: (v: number) => string;
  height?: number;
  tickEvery?: number;
}

const M = { top: 10, right: 8, bottom: 26, left: 48 };

/** Trapjeslijnen: een uurprijs geldt het hele uur, dus geen schuine lijnen tussen uren. */
export function StepLines({
  ariaLabel,
  categories,
  categoryTitles,
  series,
  format,
  tickFormat,
  height = 180,
  tickEvery = 1,
}: Props) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = categories.length;
  let min = 0;
  let max = 0;
  for (const s of series)
    for (let i = 0; i < n; i++) {
      min = Math.min(min, s.values[i]);
      max = Math.max(max, s.values[i]);
    }
  const ticks = niceTicks(min, max, 4);
  const y = linear([ticks[0], ticks[ticks.length - 1]], [height - M.bottom, M.top]);
  const plotW = Math.max(0, width - M.left - M.right);
  const band = n ? plotW / n : 0;
  const x = (i: number) => M.left + band * i;

  const path = (vals: ArrayLike<number>) => {
    let d = '';
    for (let i = 0; i < n; i++) {
      d += `${i === 0 ? 'M' : 'L'}${x(i)},${y(vals[i])} H${x(i + 1)} `;
    }
    return d;
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * n);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setHover(null)}>
      {series.length > 1 && (
        <div className="legend" aria-hidden="true">
          {series.map((s) => (
            <span key={s.key} className="legend-item">
              <span className="line-key" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-base' : 'grid'} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">
                {tickFormat(t)}
              </text>
            </g>
          ))}
          {series.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {categories.map((label, i) =>
            i % tickEvery === 0 ? (
              <text key={i} x={x(i) + band / 2} y={height - 8} textAnchor="middle" className="tick">
                {label}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <>
              <line x1={x(hover) + band / 2} x2={x(hover) + band / 2} y1={M.top} y2={height - M.bottom} className="crosshair" />
              {series.map((s) => (
                <circle
                  key={s.key}
                  cx={x(hover) + band / 2}
                  cy={y(s.values[hover])}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              ))}
            </>
          )}
          <rect
            x={M.left}
            y={M.top}
            width={plotW}
            height={height - M.top - M.bottom}
            fill="transparent"
            onPointerMove={onMove}
            tabIndex={0}
            aria-label={ariaLabel}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
              if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
            }}
            onBlur={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip
          x={x(hover) + band / 2}
          containerWidth={width}
          title={categoryTitles?.[hover] ?? categories[hover]}
          rows={series.map((s) => ({ color: s.color, label: s.label, value: format(s.values[hover]) }))}
        />
      )}
    </div>
  );
}
