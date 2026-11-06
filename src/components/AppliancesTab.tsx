import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, FASEN, SHAPE_KEYS, SHAPE_LABELS, profile, yearlyKwh, type Appliance, type Category, type Fase } from '../model/appliances';
import { api } from '../lib/api';
import { AdaxCard } from './AdaxCard';
import { DayBalance } from './DayBalance';
import { WindowEffect } from './WindowEffect';
import { Card } from './Card';
import { Segmented } from './controls';
import { StackedColumns } from './charts/StackedColumns';
import { Treemap } from './charts/Treemap';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

/** Aanpassingen uit eerdere versies stonden in de browser; die worden eenmalig overgenomen in het bestand. */
const OLD_KEY = 'energy-dash:apparaten:v1';
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));

const ZEKER = { goed: 'redelijk zeker', redelijk: 'schatting', ruw: 'ruwe gok' } as const;

interface Props {
  /** huishouden plus wassen en vaat in het model (kWh per jaar), zoals afgestemd op je nota's */
  modelKwh: number;
  /** je prijs per kWh van het net, incl. belasting, voor euro-indicaties */
  pricePerKwh: number;
  /** boiler per maand volgens het model (kWh) en vermogen van de panelen (kWp), voor de dagbalans */
  boilerMonthly: number[];
  kwp: number;
}

export function AppliancesTab({ modelKwh, pricePerKwh, boilerMonthly, kwp }: Props) {
  const [items, setItems] = useState<Appliance[] | null>(null);
  const [bron, setBron] = useState<'eigen' | 'voorbeeld'>('voorbeeld');
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [season, setSeason] = useState<'winter' | 'zomer'>('winter');
  const [open, setOpen] = useState<string | null>(null);
  const [room, setRoom] = useState<string>('alles');

  const save = (next: Appliance[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .saveApparaten(next)
        .then((r) => {
          setBron(r.bron);
          setSaveError(null);
        })
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
    }, 600);
  };

  useEffect(() => {
    api
      .apparaten()
      .then((r) => {
        let list = r.apparaten;
        try {
          const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null') as Record<string, { watt?: number; urenPerDag?: number }> | null;
          if (old) {
            list = list.map((a) => ({ ...a, ...old[a.id] }));
            localStorage.removeItem(OLD_KEY);
            save(list);
          }
        } catch {
          /* geen oude aanpassingen */
        }
        setItems(list);
        setBron(r.bron);
      })
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  }, []);

  const list: Appliance[] = useMemo(() => items ?? [], [items]);
  const update = (next: Appliance[]) => {
    setItems(next);
    save(next);
  };
  const edit = (id: string, patch: Partial<Appliance>) => update(list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const add = () => {
    const a: Appliance = { id: `eigen-${Date.now()}`, naam: 'Nieuw apparaat', ruimte: room === 'alles' ? 'Overal' : room, categorie: 'sluip', watt: 50, urenPerDag: 1, vorm: 'constant', zeker: 'ruw' };
    update([...list, a]);
    setOpen(a.id);
  };
  const remove = (id: string) => {
    update(list.filter((a) => a.id !== id));
    setOpen(null);
  };
  const rooms = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of list) m.set(a.ruimte, (m.get(a.ruimte) ?? 0) + yearlyKwh(a));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const shown = useMemo(() => (room === 'alles' ? list : list.filter((a) => a.ruimte === room)), [list, room]);
  const prof = useMemo(() => profile(shown), [shown]);
  const [view, setView] = useState<'lijst' | 'treemap'>('lijst');
  const ranked = useMemo(() => [...shown].sort((a, b) => yearlyKwh(b) - yearlyKwh(a)), [shown]);
  const max = Math.max(...ranked.map(yearlyKwh), 1);

  const cats = (Object.keys(CATEGORIES) as Category[]).filter((c) => prof.perCategory[c] > 0);
  const day = season === 'winter' ? prof.winterDay : prof.zomerDay;
  const dayTotal = (i: number) => cats.reduce((s, c) => s + day[c][i], 0);
  const peakHour = HOURS.reduce((p, _, i) => (dayTotal(i) > dayTotal(p) ? i : p), 0);
  const nightBase = Math.min(...HOURS.map((_, i) => dayTotal(i)));

  const gap = modelKwh - prof.total;
  const top3 = ranked.slice(0, 3);

  if (!items) return saveError ? <p className="error-line span-2">{saveError}</p> : null;

  return (
    <>
      {bron === 'voorbeeld' && (
        <Rich as="p" className="hint span-2">Je ziet het voorbeeld (data/apparaten.mock.json). Zodra je iets aanpast of toevoegt, maakt het dashboard je eigen lijst aan in data/apparaten.json (privé, niet in git).</Rich>
      )}
      {saveError && <p className="error-line span-2">{saveError}</p>}
      <datalist id="kamers">
        {rooms.map(([name]) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <section className="kpi-row span-2" aria-label="Apparaten samengevat">
        <div className="kpi">
          <span className="kpi-label">{room === 'alles' ? 'Opgetelde apparaten' : room}</span>
          <span className="kpi-value">{fmt.kwh(prof.total)}</span>
          <Rich as="span" className="kpi-sub">per jaar, ca. {fmt.eur(prof.total * pricePerKwh)} aan stroom. Schatting op typische vermogens.</Rich>
        </div>
        {room === 'alles' && (
        <div className="kpi">
          <span className="kpi-label">Model: huishouden en was</span>
          <span className="kpi-value">{fmt.kwh(modelKwh)}</span>
          <Rich as="span" className="kpi-sub">
            {gap > 0
              ? `${fmt.kwh(gap)} meer dan de apparaten verklaren. Dat is ruimte voor sluipverbruik of onderschatte vermogens.`
              : `${fmt.kwh(-gap)} minder dan de apparaten opleveren. Of de apparaatschattingen zijn te hoog, of het model stopt te veel in verwarming en boiler.`}
          </Rich>
        </div>
        )}
        <div className="kpi">
          <span className="kpi-label">Grootste drie</span>
          <ul className="top-list">
            {top3.map((a) => (
              <li key={a.id}>
                <span className="top-name">{a.naam.split(' (')[0]}</span>
                <span className="top-kwh">{fmt.kwh(yearlyKwh(a))}</span>
              </li>
            ))}
          </ul>
          <Rich as="span" className="kpi-sub">{fmt.kwh(top3.reduce((s, a) => s + yearlyKwh(a), 0))} samen, {Math.round((top3.reduce((s, a) => s + yearlyKwh(a), 0) / Math.max(1, prof.total)) * 100)}% van het totaal.</Rich>
        </div>
      </section>

      <DayBalance apparaten={list} boilerMonthly={boilerMonthly} kwp={kwp} />

      <AdaxCard />

      <WindowEffect />

      <div className="room-filter span-2" role="group" aria-label="Kies een kamer">
        <button type="button" className={`chip ${room === 'alles' ? 'on' : ''}`} aria-pressed={room === 'alles'} onClick={() => setRoom('alles')}>
          Alles · {fmt.int(rooms.reduce((s, [, k]) => s + k, 0))} kWh
        </button>
        {rooms.map(([name, kwh]) => (
          <button key={name} type="button" className={`chip ${room === name ? 'on' : ''}`} aria-pressed={room === name} onClick={() => setRoom(name)}>
            {name} · {fmt.int(kwh)} kWh
          </button>
        ))}
      </div>

      <Card
        title={room === 'alles' ? 'Een gemiddelde dag, uur voor uur' : `Een gemiddelde dag in: ${room}`}
        subtitle={`Zo verdeelt het apparatenprofiel zich over de dag. Piek rond ${peakHour}:00 uur, de laagste uren zitten rond ${fmt.kwh(nightBase)} per uur (altijd aan).`}
        className="span-2"
        actions={
          <Segmented
            value={season}
            options={[
              { value: 'winter', label: 'Winter' },
              { value: 'zomer', label: 'Zomer' },
            ]}
            onChange={setSeason}
          />
        }
      >
        <StackedColumns
          ariaLabel="Gestapelde kolommen: stroomverbruik van apparaten per uur van een gemiddelde dag, per categorie"
          categories={HOURS}
          categoryTitles={HOURS.map((h) => `${h}:00 tot ${Number(h) + 1}:00`)}
          up={cats.map((c) => ({ key: c, label: CATEGORIES[c].label, color: CATEGORIES[c].color }))}
          down={[]}
          values={day}
          height={260}
          tickEvery={3}
          format={(v) => `${(v * 1000).toFixed(0)} Wh`}
          extraRows={(i) => [{ label: 'Totaal', value: `${(dayTotal(i) * 1000).toFixed(0)} Wh`, strong: true }]}
        />
        <Rich as="p" className="hint">
          Verwarming en boiler staan er niet bij: die hebben hun eigen model. De vorm per apparaat is een aanname over wanneer het draait
          (avond, rond maaltijden, de hele dag). De Chargee-meter laat straks zien waar dit patroon afwijkt van de werkelijkheid.
        </Rich>
      </Card>

      <Card
        title="Per fase van de meter"
        subtitle="Je aansluiting heeft drie fases (L1, L2, L3), elk met een eigen stroomgroep. Hier zie je welke apparaten op welke fase hangen."
        className="span-2"
      >
        <div className="phase-grid">
          {([...FASEN, undefined] as Array<Fase | undefined>).map((f) => {
            const items = list.filter((a) => (f ? a.fase?.includes(f) : !a.fase?.length));
            // een apparaat over meerdere fases telt voor een gelijk deel mee op elke fase (aanname)
            const kwh = items.reduce((sum, a) => sum + yearlyKwh(a) / (a.fase?.length || 1), 0);
            const top = [...items].sort((x, y) => yearlyKwh(y) - yearlyKwh(x)).slice(0, 4);
            return (
              <div key={f ?? 'onbekend'} className="phase-box">
                <span className="kpi-label">{f ?? 'Nog niet bekend'}</span>
                <span className="phase-count">{items.length} {items.length === 1 ? 'apparaat' : 'apparaten'}</span>
                <Rich as="span" className="kpi-sub">{fmt.kwh(kwh)} per jaar in deze lijst</Rich>
                {top.length > 0 && (
                  <ul className="top-list">
                    {top.map((a) => (
                      <li key={a.id}>
                        <span className="top-name">{a.naam.split(' (')[0]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <Rich as="p" className="hint">
          De fases komen uit metingen van de meter: wat aan of uit ging en op welke fase het vermogen veranderde. Niet in deze lijst staan de
          boiler en de verwarming, die hebben hun eigen model. Open een apparaat en vink de fase aan als je die weet; een zwaar apparaat zoals een inductieplaat kan over meerdere fases verdeeld zijn en telt dan evenredig mee. Je kunt het ook invullen
          op basis van de groepenkast.
        </Rich>
      </Card>

      <Card
        title={room === 'alles' ? 'Wat kost elk apparaat' : `Apparaten in: ${room}`}
        subtitle="Naar schatting per jaar. Klik een regel en pas vermogen of uren aan; de rest van het profiel rekent mee."
        className="span-2"
        actions={
          <>
            <Segmented
              label="Weergave"
              value={view}
              options={[
                { value: 'lijst', label: 'Lijst' },
                { value: 'treemap', label: 'Treemap' },
              ]}
              onChange={setView}
            />
            <button type="button" className="ghost-btn" onClick={add}>
              Apparaat toevoegen
            </button>
          </>
        }
      >
        {view === 'treemap' && (
          <>
            <Treemap
              ariaLabel="Treemap: stroomverbruik per apparaat, gegroepeerd per categorie"
              height={440}
              format={(v) => fmt.kwh(v)}
              items={ranked.map((a) => ({
                id: a.id,
                label: a.naam.split(' (')[0],
                value: yearlyKwh(a),
                group: a.categorie,
                groupLabel: CATEGORIES[a.categorie].label,
                color: CATEGORIES[a.categorie].color,
                detail: `${fmt.eur2(yearlyKwh(a) * pricePerKwh).replace(',00', '')} per jaar`,
              }))}
              onSelect={(id) => {
                setOpen(id);
                setView('lijst');
              }}
            />
            <Rich as="p" className="hint">
              De oppervlakte van een vak is het verbruik per jaar, de kleur de categorie. Klik een vak om het apparaat in de lijst te openen en aan te passen.
            </Rich>
          </>
        )}
        <div className="supplier-list" role="list" style={view === 'lijst' ? undefined : { display: 'none' }}>
          {ranked.map((a, i) => {
            const y = yearlyKwh(a);
            const cat = CATEGORIES[a.categorie];
            return (
              <div key={a.id} role="listitem" className="supplier">
                <button type="button" className="supplier-row" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <span className="supplier-rank">{i + 1}</span>
                  <span className="supplier-name">
                    <strong>{a.naam}</strong>
                    <Rich as="span" className="supplier-sub">
                      {a.ruimte} · {cat.label} · {SHAPE_LABELS[a.vorm]}{a.fase?.length ? ` · ${a.fase.join(' en ')}` : ''}
                    </Rich>
                  </span>
                  <span className="supplier-track" aria-hidden="true">
                    <span className="supplier-bar" style={{ width: `${(y / max) * 100}%`, background: cat.color }} />
                  </span>
                  <span className="supplier-total">
                    <strong>{fmt.kwh(y)}</strong>
                    <Rich as="span" className="supplier-sub">{fmt.eur(y * pricePerKwh)} per jaar</Rich>
                  </span>
                  <span className="supplier-delta">{ZEKER[a.zeker]}</span>
                </button>
                {open === a.id && (
                  <div className="supplier-detail">
                    <label className="app-field">
                      <span className="k">Naam</span>
                      <input type="text" value={a.naam} maxLength={120} onChange={(e) => edit(a.id, { naam: e.target.value })} />
                    </label>
                    <label className="app-field">
                      <span className="k">Kamer</span>
                      <input type="text" list="kamers" value={a.ruimte} maxLength={60} onChange={(e) => edit(a.id, { ruimte: e.target.value })} />
                    </label>
                    <fieldset className="app-field fase-field">
                      <legend className="k">Fase op de meter</legend>
                      <span className="fase-options">
                        {FASEN.map((f) => (
                          <label key={f}>
                            <input
                              type="checkbox"
                              checked={a.fase?.includes(f) ?? false}
                              onChange={(e) => {
                                const next = FASEN.filter((x) => (x === f ? e.target.checked : a.fase?.includes(x)));
                                edit(a.id, { fase: next.length > 0 ? next : undefined });
                              }}
                            />
                            {f}
                          </label>
                        ))}
                      </span>
                    </fieldset>
                    <label className="app-field">
                      <span className="k">Vermogen (W)</span>
                      <input type="number" min={0} step={5} value={a.watt} onChange={(e) => edit(a.id, { watt: Math.max(0, Number(e.target.value)) })} />
                    </label>
                    <label className="app-field">
                      <span className="k">Uren per dag{a.winter ? ' (nov t/m mrt)' : ''}</span>
                      <input type="number" min={0} max={24} step={0.1} value={a.urenPerDag} onChange={(e) => edit(a.id, { urenPerDag: Math.min(24, Math.max(0, Number(e.target.value))) })} />
                    </label>
                    <label className="app-field">
                      <span className="k">Dagen per jaar (leeg = hele jaar)</span>
                      <input type="number" min={0} max={366} step={1} value={a.dagen ?? ''} onChange={(e) => edit(a.id, { dagen: e.target.value === '' ? undefined : Math.min(366, Math.max(0, Number(e.target.value))) })} />
                    </label>
                    <label className="app-field">
                      <span className="k">Moment van de dag</span>
                      <select value={a.vorm} onChange={(e) => edit(a.id, { vorm: e.target.value as Appliance['vorm'] })}>
                        {SHAPE_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {SHAPE_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="app-field">
                      <span className="k">Soort</span>
                      <select value={a.categorie} onChange={(e) => edit(a.id, { categorie: e.target.value as Category })}>
                        {(Object.keys(CATEGORIES) as Category[]).map((k) => (
                          <option key={k} value={k}>
                            {CATEGORIES[k].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {a.opmerking && <Rich as="p" className="hint">{a.opmerking}</Rich>}
                    <button type="button" className="ghost-btn" onClick={() => remove(a.id)}>
                      Verwijderen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Rich as="p" className="hint">
          Vermogens zijn typische waarden en jouw opgave van de gebruiksduur, geen metingen. Een stekkermeter van een paar euro op de
          handdoekradiator, droger en diepvries geeft de grootste winst in nauwkeurigheid. Wijzigingen worden opgeslagen in data/apparaten.json (alleen op deze computer, niet in git).
        </Rich>
      </Card>
    </>
  );
}
