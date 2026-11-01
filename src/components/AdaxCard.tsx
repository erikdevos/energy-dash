import { useMemo } from 'react';
import { api } from '../lib/api';
import { useNow, usePoll } from '../lib/usePoll';
import { Card } from './Card';
import { StackedColumns } from './charts/StackedColumns';
import { fmt } from './charts/scale';

const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--comp-1)', 'var(--comp-2)'];

/** Gemeten verbruik per Adax-radiator, uit de cloud-API van Adax. */
export function AdaxCard() {
  const { data, error } = usePoll(api.adax, 5 * 60_000);
  const now = useNow(5 * 60_000);

  const stats = useMemo(() => {
    if (!data) return null;
    const rooms = data.rooms.filter((r) => r.uren.length > 0);
    const times = [...new Set(rooms.flatMap((r) => r.uren.map(([t]) => t)))].sort((a, b) => a - b);
    if (!times.length) return null;
    // Adax levert per ruimte één waarde per dag (van 04:00 tot 04:00). De laatste dag loopt nog.
    const DAY = 24 * 3600_000;
    const complete = times.filter((t) => t + DAY <= now);
    const perRoom = rooms.map((r, i) => {
      const byDay = new Map(r.uren);
      const kwhFull = complete.reduce((s, t) => s + (byDay.get(t) ?? 0), 0) / 1000;
      return {
        key: r.id,
        label: r.naam,
        color: COLORS[i % COLORS.length],
        values: times.map((t) => (byDay.get(t) ?? 0) / 1000),
        perDay: complete.length ? kwhFull / complete.length : 0,
        kwhFull,
      };
    });
    const labels = times.map((t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'numeric' }));
    const titles = times.map((t) => {
      const d = new Date(t).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' });
      return t + DAY > now ? `${d} (loopt nog)` : d;
    });
    const perDayTotal = perRoom.reduce((s, r) => s + r.perDay, 0);
    return { perRoom, labels, titles, days: complete.length, perDayTotal };
  }, [data, now]);

  if (error) return null;
  if (!data) return null;

  if (!data.configured) {
    return (
      <Card title="Gemeten verbruik van je Adax-radiatoren" className="span-2" subtitle="Nog niet gekoppeld.">
        <p className="hint">
          Maak in de Adax-app (Account, Remote user client API) een credential en zet client-ID en wachtwoord in je lokale .env als
          ADAX_CLIENT_ID en ADAX_CLIENT_SECRET. Herstart daarna het dashboard. Je radiatoren verschijnen hier met hun echte verbruik per dag.
        </p>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card title="Gemeten verbruik van je Adax-radiatoren" className="span-2" subtitle="Gekoppeld, nog geen gegevens.">
        <p className="hint">{data.error ?? 'De eerste synchronisatie loopt. Ververs de pagina over een minuut.'}</p>
      </Card>
    );
  }

  const values = Object.fromEntries(stats.perRoom.map((r) => [r.key, r.values]));
  return (
    <Card
      title="Gemeten verbruik van je Adax-radiatoren"
      subtitle={`Echte meetwaarden per dag uit de Adax-cloud. Over ${stats.days} volle dagen samen ${fmt.kwh(stats.perDayTotal)} per dag.`}
      className="span-2"
    >
      <StackedColumns
        ariaLabel="Gestapelde kolommen: verbruik per dag van elke Adax-radiator in kWh"
        categories={stats.labels}
        categoryTitles={stats.titles}
        up={stats.perRoom.map((r) => ({ key: r.key, label: r.label, color: r.color }))}
        down={[]}
        values={values}
        height={220}
        format={(v) => `${v.toFixed(1)} kWh`}
        extraRows={(i) => [{ label: 'Samen', value: `${stats.perRoom.reduce((s, r) => s + r.values[i], 0).toFixed(1)} kWh`, strong: true }]}
      />
      <div className="supplier-list" role="list">
        {[...stats.perRoom]
          .sort((a, b) => b.perDay - a.perDay)
          .map((r) => (
            <div key={r.key} role="listitem" className="supplier">
              <div className="supplier-row">
                <span className="supplier-name">
                  <strong>{r.label}</strong>
                  <span className="supplier-sub">{fmt.kwh(r.perDay)} per dag gemiddeld</span>
                </span>
                <span className="supplier-total">
                  <strong>{fmt.kwh(r.kwhFull)}</strong>
                </span>
              </div>
            </div>
          ))}
      </div>
      <p className="hint">
        Dit zijn de dagtotalen van Adax zelf (van 04:00 tot 04:00), niet geschat. Adax geeft maximaal een week terug en per dag, geen
        uurwaarden. Daarom bewaart het dashboard elke dag wat het ophaalt, zodat de geschiedenis groeit. Alleen de ruimtes in de
        Adax-app staan erin: pelletkachel, boiler en airco niet. Laatste synchronisatie:{' '}
        {data.lastSync ? new Date(data.lastSync).toLocaleString('nl-NL') : 'nog niet'}.
      </p>
    </Card>
  );
}
