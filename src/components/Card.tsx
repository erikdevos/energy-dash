import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** als er een tabelweergave is, verschijnt een schakelaar Grafiek/Tabel */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, table, children, className }: Props) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card ${className ?? ''}`}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        <div className="card-actions">
          {actions}
          {table && (
            <button type="button" className="ghost-btn" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
              {showTable ? 'Grafiek' : 'Tabel'}
            </button>
          )}
        </div>
      </header>
      {showTable && table ? <div className="table-wrap">{table}</div> : children}
    </section>
  );
}
