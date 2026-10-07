import { useState } from 'react';
import type { ContractPreset } from '../model/defaults';
import type { Scenario } from '../model/types';
import { Card } from './Card';
import { fmt } from './charts/scale';

export interface MatrixRow {
  preset: ContractPreset;
  zonder: number;
  met: number;
}

export interface SavedScenario {
  id: string;
  name: string;
  scenario: Scenario;
  total: number;
}

interface Props {
  rows: MatrixRow[];
  batteryLabel: string;
  current: number;
  saved: SavedScenario[];
  onApply: (preset: ContractPreset, battery: boolean) => void;
  onSave: (name: string) => void;
  onLoad: (s: SavedScenario) => void;
  onDelete: (id: string) => void;
}

export function ComparePanel({ rows, batteryLabel, current, saved, onApply, onSave, onLoad, onDelete }: Props) {
  const [name, setName] = useState('');
  const all = rows.flatMap((r) => [r.zonder, r.met]);
  const best = Math.min(...all);
  const max = Math.max(...all, ...saved.map((s) => s.total), 1);

  const cell = (preset: ContractPreset, value: number, battery: boolean) => (
    <td>
      <button
        type="button"
        className={`matrix-cell ${value === best ? 'best' : ''}`}
        onClick={() => onApply(preset, battery)}
        title="Zet dit scenario in de schuifjes"
      >
        <span className="matrix-bar" style={{ width: `${Math.max(0, (value / max) * 100)}%` }} aria-hidden="true" />
        <span className="matrix-value">{fmt.eur(value)}</span>
        {value === best && <span className="matrix-tag">laagste</span>}
      </button>
    </td>
  );

  return (
    <Card
      title="Contracten vergeleken"
      subtitle="Voor jouw huidige huishouden (zon, verbruik, auto). Klik een vak om het over te nemen."
    >
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Situatie</th>
              <th>Zonder batterij</th>
              <th>Met batterij ({batteryLabel})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.preset.id}>
                <th scope="row">{r.preset.label}</th>
                {cell(r.preset, r.zonder, false)}
                {cell(r.preset, r.met, true)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="saved">
        <form
          className="save-row"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(name.trim() || `Scenario ${saved.length + 1}`);
            setName('');
          }}
        >
          <input
            className="text-input"
            placeholder="Naam voor huidige instellingen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Naam voor het scenario"
          />
          <button type="submit" className="primary-btn">Bewaar ({fmt.eur(current)})</button>
        </form>
        {saved.length > 0 && (
          <ul className="saved-list">
            {saved.map((s) => (
              <li key={s.id}>
                <button type="button" className="link-btn" onClick={() => onLoad(s)}>{s.name}</button>
                <span className="saved-value">{fmt.eur(s.total)}</span>
                <span className={`delta-small ${s.total < current ? 'good' : s.total > current ? 'bad' : ''}`}>
                  {Math.abs(s.total - current) < 1 ? 'gelijk' : `${s.total < current ? '-' : '+'}${fmt.eur(Math.abs(s.total - current))} t.o.v. nu`}
                </span>
                <button type="button" className="icon-btn" onClick={() => onDelete(s.id)} aria-label={`Verwijder ${s.name}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
