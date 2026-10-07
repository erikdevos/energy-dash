import { useId, useState, type ReactNode } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** weergave van de waarde naast het label */
  display?: (v: number) => string;
  hint?: string;
  /** referentiewaarde (bv. jaaropgave) als streepje op de schuif */
  reference?: number;
}

export function Slider({ label, value, min, max, step, onChange, display, hint, reference }: SliderProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;
  const refPct = reference !== undefined ? ((reference - min) / (max - min)) * 100 : null;
  return (
    <div className="control">
      <div className="control-head">
        <label htmlFor={id}>{label}</label>
        {editing ? (
          <input
            className="num-input"
            type="number"
            autoFocus
            defaultValue={value}
            step={step}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(v);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button type="button" className="value-btn" onClick={() => setEditing(true)} title="Klik om exact in te vullen">
            {display ? display(value) : value}
          </button>
        )}
      </div>
      <div className="range-wrap">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ '--pct': `${Math.min(100, Math.max(0, pct))}%` } as React.CSSProperties}
        />
        {refPct !== null && refPct >= 0 && refPct <= 100 && (
          <span className="range-ref" style={{ left: `${refPct}%` }} title="Waarde uit jaaropgave/startpunt" />
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="control">
      {label && <div className="control-head"><span className="label">{label}</span></div>}
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="control">
      <div className="toggle-row">
        <label htmlFor={id}>{label}</label>
        <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Section({ title, badge, children, defaultOpen = true }: { title: string; badge?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {badge && <span className="badge-muted">{badge}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
