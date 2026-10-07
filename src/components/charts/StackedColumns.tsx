import { useState } from 'react';
import { linear, niceTicks, useWidth, fmt } from './scale';
import { Tooltip, type TooltipRow } from './Tooltip';

export interface StackSeries {
  key: string;
  label: string;
  /** CSS-kleur, bij voorkeur een var(--series-n) */
  color: string;
}

interface Props {
  ariaLabel: string;
  categories: string[];
  /** lange labels voor de tooltip (default: categories) */
  categoryTitles?: string[];
  /** van onder naar boven gestapeld boven de nullijn */
  up: StackSeries[];
  /** van boven naar onder gestapeld onder de nullijn (waarden positief aanleveren) */
  down: StackSeries[];
  values: Record<string, ArrayLike<number>>;
  format?: (v: number) => string;
  height?: number;
  tickEvery?: number;
  /** extra regels onderaan de tooltip, bv. totaal */
  extraRows?: (i: number) => TooltipRow[];
  /**
   * Referentiewaarden (bv. gemeten) als korte streep over elke kolom: `up` boven de nullijn,
   * `down` eronder (positief aanleveren). null = geen waarde voor die kolom.
   */
  markers?: { label: string; up?: Array<number | null>; down?: Array<number | null> };
}

const M = { top: 10, right: 8, bottom: 26, left: 48 };
const GAP = 2;
const RADIUS = 4;

/** Rechthoek met afgeronde data-kant (boven of onder), vierkant aan de basislijn. */
function barPath(x: number, y: number, w: number, h: number, roundTop: boolean, roundBottom: boolean): string {
  const r = Math.max(0, Math.min(RADIUS, w / 2, h));
  const rt = roundTop ? r : 0;
  const rb = roundBottom ? r : 0;
  return [
    `M${x},${y + rt}`,
    rt ? `Q${x},${y} ${x + rt},${y}` : '',
    `H${x + w - rt}`,
    rt ? `Q${x + w},${y} ${x + w},${y + rt}` : '',
    `V${y + h - rb}`,
    rb ? `Q${x + w},${y + h} ${x + w - rb},${y + h}` : '',
    `H${x + rb}`,
    rb ? `Q${x},${y + h} ${x},${y + h - rb}` : '',
    'Z',
  ].join(' ');
}

export function StackedColumns({
  ariaLabel,
  categories,
  categoryTitles,
  up,
  down,
  values,
  format = fmt.kwh,
  height = 260,
  tickEvery = 1,
  extraRows,
  markers,
}: Props) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = categories.length;

  let maxUp = 0;
  let maxDown = 0;
  for (let i = 0; i < n; i++) {
    let u = 0;
    let d = 0;
    for (const s of up) u += Math.max(0, values[s.key][i]);
    for (const s of down) d += Math.max(0, values[s.key][i]);
    maxUp = Math.max(maxUp, u, markers?.up?.[i] ?? 0);
    maxDown = Math.max(maxDown, d, markers?.down?.[i] ?? 0);
  }
  const ticks = niceTicks(-maxDown, maxUp, 5);
  const y = linear([ticks[0], ticks[ticks.length - 1]], [height - M.bottom, M.top]);
  const plotW = Math.max(0, width - M.left - M.right);
  const band = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(24, band - GAP - Math.max(2, band * 0.25)));
  const y0 = y(0);

  const columns = categories.map((_, i) => {
    const cx = M.left + band * i + band / 2;
    const x = cx - barW / 2;
    const segs: Array<{ key: string; color: string; d: string }> = [];
    const stack = (series: StackSeries[], dir: 1 | -1) => {
      const visible = series.filter((s) => values[s.key][i] > 1e-9);
      let acc = 0;
      visible.forEach((s, k) => {
        const v = values[s.key][i];
        const a = y(dir * acc);
        const b = y(dir * (acc + v));
        acc += v;
        const isEnd = k === visible.length - 1;
        let top = Math.min(a, b);
        let h = Math.abs(b - a);
        // 2px oppervlak-gat tussen gestapelde segmenten (aan de kant weg van de nullijn)
        if (!isEnd) {
          h -= GAP;
          if (dir === 1) top += GAP;
        }
        if (h <= 0.3) return;
        segs.push({ key: s.key, color: s.color, d: barPath(x, top, barW, h, dir === 1 && isEnd, dir === -1 && isEnd) });
      });
    };
    stack(up, 1);
    stack(down, -1);
    return { cx, segs };
  });

  const markerRows = (i: number): TooltipRow[] => {
    if (!markers) return [];
    const out: TooltipRow[] = [];
    const u = markers.up?.[i];
    const d = markers.down?.[i];
    if (u !== null && u !== undefined) out.push({ color: 'var(--text-primary)', label: `${markers.label}: afname`, value: format(u), strong: true });
    if (d !== null && d !== undefined) out.push({ color: 'var(--text-primary)', label: `${markers.label}: teruglevering`, value: format(-d), strong: !u });
    return out;
  };
  const rows = (i: number): TooltipRow[] => [
    ...[...up].reverse().map((s) => ({ color: s.color, label: s.label, value: format(values[s.key][i]) })),
    ...down.map((s) => ({ color: s.color, label: s.label, value: format(-values[s.key][i]) })),
    ...markerRows(i),
    ...(extraRows ? extraRows(i) : []),
  ];

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setHover(null)}>
      <div className="legend" aria-hidden="true">
        {[...up, ...down].map((s) => (
          <span key={s.key} className="legend-item">
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {markers && (
          <span className="legend-item">
            <span className="line-key marker-key" />
            {markers.label}
          </span>
        )}
      </div>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? 'axis-base' : 'grid'}
              />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">
                {fmt.tick(t)}
              </text>
            </g>
          ))}
          {columns.map((c, i) => (
            <g key={i} opacity={hover === null || hover === i ? 1 : 0.5}>
              {c.segs.map((s) => (
                <path key={s.key} d={s.d} fill={s.color} />
              ))}
            </g>
          ))}
          <line x1={M.left} x2={width - M.right} y1={y0} y2={y0} className="axis-base" />
          {markers &&
            columns.map((c, i) =>
              (
                [
                  [markers.up?.[i], 1],
                  [markers.down?.[i], -1],
                ] as const
              ).map(([v, dir]) =>
                v === null || v === undefined ? null : (
                  <line
                    key={`${i}-${dir}`}
                    x1={c.cx - barW / 2 - 4}
                    x2={c.cx + barW / 2 + 4}
                    y1={y(dir * v)}
                    y2={y(dir * v)}
                    className="marker"
                    opacity={hover === null || hover === i ? 1 : 0.5}
                  />
                ),
              ),
            )}
          {categories.map((label, i) =>
            i % tickEvery === 0 ? (
              <text key={i} x={columns[i].cx} y={height - 8} textAnchor="middle" className="tick">
                {label}
              </text>
            ) : null,
          )}
          {categories.map((label, i) => (
            <rect
              key={i}
              x={M.left + band * i}
              y={M.top}
              width={band}
              height={height - M.top - M.bottom}
              fill="transparent"
              tabIndex={0}
              aria-label={`${categoryTitles?.[i] ?? label}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="hit"
            />
          ))}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip
          x={columns[hover].cx}
          containerWidth={width}
          title={categoryTitles?.[hover] ?? categories[hover]}
          rows={rows(hover)}
        />
      )}
    </div>
  );
}
