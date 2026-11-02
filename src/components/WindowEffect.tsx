import { useEffect, useMemo, useState } from 'react';
import { api, type HourlyWeather } from '../lib/api';
import { useNow, usePoll } from '../lib/usePoll';
import { MIN_BEFORE, windowEffect, type Day } from '../model/windows';
import { Card } from './Card';
import { Segmented } from './controls';
import { StackedColumns } from './charts/StackedColumns';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

const KEY = 'energy-dash:kozijnen:v1';
const DAY = 24 * 3600_000;
const dayKey = (ms: number) => new Date(ms).toLocaleDateString('sv-SE');

interface Stored {
  room?: string;
  datum?: string;
  /** datums (jjjj-mm-dd, begin van de Adax-dag) waarop de pelletkachel brandde */
  pellet?: string[];
}

function loadStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

/** Voor en na de nieuwe kozijnen, gemeten met de Adax-radiator en het echte weer. */
export function WindowEffect() {
  const { data: adax } = usePoll(api.adax, 5 * 60_000);
  const now = useNow(5 * 60_000);
  const [stored, setStored] = useState(loadStored);
  const [weather, setWeather] = useState<HourlyWeather | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rooms = useMemo(() => (adax?.rooms ?? []).filter((r) => r.uren.length > 0), [adax]);
  const biggest = [...rooms].sort((a, b) => b.uren.reduce((s, [, w]) => s + w, 0) - a.uren.reduce((s, [, w]) => s + w, 0))[0];
  const room = rooms.find((r) => r.id === stored.room) ?? biggest;
  const firstDay = room ? Math.min(...room.uren.map(([t]) => t)) : null;

  useEffect(() => {
    if (firstDay === null) return;
    api
      .weatherHourly(firstDay)
      .then((w) => {
        setWeather(w);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [firstDay]);

  const pellets = useMemo(() => new Set(stored.pellet ?? []), [stored.pellet]);
  const days: Day[] = useMemo(() => {
    if (!room || !weather || !weather.t.length) return [];
    const out: Day[] = [];
    for (const [from, wh] of room.uren) {
      if (from + DAY > now) continue; // de lopende dag telt niet mee
      let t = 0;
      let rad = 0;
      let n = 0;
      weather.t.forEach((ms, i) => {
        if (ms >= from && ms < from + DAY && Number.isFinite(weather.tempC[i])) {
          t += weather.tempC[i];
          rad += weather.rad[i] / 1000;
          n++;
        }
      });
      if (n >= 20) out.push({ from, kwh: wh / 1000, temp: t / n, rad, pellet: pellets.has(dayKey(from)) });
    }
    return out.sort((a, b) => a.from - b.from);
  }, [room, weather, now, pellets]);

  const split = stored.datum ? new Date(`${stored.datum}T00:00:00`).getTime() : null;
  const fx = useMemo(() => windowEffect(days, split !== null && Number.isFinite(split) ? split : null), [days, split]);

  const save = (patch: Partial<Stored>) => {
    const next = { ...stored, ...patch };
    setStored(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* opslag niet beschikbaar */
    }
  };

  if (!adax?.configured || !room) return null;

  const labels = days.map((d) => new Date(d.from).toLocaleDateString('nl-NL', { day: 'numeric', month: 'numeric' }));
  const titles = days.map((d) => `${new Date(d.from).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })}: ${d.temp.toFixed(1)} °C, zon ${d.rad.toFixed(1)} kWh/m²`);
  const isAfter = (d: Day) => split !== null && d.from >= split;
  const values = {
    voor: days.map((d) => (isAfter(d) ? 0 : d.kwh)),
    na: days.map((d) => (isAfter(d) ? d.kwh : 0)),
  };
  const need = Math.max(0, MIN_BEFORE - fx.nBefore);
  // aandeel van deze ruimte in alle gemeten Adax-radiatoren (andere verwarming wordt niet gemeten)
  const sum = (r: { uren: Array<[number, number]> }) => r.uren.reduce((a, [, w]) => a + w, 0);
  const share = rooms.length > 1 ? sum(room) / rooms.reduce((a, r) => a + sum(r), 0) : null;

  return (
    <Card
      title="Nieuwe kozijnen: voor en na"
      subtitle={`Verbruik van de radiator in ${room.naam}, gecorrigeerd voor temperatuur en zon van die dagen.`}
      className="span-2"
      actions={
        rooms.length > 1 ? (
          <Segmented value={room.id} options={rooms.map((r) => ({ value: r.id, label: r.naam }))} onChange={(id) => save({ room: id })} />
        ) : undefined
      }
    >
      <div className="termijn-line">
        <label className="app-field">
          <span className="k">Eerste dag met de nieuwe kozijnen</span>
          <input type="date" value={stored.datum ?? ''} onChange={(e) => save({ datum: e.target.value })} />
        </label>
        <Rich as="span" className="hint">
          {fx.nBefore} dagen gemeten vóór de vervanging.{' '}
          {need > 0 ? `Nog minstens ${need} dagen nodig voor een betrouwbare vergelijking.` : 'Genoeg voor een betrouwbaar model.'}
        </Rich>
      </div>

      {error && <p className="error-line">{error}</p>}

      {fx.saving !== null && fx.savingPct !== null && fx.margin !== null ? (
        <div className="kpi-row">
          <div className="kpi">
            <span className="kpi-label">Besparing door de kozijnen</span>
            <span className="kpi-value good">{Math.round(fx.savingPct * 100)}%</span>
            <Rich as="span" className="kpi-sub">
              {fmt.kwh(fx.saving)} minder dan verwacht over {fx.nAfter} dagen (± {fmt.kwh(fx.margin)}).
            </Rich>
          </div>
          <div className="kpi">
            <span className="kpi-label">Verwacht met oude kozijnen</span>
            <span className="kpi-value">{fmt.kwh(fx.predictedAfter)}</span>
            <Rich as="span" className="kpi-sub">bij het weer van die dagen.</Rich>
          </div>
          <div className="kpi">
            <span className="kpi-label">Werkelijk gemeten</span>
            <span className="kpi-value">{fmt.kwh(fx.actualAfter)}</span>
            <Rich as="span" className="kpi-sub">jouw aanname voor je plannen was 40 tot 50%.</Rich>
          </div>
        </div>
      ) : (
        <Rich as="p" className="hint">
          {stored.datum
            ? fx.nAfter === 0
              ? 'Er zijn nog geen volle dagen na de vervanging. Kom over een paar dagen terug.'
              : 'Het model heeft nog te weinig dagen van vóór de vervanging.'
            : 'Vul de eerste dag in waarop de nieuwe kozijnen erin zitten. Tot die tijd verzamelt het dashboard de basislijn.'}
        </Rich>
      )}

      {share !== null && (
        <Rich as="p" className="hint">
          {room.naam} is {Math.round(share * 100)}% van het gemeten Adax-verbruik.
          {fx.savingPct !== null
            ? ` Rekent de besparing door naar alle gemeten radiatoren, dan is dat ongeveer ${Math.round(share * fx.savingPct * 100)}% minder verwarming (jouw aanname voor het hele huis: 40 tot 50%), mits de ruimtes zonder Adax-meting niet veel stoken.`
            : ' Zodra de besparing bekend is, reken ik die hiermee door naar het hele huis.'}
        </Rich>
      )}

      {days.length > 0 && (
        <StackedColumns
          ariaLabel="Verbruik per dag van de radiator, voor en na de nieuwe kozijnen, met het verwachte verbruik als streep"
          categories={labels}
          categoryTitles={titles}
          up={[
            { key: 'voor', label: 'Voor de kozijnen', color: 'var(--series-1)' },
            { key: 'na', label: 'Na de kozijnen', color: 'var(--series-3)' },
          ]}
          down={[]}
          values={values}
          height={220}
          format={(v) => `${v.toFixed(1)} kWh`}
          markers={fx.coef ? { label: 'Verwacht met oude kozijnen', up: fx.predicted } : undefined}
        />
      )}
      {days.length > 0 && (
        <div className="pellet-days">
          <Rich as="span" className="hint">Op welke dagen brandde de pelletkachel? De kachel neemt warmte van de radiator over, dus dit corrigeert de meting.</Rich>
          <div className="chips">
            {days.map((d, i) => (
              <button
                key={d.from}
                type="button"
                className={`chip ${d.pellet ? 'on' : ''}`}
                aria-pressed={Boolean(d.pellet)}
                onClick={() => {
                  const k = dayKey(d.from);
                  save({ pellet: d.pellet ? (stored.pellet ?? []).filter((x) => x !== k) : [...(stored.pellet ?? []), k] });
                }}
              >
                {labels[i]}
              </button>
            ))}
          </div>
        </div>
      )}
      <Rich as="p" className="hint">
        Zo werkt het: uit de dagen vóór de vervanging leert het model hoeveel deze radiator verbruikt bij een bepaalde temperatuur en
        zonnestraling (weer van Open-Meteo). Dat wordt doorgetrokken naar de dagen erna. Wat er echt minder verbruikt wordt, is de
        besparing. Houd het dashboard draaien: Adax geeft maar een week terug, dus elke week dat de server uit staat, mist er data.
        Een koude start met veel zon of een dag met feest en kamerwarmte kan het resultaat flink verschuiven, dus kijk vooral naar
        het gemiddelde over een paar weken.
      </Rich>
    </Card>
  );
}
