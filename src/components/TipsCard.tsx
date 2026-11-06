import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { usePoll, useNow } from '../lib/usePoll';
import { type Appliance } from '../model/appliances';
import { bestStartAhead, flexTips, sessionCost, winterProfile, FLEX } from '../model/tips';
import type { YearData } from '../model/types';
import { Card } from './Card';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

interface Props {
  data: YearData;
  /** je huidige vaste prijzen incl. belasting, voor het dal-voordeel */
  vastNormaal: number;
  vastDal: number;
  /** werkdagen: dalvanaf (lokaal uur) */
  dalVanafUur: number;
  /** vaste delen van de dynamische prijs per kWh: opslag en energiebelasting (incl. BTW) */
  vasteDeel: number;
}

/** Besparing als percentage van wat je werkelijk per kWh betaalt (beursprijs + BTW + opslag + belasting). */
const pctCheaper = (nu: number, best: number, vaste: number) => Math.round(((nu - best) / (nu + vaste)) * 100);

const uur = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
const localHour = (d: Date) => Number(d.toLocaleTimeString('nl-NL', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Amsterdam' }));
const localDay = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

/** Concrete tips om slim te plannen: gebaseerd op je apparatenlijst en de uurprijzen (historisch en vandaag/morgen). */
export function TipsCard({ data, vastNormaal, vastDal, dalVanafUur, vasteDeel }: Props) {
  const [list, setList] = useState<Appliance[] | null>(null);
  useEffect(() => {
    api.apparaten().then((r) => setList(r.apparaten)).catch(() => setList([]));
  }, []);
  const profile = useMemo(() => winterProfile(data.epex, data.priceYear), [data]);
  const tips = useMemo(() => (list ? flexTips(list, profile) : []), [list, profile]);

  const fetcher = useCallback(() => api.pricesToday(), []);
  const { data: today } = usePoll(fetcher, 15 * 60_000);
  const now = useNow(60_000);
  const ahead = useMemo(() => {
    const hours = (today?.prices ?? []).map((x) => ({ t: new Date(x.t), p: x.price * 1.21 })).filter((h) => h.t.getTime() + 3_600_000 > now);
    return hours;
  }, [today, now]);

  const dalVoordeel = vastNormaal - vastDal;
  const duurste = profile.indexOf(Math.max(...profile));
  const goedkoopste = profile.indexOf(Math.min(...profile));

  return (
    <Card
      title="Slim inplannen"
      subtitle="Wanneer start je was, vaat en droger het voordeligst? Berekend met de uurprijzen en je eigen apparatenlijst."
      className="span-2"
    >
      <Rich as="p" className="hint">
        Dit levert met je huidige vaste contract nu niets op, behalve in de daluren. Vanaf een dynamisch contract per 2027 telt elk uur. De bedragen zijn
        gemiddelden over de wintermaanden van {data.priceYear} (november tot en met maart), geen voorspelling. Per beurt rekenen we met typische
        waarden (aanname): vaatwasser 1,0 kWh in 4 uur, wasmachine 0,8 kWh in 2 uur, droger 2,0 kWh in 5 uur.
      </Rich>

      <ul className="tips-list">
        {tips.map((t) => {
          const aheadBest = bestStartAhead(
            ahead.map((h) => h.p),
            t.spec.uren,
            0,
            ahead.length,
          );
          // alleen starttijden die binnen het realistische venster vallen
          const options = ahead
            .map((h, i) => ({ i, h: localHour(h.t) }))
            .filter((o) => o.h >= t.spec.vanaf && o.h <= t.spec.totStart);
          let live: { start: Date; perKwh: number; nuPerKwh: number; dayLabel: string } | null = null;
          if (aheadBest && options.length > 0) {
            let b: { i: number; c: number } | null = null;
            for (const o of options) {
              const c = sessionCost(ahead.map((h) => h.p), o.i, t.spec.uren, 1);
              if (!Number.isNaN(c) && (!b || c < b.c)) b = { i: o.i, c };
            }
            const nu = sessionCost(ahead.map((h) => h.p), 0, t.spec.uren, 1);
            if (b && !Number.isNaN(nu)) {
              const start = ahead[b.i].t;
              const tomorrow = localDay(start) > localDay(new Date(now));
              live = { start, perKwh: b.c, nuPerKwh: nu, dayLabel: tomorrow ? 'morgen' : 'vandaag' };
            }
          }
          const liveSaving = live ? (live.nuPerKwh - live.perKwh) * t.spec.kwh : 0;
          return (
            <li key={t.spec.label} className="tip">
              <div className="tip-head">
                <strong>{t.spec.label}</strong>
                <span className="tip-value">
                  {t.perBeurt >= 0.005 ? `${pctCheaper(t.prijsNu, t.prijsBest, vasteDeel)}% goedkoper` : 'al een goed moment'}
                </span>
              </div>
              {t.perBeurt >= 0.005 ? (
                <Rich as="p" className="tip-text">
                  Start rond {uur(t.besteStart)} in plaats van op je gebruikelijke tijd en je betaalt per kWh gemiddeld{' '}
                  {pctCheaper(t.prijsNu, t.prijsBest, vasteDeel)}% minder (stroomprijs {fmt.perKwh(t.prijsBest)} in plaats van {fmt.perKwh(t.prijsNu)}). Bij de{' '}
                  {fmt.kwh(t.kwhPerJaar)} per jaar die je lijst aan dit apparaat toekent is dat ongeveer {fmt.eur(t.perJaarBesparing)} per jaar. {t.spec.waarom}
                </Rich>
              ) : (
                <Rich as="p" className="tip-text">
                  Je gebruikelijke tijd is gemiddeld al even voordelig als het beste moment ({uur(t.besteStart)}).
                </Rich>
              )}
              {live && liveSaving >= 0.005 && (
                <Rich as="p" className="tip-live">
                  Voor {live.dayLabel}: de goedkoopste start is {uur(localHour(live.start))}. Dat is {pctCheaper(live.nuPerKwh, live.perKwh, vasteDeel)}% goedkoper
                  dan nu starten (stroomprijs {fmt.perKwh(live.perKwh)} in plaats van {fmt.perKwh(live.nuPerKwh)}).
                </Rich>
              )}
              {live && liveSaving < 0.005 && <p className="tip-live">Voor vandaag en morgen: nu starten is ongeveer net zo goed als later.</p>}
            </li>
          );
        })}
        {dalVoordeel > 0.005 && (
          <li className="tip">
            <div className="tip-head">
              <strong>Met je huidige contract: daluren</strong>
              <span className="tip-value">{pctCheaper(vastNormaal, vastDal, 0)}% goedkoper</span>
            </div>
            <Rich as="p" className="tip-text">
              In het weekend en op werkdagen vanaf {dalVanafUur}:00 tot 07:00 betaal je het daltarief: {pctCheaper(vastNormaal, vastDal, 0)}% goedkoper dan het normale tarief ({fmt.perKwh(vastDal)} in plaats van {fmt.perKwh(vastNormaal)} per kWh).
              Dat werkt nu al en tot het einde van dit contract.
            </Rich>
          </li>
        )}
        <li className="tip">
          <div className="tip-head">
            <strong>De dag in prijs</strong>
            <span className="tip-value">{pctCheaper(Math.max(...profile), Math.min(...profile), vasteDeel)}% verschil</span>
          </div>
          <Rich as="p" className="tip-text">
            In de winter was het gemiddeld om {uur(goedkoopste)} het goedkoopst en om {uur(duurste)} het duurst. Een kWh in het goedkoopste uur kost
            ongeveer {pctCheaper(Math.max(...profile), Math.min(...profile), vasteDeel)}% minder dan in het duurste uur, van wat je werkelijk per kWh betaalt. Bij de was en vaat is dat vooral een
            kwestie van de starttijd verschuiven, niet van minder gebruiken.
          </Rich>
        </li>
      </ul>
      <p className="hint">
        De beurten en kWh per beurt zijn aannames voor een gemiddeld programma ({FLEX.map((f) => f.label.toLowerCase()).join(', ')}). Heb je een apparaat
        gemeten, dan kun je dat in het tabblad Apparaten bijstellen; de tips volgen je lijst.
      </p>
    </Card>
  );
}
