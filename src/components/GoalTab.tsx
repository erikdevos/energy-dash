import { useMemo, useState } from 'react';
import { monthlyCosts, run } from '../model/costs';
import { batteryOptions, batterySweep, sequence, type Goal } from '../model/goal';
import type { ContractPreset } from '../model/defaults';
import type { Step } from '../model/overview';
import type { Scenario, YearData } from '../model/types';
import { Card } from './Card';
import { Segmented } from './controls';
import { TermijnInput } from './Summary';
import { StackedColumns } from './charts/StackedColumns';
import { Waterfall } from './overview/Waterfall';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

interface Props {
  goal: Goal;
  start: Scenario;
  /** je startpunt met je eigen plannen aan, voor de vergelijking "na de overige maatregelen" */
  planned: Scenario;
  dyn2027: ContractPreset;
  data: YearData;
  /** je huidige termijnbedrag per maand */
  termijnbedrag: number;
}

const SIZES = [5, 10, 15, 20];

export function GoalTab({ goal, start, planned, dyn2027, data, termijnbedrag }: Props) {
  const [basis, setBasis] = useState<'nu' | 'plannen'>('plannen');
  const [perKwh, setPerKwh] = useState(Math.round(start.batterij.aanschafprijs / Math.max(1, start.batterij.capaciteitKwh)));
  // kleine stekkerbatterijen: aannames, geen offerte
  const [ppPrice, setPpPrice] = useState(1000);
  const [ppKwh, setPpKwh] = useState(2.2);
  const [ppKw, setPpKw] = useState(1.8);
  const [ppEff, setPpEff] = useState(85);
  const [off, setOff] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('energy-dash:doel:uit') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const setLever = (id: string, on: boolean) => {
    const next = on ? off.filter((x) => x !== id) : [...off, id];
    setOff(next);
    try {
      localStorage.setItem('energy-dash:doel:uit', JSON.stringify(next));
    } catch {
      /* opslag niet beschikbaar */
    }
  };
  const seq = useMemo(
    () => sequence(start, dyn2027, data, goal.steps.map((s) => s.lever), (id) => !off.includes(id)),
    [start, dyn2027, data, goal, off],
  );
  const rows = useMemo(() => batterySweep(start, planned, dyn2027, data, SIZES), [start, planned, dyn2027, data]);
  const ppRows = useMemo(
    () =>
      batteryOptions(
        start,
        planned,
        dyn2027,
        data,
        [1, 2, 3, 4].map((n) => ({ kwh: n * ppKwh, kw: Math.min(5, n * ppKw), rendement: ppEff / 100 })),
      ),
    [start, planned, dyn2027, data, ppKwh, ppKw, ppEff],
  );

  const steps: Step[] = [
    { label: 'Nu', detail: 'huidig contract, met saldering', value: goal.now, kind: 'total' },
    { label: 'Einde saldering, vast contract', value: goal.vast - goal.now, kind: 'delta' },
    { label: 'Dynamisch contract', detail: 'jouw keuze', value: goal.dyn - goal.vast, kind: 'delta' },
    ...seq.rows.map((r) => ({
      label: r.lever.label,
      detail: r.lever.soort === 'besloten' ? 'staat al vast, kost niets extra' : r.lever.soort === 'gedrag' ? 'gedrag, kost niets' : 'investering',
      value: -r.saving,
      kind: 'delta' as const,
      toggle: { on: r.on, onChange: (on: boolean) => setLever(r.lever.id, on) },
    })),
    { label: '2027 met jouw keuzes', value: seq.end, kind: 'total' },
  ];
  const remaining = seq.end - goal.now;
  const sumOf = (soort: string) => seq.rows.filter((r) => r.lever.soort === soort).reduce((a, r) => a + r.saving, 0);
  const besloten = sumOf('besloten');
  const gedragSaving = sumOf('gedrag');
  const invest = sumOf('investering');
  const rowsKey = rows.map((r) => (basis === 'nu' ? r.savingNow : r.savingPlanned));
  const best = Math.max(...rowsKey, 1);
  const ppKey = ppRows.map((r) => (basis === 'nu' ? r.savingNow : r.savingPlanned));
  const ppBest = Math.max(...ppKey, 1);

  return (
    <>
      <section className="kpi-row span-2" aria-label="Doel 2027">
        <div className="kpi">
          <span className="kpi-label">Extra kosten door het einde van saldering</span>
          <span className="kpi-value bad">{fmt.eur(goal.extra)}</span>
          <Rich as="span" className="kpi-sub">per jaar, met een dynamisch contract en zonder maatregelen (vast: {fmt.eur(goal.vast - goal.now)}).</Rich>
        </div>
        <div className="kpi">
          <span className="kpi-label">Kozijnen en Daikin</span>
          <span className="kpi-value good">{fmt.eur(besloten)}</span>
          <Rich as="span" className="kpi-sub">per jaar minder. Daarna nog {fmt.eur(gedragSaving)} met gedrag dat niets kost en {fmt.eur(invest)} met de rest.</Rich>
        </div>
        <div className="kpi">
          <span className="kpi-label">Wat er overblijft</span>
          <span className="kpi-value">{fmt.eur(Math.max(0, remaining))}</span>
          <Rich as="span" className="kpi-sub">per jaar extra ten opzichte van nu (2027: {fmt.eur(seq.end)} in totaal, nu {fmt.eur(goal.now)}).</Rich>
        </div>
      </section>

      <Card
        title="Van extra kosten naar zo weinig mogelijk"
        subtitle="Zet maatregelen aan of uit en zie direct wat het uitmaakt. Volgorde: wat al vaststaat, dan gedrag dat niets kost, dan de investeringen. Elke stap toont wat hij oplevert na de aangevinkte stappen erboven."
        className="span-2"
      >
        <Waterfall steps={steps} />
        <TermijnPlanner scenario={dyn2027.apply(seq.scenario)} fallback={dyn2027.apply(start)} data={data} termijnbedrag={termijnbedrag} />
        <Rich as="p" className="hint">
          Bedragen zijn verwachte stroomkosten per jaar in 2027, zonder saldering, met het dynamische contract (Tibber-tarieven als
          referentie). Pellets vallen erbuiten, ook de besparing op pellets door de kozijnen (het model rekent met ongeveer 45% minder pelletwarmte). Het effect van een maatregel hangt af van de andere: een thuisbatterij die al zonnestroom
          opvangt, laat het verschuiven van apparaten minder opleveren, en andersom.
        </Rich>
      </Card>

      <Card title="Wat doe je het eerst?" subtitle="Per maatregel: wat hij oplevert in deze volgorde, alleen, en als alles al gedaan is." className="span-2">
        <div className="supplier-list" role="list">
          {goal.steps.map((s) => (
            <div key={s.lever.id} role="listitem" className="supplier">
              <div className="supplier-row battery-row duo-row">
                <span className="supplier-name">
                  <strong>{s.lever.label}</strong>
                  <Rich as="span" className="supplier-sub">
                    {s.lever.soort === 'besloten' ? 'Staat al vast, kost niets extra' : s.lever.soort === 'gedrag' ? 'Gedrag, kost niets' : 'Investering'} · {s.lever.detail}
                  </Rich>
                </span>
                <span className="supplier-total">
                  <strong>{fmt.eur(s.saving)} per jaar</strong>
                  <Rich as="span" className="supplier-sub">
                    alleen {fmt.eur(s.savingAlone)} · als laatste {fmt.eur(s.savingLast)}
                  </Rich>
                </span>
              </div>
            </div>
          ))}
        </div>
        <Rich as="p" className="hint">
          "Alleen" is wat de maatregel oplevert als je verder niets doet. "Als laatste" is wat hij nog toevoegt nadat alle andere al zijn
          gedaan. Een groot verschil betekent dat maatregelen elkaars werk overnemen. De boiler op zonuren is gratis, maar let op: een
          boiler van 80 liter voor vijf personen is krap als hij maar één keer per dag opwarmt. Het model rekent de warmteverliezen mee,
          maar niet of er genoeg warm water is voor iedereen.
        </Rich>
      </Card>

      <Card
        title="Thuisbatterij: wanneer loont het?"
        subtitle="Besparing per jaar met een dynamisch contract zonder saldering, en de terugverdientijd bij jouw aanschafprijs."
        className="span-2"
        actions={
          <Segmented
            value={basis}
            options={[
              { value: 'plannen', label: 'Na overige maatregelen' },
              { value: 'nu', label: 'Zoals nu' },
            ]}
            onChange={setBasis}
          />
        }
      >
        <div className="termijn-line">
          <label className="app-field">
            <span className="k">Prijs per kWh (incl. installatie)</span>
            <input type="number" min={100} max={1500} step={25} value={perKwh} onChange={(e) => setPerKwh(Math.max(0, Number(e.target.value)))} />
          </label>
          <Rich as="span" className="hint">Aanname: {fmt.eur(perKwh)} per kWh. Vraag een offerte; prijzen en subsidie verschillen sterk.</Rich>
        </div>
        <div className="supplier-list" role="list">
          {rows.map((r, i) => {
            const saving = rowsKey[i];
            const price = r.kwh * perKwh;
            const years = saving > 0 ? price / saving : Infinity;
            return (
              <div key={r.kwh} role="listitem" className="supplier">
                <div className="supplier-row battery-row">
                  <span className="supplier-name">
                    <strong>{r.kwh} kWh</strong>
                    <Rich as="span" className="supplier-sub">{fmt.eur(price)} aanschaf</Rich>
                  </span>
                  <span className="supplier-track" aria-hidden="true">
                    <span className="supplier-bar dynamisch" style={{ width: `${(Math.max(0, saving) / best) * 100}%` }} />
                  </span>
                  <span className="supplier-total">
                    <strong>{fmt.eur(saving)} per jaar</strong>
                    <Rich as="span" className="supplier-sub">{Number.isFinite(years) ? `terugverdiend in ${years.toFixed(1).replace('.', ',')} jaar` : 'verdient zich niet terug'}</Rich>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <Rich as="p" className="hint">
          Grotere batterijen leveren steeds minder extra op: vanaf ongeveer 10 kWh vangt de batterij vooral de zomerse overschotten op,
          en dat zijn er in je situatie genoeg. De besparing hangt af van de beursprijzen, die per jaar verschillen. Levensduur en afname
          van de capaciteit zijn niet meegerekend; reken met 10 tot 15 jaar.
        </Rich>
      </Card>

      <Card
        title="Plug-and-play batterijen: klein en goedkoop"
        subtitle="Losse stekkerbatterijen (zoals Anker, Marstek, EcoFlow, Growatt), samen te stellen uit modules. Zelfde berekening, maar met lager vermogen."
        className="span-2"
      >
        <div className="termijn-line">
          <label className="app-field">
            <span className="k">Prijs per module</span>
            <input type="number" min={100} max={3000} step={50} value={ppPrice} onChange={(e) => setPpPrice(Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="app-field">
            <span className="k">kWh per module</span>
            <input type="number" min={0.5} max={6} step={0.1} value={ppKwh} onChange={(e) => setPpKwh(Math.max(0.5, Number(e.target.value)))} />
          </label>
          <label className="app-field">
            <span className="k">kW per module</span>
            <input type="number" min={0.4} max={5} step={0.1} value={ppKw} onChange={(e) => setPpKw(Math.max(0.4, Number(e.target.value)))} />
          </label>
          <label className="app-field">
            <span className="k">Rendement (%)</span>
            <input type="number" min={70} max={98} step={1} value={ppEff} onChange={(e) => setPpEff(Math.min(98, Math.max(70, Number(e.target.value))))} />
          </label>
        </div>
        <div className="supplier-list" role="list">
          {ppRows.map((r, i) => {
            const n = i + 1;
            const saving = ppKey[i];
            const price = n * ppPrice;
            const years = saving > 0 ? price / saving : Infinity;
            return (
              <div key={n} role="listitem" className="supplier">
                <div className="supplier-row battery-row">
                  <span className="supplier-name">
                    <strong>{n} {n === 1 ? 'module' : 'modules'}</strong>
                    <Rich as="span" className="supplier-sub">{fmt.kwh(r.kwh)}, {r.kw.toFixed(1).replace('.', ',')} kW, {fmt.eur(price)} aanschaf</Rich>
                  </span>
                  <span className="supplier-track" aria-hidden="true">
                    <span className="supplier-bar dynamisch" style={{ width: `${(Math.max(0, saving) / ppBest) * 100}%` }} />
                  </span>
                  <span className="supplier-total">
                    <strong>{fmt.eur(saving)} per jaar</strong>
                    <Rich as="span" className="supplier-sub">{Number.isFinite(years) ? `terugverdiend in ${years.toFixed(1).replace('.', ',')} jaar` : 'verdient zich niet terug'}</Rich>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <Rich as="p" className="hint">
          Aannames: {fmt.eur(ppPrice)} per module van {fmt.kwh(ppKwh)}, elke module met een eigen omvormer van {ppKw.toFixed(1).replace('.', ',')} kW. Delen modules één omvormer, zet het vermogen dan lager.
          De prijzen zijn jouw schatting, niet gecontroleerd; vraag actuele prijzen na. Het model gaat uit van perfecte aansturing op prijs en zon. Een stekkerbatterij die alleen de P1-meter volgt
          doet vooral zelfverbruik, en dat levert in dit model ongeveer evenveel op. Zulke batterijen hebben geen noodstroom, en je moet nagaan of ze aan één fase hangen en wat dat voor jouw meter betekent.
        </Rich>
      </Card>
    </>
  );
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const FULL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/**
 * Welk maandbedrag past bij de gekozen maatregelen? Een te laag termijnbedrag geeft aan het eind van het jaar een grote nota,
 * een iets hoger bedrag is veiliger. Het saldo is wat je betaald hebt min wat de stroom tot dan toe kostte.
 */
function TermijnPlanner({ scenario, fallback, data, termijnbedrag }: { scenario: Scenario; fallback: Scenario; data: YearData; termijnbedrag: number }) {
  const months = useMemo(() => monthlyCosts(scenario, run(scenario, data), data), [scenario, data]);
  // als de maatregelen niets opleveren: wat je dan per maand kwijt bent
  const worst = useMemo(() => {
    const m = monthlyCosts(fallback, run(fallback, data), data);
    return m ? Math.max(0, m.reduce((a, b) => a + b, 0) / 12) : 0;
  }, [fallback, data]);
  const [chosen, setChosen] = useState<number | null>(null);
  if (!months) return null;
  const total = months.reduce((a, b) => a + b, 0);
  const cum = (i: number) => months.slice(0, i + 1).reduce((a, b) => a + b, 0);
  const fair = Math.max(0, total / 12);
  const safe = Math.max(0, ...months.map((_, i) => cum(i) / (i + 1)));
  const up5 = (v: number) => Math.ceil(v / 5) * 5;
  const t = chosen ?? up5(safe);
  const balance = months.map((_, i) => t * (i + 1) - cum(i));
  const low = Math.min(...balance);
  const lowMonth = balance.indexOf(low);
  const end = balance[11];
  const values = { plus: balance.map((b) => Math.max(0, b)), min: balance.map((b) => Math.max(0, -b)) };
  const presets = [
    { label: `Eerlijk: ${fmt.eur(up5(fair))}`, v: up5(fair) },
    { label: `Nooit achter: ${fmt.eur(up5(safe))}`, v: up5(safe) },
    { label: `Als niets lukt: ${fmt.eur(up5(worst))}`, v: up5(worst) },
  ];

  return (
    <div className="termijn-planner">
      <h3>Welk maandbedrag past hierbij?</h3>
      <Rich as="p" className="hint">
        Je verwachte kosten in 2027 met deze keuzes zijn {fmt.eur(total)}, ongeveer {fmt.eur(fair)} per maand. Nu betaal je {fmt.eur(termijnbedrag)} per maand.
        Een laag bedrag geeft aan het eind een grote nota, een hoger bedrag is veiliger. "Nooit achter" is het laagste bedrag waarbij je in geen enkele maand achterloopt;
        "Als niets lukt" is het maandbedrag zonder maatregelen (alleen het dynamische contract).
      </Rich>
      <div className="termijn-line">
        <span>Jouw maandbedrag:</span>
        <TermijnInput value={t} onChange={setChosen} />
        {presets.map((p) => (
          <button key={p.label} type="button" className={`chip ${t === p.v ? 'on' : ''}`} aria-pressed={t === p.v} onClick={() => setChosen(p.v)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className={low < 0 ? 'hint' : 'hint'}>
        {low < 0 ? `Laagste stand: ${fmt.eur(low)} eind ${FULL[lowMonth]}, je loopt dan achter. ` : 'Je loopt in 2027 nooit achter. '}
        Eind december staat je saldo op {fmt.eur(end)}{end < 0 ? ' (dit betaal je bij)' : ' (dit krijg je terug)'}.
      </p>
      <StackedColumns
        ariaLabel="Saldo per maand in 2027 bij je maandbedrag: boven de lijn heb je tegoed, eronder loop je achter"
        categories={MONTHS}
        categoryTitles={FULL}
        up={[{ key: 'plus', label: 'Tegoed', color: 'var(--series-3)' }]}
        down={[{ key: 'min', label: 'Achterstand', color: 'var(--series-2)' }]}
        values={values}
        height={200}
        format={(v) => fmt.eur(v)}
        extraRows={(i) => [
          { label: 'Kosten deze maand', value: fmt.eur(months[i]) },
          { label: 'Saldo', value: fmt.eur(balance[i]), strong: true },
        ]}
      />
    </div>
  );
}
