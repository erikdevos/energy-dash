import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { DATA_DIR, ROOT, readJson } from './cache.ts';
import { getPricesToday, getPriceYear } from './prices.ts';
import { getWeatherYear } from './pvgis.ts';
import { chargee } from './chargee.ts';
import { adax } from './adax.ts';
import { getWeather } from './weather.ts';
import { readApparaten, saveApparaten } from './apparaten.ts';

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 5174);
// Alleen bereikbaar vanaf deze computer: de API toont je meterdata en nota's. Zet HOST=0.0.0.0 alleen bewust, op een netwerk dat je vertrouwt.
const HOST = process.env.HOST ?? '127.0.0.1';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DIST = join(ROOT, 'dist');

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function num(v: string | null, fallback: number, min: number, max: number): number {
  const n = v === null ? fallback : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Alleen 'zuid', 'oost-west' of een hoek in graden; de waarde komt in een bestandsnaam terecht. */
function orientation(v: string | null): string {
  if (v === 'oost-west') return v;
  const deg = Number(v);
  return v !== null && v !== 'zuid' && Number.isFinite(deg) && deg >= -180 && deg <= 180 ? String(deg) : 'zuid';
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};

async function serveStatic(path: string, res: ServerResponse) {
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(DIST, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Niet gevonden. Draai eerst `npm run build`, of gebruik `npm run dev`.');
  }
}

const server = createServer(async (req, res) => {
  // tegen DNS-rebinding: een website mag via je browser niet bij je meterdata komen door een vreemde hostnaam naar dit adres te laten wijzen
  const hostName = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (HOST === '127.0.0.1' && !LOCAL_HOSTS.has(hostName)) return json(res, 403, { error: 'alleen via localhost' });
  const url = new URL(req.url ?? '/', 'http://localhost');
  const q = url.searchParams;
  try {
    switch (url.pathname) {
      case '/api/prices': {
        const year = num(q.get('year'), 2025, 2020, 2025);
        return json(res, 200, await getPriceYear(year));
      }
      case '/api/prices/today':
        return json(res, 200, { unit: 'EUR/kWh excl. BTW', prices: await getPricesToday() });
      case '/api/pv': {
        const weather = await getWeatherYear({
          lat: num(q.get('lat'), 52.09, 50.7, 53.6),
          lon: num(q.get('lon'), 5.12, 3.3, 7.3),
          angle: num(q.get('angle'), 35, 0, 90),
          orientation: orientation(q.get('orientation')),
          year: num(q.get('year'), 2023, 2005, 2023),
        });
        return json(res, 200, weather);
      }
      case '/api/live':
        return json(res, 200, await chargee.live());
      case '/api/history': {
        // res in minuten: 15 (kwartier), 60 (uur) of 1440 (dag)
        const resMin = [15, 60, 1440].includes(Number(q.get('res'))) ? Number(q.get('res')) : 60;
        return json(res, 200, await chargee.history(num(q.get('days'), 2, 1, 800), resMin));
      }
      case '/api/adax':
        return json(res, 200, await adax.read());
      case '/api/weather': {
        const from = num(q.get('from'), Date.now() - 14 * 86_400_000, 0, Date.now());
        return json(res, 200, (await getWeather(from)) ?? { t: [], tempC: [], rad: [] });
      }
      case '/api/apparaten': {
        if (req.method === 'PUT') {
          // alleen JSON: een andere content-type zou een website in je browser zonder toestemming kunnen sturen
          if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return json(res, 415, { error: 'alleen application/json' });
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const c of req) {
            size += (c as Buffer).length;
            if (size > 512_000) return json(res, 413, { error: 'te groot' });
            chunks.push(c as Buffer);
          }
          try {
            return json(res, 200, await saveApparaten(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
          } catch (err) {
            return json(res, 400, { error: err instanceof Error ? err.message : 'ongeldige invoer' });
          }
        }
        return json(res, 200, await readApparaten());
      }
      case '/api/dagen':
        return json(res, 200, (await readJson(join(DATA_DIR, 'dagen.json'))) ?? { dagen: [] });
      case '/api/aanbiedingen':
        return json(res, 200, (await readJson(join(DATA_DIR, 'aanbiedingen.json'))) ?? { aanbiedingen: [] });
      case '/api/leveranciers':
        return json(res, 200, (await readJson(join(DATA_DIR, 'leveranciers.json'))) ?? { contracten: [] });
      case '/api/maanden':
        return json(res, 200, (await readJson(join(DATA_DIR, 'maanden.json'))) ?? { maanden: [] });
      case '/api/jaarnotas': {
        // Eigen nota's (data/jaarnotas.json) hebben voorrang op het voorbeeldbestand.
        const own = await readJson(join(DATA_DIR, 'jaarnotas.json'));
        const mock = await readJson(join(DATA_DIR, 'jaarnotas.mock.json'));
        return json(res, 200, own ?? mock);
      }
      default:
        if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'onbekende route' });
        return serveStatic(url.pathname, res);
    }
  } catch (err) {
    console.error(err);
    return json(res, 502, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Poort ${PORT} is al in gebruik: draait het dashboard al in een andere terminal? Stop die eerst.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`energy-dash API op http://localhost:${PORT} (Chargee: ${chargee.describe()})`);
  adax.start();
  if (adax.configured()) console.log('Adax: verbruik per radiator wordt opgehaald en bewaard in data/adax/.');
  void chargee.startCollector().then(() => {
    console.log(chargee.collecting ? 'Meterdata wordt opgeslagen in data/p1/.' : 'Losse collector actief: dashboard leest mee.');
  });
});
