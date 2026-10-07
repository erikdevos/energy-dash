export interface TooltipRow {
  color?: string;
  label: string;
  value: string;
  strong?: boolean;
}

interface Props {
  x: number;
  containerWidth: number;
  title: string;
  rows: TooltipRow[];
}

const WIDTH = 220;

/** Eén tooltip met alle reeksen op deze positie; waarde voorop, label erachter. */
export function Tooltip({ x, containerWidth, title, rows }: Props) {
  const left = x + 14 + WIDTH > containerWidth ? Math.max(0, x - 14 - WIDTH) : x + 14;
  return (
    <div className="tooltip" style={{ left, width: WIDTH }} role="status">
      <div className="tooltip-title">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className={r.strong ? 'tooltip-row total' : 'tooltip-row'}>
          {r.color ? <span className="line-key" style={{ background: r.color }} /> : <span className="line-key empty" />}
          <span className="tooltip-value">{r.value}</span>
          <span className="tooltip-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
