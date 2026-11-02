import { useEffect, useMemo, useState } from 'react';
import { api, type DagMeting, type HourlyWeather } from '../lib/api';
import type { Appliance } from '../model/appliances';
import { dayBalance, type DayBalance as Balance } from '../model/balance';
import { usePoll } from '../lib/usePoll';
import { Card } from './Card';
import { Segmented } from './controls';
import { StackedColumns } from './charts/StackedColumns';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

interface Props {
  apparaten: Appliance[];
  /** boiler per maand volgens het model (kWh) */
  boilerMonthly: number[];
  /** vermogen van de zonnepanelen (kWp) */
  kwp: number;
}

const localDate = (ms: number) => new Date(ms).toLocaleDateString('sv-SE');

/** Wat is er per dag te herleiden uit de bronnen, en wat blijft onverklaard? */
export function DayBalance({ apparaten, boilerMonthly, kwp }: Props) {
  const [dagen, setDagen] = useState<DagMeting[] | null>(null);
  const [weather, setWeather] = useState<HourlyWeather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pr, setPr] = useState(0.8);
  const [span, setSpan] = useState<'14' | '30' | 'alles'>('30');
  const { data: adax } = usePoll(api.adax, 10 * 60_000);

  useEffect(() => {
    api
      .dagen()
      .then((r) => setDagen(r.dagen))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const first = dagen?.length ? new Date(`${dagen[0].datum}T00:00:00`).getTime() : null;
  useEffect(() => {
    if (first === null) return;
    api
      .weatherHourly(first)
      .then(setWeather)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [first]);

  const rows: Balance[] = useMemo(() => {
    if (!dagen || !weather || !weather.t.length) return [];
    const rad = new Map<string, number>();
    weather.t.forEach((ms, i) => {
      if (Number.isFinite(weather.rad[i])) rad.set(localDate(ms), (rad.get(localDate(ms)) ?? 0) + weather.rad[i] / 1000);
    });
    // Adax-dagen lopen van 04:00 tot 04:00; ze horen bij de kalenderdatum waarop ze beginnen
    const adaxDay = new Map<string, number>();
    for (const r of adax?.rooms ?? []) for (const [t, wh] of r.uren) adaxDay.set(localDate(t), (adaxDay.get(localDate(t)) ?? 0) + wh / 1000);
    const out: Balance[] = [];
    for (const d of dagen) {
      const r = rad.get(d.datum);
      if (r === undefined) continue;
      out.push(
        dayBalance(
          { datum: d.datum, imp: d.afnameNormaal + d.afnameDal, exp: d.terugNormaal + d.terugDal, rad: r, adax: adaxDay.get(d.datum) ?? null },
          apparaten,
          boilerMonthly,
          kwp,
          pr,
        ),
      );
    }
    return out;
  }, [dagen, weather, adax, apparaten, boilerMonthly, kwp, pr]);

  const shown = span === 'alles' ? rows : rows.slice(-Number(span));
  if (error && !dagen) return null;
  if (!dagen || !shown.length) {
    return dagen && !dagen.length ? (
      <Card title="Dagbalans: wat is verklaard?" className="span-2">
        <Rich as="p" className="hint">Er zijn nog geen dagwaarden. Importeer de dagtabel van Greenchoice met `npm run import-dagen` (zie het begin van scripts/import-dagen.ts).</Rich>
      </Card>
    ) : null;
  }

  const withAdax = shown.filter((b) => b.adax !== null);
  const avg = (f: (b: Balance) => number, list = shown) => (list.length ? list.reduce((s, b) => s + f(b), 0) / list.length : 0);
  const loadAvg = avg((b) => b.load);
  const restAvg = avg((b) => b.rest, withAdax.length ? withAdax : shown);
  const known = avg((b) => (b.adax ?? 0) + b.apparaten + b.boiler, withAdax.length ? withAdax : shown);
  const series = [
    { key: 'adax', label: 'Radiatoren (Adax, gemeten)', color: 'var(--comp-4)' },
    { key: 'apparaten', label: 'Apparaten (schatting)', color: 'var(--comp-1)' },
    { key: 'boiler', label: 'Boiler (model)', color: 'var(--comp-2)' },
    { key: 'rest', label: 'Onverklaard', color: 'var(--series-5, #8a8a8a)' },
  ];
  const values = {
    adax: shown.map((b) => b.adax ?? 0),
    apparaten: shown.map((b) => b.apparaten),
    boiler: shown.map((b) => b.boiler),
    rest: shown.map((b) => Math.max(0, b.rest)),
    teveel: shown.map((b) => Math.max(0, -b.rest)),
  };
  const labels = shown.map((b) => `${Number(b.datum.slice(8))}/${Number(b.datum.slice(5, 7))}`);

  return (
    <Card
      title="Dagbalans: wat is verklaard?"
      subtitle="Per dag het totale verbruik van het huis (meter plus zonne-opwek) met daaronder wat we kennen. De grijze rest is onverklaard."
      className="span-2"
      actions={
        <Segmented
          value={span}
          options={[
            { value: '14', label: '14 dagen' },
            { value: '30', label: '30 dagen' },
            { value: 'alles', label: 'Alles' },
          ]}
          onChange={setSpan}
        />
      }
    >
      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Gemiddeld verbruik per dag</span>
          <span className="kpi-value">{fmt.kwh(loadAvg)}</span>
          <Rich as="span" className="kpi-sub">over {shown.length} dagen, incl. geschatte zonne-opwek.</Rich>
        </div>
        <div className="kpi">
          <span className="kpi-label">Verklaard</span>
          <span className="kpi-value">{fmt.kwh(known)}</span>
          <Rich as="span" className="kpi-sub">per dag{withAdax.length ? ` (over ${withAdax.length} dagen met Adax-meting)` : ''}.</Rich>
        </div>
        <div className="kpi">
          <span className="kpi-label">Onverklaard</span>
          <span className="kpi-value">{fmt.kwh(restAvg)}</span>
          <Rich as="span" className="kpi-sub">per dag gemiddeld; kan negatief zijn als de schattingen te hoog zijn.</Rich>
        </div>
      </div>

      <div className="termijn-line">
        <label className="app-field">
          <span className="k">Rendement zonnepanelen ({Math.round(pr * 100)}%)</span>
          <input type="range" min={0.6} max={1} step={0.01} value={pr} onChange={(e) => setPr(Number(e.target.value))} />
        </label>
        <Rich as="span" className="hint">Zonne-opwek per dag = straling × {kwp.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kWp × dit rendement. Uitlezing van je omvormer zou dit precies maken.</Rich>
      </div>

      <StackedColumns
        ariaLabel="Verbruik per dag in kWh: radiatoren, apparaten, boiler en wat onverklaard blijft"
        categories={labels}
        categoryTitles={shown.map((b) => b.datum)}
        up={series}
        down={[{ key: 'teveel', label: 'Meer verklaard dan verbruikt', color: 'var(--series-2)' }]}
        values={values}
        height={240}
        tickEvery={shown.length > 20 ? 3 : 1}
        format={(v) => `${v.toFixed(1)} kWh`}
        markers={{ label: 'Totaal verbruik (meter + zon)', up: shown.map((b) => b.load) }}
        extraRows={(i) => [
          { label: 'Totaal (meter + zon)', value: fmt.kwh(shown[i].load), strong: true },
          { label: 'Waarvan zon (schatting)', value: fmt.kwh(shown[i].pv) },
          { label: 'Onverklaard', value: fmt.kwh(shown[i].rest), strong: true },
        ]}
      />
      <Rich as="p" className="hint">
        Op dagen zonder Adax-meting bevat de grijze rest ook het verbruik van de radiatoren. Dit is een controle op de schattingen, geen meting: een positieve rest betekent verbruik dat nog geen naam heeft (bijvoorbeeld
        verwarming zonder Adax-meting of de pelletkachel op koude dagen), een negatieve rest dat de schattingen te hoog zijn. De
        meterwaarden van Greenchoice zijn op hele kWh afgerond. Wissel van maand: in de winter komt de droger erbij, loopt de
        verwarming op en schuift de verhouding. Met de pelletkachel aan daalt het verbruik van de radiatoren, zodat de rest anders ligt.
      </Rich>
    </Card>
  );
}
