import { calendarFor, HOURS } from '../model/calendar';
import { notaTotals, type CalibrationTarget } from '../model/calibrate';
import { isDal } from '../model/simulate';
import type { Outcome } from '../model/types';
import type { JaarnotaSet } from '../lib/api';
import { Card } from './Card';
import { Segmented } from './controls';
import { fmt } from './charts/scale';

interface Props {
  set: JaarnotaSet;
  /** model per nota, doorgerekend met de tarieven en het regime van die nota */
  models: Outcome[];
  priceYear: number;
  dalVanafUur: number;
  targets: CalibrationTarget[];
  targetId: string;
  onTarget: (id: string) => void;
  /** aantal of vermogen panelen gewijzigd t.o.v. het startpunt */
  panelsChanged: boolean;
  onRecalibrate: () => void;
}

function dalShares(o: Outcome, year: number, dalVanafUur: number) {
  const cal = calendarFor(year);
  let imp = 0;
  let exp = 0;
  for (let i = 0; i < HOURS; i++) {
    if (!isDal(cal, i, dalVanafUur)) continue;
    imp += o.sim.imp[i];
    exp += o.sim.exp[i];
  }
  return { imp: o.totals.imp ? imp / o.totals.imp : 0, exp: o.totals.exp ? exp / o.totals.exp : 0 };
}

export function JaarnotasPanel({ set, models, priceYear, dalVanafUur, targets, targetId, onTarget, panelsChanged, onRecalibrate }: Props) {
  const rows: Array<{ label: string; nota: (k: number) => string; model: (k: number) => string; hint?: string }> = [
    { label: 'Afname van het net', nota: (k) => fmt.kwh(notaTotals(set.notas[k]).imp), model: (k) => fmt.kwh(models[k].totals.imp) },
    { label: 'Teruglevering', nota: (k) => fmt.kwh(notaTotals(set.notas[k]).exp), model: (k) => fmt.kwh(models[k].totals.exp) },
    {
      label: 'Opwek zonnepanelen',
      nota: (k) => (set.notas[k].opwekOmvormer ? fmt.kwh(set.notas[k].opwekOmvormer!) : 'niet op nota'),
      model: (k) => `${fmt.kwh(models[k].totals.pv)}${set.notas[k].opwekOmvormer ? '' : ' (geschat)'}`,
    },
    { label: 'Verbruik in huis', nota: () => 'afgeleid', model: (k) => fmt.kwh(models[k].totals.load) },
    {
      label: 'Dal-aandeel afname',
      nota: (k) => fmt.pct(notaTotals(set.notas[k]).dalShareImp),
      model: (k) => fmt.pct(dalShares(models[k], priceYear, dalVanafUur).imp),
    },
    {
      label: 'Dal-aandeel teruglevering',
      nota: (k) => fmt.pct(notaTotals(set.notas[k]).dalShareExp),
      model: (k) => fmt.pct(dalShares(models[k], priceYear, dalVanafUur).exp),
    },
    { label: 'Notabedrag (incl. BTW)', nota: (k) => fmt.eur2(set.notas[k].bedragen.totaal), model: (k) => fmt.eur2(models[k].total) },
  ];

  return (
    <Card
      title="Afstemming op je metingen"
      subtitle={
        <>
          {set.mock && <span className="pill pill-warn">Mock-data</span>} {set.leverancier}
          {set.netbeheerder && ` · ${set.netbeheerder}`}
          {set.aansluiting && ` · ${set.aansluiting}`}
          {set.locatie && ` · ${set.locatie.plaats}`}
        </>
      }
      className="span-2"
      actions={
        panelsChanged ? (
          <button type="button" className="primary-btn" onClick={onRecalibrate} title="Gebruik aantal en vermogen panelen uit je huidige instellingen">
            Opnieuw afstemmen met deze panelen
          </button>
        ) : undefined
      }
    >
      <Segmented
        label="Startpunt afstemmen op"
        value={targetId}
        options={targets.map((t) => ({ value: t.id, label: t.label }))}
        onChange={onTarget}
      />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Post</th>
              {set.notas.map((n) => (
                <th key={n.label} colSpan={2}>
                  {n.label}
                </th>
              ))}
            </tr>
            <tr>
              <th />
              {set.notas.map((n) => (
                <FragmentHead key={n.label} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {set.notas.map((n, k) => (
                  <NotaCells key={n.label} nota={r.nota(k)} model={r.model(k)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Met "Maanden …" kloppen de jaartotalen van dat kalenderjaar exact, en bepaalt het seizoenspatroon welk deel van je
        verbruik verwarming is (vergelijk de streepjes in "Stroom per maand"). Dat is de beste basis.
      </p>
      <p className="hint">
        Per nota stemt het model opwek en verbruik zo af dat afname én teruglevering kloppen. De opwek staat niet op de nota,
        dus die is geschat uit de verhouding tussen afname en teruglevering. Heb je de jaaropbrengst van je omvormer? Zet
        hem als <code>opwekOmvormer</code> in <code>data/jaarnotas.json</code>, dan wordt de schatting een meting.
      </p>
      <p className="hint">
        Valt het dal-aandeel van het model hoger uit dan op de nota? Dan draait in het echt meer verbruik overdag op
        werkdagen, bijvoorbeeld de warmtepomp of de boiler. Onder saldering maakt dat niets uit, zonder saldering wel.
      </p>
    </Card>
  );
}

function FragmentHead() {
  return (
    <>
      <th>Nota</th>
      <th>Model</th>
    </>
  );
}

function NotaCells({ nota, model }: { nota: string; model: string }) {
  return (
    <>
      <td>{nota}</td>
      <td>{model}</td>
    </>
  );
}
