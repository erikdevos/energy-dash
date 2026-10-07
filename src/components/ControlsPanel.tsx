import { NETBEHEER, type ContractPreset } from '../model/defaults';
import { evAnnualKwh, kwp } from '../model/simulate';
import type { Scenario } from '../model/types';
import type { Location } from '../lib/api';
import { fmt } from './charts/scale';
import { Section, Segmented, Slider, Toggle } from './controls';

interface Props {
  scenario: Scenario;
  reference: Scenario;
  onChange: (fn: (s: Scenario) => Scenario) => void;
  presets: ContractPreset[];
  activePreset: string | null;
  onPreset: (p: ContractPreset) => void;
  onReset: () => void;
  location: Location;
  onLocation: (l: Location) => void;
  priceYear: number;
  onPriceYear: (y: number) => void;
  weatherYear: number;
  onWeatherYear: (y: number) => void;
}

const eur3 = (v: number) => fmt.perKwh(v);
const pct = (v: number) => fmt.pct(v);
const kwh = (v: number) => `${fmt.int(v)} kWh`;

export function ControlsPanel(p: Props) {
  const { scenario: s, reference: r, onChange } = p;

  function upd<K extends Exclude<keyof Scenario, 'regime'>, F extends keyof Scenario[K]>(k: K, f: F) {
    return (v: Scenario[K][F]) => onChange((prev) => ({ ...prev, [k]: { ...prev[k], [f]: v } }));
  }

  const c = s.contract;

  return (
    <aside className="controls" aria-label="Scenario-instellingen">
      <div className="controls-head">
        <h2>Speel met je scenario</h2>
        <button type="button" className="ghost-btn" onClick={p.onReset}>
          Terug naar startpunt
        </button>
      </div>

      <div className="preset-grid">
        {p.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`preset ${p.activePreset === preset.id ? 'active' : ''}`}
            onClick={() => p.onPreset(preset)}
          >
            <strong>{preset.short}</strong>
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      <Section title="Regels en belasting" badge={s.regime === 'saldering' ? 'met saldering' : 'zonder saldering'}>
        <Segmented
          label="Salderingsregeling"
          value={s.regime}
          options={[
            { value: 'saldering', label: 'Met (t/m 2026)' },
            { value: 'geenSaldering', label: 'Zonder (vanaf 2027)' },
          ]}
          onChange={(v) => onChange((prev) => ({ ...prev, regime: v }))}
        />
        {s.regime === 'geenSaldering' && c.type === 'vast' && (
          <Slider
            label="Wettelijke minimumvergoeding"
            value={s.belasting.minVergoedingFractie}
            min={0}
            max={1}
            step={0.05}
            display={(v) => `${pct(v)} van kaal tarief`}
            onChange={upd('belasting', 'minVergoedingFractie')}
            hint="Tot 2030 minimaal 50% van het kale leveringstarief (excl. EB en BTW)."
          />
        )}
        <Slider
          label="Energiebelasting per kWh"
          value={s.belasting.energiebelasting}
          min={0}
          max={0.2}
          step={0.001}
          display={eur3}
          reference={r.belasting.energiebelasting}
          onChange={upd('belasting', 'energiebelasting')}
          hint="2026: € 0,111 · 2027 (voorstel): € 0,107"
        />
        <Slider
          label="Vermindering energiebelasting"
          value={s.belasting.vermindering}
          min={0}
          max={800}
          step={1}
          display={fmt.eur}
          onChange={upd('belasting', 'vermindering')}
        />
        <Slider
          label="Netbeheerkosten per jaar"
          value={s.belasting.netbeheerPerJaar}
          min={300}
          max={700}
          step={1}
          display={fmt.eur2}
          reference={r.belasting.netbeheerPerJaar}
          onChange={upd('belasting', 'netbeheerPerJaar')}
          hint={`2026, 3x25A: Enexis ${fmt.eur2(NETBEHEER.Enexis)} · Liander ${fmt.eur2(NETBEHEER.Liander)} · Stedin ${fmt.eur2(NETBEHEER.Stedin)}`}
        />
        <Segmented
          label="Daltarief op werkdagen vanaf"
          value={String(s.belasting.dalVanafUur)}
          options={[
            { value: '21', label: '21:00 (Enexis Brabant/Limburg)' },
            { value: '23', label: '23:00' },
          ]}
          onChange={(v) => upd('belasting', 'dalVanafUur')(Number(v))}
        />
      </Section>

      <Section title="Contract" badge={c.type === 'vast' ? 'vast' : 'dynamisch'}>
        <Segmented
          value={c.type}
          options={[
            { value: 'vast', label: 'Vast / variabel' },
            { value: 'dynamisch', label: 'Dynamisch' },
          ]}
          onChange={upd('contract', 'type')}
        />
        {c.type === 'vast' ? (
          <>
            <Slider
              label="Stroomprijs normaal (kaal)"
              value={c.tariefNormaal}
              min={0.05}
              max={0.4}
              step={0.001}
              display={eur3}
              reference={r.contract.tariefNormaal}
              onChange={upd('contract', 'tariefNormaal')}
              hint={`Incl. BTW, excl. energiebelasting. All-in: ${eur3(c.tariefNormaal + s.belasting.energiebelasting)}`}
            />
            <Slider
              label="Stroomprijs dal (kaal)"
              value={c.tariefDal}
              min={0.05}
              max={0.4}
              step={0.001}
              display={eur3}
              reference={r.contract.tariefDal}
              onChange={upd('contract', 'tariefDal')}
              hint="Gelijk aan normaal = enkeltarief."
            />
            <Slider
              label="Terugleververgoeding"
              value={c.terugleververgoeding}
              min={0}
              max={0.25}
              step={0.001}
              display={eur3}
              reference={r.contract.terugleververgoeding}
              onChange={upd('contract', 'terugleververgoeding')}
            />
            <Toggle label="Terugleverkosten" checked={c.terugleverkostenAan} onChange={upd('contract', 'terugleverkostenAan')} />
            {c.terugleverkostenAan && (
              <Slider
                label="Terugleverkosten per kWh"
                value={c.terugleverkostenPerKwh}
                min={0}
                max={0.2}
                step={0.001}
                display={eur3}
                reference={r.contract.terugleverkostenPerKwh}
                onChange={upd('contract', 'terugleverkostenPerKwh')}
                hint="Greenchoice rekent per kWh over alle teruglevering. 2026 volgens keuze.nl 13,6 ct, verwachting 2027 ca. 5,2 ct."
              />
            )}
          </>
        ) : (
          <>
            <Slider
              label="Inkoopvergoeding per kWh"
              value={c.opslag}
              min={0}
              max={0.06}
              step={0.001}
              display={eur3}
              onChange={upd('contract', 'opslag')}
              hint="Incl. BTW. Tibber en ANWB: € 0,018 · Zonneplan: € 0,020"
            />
            <Slider
              label="Kosten per teruggeleverde kWh"
              value={c.terugleverOpslag}
              min={-0.03}
              max={0.05}
              step={0.001}
              display={eur3}
              onChange={upd('contract', 'terugleverOpslag')}
              hint="Gaat af van de uurprijs. Tibber € 0,018 · ANWB € 0 · negatief = bonus (Frank, Zonneplan)."
            />
            <Slider
              label="Prijsniveau markt"
              value={c.prijsSchaal}
              min={0.5}
              max={2}
              step={0.05}
              display={(v) => `${fmt.int(v * 100)}% van ${p.priceYear}`}
              onChange={upd('contract', 'prijsSchaal')}
              hint="Test een goedkoper of duurder marktjaar."
            />
            <Toggle
              label="Panelen afschakelen bij negatieve prijs"
              checked={c.afschakelenBijNegatief}
              onChange={upd('contract', 'afschakelenBijNegatief')}
              hint="Omvormer regelt terug zodra terugleveren geld kost."
            />
          </>
        )}
        <Slider
          label="Vaste leveringskosten per maand"
          value={c.vasteLeveringskostenPerMaand}
          min={0}
          max={15}
          step={0.01}
          display={(v) => fmt.eur2(v)}
          onChange={upd('contract', 'vasteLeveringskostenPerMaand')}
        />
      </Section>

      <Section title="Zonnepanelen" badge={`${fmt.one(kwp(s))} kWp`}>
        <Slider
          label="Aantal panelen"
          value={s.zon.panelen}
          min={0}
          max={40}
          step={1}
          reference={r.zon.panelen}
          onChange={upd('zon', 'panelen')}
        />
        <Slider
          label="Vermogen per paneel"
          value={s.zon.wpPerPaneel}
          min={250}
          max={500}
          step={5}
          display={(v) => `${v} Wp`}
          onChange={upd('zon', 'wpPerPaneel')}
        />
        <Slider
          label="Opbrengstcorrectie"
          value={s.zon.opbrengstFactor}
          min={0.6}
          max={1.3}
          step={0.01}
          display={pct}
          reference={r.zon.opbrengstFactor}
          onChange={upd('zon', 'opbrengstFactor')}
          hint="Schaduw, vervuiling, afwijking t.o.v. PVGIS. Wordt gezet door kalibreren."
        />
        <Segmented
          label="Ligging"
          value={p.location.orientation === 'oost-west' ? 'oost-west' : 'zuid'}
          options={[
            { value: 'zuid', label: 'Zuid' },
            { value: 'oost-west', label: 'Oost-west' },
          ]}
          onChange={(v) => p.onLocation({ ...p.location, orientation: v })}
        />
        <Slider
          label="Hellingshoek"
          value={p.location.angle}
          min={0}
          max={60}
          step={5}
          display={(v) => `${v}°`}
          onChange={(v) => p.onLocation({ ...p.location, angle: v })}
        />
      </Section>

      <Section title="Verbruik in huis" badge={kwh(s.verbruik.basisKwh + s.verbruik.flexKwh)}>
        <Slider
          label="Huishouden (koken, licht, apparaten)"
          value={s.verbruik.basisKwh}
          min={500}
          max={6000}
          step={50}
          display={kwh}
          reference={r.verbruik.basisKwh}
          onChange={upd('verbruik', 'basisKwh')}
        />
        <Slider
          label="Wassen, drogen, vaatwasser"
          value={s.verbruik.flexKwh}
          min={0}
          max={2000}
          step={25}
          display={kwh}
          reference={r.verbruik.flexKwh}
          onChange={upd('verbruik', 'flexKwh')}
        />
        <Slider
          label="Daarvan verschoven naar zonuren"
          value={s.verbruik.flexNaarZon}
          min={0}
          max={1}
          step={0.05}
          display={pct}
          reference={r.verbruik.flexNaarZon}
          onChange={upd('verbruik', 'flexNaarZon')}
          hint="Uitgestelde start tussen 11 en 15 uur."
        />
      </Section>

      <Section title="Verwarmen en koelen" badge={s.verbruik.aircoAandeel > 0 ? `airco ${pct(s.verbruik.aircoAandeel)}` : 'radiatoren'}>
        <Slider
          label="Warmtevraag per jaar"
          value={s.verbruik.verwarmingKwh}
          min={0}
          max={8000}
          step={50}
          display={kwh}
          reference={r.verbruik.verwarmingKwh}
          onChange={upd('verbruik', 'verwarmingKwh')}
          hint="Met elektrische radiatoren is dit ook je stroomverbruik (1 op 1). Volgt de uurtemperatuur, met thermostaat 20 °C overdag en 16 °C 's nachts."
        />
        <Slider
          label="Thermostaat radiatoren overdag"
          value={s.verbruik.thermostaatDag}
          min={14}
          max={22}
          step={0.5}
          display={(v) => `${fmt.one(v)} °C`}
          reference={r.verbruik.thermostaatDag}
          onChange={upd('verbruik', 'thermostaatDag')}
          hint="7-23 uur. Nu 18 °C: daaronder springen de radiatoren aan."
        />
        <Slider
          label="Thermostaat radiatoren 's nachts"
          value={s.verbruik.thermostaatNacht}
          min={8}
          max={20}
          step={0.5}
          display={(v) => `${fmt.one(v)} °C`}
          reference={r.verbruik.thermostaatNacht}
          onChange={upd('verbruik', 'thermostaatNacht')}
          hint="Nu lager gezet: het huis zakt 's nachts naar 12-14 °C."
        />
        <Slider
          label="Minder warmtevraag (kozijnen, isolatie)"
          value={s.verbruik.isolatieBesparing}
          min={0}
          max={0.6}
          step={0.05}
          display={pct}
          onChange={upd('verbruik', 'isolatieBesparing')}
        />
        <Slider
          label="Deel van de warmte via Daikin-airco"
          value={s.verbruik.aircoAandeel}
          min={0}
          max={1}
          step={0.05}
          display={pct}
          reference={r.verbruik.aircoAandeel}
          onChange={upd('verbruik', 'aircoAandeel')}
          hint="Eén airco in de woonkamer dekt vaak 40-60% van de warmtevraag; de rest blijft op de radiatoren."
        />
        {s.verbruik.aircoAandeel > 0 && (
          <>
            <Slider
              label="Seizoensrendement airco (SCOP)"
              value={s.verbruik.aircoScop}
              min={2.5}
              max={6}
              step={0.1}
              display={(v) => fmt.one(v)}
              onChange={upd('verbruik', 'aircoScop')}
              hint="kWh warmte per kWh stroom, gemiddeld over de winter. Daikin Perfera 3,5 kW: 5,0 volgens Daikin; in de praktijk vaak iets lager."
            />
            <Slider
              label="Verwarmingsvermogen airco"
              value={s.verbruik.aircoVermogenKw}
              min={1}
              max={10}
              step={0.1}
              display={(v) => `${fmt.one(v)} kW`}
              onChange={upd('verbruik', 'aircoVermogenKw')}
              hint="Perfera 3,5 kW levert 4,0 kW warmte. Boven dat vermogen springen de radiatoren bij."
            />
            <Slider
              label="Aanschafprijs airco"
              value={s.verbruik.aircoPrijs}
              min={0}
              max={8000}
              step={100}
              display={fmt.eur}
              onChange={upd('verbruik', 'aircoPrijs')}
              hint="Indicatief incl. installatie. Vul je offerte in voor de terugverdientijd."
            />
          </>
        )}
        <Toggle
          label="Pelletkachel"
          checked={s.verbruik.pellet.aan}
          onChange={(aan) => onChange((prev) => ({ ...prev, verbruik: { ...prev.verbruik, pellet: { ...prev.verbruik.pellet, aan } } }))}
          hint="Brandt op koude dagen als jullie thuis zijn, nooit 's nachts. Die warmte kost geen stroom. Wijzig je dit, dan stemt het model zich opnieuw af op je metingen."
        />
        {s.verbruik.pellet.aan && (
          <>
            <Toggle
              label="Ook overdag op werkdagen"
              checked={s.verbruik.pellet.overdagWerkdagen}
              onChange={(overdagWerkdagen) =>
                onChange((prev) => ({ ...prev, verbruik: { ...prev.verbruik, pellet: { ...prev.verbruik.pellet, overdagWerkdagen } } }))
              }
              hint="Uit: werkdagen alleen 7-9 uur en 16-22 uur, weekend 8-22 uur."
            />
            <Slider
              label="Aan als het buiten kouder is dan"
              value={s.verbruik.pellet.onderTemp}
              min={-15}
              max={15}
              step={1}
              display={(v) => `${v} °C`}
              onChange={(onderTemp) => onChange((prev) => ({ ...prev, verbruik: { ...prev.verbruik, pellet: { ...prev.verbruik.pellet, onderTemp } } }))}
              hint="Daggemiddelde buitentemperatuur. Jullie: onder 10 °C."
            />
            <Slider
              label="Deel van de warmte als hij brandt (1 = radiatoren uit)"
              value={s.verbruik.pellet.aandeel}
              min={0.1}
              max={1}
              step={0.05}
              display={pct}
              onChange={(aandeel) => onChange((prev) => ({ ...prev, verbruik: { ...prev.verbruik, pellet: { ...prev.verbruik.pellet, aandeel } } }))}
              hint="Zolang hij brandt wordt het huis 25-30 °C en springen de radiatoren niet aan."
            />
            <Slider
              label="Pelletprijs per kg"
              value={s.verbruik.pellet.prijsPerKg}
              min={0.2}
              max={0.8}
              step={0.01}
              display={fmt.eur2}
              onChange={(prijsPerKg) => onChange((prev) => ({ ...prev, verbruik: { ...prev.verbruik, pellet: { ...prev.verbruik.pellet, prijsPerKg } } }))}
            />
          </>
        )}
        <Slider
          label="Koelen in de zomer"
          value={s.verbruik.koelenKwh}
          min={0}
          max={1000}
          step={25}
          display={kwh}
          onChange={upd('verbruik', 'koelenKwh')}
          hint="Extra stroom voor koelen boven 24 °C buiten. Valt grotendeels samen met je zonnestroom."
        />
      </Section>

      <Section title="Warm water" badge={s.verbruik.boiler === 'huidig' ? 'oude boiler' : s.verbruik.boiler === 'nieuw' ? 'nieuwe boiler' : 'warmtepompboiler'}>
        <Slider
          label="Stroom huidige boiler per jaar"
          value={s.verbruik.warmwaterKwh}
          min={0}
          max={4000}
          step={50}
          display={kwh}
          reference={r.verbruik.warmwaterKwh}
          onChange={upd('verbruik', 'warmwaterKwh')}
          hint="Elektrische boiler 80 L, 2,5 kW, 15-20 jaar oud. Inclusief stilstandsverlies (aanname: een kwart)."
        />
        <Segmented
          label="Boiler"
          value={s.verbruik.boiler}
          options={[
            { value: 'huidig', label: 'Huidige' },
            { value: 'nieuw', label: 'Nieuw elektrisch' },
            { value: 'warmtepomp', label: 'Warmtepomp' },
          ]}
          onChange={upd('verbruik', 'boiler')}
        />
        <Segmented
          label="Opwarmen"
          value={s.verbruik.warmwaterTiming}
          options={[
            { value: 'naGebruik', label: 'Na gebruik' },
            { value: 'nacht', label: "'s Nachts" },
            { value: 'zon', label: 'Zonuren' },
            { value: 'avond', label: "'s Avonds" },
          ]}
          onChange={upd('verbruik', 'warmwaterTiming')}
        />
        {s.verbruik.boiler !== 'huidig' && (
          <Slider
            label="Aanschafprijs nieuwe boiler"
            value={s.verbruik.boilerPrijs}
            min={0}
            max={6000}
            step={100}
            display={fmt.eur}
            onChange={upd('verbruik', 'boilerPrijs')}
            hint="Indicatief incl. installatie. Een tijdklok op zonuren kost weinig en werkt ook met de huidige boiler."
          />
        )}
      </Section>

      <Section title="Elektrische auto" badge={s.ev.aan ? kwh(evAnnualKwh(s)) : 'uit'} defaultOpen={false}>
        <Toggle label="Elektrische auto laden thuis" checked={s.ev.aan} onChange={upd('ev', 'aan')} />
        {s.ev.aan && (
          <>
            <Slider label="Kilometers per jaar" value={s.ev.kmPerJaar} min={0} max={40000} step={500} display={(v) => `${fmt.int(v)} km`} onChange={upd('ev', 'kmPerJaar')} />
            <Slider label="Verbruik" value={s.ev.kwhPer100km} min={12} max={25} step={0.5} display={(v) => `${fmt.one(v)} kWh/100 km`} onChange={upd('ev', 'kwhPer100km')} />
            <Segmented
              label="Laadvermogen"
              value={String(s.ev.laadvermogenKw)}
              options={[
                { value: '3.7', label: '3,7 kW' },
                { value: '7.4', label: '7,4 kW' },
                { value: '11', label: '11 kW' },
              ]}
              onChange={(v) => upd('ev', 'laadvermogenKw')(Number(v))}
            />
            <Segmented
              label="Laadstrategie"
              value={s.ev.strategie}
              options={[
                { value: 'avond', label: 'Bij thuiskomst' },
                { value: 'goedkoop', label: 'Goedkoopste uren' },
                { value: 'zon', label: 'Op zon' },
              ]}
              onChange={upd('ev', 'strategie')}
            />
            {s.ev.strategie === 'zon' && (
              <Slider
                label="Werkdagen overdag thuis"
                value={s.ev.thuisWerkdagen}
                min={0}
                max={5}
                step={1}
                display={(v) => `${v} per week + weekend`}
                onChange={upd('ev', 'thuisWerkdagen')}
                hint="Rest laadt 's nachts op de goedkoopste uren."
              />
            )}
          </>
        )}
      </Section>

      <Section title="Thuisbatterij" badge={s.batterij.aan ? `${fmt.one(s.batterij.capaciteitKwh)} kWh` : 'uit'} defaultOpen={false}>
        <Toggle label="Thuisbatterij" checked={s.batterij.aan} onChange={upd('batterij', 'aan')} />
        <Slider label="Capaciteit" value={s.batterij.capaciteitKwh} min={2} max={30} step={0.5} display={(v) => `${fmt.one(v)} kWh`} onChange={upd('batterij', 'capaciteitKwh')} />
        <Slider label="Vermogen" value={s.batterij.vermogenKw} min={1} max={11} step={0.5} display={(v) => `${fmt.one(v)} kW`} onChange={upd('batterij', 'vermogenKw')} />
        <Slider label="Rendement (heen en terug)" value={s.batterij.rendement} min={0.75} max={0.95} step={0.01} display={pct} onChange={upd('batterij', 'rendement')} />
        <Segmented
          label="Sturing"
          value={s.batterij.strategie}
          options={[
            { value: 'eigenVerbruik', label: 'Eigen verbruik' },
            { value: 'dynamisch', label: 'Slim op prijs' },
          ]}
          onChange={upd('batterij', 'strategie')}
        />
        <Slider
          label="Aanschafprijs incl. installatie"
          value={s.batterij.aanschafprijs}
          min={0}
          max={15000}
          step={250}
          display={fmt.eur}
          onChange={upd('batterij', 'aanschafprijs')}
          hint="Indicatief. Vul je offerteprijs in voor een eerlijke terugverdientijd."
        />
      </Section>

      <Section title="Data" badge={`prijzen ${p.priceYear} · weer ${p.weatherYear}`} defaultOpen={false}>
        <Segmented
          label="Jaar EPEX-uurprijzen"
          value={String(p.priceYear)}
          options={[2023, 2024, 2025].map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(v) => p.onPriceYear(Number(v))}
        />
        <Slider
          label="Weerjaar (zon en temperatuur)"
          value={p.weatherYear}
          min={2005}
          max={2023}
          step={1}
          display={String}
          onChange={p.onWeatherYear}
          hint="PVGIS heeft satellietdata t/m 2023. Kies hetzelfde jaar als de prijzen voor de beste samenhang tussen zon en prijs."
        />
        <div className="latlon">
          <label>
            Breedtegraad
            <input
              className="text-input"
              type="number"
              step="0.01"
              defaultValue={p.location.lat}
              onBlur={(e) => p.onLocation({ ...p.location, lat: Number(e.target.value) })}
            />
          </label>
          <label>
            Lengtegraad
            <input
              className="text-input"
              type="number"
              step="0.01"
              defaultValue={p.location.lon}
              onBlur={(e) => p.onLocation({ ...p.location, lon: Number(e.target.value) })}
            />
          </label>
        </div>
      </Section>
    </aside>
  );
}
