import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { usePoll, useNow } from '../lib/usePoll';
import { type Appliance } from '../model/appliances';
import { flexTips, sessionCost, winterProfile, zelfGebruikWaarde, FLEX } from '../model/tips';
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
  /** kosten per teruggeleverde kWh bij een dynamisch contract */
  terugleverOpslag: number;
}

/** Besparing als percentage van wat je werkelijk per kWh betaalt (beursprijs + BTW + opslag + belasting). */
const pctCheaper = (nu: number, best: number, vaste: number) => Math.round(((nu - best) / (nu + vaste)) * 100);

const uur = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
const localHour = (d: Date) => Number(d.toLocaleTimeString('nl-NL', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Amsterdam' }));
const localDay = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

/** Concrete tips om slim te plannen: gebaseerd op je apparatenlijst en de uurprijzen (historisch en vandaag/morgen). */
export function TipsCard({ data, vastNormaal, vastDal, dalVanafUur, vasteDeel, terugleverOpslag }: Props) {
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

  const zon = useMemo(() => zelfGebruikWaarde(data.epex, data.priceYear, vasteDeel, terugleverOpslag), [data, vasteDeel, terugleverOpslag]);
  const dalVoordeel = vastNormaal - vastDal;
  const duurste = profile.indexOf(Math.max(...profile));
  const goedkoopste = profile.indexOf(Math.min(...profile));

  const spreadPct = pctCheaper(Math.max(...profile), Math.min(...profile), vasteDeel);

  return (
    <Card
      title="Slim inplannen"
      subtitle="Wanneer start je was, vaat en droger het voordeligst? Berekend met de uurprijzen en je eigen apparatenlijst."
      className="span-2"
    >
      <Rich as="p" className="hint tips-intro">
        Met je huidige vaste contract levert dit nu niets op, behalve in de daluren. Vanaf een dynamisch contract per 2027 telt elk uur.
      </Rich>

      <ul className="tips-list">
        {tips.map((t) => {
          const prices = ahead.map((h) => h.p);
          const options = ahead.map((h, i) => ({ i, h: localHour(h.t) })).filter((o) => o.h >= t.spec.vanaf && o.h <= t.spec.totStart);
          let live: { start: Date; perKwh: number; nuPerKwh: number; dayLabel: string } | null = null;
          if (options.length > 0) {
            let b: { i: number; c: number } | null = null;
            for (const o of options) {
              const c = sessionCost(prices, o.i, t.spec.uren, 1);
              if (!Number.isNaN(c) && (!b || c < b.c)) b = { i: o.i, c };
            }
            const nu = sessionCost(prices, 0, t.spec.uren, 1);
            if (b && !Number.isNaN(nu)) {
              const start = ahead[b.i].t;
              live = { start, perKwh: b.c, nuPerKwh: nu, dayLabel: localDay(start) > localDay(new Date(now)) ? 'morgen' : 'vandaag' };
            }
          }
          const liveSaving = live ? (live.nuPerKwh - live.perKwh) * t.spec.kwh : 0;
          const good = t.perBeurt >= 0.005;
          return (
            <li key={t.spec.label} className="tip">
              <div className="tip-head">
                <span className="tip-name">{t.spec.label}</span>
                <span className={`tip-badge ${good ? '' : 'neutral'}`}>{good ? `${pctCheaper(t.prijsNu, t.prijsBest, vasteDeel)}% goedkoper` : 'al goed'}</span>
              </div>
              <p className="tip-big">{good ? `Start rond ${uur(t.besteStart)}` : `Je tijd is al voordelig`}</p>
              <Rich as="p" className="tip-text">
                {good
                  ? `Ongeveer ${fmt.eur(t.perJaarBesparing)} per jaar bij de ${fmt.kwh(t.kwhPerJaar)} die je lijst aan dit apparaat toekent. ${t.spec.waarom}`
                  : `Je gebruikelijke tijd is gemiddeld net zo voordelig als het beste moment (${uur(t.besteStart)}).`}
              </Rich>
              {live && liveSaving >= 0.005 && (
                <Rich as="p" className="tip-live">
                  <strong>{live.dayLabel}</strong> start om {uur(localHour(live.start))}: {pctCheaper(live.nuPerKwh, live.perKwh, vasteDeel)}% goedkoper dan nu starten.
                </Rich>
              )}
              {live && liveSaving < 0.005 && <p className="tip-live">Vandaag en morgen: nu starten is ongeveer net zo goed.</p>}
              <details className="tip-more">
                <summary>Hoe is dit berekend</summary>
                <Rich as="p">
                  Gemiddelde stroomprijs over de wintermaanden van {data.priceYear}: {fmt.perKwh(t.prijsBest)} per kWh als je om {uur(t.besteStart)} start, tegen{' '}
                  {fmt.perKwh(t.prijsNu)} op je gebruikelijke tijd. Per beurt rekenen we met {fmt.kwh(t.spec.kwh)} in {t.spec.uren} uur (aanname). Het percentage
                  is van wat je werkelijk per kWh betaalt, dus inclusief opslag en energiebelasting.
                </Rich>
              </details>
            </li>
          );
        })}
        {dalVoordeel > 0.005 && (
          <li className="tip">
            <div className="tip-head">
              <span className="tip-name">Daluren, nu al</span>
              <span className="tip-badge">{pctCheaper(vastNormaal, vastDal, 0)}% goedkoper</span>
            </div>
            <p className="tip-big">Na {dalVanafUur}:00 en in het weekend</p>
            <Rich as="p" className="tip-text">
              Het daltarief is {fmt.perKwh(vastDal)} in plaats van {fmt.perKwh(vastNormaal)} per kWh. Dat werkt nu al, tot het einde van je contract.
            </Rich>
          </li>
        )}
        {zon.perKwh > 0.005 && (
          <li className="tip">
            <div className="tip-head">
              <span className="tip-name">Zonuren, vanaf 2027</span>
              <span className="tip-badge">{zon.afname - zon.perKwh < 0.02 ? 'terugleveren levert ~niets' : `${Math.round((zon.perKwh / (zon.afname - zon.perKwh)) * 100)}% meer waard`}</span>
            </div>
            <p className="tip-big">Gebruik zelf wat je opwekt</p>
            <Rich as="p" className="tip-text">
              Zonder saldering levert een kWh terugleveren in de zonuren (11:00 tot 16:00, april tot en met september) gemiddeld {fmt.perKwh(zon.afname - zon.perKwh)} op,
              terwijl zelf gebruiken je {fmt.perKwh(zon.afname)} aan afname scheelt: {fmt.perKwh(zon.perKwh)} meer per kWh. Een droogbeurt van 2,0 kWh is dan ongeveer {fmt.eur2(zon.perKwh * 2)} waard, een wasbeurt van 0,8 kWh ongeveer {fmt.eur2(zon.perKwh * 0.8)}.
            </Rich>
            <details className="tip-more">
              <summary>Hoe is dit berekend</summary>
              <Rich as="p">
                Afname kost gemiddeld {fmt.perKwh(zon.afname)} per kWh (beursprijs {data.priceYear} met BTW, plus opslag en energiebelasting); teruglevering levert de beursprijs min
                {' '}{fmt.perKwh(terugleverOpslag)} op. Het voordeel geldt alleen als de panelen op dat moment genoeg leveren, dus vooral op zonnige dagen. Het percentage is het voordeel
                als deel van de afnameprijs.
              </Rich>
            </details>
          </li>
        )}
        <li className="tip">
          <div className="tip-head">
            <span className="tip-name">De dag in prijs</span>
            <span className="tip-badge neutral">{spreadPct}% verschil</span>
          </div>
          <p className="tip-big">Goedkoopst om {uur(goedkoopste)}</p>
          <Rich as="p" className="tip-text">
            Het duurste uur was gemiddeld {uur(duurste)}. Een kWh in het goedkoopste uur kost ongeveer {spreadPct}% minder. Bij was en vaat is het vooral een kwestie van de
            starttijd verschuiven, niet van minder gebruiken.
          </Rich>
        </li>
      </ul>
      <p className="hint">
        De beurten en kWh per beurt zijn aannames voor een gemiddeld programma ({FLEX.map((f) => f.label.toLowerCase()).join(', ')}). Pas je apparaat aan in het tabblad
        Apparaten; de tips volgen je lijst.
      </p>
    </Card>
  );
}
