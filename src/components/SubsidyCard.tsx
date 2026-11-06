import { useState } from 'react';
import { glasBedrag, ISDE_GLAS } from '../model/subsidies';
import { Card } from './Card';
import { fmt } from './charts/scale';
import { Rich } from './Rich';

interface Props {
  /** accuset uit de berekening hieronder, voor de terugverdientijd met en zonder subsidie */
  battery: { modules: number; kwh: number; price: number; saving: number } | null;
}

const RVO_2027 = 'https://www.rvo.nl/subsidies-financiering/isde/isde-wat-wijzigt-er-2027';
const RVO_ISOLATIE = 'https://www.rvo.nl/subsidies-financiering/isde/woningeigenaren/isolatiemaatregelen';

function years(price: number, saving: number): string {
  return saving > 0 ? `${(Math.max(0, price) / saving).toFixed(1).replace('.', ',')} jaar` : 'verdient zich niet terug';
}

/** Wat levert subsidie op voor het glas, en wat voor de accu? Alles indicatief; de bedragen staan in model/subsidies.ts. */
export function SubsidyCard({ battery }: Props) {
  const [m2, setM2] = useState(10);
  const [double, setDouble] = useState(false);
  const [batSubsidy, setBatSubsidy] = useState(0);

  const t26 = glasBedrag(m2, ISDE_GLAS.triple[2026], double);
  const t27 = glasBedrag(m2, ISDE_GLAS.triple[2027], double);
  const hr27 = glasBedrag(m2, ISDE_GLAS.hr[2027], double);
  const hr26 = glasBedrag(m2, ISDE_GLAS.hr[2026], double);
  const best = Math.max(t26, t27, hr27, hr26, 1);
  const verschil = t26 - t27;

  const rows = [
    {
      key: 't26',
      title: 'Triple glas in nieuwe kozijnen, gekocht voor of op 31 december 2026',
      sub: `€ ${ISDE_GLAS.triple[2026]} per m²`,
      value: t26,
      cls: 'dynamisch',
    },
    {
      key: 't27',
      title: 'Zelfde, gekocht in 2027 (voorgenomen bedrag)',
      sub: `€ ${ISDE_GLAS.triple[2027]} per m²`,
      value: t27,
      cls: 'vast',
    },
    {
      key: 'hr',
      title: 'HR++-glas zonder nieuwe kozijnen',
      sub: `€ ${ISDE_GLAS.hr[2026]} per m² in 2026, € ${ISDE_GLAS.hr[2027]} in 2027`,
      value: hr27,
      cls: 'vast',
    },
  ];

  const withBat = battery ? battery.price - batSubsidy : 0;

  return (
    <Card
      title="Subsidies"
      subtitle="Wat levert de ISDE op voor het glas, en wat voor een thuisaccu? Alle bedragen zijn indicatief; controleer ze bij RVO en je installateur."
      className="span-2"
    >
      {verschil > 0 && (
        <div className="insight tone-good">
          <h3>Het uitmaakt wanneer je koopt</h3>
          <p>
            Bij {m2.toLocaleString('nl-NL')} m² triple glas in nieuwe kozijnen scheelt het <span className="insight-value">{fmt.eur(verschil)}</span> of je
            het voor of op 31 december 2026 koopt (dan blijft het bedrag van 2026 gelden) of pas in 2027. Het gaat om de aankoopdatum: je mag het in 2027 laten
            plaatsen. Stuur een opdrachtbevestiging of getekende offerte uit 2026 mee met je aanvraag.
          </p>
        </div>
      )}

      <div className="termijn-line">
        <label className="app-field">
          <span className="k">Glasoppervlak (m²)</span>
          <input type="number" min={0} max={80} step={1} value={m2} onChange={(e) => setM2(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="app-field">
          <span className="k">Verdubbeling meerekenen (niet bevestigd voor glas)</span>
          <input type="checkbox" checked={double} onChange={(e) => setDouble(e.target.checked)} />
        </label>
      </div>

      <div className="supplier-list" role="list">
        {rows.map((r) => (
          <div key={r.key} role="listitem" className="supplier">
            <div className="supplier-row battery-row">
              <span className="supplier-name">
                <strong>{r.title}</strong>
                <Rich as="span" className="supplier-sub">{r.sub}</Rich>
              </span>
              <span className="supplier-track" aria-hidden="true">
                <span className={`supplier-bar ${r.cls}`} style={{ width: `${(r.value / best) * 100}%` }} />
              </span>
              <span className="supplier-total">
                <strong>{fmt.eur(r.value)}</strong>
                <Rich as="span" className="supplier-sub">eenmalig</Rich>
              </span>
            </div>
          </div>
        ))}
      </div>

      <Rich as="p" className="hint">
        Voorwaarden volgens RVO: minimaal {ISDE_GLAS.minM2} m² en maximaal {ISDE_GLAS.maxM2} m² glas, uitgevoerd door een bedrijf, aanvragen binnen 24 maanden na
        het uitvoeren van de werkzaamheden (regel uit 2026; voor 2027 staat geen aparte termijn voor glas op de pagina). De aanvragen voor 2027 openen op
        5 januari 2027 om 12:00. Voor het triple-bedrag moeten de kozijnen mee vervangen worden, anders krijg je het HR++-bedrag. Of glas meetelt voor de
        verdubbeling van het isolatiebedrag bij meer dan één maatregel (of bij een warmtepomp, zonneboiler of warmtenet) staat niet expliciet op de RVO-pagina's:
        vraag dat na. Een garage die bij de woning wordt getrokken komt niet in aanmerking, dus controleer of dat voor de garagedeur geldt. Energiezuinige
        ventilatie levert eenmalig € {ISDE_GLAS.ventilatie} op, maar alleen samen met een isolatiemaatregel. Bronnen:{' '}
        <a href={RVO_ISOLATIE} target="_blank" rel="noreferrer">RVO isolatiemaatregelen</a> en{' '}
        <a href={RVO_2027} target="_blank" rel="noreferrer">RVO wijzigingen 2027</a> (gelezen op 7 november 2026; wijzigingen voor 2027 zijn voorgenomen).
      </Rich>

      <h3 className="subhead">Wat telt niet, of is nog niet uitgezocht</h3>
      <ul className="plain-list">
        <li>
          <strong>Daikin Perfera (lucht-lucht):</strong> volgens de regeling valt een lucht-lucht warmtepomp buiten de ISDE. Hij telt dus ook niet mee als tweede maatregel.
        </li>
        <li>
          <strong>Warmtepompboiler:</strong> kan wel subsidie krijgen. Het bedrag hangt af van het model en staat op de meldcodelijst van RVO. Dat bedrag heb ik niet gevonden, dus het zit er niet in.
        </li>
        <li>
          <strong>Thuisaccu:</strong> landelijk is er geen subsidie en de ISDE dekt hem niet, ook niet in de voorgenomen wijzigingen voor 2027. Enkele provincies en gemeenten hebben wel een
          eigen regeling (Flevoland tot € 1.250, alleen voor inwoners daar). Kijk bij je eigen gemeente en provincie. Die bronnen zijn deels commercieel, dus controleer ze.
        </li>
      </ul>

      {battery && (
        <>
          <h3 className="subhead">Thuisaccu met subsidie</h3>
          <div className="termijn-line">
            <label className="app-field">
              <span className="k">Subsidie op de accu (€)</span>
              <input type="number" min={0} max={5000} step={50} value={batSubsidy} onChange={(e) => setBatSubsidy(Math.max(0, Number(e.target.value)))} />
            </label>
          </div>
          <div className="kpi-row">
            <div className="kpi">
              <span className="kpi-label">{battery.modules} modules, {fmt.kwh(battery.kwh)}</span>
              <Rich as="span" className="kpi-value">{fmt.eur(battery.saving)}</Rich>
              <Rich as="span" className="kpi-sub">besparing per jaar (model, 2027)</Rich>
            </div>
            <div className="kpi">
              <span className="kpi-label">Terugverdiend zonder subsidie</span>
              <span className="kpi-value">{years(battery.price, battery.saving)}</span>
              <Rich as="span" className="kpi-sub">bij {fmt.eur(battery.price)} aanschaf</Rich>
            </div>
            <div className="kpi">
              <span className="kpi-label">Terugverdiend met subsidie</span>
              <span className="kpi-value">{years(withBat, battery.saving)}</span>
              <Rich as="span" className="kpi-sub">bij {fmt.eur(withBat)} netto</Rich>
            </div>
          </div>
          <Rich as="p" className="hint">
            Vul hier een subsidie in als je er een vindt. Standaard staat hij op € 0, omdat er landelijk niets is. De prijs per module en de besparing komen uit het blok hierboven.
          </Rich>
        </>
      )}
    </Card>
  );
}
