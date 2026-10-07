import { useCallback } from 'react';
import { api } from '../lib/api';
import { useNow, usePoll } from '../lib/usePoll';
import { Card } from './Card';
import { StepLines } from './charts/StepLines';
import { fmt } from './charts/scale';

interface Props {
  /** dynamisch: opslag per kWh incl. BTW */
  opslag: number;
  /** energiebelasting per kWh incl. BTW */
  eb: number;
  /** je huidige vaste prijs (incl. EB) ter vergelijking */
  vastNormaal: number;
  vastDal: number;
}

const hourLabel = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

/** Goedkoopste aaneengesloten blok van n uur binnen een lijst uren. */
function cheapestBlock(hours: Array<{ t: Date; p: number }>, n: number) {
  let best: { start: Date; end: Date; avg: number } | null = null;
  for (let i = 0; i + n <= hours.length; i++) {
    const avg = hours.slice(i, i + n).reduce((a, h) => a + h.p, 0) / n;
    if (!best || avg < best.avg) best = { start: hours[i].t, end: new Date(hours[i + n - 1].t.getTime() + 3_600_000), avg };
  }
  return best;
}

export function PricesToday({ opslag, eb, vastNormaal, vastDal }: Props) {
  const fetcher = useCallback(() => api.pricesToday(), []);
  const { data, error } = usePoll(fetcher, 15 * 60_000);
  const now = useNow(60_000);
  const hours = (data?.prices ?? []).map((x) => ({ t: new Date(x.t), p: x.price * 1.21 + opslag + eb }));
  const dayKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const todayKey = dayKey(new Date(now));
  const today = hours.filter((h) => dayKey(h.t) === todayKey);
  const tomorrow = hours.filter((h) => dayKey(h.t) > todayKey);
  const nowHour = hours.find((h) => h.t.getTime() <= now && now < h.t.getTime() + 3_600_000);
  const restToday = today.filter((h) => h.t.getTime() + 3_600_000 > now);
  const blockToday = cheapestBlock(restToday, 3);
  const blockTomorrow = tomorrow.length ? cheapestBlock(tomorrow.filter((h) => h.t.getHours() >= 7 && h.t.getHours() < 23), 3) : null;
  const priciest = today.length ? today.reduce((a, b) => (b.p > a.p ? b : a)) : null;

  const labels = hours.map((h) =>
    h.t.toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', timeZone: 'Europe/Amsterdam' }).replace(',', ''),
  );
  const titles = hours.map((h) => `${h.t.toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'Europe/Amsterdam' })} ${hourLabel(h.t)}`);

  return (
    <Card
      title="Stroomprijs vandaag en morgen"
      subtitle="Wat je per kWh zou betalen met een dynamisch contract (beursprijs + opslag + belasting). Morgen verschijnt rond 13 uur."
      className="span-2"
    >
      {error && <p className="error-line">Prijzen ophalen lukt niet: {error}</p>}
      <div className="price-facts">
        {nowHour && (
          <div className="stat">
            <span className="stat-label">Nu</span>
            <span className="stat-value">{fmt.perKwh(nowHour.p)}</span>
            <span className="stat-note">jouw vaste prijs: {fmt.perKwh(vastNormaal)} normaal, {fmt.perKwh(vastDal)} dal</span>
          </div>
        )}
        {blockToday && (
          <div className="stat">
            <span className="stat-label">Goedkoopste 3 uur vandaag</span>
            <span className="stat-value">
              {hourLabel(blockToday.start)}-{hourLabel(blockToday.end)}
            </span>
            <span className="stat-note">gemiddeld {fmt.perKwh(blockToday.avg)}</span>
          </div>
        )}
        {blockTomorrow && (
          <div className="stat">
            <span className="stat-label">Goedkoopste 3 uur morgen</span>
            <span className="stat-value">
              {hourLabel(blockTomorrow.start)}-{hourLabel(blockTomorrow.end)}
            </span>
            <span className="stat-note">gemiddeld {fmt.perKwh(blockTomorrow.avg)}</span>
          </div>
        )}
        {priciest && (
          <div className="stat">
            <span className="stat-label">Duurste uur vandaag</span>
            <span className="stat-value">{hourLabel(priciest.t)}</span>
            <span className="stat-note">{fmt.perKwh(priciest.p)}</span>
          </div>
        )}
      </div>
      {hours.length > 0 && (
        <StepLines
          ariaLabel="Uurprijs vandaag en morgen bij een dynamisch contract"
          categories={labels}
          categoryTitles={titles}
          series={[{ key: 'p', label: 'Dynamische prijs', color: 'var(--series-1)', values: hours.map((h) => h.p) }]}
          format={fmt.perKwh}
          tickFormat={(v) => `€${fmt.one(v)}`}
          tickEvery={6}
          height={180}
        />
      )}
      <p className="hint">
        Met je huidige vaste contract en saldering maakt het tijdstip voor je rekening (nog) niet uit. Vanaf 2027 wel: was, droog
        en vaat dan bij voorkeur in de goedkope uren en als je panelen leveren.
      </p>
    </Card>
  );
}
