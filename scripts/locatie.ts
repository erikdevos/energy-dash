// De woonplaats staat in data/jaarnotas.json (privé, niet in git). Scripts leiden hun cachebestand daar vanaf, zodat er geen coördinaten in de code staan.
import { readFileSync } from 'node:fs';

const loc = (JSON.parse(readFileSync('data/jaarnotas.json', 'utf8')) as { locatie: { lat: number; lon: number } }).locatie;
export const LOC = `${loc.lat}-${loc.lon}`;
