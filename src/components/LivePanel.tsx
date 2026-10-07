import { useCallback, useState } from 'react';
import { api, type HistoryResponse, type LiveReading } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { Card } from './Card';
import { Segmented } from './controls';
import { StackedColumns } from './charts/StackedColumns';
import { fmt } from './charts/scale';
import { FLOW_SERIES } from './charts/series';

const kw = (w: number) => `${fmt.one(w / 1000)} kW`;

interface Props {
  live: { data: LiveReading | null; error: string | null };
  /** eindstanden van de laatste jaarnota, om het lopende notajaar te tonen */
  sinceNota?: {
    sinds: string;
    meter: { leveringNormaal: number; leveringDal: number; terugleveringNormaal: number; terugleveringDal: number };
  };
}

export function LivePanel({ live, sinceNota }: Props) {
  const [range, setRange] = useState<'48u' | '30d'>('48u');
  const fetchHistory = useCallback(() => (range === '48u' ? api.history(2, 60) : api.history(30, 1440)), [range]);
  const hist = usePoll<HistoryResponse>(fetchHistory, 60_000);
  const r = live.data;
  const net = r ? r.importW - r.exportW : 0;
  const buckets = hist.data?.res === (range === '48u' ? 60 : 1440) ? hist.data.buckets : [];
  const daily = range === '30d';
  const labels = buckets.map((h) =>
    daily
      ? new Date(h.t).toLocaleDateString('nl-NL', { day: 'numeric', timeZone: 'Europe/Amsterdam' })
      : new Date(h.t).toLocaleTimeString('nl-NL', { hour: '2-digit', timeZone: 'Europe/Amsterdam' }),
  );
  const titles = buckets.map(
    (h) =>
      new Date(h.t).toLocaleString('nl-NL', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(daily ? {} : { hour: '2-digit', minute: '2-digit' }),
        timeZone: 'Europe/Amsterdam',
      }) + (h.gap ? ' (deels geschat)' : ''),
  );
  const first = hist.data?.first ? new Date(hist.data.first) : null;

  const mode = r?.mode ?? hist.data?.mode;
  const sinceToday = r?.today.since ? new Date(r.today.since) : null;
  const todayLabel =
    sinceToday && sinceToday.getHours() * 60 + sinceToday.getMinutes() > 30
      ? `sinds ${sinceToday.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
      : 'vandaag';
  // DSMR in Nederland: tarief 1 = dal, tarief 2 = normaal. Alleen zinvol bij de echte meter.
  const since =
    r && mode === 'live' && sinceNota
      ? {
          imp: r.meter.importT1 - sinceNota.meter.leveringDal + r.meter.importT2 - sinceNota.meter.leveringNormaal,
          exp: r.meter.exportT1 - sinceNota.meter.terugleveringDal + r.meter.exportT2 - sinceNota.meter.terugleveringNormaal,
          label: new Date(sinceNota.sinds).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
        }
      : null;
  // Concreet advies op basis van wat de meter nu ziet.
  const topPhase = r?.phases?.reduce((a, b) => (b.importW > a.importW ? b : a));
  const advice = !r
    ? null
    : r.exportW > 1000
      ? { tone: 'good', text: `Je levert nu ${kw(r.exportW)} terug. Goed moment voor de wasmachine, droger of vaatwasser: die gebruiken 1 tot 2 kW.` }
      : r.importW > 1800
        ? {
            tone: 'bad',
            text: `Je neemt nu ${kw(r.importW)} af${topPhase && topPhase.importW > 1500 ? `, vooral op ${topPhase.phase} (${kw(topPhase.importW)})` : ''}. Waarschijnlijk staat een radiator of de boiler aan.`,
          }
        : { tone: 'info', text: `Rustig verbruik: ${kw(r.importW)} van het net${r.exportW > 0 ? `, ${kw(r.exportW)} terug` : ''}.` };

  return (
    <Card
      title="Nu in huis"
      subtitle={
        <>
          {mode === 'mock' ? (
            <span className="pill pill-warn">Mock-data</span>
          ) : mode === 'live' ? (
            <span className="pill pill-live">Live</span>
          ) : null}{' '}
          {r?.device ?? 'Chargee Sparky'}
          {r && ` · ${new Date(r.ts).toLocaleTimeString('nl-NL')}`}
        </>
      }
    >
      {(live.error || r?.error) && <p className="error-line">Geen verbinding met de meter: {live.error ?? r?.error}</p>}
      {advice && <p className={`advice tone-${advice.tone}`}>{advice.text}</p>}
      <div className="live-grid">
        <div className="live-now">
          <span className="live-label">{net >= 0 ? 'Je neemt nu af' : 'Je levert nu terug'}</span>
          <span className="live-value">{r ? kw(Math.abs(net)) : '...'}</span>
          {r?.phases && (
            <div className="phase-row">
              {r.phases.map((p) => (
                <span key={p.phase}>
                  {p.phase} <strong>{fmt.int(p.importW - p.exportW)} W</strong>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="live-today">
          <div>
            <span className="k">Afgenomen {todayLabel}</span>
            <span className="v">{r ? fmt.kwh(r.today.imp) : '-'}</span>
          </div>
          <div>
            <span className="k">Teruggeleverd {todayLabel}</span>
            <span className="v">{r ? fmt.kwh(r.today.exp) : '-'}</span>
          </div>
          {since ? (
            <>
              <div>
                <span className="k">Afgenomen sinds jaarnota ({since.label})</span>
                <span className="v">{fmt.kwh(since.imp)}</span>
              </div>
              <div>
                <span className="k">Teruggeleverd sinds jaarnota</span>
                <span className="v">{fmt.kwh(since.exp)}</span>
              </div>
              <div>
                <span className="k">Netto tot nu toe</span>
                <span className="v">{since.exp >= since.imp ? `${fmt.kwh(since.exp - since.imp)} terug` : `${fmt.kwh(since.imp - since.exp)} afname`}</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="k">Meterstand afname (dal + normaal)</span>
                <span className="v small">{r ? fmt.kwh(r.meter.importT1 + r.meter.importT2) : '-'}</span>
              </div>
              <div>
                <span className="k">Meterstand teruglevering</span>
                <span className="v small">{r ? fmt.kwh(r.meter.exportT1 + r.meter.exportT2) : '-'}</span>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="history-head">
        <h3 className="mini-title">Gemeten {daily ? 'per dag' : 'per uur'}</h3>
        <Segmented
          value={range}
          options={[
            { value: '48u', label: '48 uur' },
            { value: '30d', label: '30 dagen' },
          ]}
          onChange={setRange}
        />
      </div>
      {buckets.length > 0 ? (
        <StackedColumns
          ariaLabel={`Gemeten afname en teruglevering ${daily ? 'per dag' : 'per uur'}`}
          categories={labels}
          categoryTitles={titles}
          up={[FLOW_SERIES.imp]}
          down={[FLOW_SERIES.exp]}
          values={{ imp: buckets.map((h) => h.imp), exp: buckets.map((h) => h.exp) }}
          format={(v) => `${fmt.one(v)} kWh`}
          tickEvery={daily ? 5 : 6}
          height={170}
          extraRows={(i) => {
            const b = buckets[i];
            const rows = [{ label: 'waarvan afname in dal', value: `${fmt.one(b.impD)} kWh`, strong: false }];
            if (b.pImpMax) rows.push({ label: 'piek afname', value: `${fmt.one(b.pImpMax / 1000)} kW`, strong: false });
            return rows;
          }}
        />
      ) : (
        <p className="hint">Nog geen meetgegevens in deze periode.</p>
      )}
      {first && (
        <p className="hint">
          Opgeslagen per kwartier sinds{' '}
          {first.toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} in{' '}
          <code>data/{mode === 'mock' ? 'p1-mock' : 'p1'}/</code>. Er wordt alleen gemeten zolang de server of de collector draait.
        </p>
      )}
    </Card>
  );
}
