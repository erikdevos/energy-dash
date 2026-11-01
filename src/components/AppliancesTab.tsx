import { useMemo, useState } from 'react';
import { CATEGORIES, DEFAULT_APPLIANCES, SHAPE_LABELS, profile, yearlyKwh, type Appliance, type Category } from '../model/appliances';
import { AdaxCard } from './AdaxCard';
import { WindowEffect } from './WindowEffect';
import { Card } from './Card';
import { Segmented } from './controls';
import { StackedColumns } from './charts/StackedColumns';
import { fmt } from './charts/scale';

const KEY = 'energy-dash:apparaten:v1';
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));

type Edits = Record<string, { watt?: number; urenPerDag?: number }>;

function loadEdits(): Edits {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Edits;
  } catch {
    return {};
  }
}

const ZEKER = { goed: 'redelijk zeker', redelijk: 'schatting', ruw: 'ruwe gok' } as const;

interface Props {
  /** huishouden plus wassen en vaat in het model (kWh per jaar), zoals afgestemd op je nota's */
  modelKwh: number;
  /** je prijs per kWh van het net, incl. belasting, voor euro-indicaties */
  pricePerKwh: number;
}

export function AppliancesTab({ modelKwh, pricePerKwh }: Props) {
  const [edits, setEdits] = useState<Edits>(loadEdits);
  const [season, setSeason] = useState<'winter' | 'zomer'>('winter');
  const [open, setOpen] = useState<string | null>(null);
  const [room, setRoom] = useState<string>('alles');

  const list: Appliance[] = useMemo(() => DEFAULT_APPLIANCES.map((a) => ({ ...a, ...edits[a.id] })), [edits]);
  const rooms = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of list) m.set(a.ruimte, (m.get(a.ruimte) ?? 0) + yearlyKwh(a));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const shown = useMemo(() => (room === 'alles' ? list : list.filter((a) => a.ruimte === room)), [list, room]);
  const prof = useMemo(() => profile(shown), [shown]);
  const ranked = useMemo(() => [...shown].sort((a, b) => yearlyKwh(b) - yearlyKwh(a)), [shown]);
  const max = Math.max(...ranked.map(yearlyKwh), 1);

  const cats = (Object.keys(CATEGORIES) as Category[]).filter((c) => prof.perCategory[c] > 0);
  const day = season === 'winter' ? prof.winterDay : prof.zomerDay;
  const dayTotal = (i: number) => cats.reduce((s, c) => s + day[c][i], 0);
  const peakHour = HOURS.reduce((p, _, i) => (dayTotal(i) > dayTotal(p) ? i : p), 0);
  const nightBase = Math.min(...HOURS.map((_, i) => dayTotal(i)));

  const gap = modelKwh - prof.total;
  const top3 = ranked.slice(0, 3);

  const edit = (id: string, patch: { watt?: number; urenPerDag?: number }) => {
    const next = { ...edits, [id]: { ...edits[id], ...patch } };
    setEdits(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* opslag niet beschikbaar: de aanpassing geldt dan alleen in deze sessie */
    }
  };
  const reset = () => {
    setEdits({});
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* zie hierboven */
    }
  };

  return (
    <>
      <section className="kpi-row span-2" aria-label="Apparaten samengevat">
        <div className="kpi">
          <span className="kpi-label">{room === 'alles' ? 'Opgetelde apparaten' : room}</span>
          <span className="kpi-value">{fmt.kwh(prof.total)}</span>
          <span className="kpi-sub">per jaar, ca. {fmt.eur(prof.total * pricePerKwh)} aan stroom. Schatting op typische vermogens.</span>
        </div>
        {room === 'alles' && (
        <div className="kpi">
          <span className="kpi-label">Model: huishouden en was</span>
          <span className="kpi-value">{fmt.kwh(modelKwh)}</span>
          <span className="kpi-sub">
            {gap > 0
              ? `${fmt.kwh(gap)} meer dan de apparaten verklaren. Dat is ruimte voor sluipverbruik of onderschatte vermogens.`
              : `${fmt.kwh(-gap)} minder dan de apparaten opleveren. Of de apparaatschattingen zijn te hoog, of het model stopt te veel in verwarming en boiler.`}
          </span>
        </div>
        )}
        <div className="kpi">
          <span className="kpi-label">Grootste drie</span>
          <span className="kpi-value small">{top3.map((a) => a.naam.split(' (')[0]).join(', ')}</span>
          <span className="kpi-sub">{fmt.kwh(top3.reduce((s, a) => s + yearlyKwh(a), 0))} samen, {Math.round((top3.reduce((s, a) => s + yearlyKwh(a), 0) / Math.max(1, prof.total)) * 100)}% van het totaal.</span>
        </div>
      </section>

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
        <p className="hint">
          Verwarming en boiler staan er niet bij: die hebben hun eigen model. De vorm per apparaat is een aanname over wanneer het draait
          (avond, rond maaltijden, de hele dag). De Chargee-meter laat straks zien waar dit patroon afwijkt van de werkelijkheid.
        </p>
      </Card>

      <Card
        title={room === 'alles' ? 'Wat kost elk apparaat' : `Apparaten in: ${room}`}
        subtitle="Naar schatting per jaar. Klik een regel en pas vermogen of uren aan; de rest van het profiel rekent mee."
        className="span-2"
        actions={
          <button type="button" className="ghost-btn" onClick={reset} disabled={!Object.keys(edits).length}>
            Standaardwaarden
          </button>
        }
      >
        <div className="supplier-list" role="list">
          {ranked.map((a, i) => {
            const y = yearlyKwh(a);
            const cat = CATEGORIES[a.categorie];
            return (
              <div key={a.id} role="listitem" className="supplier">
                <button type="button" className="supplier-row" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <span className="supplier-rank">{i + 1}</span>
                  <span className="supplier-name">
                    <strong>{a.naam}</strong>
                    <span className="supplier-sub">
                      {a.ruimte} · {cat.label} · {SHAPE_LABELS[a.vorm]}
                    </span>
                  </span>
                  <span className="supplier-track" aria-hidden="true">
                    <span className="supplier-bar" style={{ width: `${(y / max) * 100}%`, background: cat.color }} />
                  </span>
                  <span className="supplier-total">
                    <strong>{fmt.kwh(y)}</strong>
                    <span className="supplier-sub">{fmt.eur(y * pricePerKwh)} per jaar</span>
                  </span>
                  <span className="supplier-delta">{ZEKER[a.zeker]}</span>
                </button>
                {open === a.id && (
                  <div className="supplier-detail">
                    <label className="app-field">
                      <span className="k">Vermogen (W)</span>
                      <input type="number" min={0} step={5} value={a.watt} onChange={(e) => edit(a.id, { watt: Math.max(0, Number(e.target.value)) })} />
                    </label>
                    <label className="app-field">
                      <span className="k">Uren per dag{a.winter ? ' (nov t/m mrt)' : ''}</span>
                      <input type="number" min={0} max={24} step={0.1} value={a.urenPerDag} onChange={(e) => edit(a.id, { urenPerDag: Math.min(24, Math.max(0, Number(e.target.value))) })} />
                    </label>
                    {a.opmerking && <p className="hint">{a.opmerking}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="hint">
          Vermogens zijn typische waarden en jouw opgave van de gebruiksduur, geen metingen. Een stekkermeter van een paar euro op de
          handdoekradiator, droger en diepvries geeft de grootste winst in nauwkeurigheid. Aanpassingen blijven in je browser staan.
        </p>
      </Card>
    </>
  );
}
