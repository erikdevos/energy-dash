import { Card } from './Card';

const SOURCES: Array<[string, string, string]> = [
  ['Einde saldering per 1-1-2027, minimumvergoeding 50% t/m 2029', 'Wet beëindiging salderingsregeling, Stb. 2025, 17', 'https://zoek.officielebekendmakingen.nl/stb-2025-17.html'],
  ['Energiebelasting en vermindering 2026', 'Rijksoverheid', 'https://www.rijksoverheid.nl/onderwerpen/energie-thuis/vraag-en-antwoord/opbouw-energierekening'],
  ['Energiebelasting 2027 (voorstel)', 'Belastingplan 2027, fiscale sleuteltabel', 'https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/pakket-belastingplan-2027/Fiscale-sleuteltabel-2027-incl-correctie-tarieven-energiebelasting-zelfstandigenaftrek.pdf'],
  ['Greenchoice tarieven, terugleververgoeding en terugleverkosten', 'keuze.nl (Greenchoice publiceert zelf geen bedragen)', 'https://www.keuze.nl/energie/energieleveranciers/greenchoice'],
  ['Greenchoice verwachting 2027', 'Greenchoice rekenvoorbeeld nettoterugleveraar', 'https://www.greenchoice.nl/zonnepanelen/salderingsregeling/rekenvoorbeelden/nettoterugleveraar/'],
  ['Daltarief Enexis Brabant/Limburg vanaf 21:00', 'Radar (AVROTROS)', 'https://radar.avrotros.nl/artikel/piek-en-daltarief-niet-overal-even-laat-in-nederland-34881'],
  ['Netbeheerkosten Liander 2026', 'Liander tarievenblad', 'https://www.liander.nl/-/media/files/tarieven/consument/2026/jaarlijkse-netwerkkosten-stroom-2026-v10.pdf'],
  ['Dynamisch: inkoop- en verkoopvergoeding', 'Tibber', 'https://tibber.com/nl/energiecontract'],
  ['Daikin Perfera FTXM-R: verwarmingsvermogen en SCOP', 'Daikin productgegevens', 'https://www.daikin.eu/en_us/products/product.table.html/FTXM-R---2MXM-A.html'],
  ['EPEX day-ahead uurprijzen', 'EnergyZero API', 'https://api.energyzero.nl'],
  ['Zonne-opwek en temperatuur per uur', 'PVGIS 5.3, EU JRC', 'https://re.jrc.ec.europa.eu/pvg_tools/en/'],
  ['Chargee Sparky Local API v1.1', 'Chargee support', 'https://support.chargee.energy/en/articles/14525475-how-do-i-use-sparky-s-local-api'],
];

const ASSUMPTIONS = [
  'Verbruiksprofielen (huishouden, wasmachine, warmtepomp, boiler) zijn gemodelleerde vormen, geen meetdata. Ze worden geschaald op je jaarnota\'s.',
  'Opwek en verbruik zijn afgestemd op je Greenchoice-jaarnota\'s. De opwek staat niet op de nota en is geschat uit afname en teruglevering, tot je de omvormeropbrengst invult.',
  '20 panelen van 410 Wp op een zuiddak van 35° is een aanname. Pas vermogen en ligging aan; het model stemt de opwek daarna opnieuw af op je nota.',
  'Dal: werkdagen vanaf 21:00 (Enexis Brabant/Limburg) of 23:00 tot 07:00, plus het weekend. Feestdagen tellen niet mee als dal.',
  'Dynamisch onder saldering: teruglevering tegen uurprijs incl. BTW, energiebelasting jaarlijks verrekend. Na 2027: uurprijs zonder BTW.',
  'De slimme batterij en de auto op goedkoopste uren kennen de prijzen en de zon van de komende 24 uur vooraf. In het echt valt de besparing daarom iets lager uit.',
  'EPEX-prijzen zijn uurgemiddelden. Sinds oktober 2025 rekent de markt per kwartier.',
  'Of terugleverkosten de vergoeding onder de wettelijke 50%-grens mogen drukken, is nog niet duidelijk. Het model telt ze gewoon op.',
  'De batterijprijs van € 5.000 en de airco-prijs van € 3.000 zijn indicatief. Slijtage en vervanging zitten niet in de terugverdientijd.',
  'Airco: SCOP 4,5 (Daikin geeft 5,0 voor de Perfera 3,5 kW), max. 4,0 kW warmte; de rest via de radiatoren. Kozijnen: 15% minder warmtevraag is een schatting.',
];

export function Sources() {
  return (
    <Card title="Bronnen en aannames" subtitle="Stand 7 oktober 2026. Controleer tarieven altijd bij je eigen contract." className="span-2">
      <div className="sources">
        <div>
          <h3 className="mini-title">Bronnen</h3>
          <ul>
            {SOURCES.map(([what, who, url]) => (
              <li key={what}>
                {what}: <a href={url} target="_blank" rel="noreferrer">{who}</a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mini-title">Aannames</h3>
          <ul>
            {ASSUMPTIONS.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
