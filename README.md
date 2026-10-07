# Energiedashboard

Speeltuin voor een all-electric huis met zonnepanelen. Je ziet wat stroom kost met en zonder saldering (einde per 1-1-2027), met een vast of dynamisch contract, en wat een thuisbatterij, elektrische auto, isolatie of slimmer schakelen oplevert. Alles wordt per uur doorgerekend over een heel jaar.

## Indeling

- **Overzicht:** de kern op één scherm.
  - Drie kernkaarten: dit jaar, 2027 zonder plannen, 2027 met plannen.
  - "De weg naar 2027": van je kosten nu, via het einde van de saldering, naar 2027, met per plan wat het terugwint. Plannen zet je aan of uit met de knoppen erboven.
  - Slimme inzichten in gewone taal.
  - Waar je stroom naartoe gaat, nu en met je plannen.
- **Nu:** live meter met advies, de verwachte eindnota, en de stroomprijzen van vandaag en morgen met de goedkoopste uren.
- **Verbruik:** verbruik per onderdeel per maand, model tegen meting per maand, en het dagbeeld per uur.
- **Scenario's:** de speeltuin met alle schuifjes, contractvergelijking en bewaarde scenario's.
- **Gegevens:** afstemming op jaarnota's en maanddata, bronnen en aannames.

## Starten

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` start twee processen: de API-server (poort 5174) en Vite.

## Databronnen

| Bron | Wat | Status |
|---|---|---|
| EnergyZero API | EPEX day-ahead uurprijzen 2023-2025 | echt, gecachet in `data/cache/` |
| PVGIS (EU JRC) | zonne-opwek per kWp en buitentemperatuur per uur | echt, gecachet |
| Chargee Sparky | live P1-meter (vermogen, meterstanden), historie per uur | live via `CHARGEE_HOST` in `.env`, anders mock |
| Greenchoice-jaarnota's | afname/teruglevering per jaar, tarieven, vaste kosten | `data/jaarnotas.json` (uit de PDF's in `data/jaarnotas/`), anders mock |
| Greenchoice-maanddata | afname/teruglevering per maand in kWh | `data/maanden.json` (overgenomen uit Mijn Greenchoice) |

### Chargee koppelen

De Sparky heeft een lokale API (`GET http://<host>/api/v1/data`, poort 80, geen token). Zet de host in `.env`:

```bash
cp .env.example .env
```

Vul `CHARGEE_HOST` in, bijvoorbeeld `sparky-<serienummer>.local` of het IP uit je router (`dns-sd -B _chargee_p1._tcp .` vindt hem ook). Afname en teruglevering komen uit het DSMR-telegram (1.7.0 en 2.7.0), dus het teken van `active_power_w` maakt niet uit. Documentatie: [Sparky Local API](https://support.chargee.energy/en/articles/14525475-how-do-i-use-sparky-s-local-api).

### Meterdata opslaan

De Sparky bewaart zelf geen historie, dus we meten zelf. Elke 10 seconden wordt de meter uitgelezen. Per kwartier komt er een regel bij in `data/p1/JJJJ-MM.jsonl` met:
- afname en teruglevering, gesplitst in normaal en dal;
- het piekvermogen;
- de meterstanden.

Er wordt niets weggegooid. Lag de meting stil, dan legt de eerste nieuwe meting het hele gat vast als één regel (`gap: true`): de kWh kloppen dan nog steeds, alleen niet per kwartier.

Meten gebeurt alleen zolang er een proces draait. Dat kan op twee manieren:
- **Het dashboard zelf:** `npm run dev`.
- **De losse collector:** `npm run collect`. Hiervoor hoeft het dashboard niet open.

Er verzamelt altijd maar één proces tegelijk. De andere leest mee en neemt het over zodra het eerste stopt.

Om de collector altijd te laten draaien zolang de Mac aan staat, staat er een launchd-bestand klaar in `scripts/launchd/`; installatie-instructies staan in het bestand zelf. Wil je ook meten als de Mac uit staat, dan heb je een apparaat nodig dat altijd aan is, zoals een Raspberry Pi of NAS met Node 22, of Home Assistant met de officiële Chargee-integratie.

### Jaarnota's

De PDF's staan in `data/jaarnotas/`, de relevante cijfers in `data/jaarnotas.json`: kWh, tarieven, vaste kosten en meterstanden, zonder naam, adres of IBAN. Beide staan in `.gitignore`. Bij een nieuwe nota voeg je een blok toe aan `notas`. Heb je de jaaropbrengst van je omvormer, zet die dan als `opwekOmvormer` bij de nota: dan is de opwek gemeten in plaats van geschat.

Gefactureerde termijnen (uit de termijnnota's in `data/jaarnotas/termijnen/`) staan onder `termijnen`. De verwachte eindnota telt die als betaald; voor de resterende maanden rekent hij met het termijnbedrag uit het overzicht.

Met een volledig kalenderjaar in `data/maanden.json` ("Maanden 2025") kloppen de jaartotalen exact, en bepaalt het seizoenspatroon hoeveel van het verbruik verwarming is. In "Stroom per maand" staan de gemeten maanden als streepjes naast het model. Nieuwe maanden voeg je gewoon toe aan dat bestand.

Het dashboard stemt opwek en verbruik zo af dat afname én teruglevering van de gekozen nota kloppen. Na een wijziging in ligging, locatie of weerjaar gebeurt dat opnieuw. Na het aanpassen van het aantal panelen of het vermogen per paneel doe je het via de knop in het jaarnota-paneel.

## Structuur

- `server/`: Node-server zonder dependencies (draait TypeScript direct), haalt prijzen en PVGIS op en leest de Sparky uit.
- `src/model/`: het rekenmodel. Het is los te testen met `npm run check` en `npx tsx scripts/check-notas.ts`.
  - `profiles.ts`: verbruiksvormen.
  - `simulate.ts`: uur-simulatie met batterij, auto en afschakelen.
  - `costs.ts`: kosten met en zonder saldering.
  - `defaults.ts`: tarieven met bron.
- `src/components/`: het dashboard; grafieken zijn eigen SVG-componenten.

## Belangrijkste aannames

Alle aannames en bronnen staan ook onderaan in het dashboard.

- Verbruiksprofielen zijn gemodelleerd, niet gemeten. Zodra er een paar weken Chargee-historie is, kunnen ze daarop worden afgesteld.
- De slimme batterij en het slim laden van de auto kennen prijzen en zon 24 uur vooruit. Dat is optimistisch.
- Je huidige contract heeft volgens de jaarnota's geen terugleverkosten. Voor "Vast 2027" gebruikt het model de verwachting uit het Greenchoice-rekenvoorbeeld (vergoeding € 0,054, kosten € 0,052 per kWh). Greenchoice markeert die zelf als schatting.
