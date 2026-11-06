import { useMemo } from 'react';
import { useWidth } from './scale';

export interface TreemapItem {
  id: string;
  label: string;
  value: number;
  /** groep (bijvoorbeeld categorie) en de kleur daarvan */
  group: string;
  groupLabel: string;
  color: string;
  /** tweede regel in de tegel, bijvoorbeeld de kosten */
  detail?: string;
}

interface Props {
  items: TreemapItem[];
  height?: number;
  format: (v: number) => string;
  ariaLabel: string;
  onSelect?: (id: string) => void;
  /** geen groepen: alle vakken direct naast elkaar, elk met zijn eigen kleur */
  flat?: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap (Bruls e.a.): vakken zo vierkant mogelijk, op volgorde van grootte. */
function squarify<T extends { value: number }>(items: T[], box: Rect): Array<{ item: T } & Rect> {
  const total = items.reduce((a, b) => a + b.value, 0);
  const out: Array<{ item: T } & Rect> = [];
  if (total <= 0 || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  const queue = items.filter((i) => i.value > 0).map((item) => ({ item, area: item.value * scale }));
  let { x, y, w, h } = box;
  let row: typeof queue = [];
  const worst = (r: typeof queue, side: number) => {
    const s = r.reduce((a, b) => a + b.area, 0);
    const max = Math.max(...r.map((q) => q.area));
    const min = Math.min(...r.map((q) => q.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const flush = () => {
    if (row.length === 0) return;
    const s = row.reduce((a, b) => a + b.area, 0);
    if (w >= h) {
      const rw = s / h;
      let cy = y;
      for (const q of row) {
        const rh = q.area / rw;
        out.push({ item: q.item, x, y: cy, w: rw, h: rh });
        cy += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const q of row) {
        const rw = q.area / rh;
        out.push({ item: q.item, x: cx, y, w: rw, h: rh });
        cx += rw;
      }
      y += rh;
      h -= rh;
    }
    row = [];
  };
  for (const q of queue) {
    const side = Math.min(w, h);
    if (row.length === 0 || worst([...row, q], side) <= worst(row, side)) row.push(q);
    else {
      flush();
      row.push(q);
    }
  }
  flush();
  return out;
}

const GAP = 3;
const HEAD = 20;

export function Treemap({ items, height = 420, format, ariaLabel, onSelect, flat }: Props) {
  const { ref, width } = useWidth<HTMLDivElement>();

  const layout = useMemo(() => {
    if (width <= 0) return null;
    const groups = new Map<string, { label: string; color: string; items: TreemapItem[]; value: number }>();
    for (const it of items) {
      const key = flat ? 'alles' : it.group;
      const g = groups.get(key) ?? { label: it.groupLabel, color: it.color, items: [], value: 0 };
      g.items.push(it);
      g.value += it.value;
      groups.set(key, g);
    }
    const list = [...groups.entries()].map(([key, g]) => ({ key, ...g, items: [...g.items].sort((a, b) => b.value - a.value) }));
    list.sort((a, b) => b.value - a.value);
    return squarify(list, { x: 0, y: 0, w: width, h: height }).map(({ item: g, x, y, w, h }) => {
      const showHead = !flat && h > HEAD + 24 && w > 70;
      const gap = flat ? 0 : GAP;
      const inner: Rect = { x: x + gap, y: y + gap + (showHead ? HEAD : 0), w: w - gap * 2, h: h - gap * 2 - (showHead ? HEAD : 0) };
      return { g, x, y, w, h, showHead, tiles: squarify(g.items, inner) };
    });
  }, [items, width, height, flat]);

  const total = items.reduce((a, b) => a + b.value, 0);

  return (
    <div ref={ref} className="treemap" style={{ height }} role="group" aria-label={ariaLabel}>
      {layout?.map(({ g, x, y, w, h, showHead, tiles }) => (
        <div
          key={g.key}
          className={flat ? 'tm-group flat' : 'tm-group'}
          style={flat ? { left: x, top: y, width: w, height: h } : { left: x, top: y, width: w, height: h, borderColor: g.color, background: `color-mix(in srgb, ${g.color} 10%, transparent)` }}
        >
          {showHead && (
            <span className="tm-head" style={{ color: 'var(--text-secondary)' }}>
              {g.label} <span className="tm-head-val">{format(g.value)}</span>
            </span>
          )}
          {tiles.map(({ item, x: tx, y: ty, w: tw, h: th }) => {
            const big = tw > 96 && th > 44;
            return (
              <button
                key={item.id}
                type="button"
                className="tm-tile"
                title={`${item.label}: ${format(item.value)} (${Math.round((item.value / total) * 100)}%)${item.detail ? `, ${item.detail}` : ''}`}
                onClick={() => onSelect?.(item.id)}
                style={{
                  left: tx - x,
                  top: ty - y,
                  width: Math.max(0, tw - 2),
                  height: Math.max(0, th - 2),
                  background: `color-mix(in srgb, ${item.color} 32%, var(--surface-1))`,
                  borderColor: item.color,
                }}
              >
                {tw > 48 && th > 22 && (
                  <>
                    <span className="tm-name">{item.label}</span>
                    {big && <span className="tm-val">{format(item.value)}</span>}
                    {big && th > 64 && item.detail && <span className="tm-detail">{item.detail}</span>}
                  </>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
