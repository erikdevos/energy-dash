import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api, toYearData, type JaarnotaSet, type Location, type MaandData } from './lib/api';
import { usePoll } from './lib/usePoll';
import { calibrate, calibrationTargets, notaScenario, startFromNotas } from './model/calibrate';
import { run } from './model/costs';
import { BASE_SCENARIO, DEFAULT_LOCATION, DEFAULT_PRICE_YEAR, DEFAULT_WEATHER_YEAR, clone, makePresets, type ContractPreset } from './model/defaults';
import { applyMyPlans, planImpact, revertAll } from './model/plans';
import { buildInsights } from './model/insights';
import { PLAN_ORDER, planOn, roadTo2027, setPlan, type PlanId } from './model/overview';
import { Overview, type Tab } from './components/overview/Overview';
import { PricesToday } from './components/PricesToday';
import { SuppliersTab } from './components/SuppliersTab';
import { rankSuppliers, type SupplierData } from './model/suppliers';
import { projectSettlement } from './model/settlement';
import type { Scenario, YearData } from './model/types';
import { ComparePanel, type MatrixRow, type SavedScenario } from './components/ComparePanel';
import { ControlsPanel } from './components/ControlsPanel';
import { ConsumptionChart } from './components/ConsumptionChart';
import { CostBreakdown } from './components/CostBreakdown';
import { DayView } from './components/DayView';
import { JaarnotasPanel } from './components/JaarnotasPanel';
import { LivePanel } from './components/LivePanel';
import { MonthlyChart, type MeasuredYear } from './components/MonthlyChart';
import { PlansCard } from './components/PlansCard';
import { Sources } from './components/Sources';
import { SettlementCard } from './components/SettlementCard';
import { Summary, type Investment } from './components/Summary';
import { fmt } from './components/charts/scale';

const STORAGE_KEY = 'energy-dash:v6';

interface Stored {
  scenario: Scenario;
  startpunt: Scenario;
  saved: SavedScenario[];
  location: Location;
  priceYear: number;
  weatherYear: number;
  targetId: string;
  termijnbedrag: number;
  contract2027: 'dyn2027' | 'vast2027';
}

/** Opgeslagen scenario's aanvullen met velden die er later bij zijn gekomen. */
function withDefaults(s: Scenario): Scenario {
  const b = BASE_SCENARIO;
  return {
    ...b,
    ...s,
    contract: { ...b.contract, ...s.contract },
    belasting: { ...b.belasting, ...s.belasting },
    zon: { ...b.zon, ...s.zon },
    verbruik: { ...b.verbruik, ...s.verbruik },
    ev: { ...b.ev, ...s.ev },
    batterij: { ...b.batterij, ...s.batterij },
  };
}

function loadStored(): Partial<Stored> {
  try {
    const st = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Stored>;
    if (st.scenario) st.scenario = withDefaults(st.scenario);
    if (st.startpunt) st.startpunt = withDefaults(st.startpunt);
    st.saved = st.saved?.map((x) => ({ ...x, scenario: withDefaults(x.scenario) }));
    return st;
  } catch {
    return {};
  }
}

function todayIndex(): number {
  const now = new Date();
  return Math.min(364, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 86_400_000));
}

function describe(s: Scenario): string {
  return [
    s.regime === 'saldering' ? 'met saldering' : 'zonder saldering',
    s.contract.type === 'vast' ? 'vast contract' : 'dynamisch contract',
    s.batterij.aan ? `batterij ${fmt.one(s.batterij.capaciteitKwh)} kWh` : null,
    s.ev.aan ? 'elektrische auto' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Neem alleen de afgestemde getallen over (opbrengst en verbruiksposten); je eigen keuzes blijven staan. */
const withHousehold = (s: Scenario, from: Scenario): Scenario => ({
  ...s,
  zon: { ...s.zon, opbrengstFactor: from.zon.opbrengstFactor },
  verbruik: {
    ...s.verbruik,
    basisKwh: from.verbruik.basisKwh,
    flexKwh: from.verbruik.flexKwh,
    verwarmingKwh: from.verbruik.verwarmingKwh,
    warmwaterKwh: from.verbruik.warmwaterKwh,
    pellet: from.verbruik.pellet,
  },
});

export default function App() {
  const [stored] = useState(loadStored);
  const [scenario, setScenario] = useState<Scenario | null>(stored.scenario ?? null);
  const [startpunt, setStartpunt] = useState<Scenario | null>(stored.startpunt ?? null);
  const [saved, setSaved] = useState<SavedScenario[]>(stored.saved ?? []);
  const [location, setLocation] = useState<Location | null>(stored.location ?? null);
  const [priceYear, setPriceYear] = useState(stored.priceYear ?? DEFAULT_PRICE_YEAR);
  const [weatherYear, setWeatherYear] = useState(stored.weatherYear ?? DEFAULT_WEATHER_YEAR);
  const [targetId, setTargetId] = useState<string | null>(stored.targetId ?? null);
  const [termijnbedrag, setTermijnbedrag] = useState<number | null>(stored.termijnbedrag ?? null);
  const live = usePoll(api.live, 5000);
  const [day, setDay] = useState(todayIndex);
  const [contract2027, setContract2027] = useState<'dyn2027' | 'vast2027'>(stored.contract2027 ?? 'dyn2027');
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overzicht', label: 'Overzicht' },
    { id: 'nu', label: 'Nu' },
    { id: 'verbruik', label: 'Verbruik' },
    { id: 'scenarios', label: "Scenario's" },
    { id: 'leveranciers', label: 'Leveranciers' },
    { id: 'gegevens', label: 'Gegevens' },
  ];
  const [tab, setTabState] = useState<Tab>(() => {
    const h = window.location.hash.slice(1) as Tab;
    return TABS.some((t) => t.id === h) ? h : 'overzicht';
  });
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1) as Tab;
      if (['overzicht', 'nu', 'verbruik', 'scenarios', 'leveranciers', 'gegevens'].includes(h)) setTabState(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  };
  const [data, setData] = useState<YearData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState<JaarnotaSet | null>(null);
  const [maanden, setMaanden] = useState<MaandData | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierData | null>(null);
  useEffect(() => {
    api.leveranciers().then(setSuppliers).catch(() => setSuppliers(null));
  }, []);
  /** na een wijziging van locatie/dak/weerjaar opnieuw afstemmen zodra de nieuwe data er is */
  const [recalibrate, setRecalibrate] = useState(false);

  useEffect(() => {
    Promise.all([api.jaarnotas(), api.maanden().catch(() => ({ maanden: [] }) as MaandData)])
      .then(([set, md]) => {
        setNotas(set);
        setMaanden(md);
        const monthlyYears = calibrationTargets(set, md).filter((t) => t.monthly);
        const loc = set.locatie;
        const inst = set.installatie;
        setLocation(
          (l) =>
            l ?? {
              lat: loc?.lat ?? DEFAULT_LOCATION.lat,
              lon: loc?.lon ?? DEFAULT_LOCATION.lon,
              angle: inst?.hellingshoek ?? DEFAULT_LOCATION.angle,
              orientation: inst?.orientatie ?? DEFAULT_LOCATION.orientation,
            },
        );
        // Standaard afstemmen op de laatste 12 maanden, anders het laatste kalenderjaar, anders de laatste jaarnota.
        const recent = monthlyYears.find((t) => t.id === 'laatste-12') ?? monthlyYears[monthlyYears.length - 1];
        setTargetId((t) => t ?? recent?.id ?? set.notas[set.notas.length - 1]?.label ?? null);
        setTermijnbedrag((t) => t ?? set.contract?.termijnbedrag ?? 0);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!location) return;
    let alive = true;
    setLoading(true);
    Promise.all([api.prices(priceYear), api.weather(location, weatherYear)])
      .then(([p, w]) => alive && (setData(toYearData(p, w)), setError(null)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [priceYear, weatherYear, location]);

  const targets = useMemo(() => (notas ? calibrationTargets(notas, maanden) : []), [notas, maanden]);

  // Gemeten maanden per jaar voor de maandgrafiek (deelmaanden weggelaten).
  const measured: MeasuredYear[] = useMemo(() => {
    const years = new Map<number, MeasuredYear>();
    for (const m of maanden?.maanden ?? []) {
      const [y, mo] = m.maand.split('-').map(Number);
      if (!years.has(y)) years.set(y, { year: y, imp: Array(12).fill(null), exp: Array(12).fill(null) });
      if (m.deel) continue;
      years.get(y)!.imp[mo - 1] = m.afname;
      years.get(y)!.exp[mo - 1] = m.teruglevering;
    }
    return [...years.values()].sort((a, b) => a.year - b.year);
  }, [maanden]);
  const target = targets.find((t) => t.id === targetId) ?? targets[targets.length - 1];

  // Startpunt: je contract van de nota, afgestemd op de gekozen nota. Bij eerste start of na een dakwijziging.
  useEffect(() => {
    if (!notas || !data || !target || loading) return;
    if (startpunt && !recalibrate) return;
    const base = startpunt ? calibrate(startpunt, target, data) : startFromNotas(notas, target, data);
    setStartpunt(base);
    setScenario((s) => (s ? withHousehold(s, base) : base));
    setRecalibrate(false);
  }, [notas, data, target, startpunt, recalibrate, loading]);

  useEffect(() => {
    if (!scenario || !startpunt || !location || !targetId || termijnbedrag === null) return;
    const value: Stored = { scenario, startpunt, saved, location, priceYear, weatherYear, targetId, termijnbedrag, contract2027 };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* opslag niet beschikbaar: dan alleen in geheugen */
    }
  }, [scenario, startpunt, saved, location, priceYear, weatherYear, targetId, termijnbedrag, contract2027]);

  // De pelletkachel hoort bij je huidige situatie: wijzig je hem, dan opnieuw afstemmen op je metingen.
  useEffect(() => {
    if (!scenario || !startpunt || !data || !target || loading) return;
    if (same(scenario.verbruik.pellet, startpunt.verbruik.pellet)) return;
    const base = calibrate({ ...startpunt, verbruik: { ...startpunt.verbruik, pellet: scenario.verbruik.pellet } }, target, data);
    setStartpunt(base);
    setScenario((s) => (s ? withHousehold(s, base) : s));
  }, [scenario, startpunt, data, target, loading]);

  const deferred = useDeferredValue(scenario);
  const update = useCallback((fn: (s: Scenario) => Scenario) => setScenario((s) => (s ? fn(s) : s)), []);
  const presets = useMemo(() => (startpunt ? makePresets(startpunt.contract) : []), [startpunt]);

  const outcome = useMemo(() => (deferred && data ? run(deferred, data) : null), [deferred, data]);
  const reference = useMemo(() => (startpunt && data ? run(startpunt, data) : null), [startpunt, data]);

  // Wat levert elke maatregel op? Vergelijk met hetzelfde scenario zonder die maatregel.
  const investments: Investment[] = useMemo(() => {
    if (!deferred || !data || !outcome) return [];
    const list: Investment[] = [];
    const without = (s: Scenario) => run(s, data).total - outcome.total;
    if (deferred.batterij.aan) {
      list.push({
        label: 'Batterij',
        savings: without({ ...deferred, batterij: { ...deferred.batterij, aan: false } }),
        price: deferred.batterij.aanschafprijs,
      });
    }
    if (deferred.verbruik.aircoAandeel > 0) {
      list.push({
        label: 'Airco (verwarmen)',
        savings: without({ ...deferred, verbruik: { ...deferred.verbruik, aircoAandeel: 0 } }),
        price: deferred.verbruik.aircoPrijs,
      });
    }
    if (deferred.verbruik.boiler !== 'huidig') {
      list.push({
        label: deferred.verbruik.boiler === 'warmtepomp' ? 'Warmtepompboiler' : 'Nieuwe boiler',
        savings: without({ ...deferred, verbruik: { ...deferred.verbruik, boiler: 'huidig' } }),
        price: deferred.verbruik.boilerPrijs,
      });
    }
    return list;
  }, [deferred, data, outcome]);

  const matrix: MatrixRow[] = useMemo(() => {
    if (!deferred || !data) return [];
    return presets.map((preset) => {
      const base = preset.apply(deferred);
      return {
        preset,
        zonder: run({ ...base, batterij: { ...base.batterij, aan: false } }, data).total,
        met: run({ ...base, batterij: { ...base.batterij, aan: true } }, data).total,
      };
    });
  }, [deferred, data, presets]);

  // Per nota het model afgestemd op juist die nota, doorgerekend met de tarieven van toen.
  const notaModels = useMemo(() => {
    if (!notas || !data || !startpunt) return null;
    return notas.notas.map((n) => {
      const t = targets.find((x) => x.id === n.label)!;
      return run(notaScenario(calibrate(startpunt, t, data), notas, n), data);
    });
  }, [notas, data, startpunt, targets]);

  // Effect van elke maatregel, voor je huidige contract en de twee 2027-varianten.
  const planPresets = useMemo(() => presets.filter((p) => ['nu', 'vast2027', 'dyn2027'].includes(p.id)), [presets]);
  const plans = useMemo(
    () => (deferred && startpunt && data ? planImpact(deferred, startpunt, planPresets, data) : null),
    [deferred, startpunt, planPresets, data],
  );

  // Leveranciers voor 2027: je huishouden zoals nu en met de plannen die aan staan.
  const supplierRows = useMemo(() => {
    if (!suppliers || !startpunt || !deferred || !data || tab !== 'leveranciers') return null;
    return { now: rankSuppliers(startpunt, suppliers, data), plans: rankSuppliers(deferred, suppliers, data) };
  }, [suppliers, startpunt, deferred, data, tab]);

  const savedWithTotals = useMemo(
    () => (data ? saved.map((s) => ({ ...s, total: run(s.scenario, data).total })) : saved),
    [saved, data],
  );

  const activePreset = scenario ? (presets.find((p) => same(p.apply(scenario), scenario))?.id ?? null) : null;

  const applyPreset = (preset: ContractPreset, battery?: boolean) =>
    update((s) => {
      const next = preset.apply(s);
      return battery === undefined ? next : { ...next, batterij: { ...next.batterij, aan: battery } };
    });

  /** Opnieuw afstemmen met de panelen uit de huidige instellingen (na het corrigeren van Wp of aantal). */
  const recalibrateWithCurrentPanels = () => {
    if (!scenario || !startpunt || !data || !target) return;
    const next = calibrate({ ...startpunt, zon: { ...startpunt.zon, panelen: scenario.zon.panelen, wpPerPaneel: scenario.zon.wpPerPaneel } }, target, data);
    setStartpunt(next);
    update((s) => withHousehold(s, next));
  };

  const sinceNota = useMemo(() => {
    const last = notas?.notas[notas.notas.length - 1];
    return last?.meterstandenEind ? { sinds: last.periode.tot, meter: last.meterstandenEind } : undefined;
  }, [notas]);

  // Eindnota van het lopende contract: gemeten meterstanden + model voor de rest van de periode (status quo).
  const settlement = useMemo(() => {
    const last = notas?.notas[notas.notas.length - 1];
    const eind = notas?.contract?.einddatum;
    if (!last || !eind || !startpunt || !reference || !data) return null;
    return projectSettlement(startpunt, reference, data.priceYear, last, eind, termijnbedrag ?? 0, live.data, notas?.termijnen ?? []);
  }, [notas, startpunt, reference, data, termijnbedrag, live.data]);

  // Overzicht: de weg naar 2027 en de inzichten.
  const presetMap = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, p])), [presets]);
  const pricePerKwh = startpunt
    ? 0.6 * startpunt.contract.tariefDal + 0.4 * startpunt.contract.tariefNormaal + startpunt.belasting.energiebelasting
    : 0.33;
  const road = useMemo(
    () => (deferred && startpunt && data && presetMap.nu ? roadTo2027(deferred, startpunt, presetMap.nu, presetMap[contract2027], data) : null),
    [deferred, startpunt, data, presetMap, contract2027],
  );
  const plansOn = useMemo(
    () => Object.fromEntries(PLAN_ORDER.map((id) => [id, deferred && startpunt ? planOn(deferred, startpunt, id) : false])) as Record<PlanId, boolean>,
    [deferred, startpunt],
  );
  const insights = useMemo(
    () =>
      deferred && startpunt && data && reference && presetMap.nu
        ? buildInsights({
            scenario: deferred,
            start: startpunt,
            nowOutcome: reference,
            presets: { nu: presetMap.nu, dyn2026: presetMap.dyn2026, vast2027: presetMap.vast2027, dyn2027: presetMap.dyn2027 },
            data,
            settlement,
            pricePerKwh,
          })
        : [],
    [deferred, startpunt, data, reference, presetMap, settlement, pricePerKwh],
  );


  if (!scenario || !startpunt || !data || !outcome || !reference || !location) {
    return (
      <div className="boot">
        {error ? (
          <>
            <h1>Data laden lukt niet</h1>
            <p className="error-line">{error}</p>
            <p>Draait de API-server? Start alles met <code>npm run dev</code>.</p>
          </>
        ) : (
          <p>Jaarnota's, uurprijzen en zonprofiel ophalen en het model afstemmen... (de eerste keer duurt dit een paar seconden)</p>
        )}
      </div>
    );
  }

  const controls = (
    <ControlsPanel
      scenario={scenario}
      reference={startpunt}
      onChange={update}
      presets={presets}
      activePreset={activePreset}
      onPreset={(p) => applyPreset(p)}
      onReset={() => setScenario(startpunt)}
      location={location}
      onLocation={(l) => {
        setLocation(l);
        setRecalibrate(true);
      }}
      priceYear={priceYear}
      onPriceYear={setPriceYear}
      weatherYear={weatherYear}
      onWeatherYear={(y) => {
        setWeatherYear(y);
        setRecalibrate(true);
      }}
    />
  );

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Energiedashboard</h1>
          <p className="topbar-sub">
            All-electric huis{notas?.locatie ? ` in ${notas.locatie.plaats}` : ''} · {startpunt.zon.panelen} zonnepanelen · wat kost stroom straks, en wat levert slim schakelen op?
          </p>
        </div>
        <div className="source-pills">
          <span className={`pill ${live.data?.mode === 'live' ? 'pill-live' : ''}`}>
            {live.data?.mode === 'live' ? `Meter live · ${(live.data.importW - live.data.exportW >= 0 ? '' : '−') + fmt.one(Math.abs(live.data.importW - live.data.exportW) / 1000)} kW` : 'Meter mock'}
          </span>
          <span className={`pill ${notas?.mock ? 'pill-warn' : ''}`}>
            {notas?.mock ? 'Jaarnota mock' : `Afgestemd op ${target?.label ?? 'je metingen'}`}
          </span>
        </div>
        <nav className="tabs" aria-label="Onderdelen">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`tab ${tab === t.id ? 'active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className={`layout ${tab === 'scenarios' ? '' : 'no-controls'}`}>
        {tab === 'scenarios' && controls}

        <main className={`content ${loading ? 'refreshing' : ''}`}>
          {error && <p className="error-line">{error}</p>}

          {tab === 'overzicht' && road && (
            <Overview
              settlement={settlement}
              termijnbedrag={termijnbedrag ?? 0}
              onTermijnbedrag={setTermijnbedrag}
              now={road.now}
              statusQuo2027={road.statusQuo2027}
              withPlans2027={road.end}
              contract={contract2027}
              onContract={setContract2027}
              steps={road.steps}
              plansOn={plansOn}
              onTogglePlan={(id) => update((s) => setPlan(s, startpunt, id, !planOn(s, startpunt, id)))}
              insights={insights}
              onTab={setTab}
              nowOutcome={reference}
              plannedOutcome={outcome}
            />
          )}

          {tab === 'nu' && (
            <>
              <LivePanel live={live} sinceNota={sinceNota} />
              {settlement && <SettlementCard s={settlement} termijnbedrag={termijnbedrag ?? 0} />}
              <PricesToday
                opslag={presetMap.dyn2027?.apply(startpunt).contract.opslag ?? 0.018}
                eb={startpunt.belasting.energiebelasting}
                vastNormaal={startpunt.contract.tariefNormaal + startpunt.belasting.energiebelasting}
                vastDal={startpunt.contract.tariefDal + startpunt.belasting.energiebelasting}
              />
            </>
          )}

          {tab === 'verbruik' && (
            <>
              <ConsumptionChart outcome={outcome} pricePerKwh={pricePerKwh} pelletPrijsPerKg={(deferred ?? scenario).verbruik.pellet.prijsPerKg} />
              <div className="span-2">
                <MonthlyChart outcome={outcome} measured={measured} defaultYear={target?.monthly?.year} />
              </div>
              <DayView outcome={outcome} scenario={deferred ?? scenario} priceYear={data.priceYear} day={day} onDay={setDay} />
            </>
          )}

          {tab === 'scenarios' && (
            <>
              <Summary
                outcome={outcome}
                reference={reference}
                scenario={deferred ?? scenario}
                scenarioLabel={describe(deferred ?? scenario)}
                investments={investments}
                termijnbedrag={termijnbedrag ?? 0}
                onTermijnbedrag={setTermijnbedrag}
                settlement={settlement}
              />
              {plans && (
                <PlansCard
                  rows={plans.rows}
                  total={plans.total}
                  columns={planPresets.map((p) => (p.short === 'Nu' ? 'Nu (2026)' : p.short))}
                  onApplyPlans={() => update((s) => applyMyPlans(s, startpunt))}
                  onRevert={() => update((s) => revertAll(s, startpunt))}
                />
              )}
              <CostBreakdown outcome={outcome} reference={reference} />
              <ComparePanel
                rows={matrix}
                batteryLabel={`${fmt.one(scenario.batterij.capaciteitKwh)} kWh`}
                current={outcome.total}
                saved={savedWithTotals}
                onApply={applyPreset}
                onSave={(name) =>
                  setSaved((list) => [...list, { id: crypto.randomUUID(), name, scenario: clone(scenario), total: outcome.total }])
                }
                onLoad={(s) => setScenario(clone(s.scenario))}
                onDelete={(id) => setSaved((list) => list.filter((s) => s.id !== id))}
              />
            </>
          )}

          {tab === 'leveranciers' &&
            (suppliers && supplierRows ? (
              <SuppliersTab
                data={suppliers}
                nowRows={supplierRows.now}
                planRows={supplierRows.plans}
                plansActive={Object.values(plansOn).some(Boolean)}
                current={notas?.leverancier ?? 'Greenchoice'}
                priceYear={data.priceYear}
              />
            ) : (
              <p className="hint">Geen leveranciersgegevens gevonden (data/leveranciers.json).</p>
            ))}

          {tab === 'gegevens' && (
            <>
              {notas && notaModels && target && (
                <JaarnotasPanel
                  set={notas}
                  models={notaModels}
                  priceYear={data.priceYear}
                  dalVanafUur={startpunt.belasting.dalVanafUur}
                  targets={targets}
                  targetId={target.id}
                  onTarget={(id) => {
                    setTargetId(id);
                    setRecalibrate(true);
                  }}
                  panelsChanged={scenario.zon.panelen !== startpunt.zon.panelen || scenario.zon.wpPerPaneel !== startpunt.zon.wpPerPaneel}
                  onRecalibrate={recalibrateWithCurrentPanels}
                />
              )}
              <Sources />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
